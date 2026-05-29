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
  isConflictErrorMock,
  isNotFoundErrorMock,
  isPreconditionFailedErrorMock,
  withCosmosRetryMock
} = vi.hoisted(() => ({
  getContainersMock: vi.fn(),
  getExternalSyncContainerMock: vi.fn(),
  isConflictErrorMock: vi.fn(),
  isNotFoundErrorMock: vi.fn(),
  isPreconditionFailedErrorMock: vi.fn(),
  withCosmosRetryMock: vi.fn(async <T>(operation: () => Promise<T>) => operation())
}));

vi.mock("./core", () => ({
  EPOCH_DATE_ISO: "1970-01-01T00:00:00.000Z",
  getContainers: getContainersMock,
  getExternalSyncContainer: getExternalSyncContainerMock,
  isConflictError: isConflictErrorMock,
  isNotFoundError: isNotFoundErrorMock,
  isPreconditionFailedError: isPreconditionFailedErrorMock,
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
      upsert: vi.fn(),
      batch: vi.fn()
    },
    item: vi.fn()
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  isConflictErrorMock.mockImplementation((error: unknown) => {
    const statusCode = (error as { statusCode?: unknown })?.statusCode;
    const code = (error as { code?: unknown })?.code;
    return statusCode === 409 || code === 409 || code === "Conflict";
  });
  isNotFoundErrorMock.mockImplementation((error: unknown) => {
    const statusCode = (error as { statusCode?: unknown })?.statusCode;
    const code = (error as { code?: unknown })?.code;
    return statusCode === 404 || code === 404 || code === "NotFound";
  });
  isPreconditionFailedErrorMock.mockImplementation((error: unknown) => {
    const statusCode = (error as { statusCode?: unknown })?.statusCode;
    const code = (error as { code?: unknown })?.code;
    return statusCode === 412 || code === 412 || code === "PreconditionFailed";
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

test("getEffectiveSyncSnapshot follows the meta preset set and ignores orphaned pending documents", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  const presetDocuments = [
    {
      id: "sync:preset:user-1:legacy",
      docType: "sync_preset",
      userId: "user-1",
      presetId: "legacy",
      preset: { id: "legacy", name: "Legacy should be ignored" },
      sales: [{ id: 1 }],
      version: 3,
      updatedAt: "2026-03-18T10:00:00.000Z"
    },
    {
      id: "sync:preset-set:user-1:pending:orphan",
      docType: "sync_preset",
      userId: "user-1",
      presetId: "orphan",
      preset: { id: "orphan", name: "Orphan should be ignored" },
      sales: [{ id: 2 }],
      presetSetId: "pending",
      version: 99,
      updatedAt: "2026-03-18T14:00:00.000Z"
    },
    {
      id: "sync:preset-set:user-1:current:current",
      docType: "sync_preset",
      userId: "user-1",
      presetId: "current",
      preset: { id: "current", name: "Current" },
      sales: [{ id: 3 }],
      presetSetId: "current",
      version: 8,
      updatedAt: "2026-03-18T12:00:00.000Z"
    }
  ] as SyncPresetDocument[];
  const metaDocument = {
    id: "sync:meta:user-1",
    docType: "sync_meta",
    userId: "user-1",
    version: 8,
    updatedAt: "2026-03-18T13:00:00.000Z",
    presetSetId: "current"
  } as SyncMetaDocument;

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

  assert.deepEqual(snapshot?.lots, [{ id: "current", name: "Current" }]);
  assert.deepEqual(snapshot?.salesByLot, { current: [{ id: 3 }] });
  assert.equal(snapshot?.version, 8);
  assert.equal(snapshot?.updatedAt, "2026-03-18T13:00:00.000Z");
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
  assert.equal(syncSnapshots.items.upsert.mock.calls.length, 0);
  assert.equal(syncSnapshots.items.batch.mock.calls.length, 1);
  const operations = syncSnapshots.items.batch.mock.calls[0]?.[0] as Array<{
    operationType: string;
    id?: string;
    ifMatch?: string;
    resourceBody?: SyncMetaDocument | SyncPresetDocument;
  }>;
  const presetOperations = operations.slice(0, -1);
  const metaOperation = operations.at(-1);
  const presetSetId = (metaOperation?.resourceBody as SyncMetaDocument | undefined)?.presetSetId ?? "";

  assert.equal(syncSnapshots.items.batch.mock.calls[0]?.[1], "user-1");
  assert.deepEqual(presetOperations.map((operation) => operation.operationType), ["Upsert", "Upsert"]);
  assert.deepEqual(presetOperations.map((operation) => operation.resourceBody?.presetId), ["keep", "new"]);
  assert.equal(presetOperations.every((operation) =>
    (operation.resourceBody as SyncPresetDocument | undefined)?.presetSetId === presetSetId
  ), true);
  assert.match(presetSetId, /^v9:/);
  assert.equal(metaOperation?.operationType, "Replace");
  assert.equal(metaOperation?.id, "sync:meta:user-1");
  assert.equal((metaOperation?.resourceBody as SyncMetaDocument)?.salesMode, "entity");
  assert.equal((metaOperation?.resourceBody as SyncMetaDocument)?.livePricingMode, "entity");
  assert.deepEqual((metaOperation?.resourceBody as SyncMetaDocument)?.wheelConfigs, [{
    id: 91,
    name: "Wheel A",
    spinPrice: 10,
    targetMargin: 40,
    createdAt: "",
    tiers: []
  }]);
  assert.equal((metaOperation?.resourceBody as SyncMetaDocument)?.activeWheelConfigId, 91);
});

test("upsertSyncSnapshotIncremental writes changed presets and meta in one ETag guarded batch", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  const metaDocument = {
    id: "sync:meta:user-1",
    docType: "sync_meta" as const,
    userId: "user-1",
    version: 3,
    updatedAt: "2026-03-18T09:00:00.000Z",
    wheelConfigs: [],
    activeWheelConfigId: null,
    _etag: "etag-3"
  };

  syncSnapshots.items.query.mockReturnValue({
    fetchAll: vi.fn().mockResolvedValue({
      resources: []
    })
  });
  syncSnapshots.items.batch.mockResolvedValue({ result: [] });
  syncSnapshots.item.mockImplementation((id: string, userId: string) => ({
    read: vi.fn().mockResolvedValue({
      resource: id === "sync:meta:user-1" ? metaDocument : null
    }),
    delete: vi.fn().mockResolvedValue({ id, userId })
  }));
  getContainersMock.mockReturnValue({ syncSnapshots });

  const input = {
    userId: "user-1",
    lots: [{ id: "new", name: "New preset" }],
    salesByLot: {
      new: [{ id: 22 }]
    },
    wheelConfigs: [],
    activeWheelConfigId: null,
    version: 4,
    expectedVersion: 3,
    updatedAt: "2026-03-18T15:00:00.000Z"
  } as Parameters<typeof upsertSyncSnapshotIncremental>[1] & { expectedVersion: number };

  const result = await upsertSyncSnapshotIncremental(createConfig(), input);

  assert.deepEqual(result, {
    changed: true,
    upsertedCount: 1,
    deletedCount: 0
  });
  assert.equal(syncSnapshots.items.upsert.mock.calls.length, 0);
  assert.equal(syncSnapshots.items.batch.mock.calls.length, 1);
  assert.equal(syncSnapshots.items.batch.mock.calls[0]?.[1], "user-1");
  const operations = syncSnapshots.items.batch.mock.calls[0]?.[0] as Array<{
    operationType: string;
    id?: string;
    ifMatch?: string;
    resourceBody?: SyncMetaDocument | SyncPresetDocument;
  }>;
  const presetOperation = operations[0];
  const metaOperation = operations.at(-1);
  const presetSetId = (metaOperation?.resourceBody as SyncMetaDocument | undefined)?.presetSetId ?? "";
  assert.equal(presetOperation?.operationType, "Upsert");
  assert.equal(presetOperation?.resourceBody?.id, `sync:preset-set:user-1:${presetSetId}:new`);
  assert.equal((presetOperation?.resourceBody as SyncPresetDocument | undefined)?.presetSetId, presetSetId);
  assert.equal(metaOperation?.operationType, "Replace");
  assert.equal(metaOperation?.id, "sync:meta:user-1");
  assert.equal(metaOperation?.ifMatch, "etag-3");
  assert.match(presetSetId, /^v4:/);
});

test("upsertSyncSnapshotIncremental writes a versioned preset set before swapping the meta pointer", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  const existingPresetDocuments: SyncPresetDocument[] = [
    {
      id: "sync:preset:user-1:keep",
      docType: "sync_preset",
      userId: "user-1",
      presetId: "keep",
      preset: { id: "keep", name: "Keep" },
      sales: [{ id: 1 }],
      version: 3,
      updatedAt: "2026-03-18T09:00:00.000Z"
    },
    {
      id: "sync:preset:user-1:drop",
      docType: "sync_preset",
      userId: "user-1",
      presetId: "drop",
      preset: { id: "drop", name: "Drop" },
      sales: [],
      version: 3,
      updatedAt: "2026-03-18T09:00:00.000Z"
    }
  ];
  const metaDocument = {
    id: "sync:meta:user-1",
    docType: "sync_meta" as const,
    userId: "user-1",
    version: 3,
    updatedAt: "2026-03-18T09:00:00.000Z",
    wheelConfigs: [],
    activeWheelConfigId: null,
    _etag: "etag-3"
  };

  syncSnapshots.items.query.mockReturnValue({
    fetchAll: vi.fn().mockResolvedValue({
      resources: existingPresetDocuments
    })
  });
  syncSnapshots.items.batch.mockResolvedValue({ result: [] });
  syncSnapshots.item.mockImplementation((id: string) => ({
    read: vi.fn().mockResolvedValue({
      resource: id === "sync:meta:user-1" ? metaDocument : null
    })
  }));
  getContainersMock.mockReturnValue({ syncSnapshots });

  const input = {
    userId: "user-1",
    lots: [
      { id: "keep", name: "Keep renamed" },
      { id: "new", name: "New preset" }
    ],
    salesByLot: {
      keep: [{ id: 11 }],
      new: [{ id: 22 }]
    },
    wheelConfigs: [],
    activeWheelConfigId: null,
    version: 4,
    expectedVersion: 3,
    updatedAt: "2026-03-18T15:00:00.000Z"
  } as Parameters<typeof upsertSyncSnapshotIncremental>[1] & { expectedVersion: number };

  const result = await upsertSyncSnapshotIncremental(createConfig(), input);

  assert.deepEqual(result, {
    changed: true,
    upsertedCount: 2,
    deletedCount: 1
  });
  const operations = syncSnapshots.items.batch.mock.calls[0]?.[0] as Array<{
    operationType: string;
    id?: string;
    ifMatch?: string;
    resourceBody?: SyncMetaDocument | SyncPresetDocument;
  }>;
  const presetOperations = operations.slice(0, -1);
  const metaOperation = operations.at(-1);
  const presetSetIds = new Set(presetOperations.map((operation) =>
    String((operation.resourceBody as SyncPresetDocument | undefined)?.presetSetId ?? "")
  ));

  assert.equal(syncSnapshots.items.batch.mock.calls[0]?.[1], "user-1");
  assert.deepEqual(presetOperations.map((operation) => operation.operationType), ["Upsert", "Upsert"]);
  assert.deepEqual(presetOperations.map((operation) => operation.resourceBody?.presetId), ["keep", "new"]);
  assert.equal([...presetSetIds].length, 1);
  assert.match([...presetSetIds][0] ?? "", /^v4:/);
  assert.deepEqual(
    presetOperations.map((operation) => operation.resourceBody?.id).every((id) =>
      typeof id === "string" && id.startsWith(`sync:preset-set:user-1:${[...presetSetIds][0]}:`)
    ),
    true
  );
  assert.equal(metaOperation?.operationType, "Replace");
  assert.equal(metaOperation?.ifMatch, "etag-3");
  assert.equal((metaOperation?.resourceBody as SyncMetaDocument | undefined)?.presetSetId, [...presetSetIds][0]);
});

test("upsertSyncSnapshotIncremental keeps large writes behind the final meta CAS", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  const replaceMock = vi.fn().mockResolvedValue({ resource: null });
  const metaDocument = {
    id: "sync:meta:user-1",
    docType: "sync_meta" as const,
    userId: "user-1",
    version: 1,
    updatedAt: "2026-03-18T09:00:00.000Z",
    wheelConfigs: [],
    activeWheelConfigId: null,
    _etag: "etag-1"
  };
  const lots = Array.from({ length: 101 }, (_, index) => ({
    id: `lot-${index + 1}`,
    name: `Lot ${index + 1}`
  }));

  syncSnapshots.items.query.mockReturnValue({
    fetchAll: vi.fn().mockResolvedValue({
      resources: []
    })
  });
  syncSnapshots.items.upsert.mockResolvedValue({ resource: null });
  syncSnapshots.item.mockImplementation((id: string) => ({
    read: vi.fn().mockResolvedValue({
      resource: id === "sync:meta:user-1" ? metaDocument : null
    }),
    replace: replaceMock
  }));
  getContainersMock.mockReturnValue({ syncSnapshots });

  await upsertSyncSnapshotIncremental(createConfig(), {
    userId: "user-1",
    lots,
    salesByLot: Object.fromEntries(lots.map((lot) => [lot.id, []])),
    wheelConfigs: [],
    activeWheelConfigId: null,
    version: 2,
    expectedVersion: 1,
    updatedAt: "2026-03-18T15:00:00.000Z"
  });

  const stagedPresetSetIds = new Set(syncSnapshots.items.upsert.mock.calls.map((call) =>
    String((call[0] as SyncPresetDocument | undefined)?.presetSetId ?? "")
  ));
  const metaBody = replaceMock.mock.calls[0]?.[0] as SyncMetaDocument;
  const replaceOptions = replaceMock.mock.calls[0]?.[1] as {
    accessCondition?: { type?: string; condition?: string };
  };

  assert.equal(syncSnapshots.items.batch.mock.calls.length, 0);
  assert.equal(syncSnapshots.items.upsert.mock.calls.length, 101);
  assert.equal(replaceMock.mock.calls.length, 1);
  assert.equal(stagedPresetSetIds.size, 1);
  assert.equal(metaBody.presetSetId, [...stagedPresetSetIds][0]);
  assert.equal(replaceOptions.accessCondition?.type, "IfMatch");
  assert.equal(replaceOptions.accessCondition?.condition, "etag-1");
});

test("upsertSyncSnapshotIncremental rejects stale expected versions before writing", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  const metaDocument: SyncMetaDocument = {
    id: "sync:meta:user-1",
    docType: "sync_meta",
    userId: "user-1",
    version: 3,
    updatedAt: "2026-03-18T09:00:00.000Z",
    wheelConfigs: [],
    activeWheelConfigId: null
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

  const input = {
    userId: "user-1",
    lots: [{ id: "new", name: "New preset" }],
    salesByLot: {
      new: [{ id: 22 }]
    },
    wheelConfigs: [],
    activeWheelConfigId: null,
    version: 4,
    expectedVersion: 2,
    updatedAt: "2026-03-18T15:00:00.000Z"
  } as Parameters<typeof upsertSyncSnapshotIncremental>[1] & { expectedVersion: number };

  await assert.rejects(
    () => upsertSyncSnapshotIncremental(createConfig(), input),
    /Cloud data changed since your last sync/
  );
  assert.equal(syncSnapshots.items.upsert.mock.calls.length, 0);
  assert.equal(syncSnapshots.items.batch.mock.calls.length, 0);
});

test("upsertSyncSnapshotIncremental ignores orphaned preset sets when checking expected versions", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  const orphanedDocument = {
    id: "sync:preset-set:user-1:orphan:orphan",
    docType: "sync_preset",
    userId: "user-1",
    presetId: "orphan",
    preset: { id: "orphan", name: "Orphan should not advance CAS" },
    sales: [],
    presetSetId: "orphan",
    version: 99,
    updatedAt: "2026-03-18T15:00:00.000Z"
  } as SyncPresetDocument;
  const legacyDocument: SyncPresetDocument = {
    id: "sync:preset:user-1:keep",
    docType: "sync_preset",
    userId: "user-1",
    presetId: "keep",
    preset: { id: "keep", name: "Keep" },
    sales: [],
    version: 3,
    updatedAt: "2026-03-18T09:00:00.000Z"
  };
  const metaDocument: SyncMetaDocument = {
    id: "sync:meta:user-1",
    docType: "sync_meta",
    userId: "user-1",
    version: 3,
    updatedAt: "2026-03-18T09:00:00.000Z",
    wheelConfigs: [],
    activeWheelConfigId: null
  };

  syncSnapshots.items.query.mockReturnValue({
    fetchAll: vi.fn().mockResolvedValue({
      resources: [legacyDocument, orphanedDocument]
    })
  });
  syncSnapshots.items.batch.mockResolvedValue({ result: [] });
  syncSnapshots.item.mockImplementation((id: string) => ({
    read: vi.fn().mockResolvedValue({
      resource: id === "sync:meta:user-1" ? metaDocument : null
    })
  }));
  getContainersMock.mockReturnValue({ syncSnapshots });

  await upsertSyncSnapshotIncremental(createConfig(), {
    userId: "user-1",
    lots: [{ id: "keep", name: "Keep renamed" }],
    salesByLot: { keep: [] },
    wheelConfigs: [],
    activeWheelConfigId: null,
    version: 4,
    expectedVersion: 3,
    updatedAt: "2026-03-18T15:00:00.000Z"
  });

  assert.equal(syncSnapshots.items.batch.mock.calls.length, 1);
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
  assert.equal(syncSnapshots.items.upsert.mock.calls.length, 0);
  assert.equal(syncSnapshots.items.batch.mock.calls.length, 1);
  const metaOperation = syncSnapshots.items.batch.mock.calls[0]?.[0]?.[0] as {
    operationType: string;
    id: string;
    resourceBody: SyncMetaDocument;
  };
  assert.equal(metaOperation.operationType, "Replace");
  assert.equal(metaOperation.id, "sync:meta:user-1");
  assert.deepEqual(metaOperation.resourceBody.wheelConfigs, [{
    id: 42,
    name: "Synced wheel",
    spinPrice: 25,
    targetMargin: 30,
    createdAt: "",
    tiers: []
  }]);
  assert.equal(metaOperation.resourceBody.activeWheelConfigId, 42);
});

test("upsertSyncSnapshotIncremental updates meta when only system pricing defaults change", async () => {
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
    systemPricingDefaults: {
      sellingCurrency: "CAD",
      sellingTaxPercent: 15
    }
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
    wheelConfigs: [],
    activeWheelConfigId: null,
    systemPricingDefaults: {
      sellingCurrency: "USD",
      sellingTaxPercent: 8,
      targetProfitPercent: 21
    },
    version: 10,
    updatedAt: "2026-03-18T16:00:00.000Z"
  });

  assert.deepEqual(result, {
    changed: true,
    upsertedCount: 0,
    deletedCount: 0
  });
  assert.equal(syncSnapshots.items.upsert.mock.calls.length, 0);
  assert.equal(syncSnapshots.items.batch.mock.calls.length, 1);
  const metaOperation = syncSnapshots.items.batch.mock.calls[0]?.[0]?.[0] as {
    operationType: string;
    id: string;
    resourceBody: SyncMetaDocument;
  };
  assert.equal(metaOperation.operationType, "Replace");
  assert.equal(metaOperation.id, "sync:meta:user-1");
  assert.deepEqual(metaOperation.resourceBody.systemPricingDefaults, {
    sellingCurrency: "USD",
    sellingTaxPercent: 8,
    targetProfitPercent: 21
  });
});

test("upsertSyncSnapshotIncremental preserves system pricing defaults when clients omit the field", async () => {
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
    systemPricingDefaults: {
      sellingCurrency: "CAD",
      sellingTaxPercent: 15
    }
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
    wheelConfigs: [],
    activeWheelConfigId: null,
    version: 10,
    updatedAt: "2026-03-18T16:00:00.000Z"
  });

  assert.deepEqual(result, {
    changed: false,
    upsertedCount: 0,
    deletedCount: 0
  });
  assert.equal(syncSnapshots.items.upsert.mock.calls.length, 0);
});
