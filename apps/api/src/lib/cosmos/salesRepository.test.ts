import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import type { ApiConfig, SaleDocument } from "../../types";

const {
  getContainersMock,
  isConflictErrorMock,
  isNotFoundErrorMock,
  isPreconditionFailedErrorMock,
  withCosmosRetryMock
} = vi.hoisted(() => ({
  getContainersMock: vi.fn(),
  isConflictErrorMock: vi.fn(),
  isNotFoundErrorMock: vi.fn(),
  isPreconditionFailedErrorMock: vi.fn(),
  withCosmosRetryMock: vi.fn(async <T>(operation: () => Promise<T>) => operation())
}));

vi.mock("./core", () => ({
  getContainers: getContainersMock,
  isConflictError: isConflictErrorMock,
  isNotFoundError: isNotFoundErrorMock,
  isPreconditionFailedError: isPreconditionFailedErrorMock,
  withCosmosRetry: withCosmosRetryMock
}));

import {
  deleteSaleDocument,
  EntityVersionConflictError,
  getLotSalesSyncMeta,
  listSalesForScope,
  listSalesForLot,
  listSyncScopeKeys,
  setSyncScopeEntityModes,
  upsertLotLivePricing,
  upsertSaleDocument
} from "./salesRepository";

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
    migrationCosmosDatabaseId: "whatfees",
    entitlementsContainerId: "entitlements",
    syncContainerId: "sync_data",
    migrationRunsContainerId: "migration_runs"
  };
}

function createSyncSnapshotsContainer() {
  return {
    items: {
      create: vi.fn(),
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
    return statusCode === 404;
  });
  isConflictErrorMock.mockImplementation((error: unknown) => {
    const statusCode = (error as { statusCode?: unknown })?.statusCode;
    return statusCode === 409;
  });
  isPreconditionFailedErrorMock.mockImplementation((error: unknown) => {
    const statusCode = (error as { statusCode?: unknown })?.statusCode;
    return statusCode === 412;
  });
});

test("upsertSaleDocument trims identifiers and creates version 1 for new rows", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  syncSnapshots.item.mockReturnValue({
    read: vi.fn().mockRejectedValue({ statusCode: 404 })
  });
  syncSnapshots.items.create.mockImplementation(async (document: SaleDocument) => ({
    resource: document
  }));
  getContainersMock.mockReturnValue({ syncSnapshots });

  const result = await upsertSaleDocument(createConfig(), {
    scopeKey: " user-1 ",
    lotId: " lot-1 ",
    saleId: " sale-1 ",
    sale: { id: 1, date: "2026-03-18" },
    updatedBy: " actor-1 ",
    mutationId: " mutation-1 ",
    baseVersion: 0
  });

  assert.equal(result.id, "sale:user-1:lot-1:sale-1");
  assert.equal(result.scopeKey, "user-1");
  assert.equal(result.lotId, "lot-1");
  assert.equal(result.saleId, "sale-1");
  assert.equal(result.updatedBy, "actor-1");
  assert.equal(result.mutationId, "mutation-1");
  assert.equal(result.version, 1);
  assert.equal(syncSnapshots.items.create.mock.calls.length, 1);
  assert.equal(syncSnapshots.items.upsert.mock.calls.length, 0);
});

test("upsertSaleDocument creates new rows with create so duplicate writers conflict atomically", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  syncSnapshots.item.mockReturnValue({
    read: vi.fn().mockRejectedValue({ statusCode: 404 })
  });
  syncSnapshots.items.create.mockImplementation(async (document: SaleDocument) => ({
    resource: document
  }));
  getContainersMock.mockReturnValue({ syncSnapshots });

  const result = await upsertSaleDocument(createConfig(), {
    scopeKey: "user-1",
    lotId: "lot-1",
    saleId: "sale-1",
    sale: { id: 1 },
    updatedBy: "user-1",
    mutationId: "m-1",
    baseVersion: 0
  });

  assert.equal(result.version, 1);
  assert.equal(syncSnapshots.items.create.mock.calls.length, 1);
  assert.equal(syncSnapshots.items.upsert.mock.calls.length, 0);

  syncSnapshots.items.create.mockRejectedValueOnce({ statusCode: 409 });
  await assert.rejects(
    () => upsertSaleDocument(createConfig(), {
      scopeKey: "user-1",
      lotId: "lot-1",
      saleId: "sale-2",
      sale: { id: 2 },
      updatedBy: "user-1",
      mutationId: "m-2",
      baseVersion: 0
    }),
    (error: unknown) => {
      assert.ok(error instanceof EntityVersionConflictError);
      assert.equal(error.message, "Sale changed since it was last loaded.");
      return true;
    }
  );
});

test("upsertSaleDocument replaces existing rows with an If-Match ETag", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  const existingSale: SaleDocument & { _etag: string } = {
    id: "sale:user-1:lot-1:sale-1",
    docType: "sale",
    userId: "user-1",
    scopeKey: "user-1",
    lotId: "lot-1",
    saleId: "sale-1",
    sale: { id: 1 },
    version: 3,
    updatedAt: "2026-03-18T00:00:00.000Z",
    updatedBy: "user-1",
    mutationId: "m-1",
    deletedAt: null,
    _etag: "etag-sale-3"
  };
  const replace = vi.fn(async (document: SaleDocument, _options?: unknown) => ({ resource: document }));
  syncSnapshots.item.mockReturnValue({
    read: vi.fn().mockResolvedValue({ resource: existingSale }),
    replace
  });
  syncSnapshots.items.upsert.mockImplementation(async (document: SaleDocument) => ({
    resource: document
  }));
  getContainersMock.mockReturnValue({ syncSnapshots });

  const result = await upsertSaleDocument(createConfig(), {
    scopeKey: "user-1",
    lotId: "lot-1",
    saleId: "sale-1",
    sale: { id: 1, price: 12 },
    updatedBy: "user-2",
    mutationId: "m-2",
    baseVersion: 3
  });

  assert.equal(result.version, 4);
  assert.equal(syncSnapshots.items.upsert.mock.calls.length, 0);
  assert.equal(replace.mock.calls.length, 1);
  assert.deepEqual(replace.mock.calls[0]?.[1], {
    accessCondition: {
      type: "IfMatch",
      condition: "etag-sale-3"
    }
  });

  replace.mockRejectedValueOnce({ statusCode: 412 });
  await assert.rejects(
    () => upsertSaleDocument(createConfig(), {
      scopeKey: "user-1",
      lotId: "lot-1",
      saleId: "sale-1",
      sale: { id: 1, price: 13 },
      updatedBy: "user-2",
      mutationId: "m-3",
      baseVersion: 3
    }),
    (error: unknown) => {
      assert.ok(error instanceof EntityVersionConflictError);
      assert.equal(error.message, "Sale changed since it was last loaded.");
      return true;
    }
  );
});

test("upsertSaleDocument rejects stale base versions", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  const existingSale: SaleDocument = {
    id: "sale:user-1:lot-1:sale-1",
    docType: "sale",
    userId: "user-1",
    scopeKey: "user-1",
    lotId: "lot-1",
    saleId: "sale-1",
    sale: { id: 1, date: "2026-03-18" },
    version: 3,
    updatedAt: "2026-03-18T00:00:00.000Z",
    updatedBy: "user-1",
    mutationId: "m-1",
    deletedAt: null
  };

  syncSnapshots.item.mockReturnValue({
    read: vi.fn().mockResolvedValue({ resource: existingSale })
  });
  getContainersMock.mockReturnValue({ syncSnapshots });

  await assert.rejects(
    () => upsertSaleDocument(createConfig(), {
      scopeKey: "user-1",
      lotId: "lot-1",
      saleId: "sale-1",
      sale: { id: 1 },
      updatedBy: "user-1",
      mutationId: "m-2",
      baseVersion: 2
    }),
    (error: unknown) => {
      assert.ok(error instanceof EntityVersionConflictError);
      assert.equal(error.message, "Sale changed since it was last loaded.");
      return true;
    }
  );
  assert.equal(syncSnapshots.items.upsert.mock.calls.length, 0);
});

test("deleteSaleDocument returns null when the row is missing or already deleted", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  syncSnapshots.item
    .mockReturnValueOnce({
      read: vi.fn().mockRejectedValue({ statusCode: 404 })
    })
    .mockReturnValueOnce({
      read: vi.fn().mockResolvedValue({
        resource: {
          id: "sale:user-1:lot-1:sale-1",
          docType: "sale",
          userId: "user-1",
          scopeKey: "user-1",
          lotId: "lot-1",
          saleId: "sale-1",
          sale: { id: 1 },
          version: 1,
          updatedAt: "2026-03-18T00:00:00.000Z",
          updatedBy: "user-1",
          mutationId: "m-1",
          deletedAt: "2026-03-18T01:00:00.000Z"
        }
      })
    });
  getContainersMock.mockReturnValue({ syncSnapshots });

  const missing = await deleteSaleDocument(createConfig(), {
    scopeKey: "user-1",
    lotId: "lot-1",
    saleId: "sale-1",
    updatedBy: "user-1",
    mutationId: "m-2"
  });
  const alreadyDeleted = await deleteSaleDocument(createConfig(), {
    scopeKey: "user-1",
    lotId: "lot-1",
    saleId: "sale-1",
    updatedBy: "user-1",
    mutationId: "m-2"
  });

  assert.equal(missing, null);
  assert.equal(alreadyDeleted, null);
  assert.equal(syncSnapshots.items.upsert.mock.calls.length, 0);
});

test("deleteSaleDocument soft-deletes with an If-Match ETag", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  const existingSale: SaleDocument & { _etag: string } = {
    id: "sale:user-1:lot-1:sale-1",
    docType: "sale",
    userId: "user-1",
    scopeKey: "user-1",
    lotId: "lot-1",
    saleId: "sale-1",
    sale: { id: 1 },
    version: 2,
    updatedAt: "2026-03-18T00:00:00.000Z",
    updatedBy: "user-1",
    mutationId: "m-1",
    deletedAt: null,
    _etag: "etag-delete-2"
  };
  const replace = vi.fn(async (document: SaleDocument, _options?: unknown) => ({ resource: document }));
  syncSnapshots.item.mockReturnValue({
    read: vi.fn().mockResolvedValue({ resource: existingSale }),
    replace
  });
  getContainersMock.mockReturnValue({ syncSnapshots });

  const result = await deleteSaleDocument(createConfig(), {
    scopeKey: "user-1",
    lotId: "lot-1",
    saleId: "sale-1",
    updatedBy: "user-2",
    mutationId: "m-delete",
    baseVersion: 2
  });

  assert.equal(result?.version, 3);
  assert.equal(syncSnapshots.items.upsert.mock.calls.length, 0);
  assert.equal(replace.mock.calls.length, 1);
  const replaceOptions = replace.mock.calls[0]?.[1] as {
    accessCondition?: { condition?: string };
  } | undefined;
  assert.equal(replaceOptions?.accessCondition?.condition, "etag-delete-2");
});

test("listSalesForLot filters invalid docs and sorts by date then sale id", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  syncSnapshots.items = {
    ...syncSnapshots.items,
    query: vi.fn().mockReturnValue({
      fetchAll: vi.fn().mockResolvedValue({
        resources: [
          {
            id: "sale:user-1:lot-1:sale-b",
            docType: "sale",
            userId: "user-1",
            scopeKey: "user-1",
            lotId: "lot-1",
            saleId: "sale-b",
            sale: { date: "2026-03-18" },
            version: 1,
            updatedAt: "2026-03-18T00:00:00.000Z",
            updatedBy: "user-1",
            mutationId: "m-1",
            deletedAt: null
          },
          {
            id: "sale:user-1:lot-1:sale-a",
            docType: "sale",
            userId: "user-1",
            scopeKey: "user-1",
            lotId: "lot-1",
            saleId: "sale-a",
            sale: { date: "2026-03-18" },
            version: 1,
            updatedAt: "2026-03-18T00:00:00.000Z",
            updatedBy: "user-1",
            mutationId: "m-2",
            deletedAt: null
          },
          {
            id: "ignored",
            docType: "sync_meta"
          },
          {
            id: "sale:user-1:lot-1:sale-old",
            docType: "sale",
            userId: "user-1",
            scopeKey: "user-1",
            lotId: "lot-1",
            saleId: "sale-old",
            sale: { date: "2026-03-17" },
            version: 1,
            updatedAt: "2026-03-18T00:00:00.000Z",
            updatedBy: "user-1",
            mutationId: "m-3",
            deletedAt: null
          }
        ]
      })
    })
  };
  getContainersMock.mockReturnValue({ syncSnapshots });

  const result = await listSalesForLot(createConfig(), "user-1", "lot-1");

  assert.deepEqual(
    result.map((entry) => entry.saleId),
    ["sale-old", "sale-a", "sale-b"]
  );
});

test("listSalesForScope filters by requested lot ids and sorts by lot then date then sale id", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  syncSnapshots.items = {
    ...syncSnapshots.items,
    query: vi.fn().mockReturnValue({
      fetchAll: vi.fn().mockResolvedValue({
        resources: [
          {
            id: "sale:user-1:lot-2:sale-b",
            docType: "sale",
            userId: "user-1",
            scopeKey: "user-1",
            lotId: "lot-2",
            saleId: "sale-b",
            sale: { date: "2026-03-18" },
            version: 1,
            updatedAt: "2026-03-18T00:00:00.000Z",
            updatedBy: "user-1",
            mutationId: "m-1",
            deletedAt: null
          },
          {
            id: "sale:user-1:lot-1:sale-a",
            docType: "sale",
            userId: "user-1",
            scopeKey: "user-1",
            lotId: "lot-1",
            saleId: "sale-a",
            sale: { date: "2026-03-17" },
            version: 1,
            updatedAt: "2026-03-18T00:00:00.000Z",
            updatedBy: "user-1",
            mutationId: "m-2",
            deletedAt: null
          },
          {
            id: "sale:user-1:lot-2:sale-a",
            docType: "sale",
            userId: "user-1",
            scopeKey: "user-1",
            lotId: "lot-2",
            saleId: "sale-a",
            sale: { date: "2026-03-18" },
            version: 1,
            updatedAt: "2026-03-18T00:00:00.000Z",
            updatedBy: "user-1",
            mutationId: "m-3",
            deletedAt: null
          }
        ]
      })
    })
  };
  getContainersMock.mockReturnValue({ syncSnapshots });

  const result = await listSalesForScope(createConfig(), "user-1", ["lot-2", "lot-1", "lot-2"]);

  assert.equal(syncSnapshots.items.query.mock.calls[0]?.[0]?.parameters?.[2]?.name, "@lotIds");
  assert.deepEqual(syncSnapshots.items.query.mock.calls[0]?.[0]?.parameters?.[2]?.value, ["lot-2", "lot-1"]);
  assert.deepEqual(
    result.map((entry) => `${entry.lotId}:${entry.saleId}`),
    ["lot-1:sale-a", "lot-2:sale-a", "lot-2:sale-b"]
  );
});

test("getLotSalesSyncMeta returns active count plus latest mutation time for a lot", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  syncSnapshots.items = {
    ...syncSnapshots.items,
    query: vi.fn()
      .mockReturnValueOnce({
        fetchAll: vi.fn().mockResolvedValue({
          resources: [2]
        })
      })
      .mockReturnValueOnce({
        fetchAll: vi.fn().mockResolvedValue({
          resources: ["2026-03-18T12:34:56.000Z"]
        })
      })
  };
  getContainersMock.mockReturnValue({ syncSnapshots });

  const result = await getLotSalesSyncMeta(createConfig(), "user-1", "lot-9");

  assert.equal(syncSnapshots.items.query.mock.calls.length, 2);
  assert.equal(syncSnapshots.items.query.mock.calls[0]?.[0]?.parameters?.[2]?.value, "lot-9");
  assert.equal(syncSnapshots.items.query.mock.calls[1]?.[0]?.parameters?.[2]?.value, "lot-9");
  assert.deepEqual(result, {
    activeCount: 2,
    latestUpdatedAt: "2026-03-18T12:34:56.000Z"
  });
});

test("upsertLotLivePricing rejects stale base versions", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  syncSnapshots.item.mockReturnValue({
    read: vi.fn().mockResolvedValue({
      resource: {
        id: "lot_live_pricing:user-1:lot-1",
        docType: "lot_live_pricing",
        userId: "user-1",
        scopeKey: "user-1",
        lotId: "lot-1",
        livePackPrice: 1,
        liveBoxPriceSell: 2,
        liveSpotPrice: 3,
        version: 4,
        updatedAt: "2026-03-18T00:00:00.000Z",
        updatedBy: "user-1",
        mutationId: "m-1"
      }
    })
  });
  getContainersMock.mockReturnValue({ syncSnapshots });

  await assert.rejects(
    () => upsertLotLivePricing(createConfig(), {
      scopeKey: "user-1",
      lotId: "lot-1",
      livePackPrice: 4,
      liveBoxPriceSell: 5,
      liveSpotPrice: 6,
      updatedBy: "user-1",
      mutationId: "m-2",
      baseVersion: 2
    }),
    (error: unknown) => {
      assert.ok(error instanceof EntityVersionConflictError);
      assert.equal(error.message, "Live pricing changed since it was last loaded.");
      return true;
    }
  );
});

test("upsertLotLivePricing creates new rows and replaces existing rows with Cosmos CAS", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  const existingPricing = {
    id: "lot_live_pricing:user-1:lot-1",
    docType: "lot_live_pricing",
    userId: "user-1",
    scopeKey: "user-1",
    lotId: "lot-1",
    livePackPrice: 1,
    liveBoxPriceSell: 2,
    liveSpotPrice: 3,
    version: 4,
    updatedAt: "2026-03-18T00:00:00.000Z",
    updatedBy: "user-1",
    mutationId: "m-1",
    _etag: "etag-live-4"
  };
  const replace = vi.fn(async (document, _options?: unknown) => ({ resource: document }));
  syncSnapshots.item
    .mockReturnValueOnce({
      read: vi.fn().mockRejectedValue({ statusCode: 404 })
    })
    .mockReturnValue({
      read: vi.fn().mockResolvedValue({ resource: existingPricing }),
      replace
    });
  syncSnapshots.items.create.mockImplementation(async (document) => ({ resource: document }));
  getContainersMock.mockReturnValue({ syncSnapshots });

  const created = await upsertLotLivePricing(createConfig(), {
    scopeKey: "user-1",
    lotId: "lot-1",
    livePackPrice: 4,
    liveBoxPriceSell: 5,
    liveSpotPrice: 6,
    updatedBy: "user-1",
    mutationId: "m-2",
    baseVersion: 0
  });

  assert.equal(created.version, 1);
  assert.equal(syncSnapshots.items.create.mock.calls.length, 1);
  assert.equal(syncSnapshots.items.upsert.mock.calls.length, 0);

  const updated = await upsertLotLivePricing(createConfig(), {
    scopeKey: "user-1",
    lotId: "lot-1",
    livePackPrice: 7,
    liveBoxPriceSell: 8,
    liveSpotPrice: 9,
    updatedBy: "user-1",
    mutationId: "m-3",
    baseVersion: 4
  });

  assert.equal(updated.version, 5);
  assert.equal(replace.mock.calls.length, 1);
  const replaceOptions = replace.mock.calls[0]?.[1] as {
    accessCondition?: { condition?: string };
  } | undefined;
  assert.equal(replaceOptions?.accessCondition?.condition, "etag-live-4");

  replace.mockRejectedValueOnce({ statusCode: 412 });
  await assert.rejects(
    () => upsertLotLivePricing(createConfig(), {
      scopeKey: "user-1",
      lotId: "lot-1",
      livePackPrice: 10,
      liveBoxPriceSell: 11,
      liveSpotPrice: 12,
      updatedBy: "user-1",
      mutationId: "m-4",
      baseVersion: 4
    }),
    (error: unknown) => {
      assert.ok(error instanceof EntityVersionConflictError);
      assert.equal(error.message, "Live pricing changed since it was last loaded.");
      return true;
    }
  );
});

test("setSyncScopeEntityModes preserves the existing sync meta version", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  syncSnapshots.item.mockReturnValue({
    read: vi.fn().mockResolvedValue({
      resource: {
        id: "sync:meta:user-1",
        docType: "sync_meta",
        userId: "user-1",
        version: 7,
        updatedAt: "2026-03-17T00:00:00.000Z",
        salesMode: "snapshot",
        livePricingMode: "lot_defaults"
      }
    })
  });
  syncSnapshots.items.upsert.mockImplementation(async (document) => ({
    resource: document
  }));
  getContainersMock.mockReturnValue({ syncSnapshots });

  const result = await setSyncScopeEntityModes(createConfig(), {
    scopeKey: "user-1",
    updatedAt: "2026-03-18T00:00:00.000Z",
    salesMode: "entity",
    livePricingMode: "entity"
  });

  assert.equal(result.version, 7);
  assert.equal(result.salesMode, "entity");
  assert.equal(result.livePricingMode, "entity");
});

test("setSyncScopeEntityModes preserves wheel config metadata on sync_meta", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  syncSnapshots.item.mockReturnValue({
    read: vi.fn().mockResolvedValue({
      resource: {
        id: "sync:meta:user-1",
        docType: "sync_meta",
        userId: "user-1",
        version: 7,
        updatedAt: "2026-03-17T00:00:00.000Z",
        wheelConfigs: [{ id: 42, name: "Wheel A" }],
        activeWheelConfigId: 42,
        salesMode: "snapshot",
        livePricingMode: "lot_defaults"
      }
    })
  });
  syncSnapshots.items.upsert.mockImplementation(async (document) => ({
    resource: document
  }));
  getContainersMock.mockReturnValue({ syncSnapshots });

  const result = await setSyncScopeEntityModes(createConfig(), {
    scopeKey: "user-1",
    updatedAt: "2026-03-18T00:00:00.000Z",
    salesMode: "entity",
    livePricingMode: "entity"
  });

  assert.deepEqual(syncSnapshots.items.upsert.mock.calls[0]?.[0]?.wheelConfigs, [{ id: 42, name: "Wheel A" }]);
  assert.equal(syncSnapshots.items.upsert.mock.calls[0]?.[0]?.activeWheelConfigId, 42);
  assert.deepEqual(result.wheelConfigs, [{ id: 42, name: "Wheel A" }]);
  assert.equal(result.activeWheelConfigId, 42);
});

test("listSyncScopeKeys de-duplicates and sorts scope keys", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  syncSnapshots.items = {
    ...syncSnapshots.items,
    query: vi.fn().mockReturnValue({
      fetchAll: vi.fn().mockResolvedValue({
        resources: [
          { userId: "ws:team-b" },
          { userId: "user-1" },
          { userId: "ws:team-b" },
          { userId: " " }
        ]
      })
    })
  };
  getContainersMock.mockReturnValue({ syncSnapshots });

  const result = await listSyncScopeKeys(createConfig());

  assert.deepEqual(result, ["user-1", "ws:team-b"]);
});
