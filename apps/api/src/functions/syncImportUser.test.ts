import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import type { ApiConfig } from "../types";

vi.mock("@azure/functions", () => ({
  app: {
    http: vi.fn()
  }
}));

const {
  getConfigMock,
  resolveUserIdMock,
  getEffectiveSyncSnapshotMock,
  getEffectiveSyncSnapshotFromExternalSourceMock,
  upsertSyncSnapshotIncrementalMock
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  resolveUserIdMock: vi.fn(),
  getEffectiveSyncSnapshotMock: vi.fn(),
  getEffectiveSyncSnapshotFromExternalSourceMock: vi.fn(),
  upsertSyncSnapshotIncrementalMock: vi.fn()
}));

vi.mock("../lib/config", () => ({
  getConfig: getConfigMock
}));

vi.mock("../lib/auth", () => ({
  HttpError: class HttpError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  resolveUserId: resolveUserIdMock,
  consumeAuthResponseHeaders: vi.fn(() => ({}))
}));

vi.mock("../lib/cosmos", () => ({
  getEffectiveSyncSnapshot: getEffectiveSyncSnapshotMock,
  getEffectiveSyncSnapshotFromExternalSource: getEffectiveSyncSnapshotFromExternalSourceMock,
  upsertSyncSnapshotIncremental: upsertSyncSnapshotIncrementalMock
}));

import { syncImportUser } from "./syncImportUser";

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
    syncImportSourceCosmosEndpoint: "https://prod.documents.azure.com:443/",
    syncImportSourceCosmosKey: "prod-key",
    syncImportSourceCosmosDatabaseId: "whatfees-prod",
    syncImportSourceSyncContainerId: "sync_data_prod",
    migrationRunsContainerId: "migration_runs"
  };
}

function createRequest(body?: unknown) {
  return {
    method: "POST",
    headers: {
      get(_name: string) {
        return null;
      }
    },
    json: async () => body
  };
}

function createContext() {
  return {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getConfigMock.mockReturnValue(createConfig());
  resolveUserIdMock.mockResolvedValue("107850224060485991888");
  getEffectiveSyncSnapshotFromExternalSourceMock.mockResolvedValue({
    lots: [{ id: 1, name: "Lot A" }],
    salesByLot: { "1": [{ id: 11 }] },
    version: 5,
    updatedAt: "2026-03-09T00:00:00.000Z"
  });
  getEffectiveSyncSnapshotMock.mockResolvedValue({
    lots: [{ id: 1, name: "Lot A" }],
    salesByLot: { "1": [{ id: 11 }] },
    version: 2,
    updatedAt: "2026-03-09T00:00:00.000Z"
  });
  upsertSyncSnapshotIncrementalMock.mockResolvedValue({
    changed: true,
    upsertedCount: 1,
    deletedCount: 0
  });
});

test("syncImportUser rejects non-admin actor", async () => {
  resolveUserIdMock.mockResolvedValue("not-admin");
  const response = await syncImportUser(createRequest({ sourceUserId: "123" }) as never, createContext() as never);

  assert.equal(response.status, 403);
  assert.equal((response.jsonBody as { error: string }).error, "Forbidden.");
  assert.equal(getEffectiveSyncSnapshotFromExternalSourceMock.mock.calls.length, 0);
  assert.equal(getEffectiveSyncSnapshotMock.mock.calls.length, 0);
});

test("syncImportUser validates missing source user id", async () => {
  const response = await syncImportUser(createRequest({ sourceUserId: " " }) as never, createContext() as never);

  assert.equal(response.status, 400);
  assert.equal((response.jsonBody as { error: string }).error, "Field 'sourceUserId' is required.");
  assert.equal(getEffectiveSyncSnapshotFromExternalSourceMock.mock.calls.length, 0);
  assert.equal(getEffectiveSyncSnapshotMock.mock.calls.length, 0);
});

test("syncImportUser returns 404 when source snapshot is not found", async () => {
  getEffectiveSyncSnapshotFromExternalSourceMock.mockResolvedValueOnce(null);
  const response = await syncImportUser(createRequest({ sourceUserId: "123456" }) as never, createContext() as never);

  assert.equal(response.status, 404);
  assert.equal((response.jsonBody as { error: string }).error, "Source sync snapshot was not found.");
  assert.equal(upsertSyncSnapshotIncrementalMock.mock.calls.length, 0);
});

test("syncImportUser copies source snapshot into actor partition", async () => {
  getEffectiveSyncSnapshotFromExternalSourceMock.mockResolvedValue({
    lots: [{ id: 2, name: "Imported lot" }],
    salesByLot: { "2": [{ id: 22 }] },
    version: 7,
    updatedAt: "2026-03-09T10:00:00.000Z"
  });
  getEffectiveSyncSnapshotMock.mockImplementation(async (_config: ApiConfig, userId: string) => {
    if (userId !== "107850224060485991888") return null;
    return {
      lots: [{ id: 1, name: "My lot" }],
      salesByLot: {},
      version: 3,
      updatedAt: "2026-03-09T09:00:00.000Z"
    };
  });

  const response = await syncImportUser(
    createRequest({ sourceUserId: "1234567890" }) as never,
    createContext() as never
  );

  assert.equal(response.status, 200);
  assert.equal((response.jsonBody as { ok: boolean }).ok, true);
  assert.equal(getEffectiveSyncSnapshotFromExternalSourceMock.mock.calls.length, 1);
  assert.deepEqual(getEffectiveSyncSnapshotFromExternalSourceMock.mock.calls[0]?.[0], {
    endpoint: "https://prod.documents.azure.com:443/",
    key: "prod-key",
    databaseId: "whatfees-prod",
    syncContainerId: "sync_data_prod"
  });
  assert.equal(getEffectiveSyncSnapshotFromExternalSourceMock.mock.calls[0]?.[1], "1234567890");
  assert.equal(upsertSyncSnapshotIncrementalMock.mock.calls.length, 1);
  assert.equal(upsertSyncSnapshotIncrementalMock.mock.calls[0]?.[1]?.userId, "107850224060485991888");
  assert.deepEqual(upsertSyncSnapshotIncrementalMock.mock.calls[0]?.[1]?.lots, [{ id: 2, name: "Imported lot" }]);
  assert.deepEqual(upsertSyncSnapshotIncrementalMock.mock.calls[0]?.[1]?.salesByLot, { "2": [{ id: 22 }] });
});
