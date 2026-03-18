import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import type { ApiConfig, SaleDocument } from "../../types";

const {
  getContainersMock,
  isNotFoundErrorMock,
  withCosmosRetryMock
} = vi.hoisted(() => ({
  getContainersMock: vi.fn(),
  isNotFoundErrorMock: vi.fn(),
  withCosmosRetryMock: vi.fn(async <T>(operation: () => Promise<T>) => operation())
}));

vi.mock("./core", () => ({
  getContainers: getContainersMock,
  isNotFoundError: isNotFoundErrorMock,
  withCosmosRetry: withCosmosRetryMock
}));

import {
  EntityVersionConflictError,
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
    entitlementsContainerId: "entitlements",
    syncContainerId: "sync_data",
    migrationRunsContainerId: "migration_runs"
  };
}

function createSyncSnapshotsContainer() {
  return {
    items: {
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
});

test("upsertSaleDocument trims identifiers and creates version 1 for new rows", async () => {
  const syncSnapshots = createSyncSnapshotsContainer();
  syncSnapshots.item.mockReturnValue({
    read: vi.fn().mockRejectedValue({ statusCode: 404 })
  });
  syncSnapshots.items.upsert.mockImplementation(async (document: SaleDocument) => ({
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
  assert.equal(syncSnapshots.items.upsert.mock.calls.length, 1);
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
