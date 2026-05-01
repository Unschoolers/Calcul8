import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import type {
  ApiConfig,
  LotLivePricingDocument,
  SaleDocument,
  SyncMetaDocument,
  SyncPresetDocument
} from "../../types";

const {
  getContainersMock,
  getExternalSyncContainerMock,
  isNotFoundErrorMock,
  withCosmosRetryMock
} = vi.hoisted(() => ({
  getContainersMock: vi.fn(),
  getExternalSyncContainerMock: vi.fn(),
  isNotFoundErrorMock: vi.fn(),
  withCosmosRetryMock: vi.fn(async <T>(operation: () => Promise<T>) => operation())
}));

vi.mock("./core", () => ({
  EPOCH_DATE_ISO: "1970-01-01T00:00:00.000Z",
  getContainers: getContainersMock,
  getExternalSyncContainer: getExternalSyncContainerMock,
  isNotFoundError: isNotFoundErrorMock,
  withCosmosRetry: withCosmosRetryMock
}));

import {
  getEffectiveSyncSnapshot,
  getSyncScopeEntityDocuments,
  replaceSyncScopeEntityDocuments,
  upsertSyncSnapshotIncremental
} from "./syncSnapshotRepository";

function createConfig(): ApiConfig {
  return {
    apiEnv: "dev",
    authBypassDev: true,
    migrationsAdminKey: "",
    googleClientId: "",
    googlePlayPackageName: "io.whatfees",
    googlePlayProProductIds: ["pro_access"],
    googlePlayServiceAccountEmail: "",
    googlePlayServiceAccountPrivateKey: "",
    allowedOrigins: [],
    cosmosEndpoint: "https://example.documents.azure.com:443/",
    cosmosKey: "key",
    cosmosDatabaseId: "whatfees",
    entitlementsContainerId: "entitlements",
    syncContainerId: "sync_data",
    migrationRunsContainerId: "migration_runs"
  };
}

function createSyncSnapshotsContainer() {
  return {
    items: {
      query: vi.fn(),
      upsert: vi.fn()
    },
    item: vi.fn()
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  isNotFoundErrorMock.mockImplementation((error: unknown) => {
    const statusCode = (error as { statusCode?: unknown })?.statusCode;
    const code = (error as { code?: unknown })?.code;
    return statusCode === 404 || code === 404 || code === "NotFound";
  });
});

test("getEffectiveSyncSnapshot reconstructs lots and omits preset sales when entity mode is enabled", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  const presetDocuments: SyncPresetDocument[] = [
    {
      id: "sync:preset:user-1:lot-1",
      docType: "sync_preset",
      userId: "user-1",
      presetId: "lot-1",
      preset: { id: "lot-1", name: "Lot 1" },
      sales: [{ id: 1 }],
      version: 3,
      updatedAt: "2026-03-18T10:00:00.000Z"
    },
    {
      id: "sync:preset:user-1:lot-2",
      docType: "sync_preset",
      userId: "user-1",
      presetId: "lot-2",
      preset: { id: "lot-2", name: "Lot 2" },
      sales: [{ id: 2 }],
      version: 5,
      updatedAt: "2026-03-18T12:00:00.000Z"
    }
  ];
  const metaDocument: SyncMetaDocument = {
    id: "sync:meta:user-1",
    docType: "sync_meta",
    userId: "user-1",
    version: 7,
    updatedAt: "2026-03-18T13:00:00.000Z",
    salesMode: "entity",
    livePricingMode: "entity"
  };

  syncSnapshots.items.query.mockReturnValue({
    fetchAll: vi.fn().mockResolvedValue({
      resources: presetDocuments
    })
  });
  syncSnapshots.item.mockImplementation((id: string) => ({
    read: vi.fn().mockResolvedValue({
      resource: id === "sync:meta:user-1" ? metaDocument : null
    })
  }));
  getContainersMock.mockReturnValue({ syncSnapshots });

  const snapshot = await getEffectiveSyncSnapshot(createConfig(), "user-1");

  assert.deepEqual(snapshot, {
    id: "sync:user-1",
    userId: "user-1",
    lots: [
      { id: "lot-1", name: "Lot 1" },
      { id: "lot-2", name: "Lot 2" }
    ],
    salesByLot: {},
    wheelConfigs: [],
    activeWheelConfigId: null,
    version: 7,
    updatedAt: "2026-03-18T13:00:00.000Z"
  });
});

test("getEffectiveSyncSnapshot normalizes legacy preset sales and meta wheel configs", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  const presetDocuments: SyncPresetDocument[] = [
    {
      id: "sync:preset:user-1:10",
      docType: "sync_preset",
      userId: "user-1",
      presetId: "10",
      preset: { id: "10", name: "Legacy lot" },
      sales: [
        {
          id: "501",
          type: "wheel",
          quantity: "1",
          price: "14.25",
          customer: " Alex ",
          linkedWheelId: "91",
          unknownSaleField: "drop"
        },
        {
          id: "bad",
          price: 5
        }
      ],
      version: 3,
      updatedAt: "2026-03-18T10:00:00.000Z"
    }
  ];
  const metaDocument: SyncMetaDocument = {
    id: "sync:meta:user-1",
    docType: "sync_meta",
    userId: "user-1",
    version: 7,
    updatedAt: "2026-03-18T13:00:00.000Z",
    wheelConfigs: [
      {
        id: "91",
        name: " Legacy wheel ",
        spinPrice: "10",
        gameType: "grid",
        outcomeCount: "80",
        unknownConfigField: "drop",
        tiers: [
          {
            id: "tier-1",
            label: " Chase ",
            chancePercent: "25",
            unknownTierField: "drop"
          }
        ]
      },
      {
        id: "bad",
        name: "Bad wheel"
      }
    ] as never,
    activeWheelConfigId: "91" as never,
    salesMode: "snapshot",
    livePricingMode: "entity"
  };

  syncSnapshots.items.query.mockReturnValue({
    fetchAll: vi.fn().mockResolvedValue({
      resources: presetDocuments
    })
  });
  syncSnapshots.item.mockImplementation((id: string) => ({
    read: vi.fn().mockResolvedValue({
      resource: id === "sync:meta:user-1" ? metaDocument : null
    })
  }));
  getContainersMock.mockReturnValue({ syncSnapshots });

  const snapshot = await getEffectiveSyncSnapshot(createConfig(), "user-1");

  assert.deepEqual(snapshot?.salesByLot, {
    "10": [
      {
        id: 501,
        type: "wheel",
        quantity: 1,
        price: 14.25,
        customer: "Alex",
        linkedWheelId: 91
      }
    ]
  });
  assert.deepEqual(snapshot?.wheelConfigs, [
    {
      id: 91,
      name: "Legacy wheel",
      spinPrice: 10,
      gameType: "grid",
      outcomeCount: 80,
      tiers: [
        {
          id: "tier-1",
          label: "Chase",
          chancePercent: 25
        }
      ]
    }
  ]);
  assert.equal(snapshot?.activeWheelConfigId, 91);
});

test("getEffectiveSyncSnapshot returns wheel-only snapshot when meta contains wheel configs", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  const metaDocument: SyncMetaDocument = {
    id: "sync:meta:user-1",
    docType: "sync_meta",
    userId: "user-1",
    version: 4,
    updatedAt: "2026-03-18T13:00:00.000Z",
    wheelConfigs: [{
      id: 91,
      name: "Wheel A",
      spinPrice: 10,
      targetMargin: 40,
      createdAt: "",
      tiers: []
    }],
    activeWheelConfigId: 91,
    salesMode: "entity",
    livePricingMode: "entity"
  };

  syncSnapshots.items.query.mockReturnValue({
    fetchAll: vi.fn().mockResolvedValue({
      resources: []
    })
  });
  syncSnapshots.item.mockImplementation((id: string) => ({
    read: vi.fn().mockResolvedValue({
      resource: id === "sync:meta:user-1" ? metaDocument : null
    })
  }));
  getContainersMock.mockReturnValue({ syncSnapshots });

  const snapshot = await getEffectiveSyncSnapshot(createConfig(), "user-1");

  assert.deepEqual(snapshot, {
    id: "sync:user-1",
    userId: "user-1",
    lots: [],
    salesByLot: {},
    wheelConfigs: [{
      id: 91,
      name: "Wheel A",
      spinPrice: 10,
      targetMargin: 40,
      createdAt: "",
      tiers: []
    }],
    activeWheelConfigId: 91,
    version: 4,
    updatedAt: "2026-03-18T13:00:00.000Z"
  });
});

test("replaceSyncScopeEntityDocuments deletes stale docs and rewrites incoming docs with scoped ids", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  const existingSale: SaleDocument = {
    id: "sale:ws:team-1:lot-1:sale-keep",
    docType: "sale",
    userId: "ws:team-1",
    scopeKey: "ws:team-1",
    lotId: "lot-1",
    saleId: "sale-keep",
    sale: { id: 1 },
    version: 1,
    updatedAt: "2026-03-18T00:00:00.000Z",
    updatedBy: "user-a",
    mutationId: "sale:1"
  };
  const staleSale: SaleDocument = {
    ...existingSale,
    id: "sale:ws:team-1:lot-1:sale-drop",
    saleId: "sale-drop"
  };
  const staleLivePricing: LotLivePricingDocument = {
    id: "lot_live_pricing:ws:team-1:lot-old",
    docType: "lot_live_pricing",
    userId: "ws:team-1",
    scopeKey: "ws:team-1",
    lotId: "lot-old",
    livePackPrice: 1,
    liveBoxPriceSell: 2,
    liveSpotPrice: 3,
    version: 1,
    updatedAt: "2026-03-18T00:00:00.000Z",
    updatedBy: "user-a",
    mutationId: "live:1"
  };

  syncSnapshots.items.query.mockReturnValue({
    fetchAll: vi.fn().mockResolvedValue({
      resources: [existingSale, staleSale, staleLivePricing]
    })
  });
  syncSnapshots.items.upsert.mockResolvedValue({ resource: null });
  syncSnapshots.item.mockImplementation((id: string, partitionKey: string) => ({
    delete: vi.fn().mockResolvedValue({
      id,
      partitionKey
    })
  }));
  getContainersMock.mockReturnValue({ syncSnapshots });

  const result = await replaceSyncScopeEntityDocuments(createConfig(), {
    scopeKey: "ws:team-1",
    saleDocuments: [
      {
        ...existingSale,
        id: "ignored",
        userId: "other",
        scopeKey: "other"
      },
      {
        ...existingSale,
        id: "ignored-2",
        saleId: "sale-new",
        userId: "other",
        scopeKey: "other"
      }
    ],
    livePricingDocuments: [{
      ...staleLivePricing,
      id: "ignored-live",
      lotId: "lot-1",
      userId: "other",
      scopeKey: "other"
    }]
  });

  assert.deepEqual(result, {
    upsertedCount: 3,
    deletedCount: 2
  });
  assert.equal(syncSnapshots.item.mock.calls.some((call: unknown[]) =>
    call[0] === "sale:ws:team-1:lot-1:sale-drop" && call[1] === "ws:team-1"
  ), true);
  assert.equal(syncSnapshots.item.mock.calls.some((call: unknown[]) =>
    call[0] === "lot_live_pricing:ws:team-1:lot-old" && call[1] === "ws:team-1"
  ), true);
  assert.equal(syncSnapshots.items.upsert.mock.calls[0]?.[0]?.id, "sale:ws:team-1:lot-1:sale-keep");
  assert.equal(syncSnapshots.items.upsert.mock.calls[1]?.[0]?.id, "sale:ws:team-1:lot-1:sale-new");
  assert.equal(syncSnapshots.items.upsert.mock.calls[2]?.[0]?.id, "lot_live_pricing:ws:team-1:lot-1");
  assert.equal(syncSnapshots.items.upsert.mock.calls[2]?.[0]?.scopeKey, "ws:team-1");
  assert.equal(syncSnapshots.items.upsert.mock.calls[2]?.[0]?.userId, "ws:team-1");
});

test("getSyncScopeEntityDocuments filters malformed live pricing entity documents", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  const validLivePricing: LotLivePricingDocument = {
    id: "lot_live_pricing:ws:team-1:lot-1",
    docType: "lot_live_pricing",
    userId: "ws:team-1",
    scopeKey: "ws:team-1",
    lotId: "lot-1",
    livePackPrice: 1,
    liveBoxPriceSell: 2,
    liveSpotPrice: 3,
    version: 1,
    updatedAt: "2026-03-18T00:00:00.000Z",
    updatedBy: "user-a",
    mutationId: "live:1"
  };

  syncSnapshots.items.query.mockReturnValue({
    fetchAll: vi.fn().mockResolvedValue({
      resources: [
        validLivePricing,
        {
          ...validLivePricing,
          id: "lot_live_pricing:ws:team-1:lot-bad",
          lotId: "lot-bad",
          livePackPrice: -1
        },
        {
          ...validLivePricing,
          id: "lot_live_pricing:ws:team-1:lot-missing-mutation",
          lotId: "lot-missing-mutation",
          mutationId: ""
        },
        {
          ...validLivePricing,
          id: "lot_live_pricing:ws:team-1:lot-wrong-scope",
          lotId: "lot-wrong-scope",
          scopeKey: "other-scope"
        }
      ]
    })
  });
  getContainersMock.mockReturnValue({ syncSnapshots });

  const result = await getSyncScopeEntityDocuments(createConfig(), "ws:team-1");

  assert.deepEqual(result.livePricingDocuments, [validLivePricing]);
});

test("replaceSyncScopeEntityDocuments does not upsert malformed live pricing entity input", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  const validLivePricing: LotLivePricingDocument = {
    id: "ignored-live",
    docType: "lot_live_pricing",
    userId: "source",
    scopeKey: "source",
    lotId: "lot-1",
    livePackPrice: 1,
    liveBoxPriceSell: 2,
    liveSpotPrice: 3,
    version: 1,
    updatedAt: "2026-03-18T00:00:00.000Z",
    updatedBy: "user-a",
    mutationId: "live:1"
  };

  syncSnapshots.items.query.mockReturnValue({
    fetchAll: vi.fn().mockResolvedValue({ resources: [] })
  });
  syncSnapshots.items.upsert.mockResolvedValue({ resource: null });
  getContainersMock.mockReturnValue({ syncSnapshots });

  const result = await replaceSyncScopeEntityDocuments(createConfig(), {
    scopeKey: "ws:team-1",
    saleDocuments: [],
    livePricingDocuments: [
      validLivePricing,
      {
        ...validLivePricing,
        lotId: "lot-bad",
        liveSpotPrice: Number.NaN
      }
    ]
  });

  assert.deepEqual(result, {
    upsertedCount: 1,
    deletedCount: 0
  });
  assert.equal(syncSnapshots.items.upsert.mock.calls.length, 1);
  assert.equal(syncSnapshots.items.upsert.mock.calls[0]?.[0]?.id, "lot_live_pricing:ws:team-1:lot-1");
});

test("upsertSyncSnapshotIncremental upserts changed presets, deletes removed presets, and preserves sync modes", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  const existingPresetDocuments: SyncPresetDocument[] = [
    {
      id: "sync:preset:user-1:keep",
      docType: "sync_preset",
      userId: "user-1",
      presetId: "keep",
      preset: { id: "keep", name: "Keep" },
      sales: [{ id: 1 }],
      version: 1,
      updatedAt: "2026-03-18T09:00:00.000Z"
    },
    {
      id: "sync:preset:user-1:drop",
      docType: "sync_preset",
      userId: "user-1",
      presetId: "drop",
      preset: { id: "drop", name: "Drop" },
      sales: [],
      version: 1,
      updatedAt: "2026-03-18T09:00:00.000Z"
    }
  ];
  const metaDocument: SyncMetaDocument = {
    id: "sync:meta:user-1",
    docType: "sync_meta",
    userId: "user-1",
    version: 3,
    updatedAt: "2026-03-18T09:00:00.000Z",
    wheelConfigs: [],
    activeWheelConfigId: null,
    salesMode: "entity",
    livePricingMode: "entity"
  };

  syncSnapshots.items.query.mockReturnValue({
    fetchAll: vi.fn().mockResolvedValue({
      resources: existingPresetDocuments
    })
  });
  syncSnapshots.items.upsert.mockResolvedValue({ resource: null });
  syncSnapshots.item.mockImplementation((id: string, userId: string) => ({
    read: vi.fn().mockResolvedValue({
      resource: id === "sync:meta:user-1" ? metaDocument : null
    }),
    delete: vi.fn().mockResolvedValue({ id, userId })
  }));
  getContainersMock.mockReturnValue({ syncSnapshots });

  const result = await upsertSyncSnapshotIncremental(createConfig(), {
    userId: "user-1",
    lots: [
      { id: "keep", name: "Keep v2" },
      { id: "new", name: "New preset" }
    ],
    salesByLot: {
      keep: [{ id: 11 }],
      new: [{ id: 22 }]
    },
    wheelConfigs: [{
      id: 91,
      name: "Wheel A",
      spinPrice: 10,
      targetMargin: 40,
      createdAt: "",
      tiers: []
    }],
    activeWheelConfigId: 91,
    version: 9,
    updatedAt: "2026-03-18T15:00:00.000Z"
  });

  assert.deepEqual(result, {
    changed: true,
    upsertedCount: 2,
    deletedCount: 1
  });
  assert.equal(syncSnapshots.item.mock.calls.some((call: unknown[]) =>
    call[0] === "sync:preset:user-1:drop" && call[1] === "user-1"
  ), true);
  assert.equal(syncSnapshots.items.upsert.mock.calls[0]?.[0]?.id, "sync:preset:user-1:keep");
  assert.equal(syncSnapshots.items.upsert.mock.calls[1]?.[0]?.id, "sync:preset:user-1:new");
  assert.equal(syncSnapshots.items.upsert.mock.calls[2]?.[0]?.id, "sync:meta:user-1");
  assert.equal(syncSnapshots.items.upsert.mock.calls[2]?.[0]?.salesMode, "entity");
  assert.equal(syncSnapshots.items.upsert.mock.calls[2]?.[0]?.livePricingMode, "entity");
  assert.deepEqual(syncSnapshots.items.upsert.mock.calls[2]?.[0]?.wheelConfigs, [{
    id: 91,
    name: "Wheel A",
    spinPrice: 10,
    targetMargin: 40,
    createdAt: "",
    tiers: []
  }]);
  assert.equal(syncSnapshots.items.upsert.mock.calls[2]?.[0]?.activeWheelConfigId, 91);
});

test("upsertSyncSnapshotIncremental updates meta when only wheel config data changes", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  const existingPresetDocuments: SyncPresetDocument[] = [
    {
      id: "sync:preset:user-1:keep",
      docType: "sync_preset",
      userId: "user-1",
      presetId: "keep",
      preset: { id: "keep", name: "Keep" },
      sales: [{ id: 1 }],
      version: 1,
      updatedAt: "2026-03-18T09:00:00.000Z"
    }
  ];
  const metaDocument: SyncMetaDocument = {
    id: "sync:meta:user-1",
    docType: "sync_meta",
    userId: "user-1",
    version: 3,
    updatedAt: "2026-03-18T09:00:00.000Z",
    wheelConfigs: [],
    activeWheelConfigId: null,
    salesMode: "entity",
    livePricingMode: "entity"
  };

  syncSnapshots.items.query.mockReturnValue({
    fetchAll: vi.fn().mockResolvedValue({
      resources: existingPresetDocuments
    })
  });
  syncSnapshots.items.upsert.mockResolvedValue({ resource: null });
  syncSnapshots.item.mockImplementation((id: string, userId: string) => ({
    read: vi.fn().mockResolvedValue({
      resource: id === "sync:meta:user-1" ? metaDocument : null
    }),
    delete: vi.fn().mockResolvedValue({ id, userId })
  }));
  getContainersMock.mockReturnValue({ syncSnapshots });

  const result = await upsertSyncSnapshotIncremental(createConfig(), {
    userId: "user-1",
    lots: [{ id: "keep", name: "Keep" }],
    salesByLot: {
      keep: [{ id: 1 }]
    },
    wheelConfigs: [{
      id: 42,
      name: "Synced wheel",
      spinPrice: 25,
      targetMargin: 30,
      createdAt: "",
      tiers: []
    }],
    activeWheelConfigId: 42,
    version: 10,
    updatedAt: "2026-03-18T16:00:00.000Z"
  });

  assert.deepEqual(result, {
    changed: true,
    upsertedCount: 0,
    deletedCount: 0
  });
  assert.equal(syncSnapshots.items.upsert.mock.calls.length, 1);
  assert.equal(syncSnapshots.items.upsert.mock.calls[0]?.[0]?.id, "sync:meta:user-1");
  assert.deepEqual(syncSnapshots.items.upsert.mock.calls[0]?.[0]?.wheelConfigs, [{
    id: 42,
    name: "Synced wheel",
    spinPrice: 25,
    targetMargin: 30,
    createdAt: "",
    tiers: []
  }]);
  assert.equal(syncSnapshots.items.upsert.mock.calls[0]?.[0]?.activeWheelConfigId, 42);
});
