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
  getSyncMetaDocumentFromExternalSourceMock,
  getSyncScopeEntityDocumentsFromExternalSourceMock,
  replaceSyncScopeEntityDocumentsMock,
  setSyncScopeEntityModesMock,
  upsertSyncSnapshotIncrementalMock
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  resolveUserIdMock: vi.fn(),
  getEffectiveSyncSnapshotMock: vi.fn(),
  getEffectiveSyncSnapshotFromExternalSourceMock: vi.fn(),
  getSyncMetaDocumentFromExternalSourceMock: vi.fn(),
  getSyncScopeEntityDocumentsFromExternalSourceMock: vi.fn(),
  replaceSyncScopeEntityDocumentsMock: vi.fn(),
  setSyncScopeEntityModesMock: vi.fn(),
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
  getSyncMetaDocumentFromExternalSource: getSyncMetaDocumentFromExternalSourceMock,
  getSyncScopeEntityDocumentsFromExternalSource: getSyncScopeEntityDocumentsFromExternalSourceMock,
  replaceSyncScopeEntityDocuments: replaceSyncScopeEntityDocumentsMock,
  setSyncScopeEntityModes: setSyncScopeEntityModesMock,
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
    migrationCosmosDatabaseId: "whatfees",
    entitlementsContainerId: "entitlements",
    syncContainerId: "sync_data",
    syncImportSourceCosmosEndpoint: "https://prod.documents.azure.com:443/",
    syncImportSourceCosmosKey: "prod-key",
    syncImportSourceCosmosDatabaseId: "whatfees-prod",
    syncImportSourceSyncContainerId: "sync_data_prod",
    migrationRunsContainerId: "migration_runs",
    cardCatalogContainerId: "card_catalog",
    sessionsContainerId: "sessions",
    sessionCookieName: "whatfees_session",
    sessionIdleTtlSeconds: 60,
    sessionAbsoluteTtlSeconds: 120,
    sessionTouchIntervalSeconds: 30
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
  getSyncMetaDocumentFromExternalSourceMock.mockResolvedValue({
    id: "sync:meta:107850224060485991888",
    docType: "sync_meta",
    userId: "107850224060485991888",
    version: 5,
    updatedAt: "2026-03-09T00:00:00.000Z",
    salesMode: "entity",
    livePricingMode: "entity"
  });
  getSyncScopeEntityDocumentsFromExternalSourceMock.mockResolvedValue({
    saleDocuments: [
      {
        id: "sale:source:1:11",
        docType: "sale",
        userId: "source",
        scopeKey: "source",
        lotId: "1",
        saleId: "11",
        sale: { id: 11 },
        version: 1,
        updatedAt: "2026-03-09T00:00:00.000Z",
        updatedBy: "data-migrator",
        mutationId: "m:1",
        deletedAt: null
      }
    ],
    livePricingDocuments: [
      {
        id: "lot_live_pricing:source:1",
        docType: "lot_live_pricing",
        userId: "source",
        scopeKey: "source",
        lotId: "1",
        livePackPrice: 1,
        liveBoxPriceSell: 2,
        liveSpotPrice: 3,
        version: 1,
        updatedAt: "2026-03-09T00:00:00.000Z",
        updatedBy: "data-migrator",
        mutationId: "m:2"
      }
    ]
  });
  upsertSyncSnapshotIncrementalMock.mockResolvedValue({
    changed: true,
    upsertedCount: 1,
    deletedCount: 0
  });
  replaceSyncScopeEntityDocumentsMock.mockResolvedValue({
    upsertedCount: 2,
    deletedCount: 0
  });
  setSyncScopeEntityModesMock.mockResolvedValue(undefined);
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
  assert.equal(replaceSyncScopeEntityDocumentsMock.mock.calls.length, 0);
});

test("syncImportUser returns 404 when source snapshot is not found", async () => {
  getEffectiveSyncSnapshotFromExternalSourceMock.mockResolvedValueOnce(null);
  const response = await syncImportUser(createRequest({ sourceUserId: "123456" }) as never, createContext() as never);

  assert.equal(response.status, 404);
  assert.equal((response.jsonBody as { error: string }).error, "Source sync snapshot was not found.");
  assert.equal(upsertSyncSnapshotIncrementalMock.mock.calls.length, 0);
  assert.equal(replaceSyncScopeEntityDocumentsMock.mock.calls.length, 0);
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
  assert.equal(getSyncMetaDocumentFromExternalSourceMock.mock.calls.length, 1);
  assert.equal(getSyncScopeEntityDocumentsFromExternalSourceMock.mock.calls.length, 1);
  assert.equal(replaceSyncScopeEntityDocumentsMock.mock.calls.length, 1);
  assert.equal(replaceSyncScopeEntityDocumentsMock.mock.calls[0]?.[1]?.scopeKey, "107850224060485991888");
  assert.equal(setSyncScopeEntityModesMock.mock.calls.length, 1);
  assert.deepEqual((response.jsonBody as { salesMode: string; livePricingMode: string }).salesMode, "entity");
  assert.deepEqual((response.jsonBody as { salesMode: string; livePricingMode: string }).livePricingMode, "entity");
});
