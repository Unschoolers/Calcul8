import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import type { ApiConfig } from "../../types";

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
  hasWorkspaceMembershipMock,
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
  hasWorkspaceMembershipMock: vi.fn(),
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

vi.mock("../lib/cosmos/syncSnapshotRepository", () => ({
  getEffectiveSyncSnapshot: getEffectiveSyncSnapshotMock,
  getEffectiveSyncSnapshotFromExternalSource: getEffectiveSyncSnapshotFromExternalSourceMock,
  getSyncMetaDocumentFromExternalSource: getSyncMetaDocumentFromExternalSourceMock,
  getSyncScopeEntityDocumentsFromExternalSource: getSyncScopeEntityDocumentsFromExternalSourceMock,
  replaceSyncScopeEntityDocuments: replaceSyncScopeEntityDocumentsMock,
  upsertSyncSnapshotIncremental: upsertSyncSnapshotIncrementalMock
}));

vi.mock("../lib/cosmos/salesRepository", () => ({
  setSyncScopeEntityModes: setSyncScopeEntityModesMock
}));

vi.mock("../lib/cosmos/workspaceRepository", () => ({
  hasWorkspaceMembership: hasWorkspaceMembershipMock
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
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-09T12:00:00.000Z"));
  vi.clearAllMocks();
  getConfigMock.mockReturnValue(createConfig());
  resolveUserIdMock.mockResolvedValue("107850224060485991888");
  hasWorkspaceMembershipMock.mockResolvedValue(true);
  getEffectiveSyncSnapshotFromExternalSourceMock.mockResolvedValue({
    lots: [{ id: 1, name: "Lot A" }],
    salesByLot: { "1": [{ id: 11 }] },
    wheelConfigs: [{
      id: 91,
      name: "Imported wheel",
      spinPrice: 10,
      targetMargin: 40,
      createdAt: "",
      tiers: []
    }],
    activeWheelConfigId: 91,
    version: 5,
    updatedAt: "2026-03-09T00:00:00.000Z"
  });
  getEffectiveSyncSnapshotMock.mockResolvedValue({
    lots: [{ id: 1, name: "Lot A" }],
    salesByLot: { "1": [{ id: 11 }] },
    wheelConfigs: [],
    activeWheelConfigId: null,
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

afterEach(() => {
  vi.useRealTimers();
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

test("syncImportUser rejects workspace imports without workspace membership", async () => {
  hasWorkspaceMembershipMock.mockResolvedValueOnce(false);
  const response = await syncImportUser(
    createRequest({ sourceUserId: "1234567890", workspaceId: "team-42" }) as never,
    createContext() as never
  );

  assert.equal(response.status, 403);
  assert.equal((response.jsonBody as { error: string }).error, "User is not a member of this workspace.");
  assert.equal(getEffectiveSyncSnapshotFromExternalSourceMock.mock.calls.length, 0);
  assert.equal(upsertSyncSnapshotIncrementalMock.mock.calls.length, 0);
  assert.equal(replaceSyncScopeEntityDocumentsMock.mock.calls.length, 0);
});

test("syncImportUser copies source snapshot into actor partition", async () => {
  const systemPricingDefaults = {
    sellingCurrency: "CAD",
    targetProfitPercent: 18,
    sellingTaxPercent: 15,
    sellingShippingPerOrder: 8,
    feeProfilePreset: "whatnot",
    spotsPerBox: 5
  };
  getEffectiveSyncSnapshotFromExternalSourceMock.mockResolvedValue({
    lots: [{ id: 2, name: "Imported lot" }],
    salesByLot: { "2": [{ id: 22 }] },
    wheelConfigs: [{
      id: 42,
      name: "Workspace wheel",
      spinPrice: 25,
      targetMargin: 30,
      createdAt: "",
      tiers: []
    }],
    activeWheelConfigId: 42,
    systemPricingDefaults,
    version: 7,
    updatedAt: "2026-03-09T10:00:00.000Z"
  });
  getEffectiveSyncSnapshotMock.mockImplementation(async (_config: ApiConfig, userId: string) => {
    if (userId !== "107850224060485991888") return null;
    return {
      lots: [{ id: 1, name: "My lot" }],
      salesByLot: {},
      wheelConfigs: [],
      activeWheelConfigId: null,
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
  assert.deepEqual(upsertSyncSnapshotIncrementalMock.mock.calls[0]?.[1]?.systemPricingDefaults, systemPricingDefaults);
  assert.deepEqual(upsertSyncSnapshotIncrementalMock.mock.calls[0]?.[1]?.wheelConfigs, [{
    id: 42,
    name: "Workspace wheel",
    spinPrice: 25,
    targetMargin: 30,
    createdAt: "",
    tiers: []
  }]);
  assert.equal(upsertSyncSnapshotIncrementalMock.mock.calls[0]?.[1]?.activeWheelConfigId, 42);
  assert.equal(getSyncMetaDocumentFromExternalSourceMock.mock.calls.length, 1);
  assert.equal(getSyncScopeEntityDocumentsFromExternalSourceMock.mock.calls.length, 1);
  assert.equal(replaceSyncScopeEntityDocumentsMock.mock.calls.length, 1);
  assert.equal(replaceSyncScopeEntityDocumentsMock.mock.calls[0]?.[1]?.scopeKey, "107850224060485991888");
  assert.equal(setSyncScopeEntityModesMock.mock.calls.length, 1);
  assert.equal((response.jsonBody as { sourceWheelConfigsCount: number }).sourceWheelConfigsCount, 1);
  assert.equal((response.jsonBody as { sourceActiveWheelConfigId: number | null }).sourceActiveWheelConfigId, 42);
  assert.equal((response.jsonBody as { sourceLotsCount: number }).sourceLotsCount, 1);
  assert.equal((response.jsonBody as { sourceSystemPricingDefaultsPresent: boolean }).sourceSystemPricingDefaultsPresent, true);
  assert.deepEqual((response.jsonBody as {
    snapshot: {
      lots: unknown[];
      systemPricingDefaults: typeof systemPricingDefaults;
      version: number;
    };
  }).snapshot, {
    id: "sync:107850224060485991888",
    userId: "107850224060485991888",
    lots: [{ id: 2, name: "Imported lot" }],
    salesByLot: { "2": [{ id: 22 }] },
    systemPricingDefaults,
    wheelConfigs: [{
      id: 42,
      name: "Workspace wheel",
      spinPrice: 25,
      targetMargin: 30,
      createdAt: "",
      tiers: []
    }],
    activeWheelConfigId: 42,
    version: 8,
    updatedAt: "2026-03-09T12:00:00.000Z"
  });
  assert.deepEqual((response.jsonBody as { salesMode: string; livePricingMode: string }).salesMode, "entity");
  assert.deepEqual((response.jsonBody as { salesMode: string; livePricingMode: string }).livePricingMode, "entity");
});

test("syncImportUser copies source snapshot into authorized workspace partition", async () => {
  getEffectiveSyncSnapshotFromExternalSourceMock.mockResolvedValue({
    lots: [{ id: 2, name: "Imported workspace lot" }],
    salesByLot: { "2": [{ id: 22 }] },
    wheelConfigs: [],
    activeWheelConfigId: null,
    version: 7,
    updatedAt: "2026-03-09T10:00:00.000Z"
  });
  getEffectiveSyncSnapshotMock.mockImplementation(async (_config: ApiConfig, scopeKey: string) => {
    if (scopeKey !== "ws:team-42") return null;
    return {
      lots: [{ id: 1, name: "Workspace lot" }],
      salesByLot: {},
      wheelConfigs: [],
      activeWheelConfigId: null,
      version: 3,
      updatedAt: "2026-03-09T09:00:00.000Z"
    };
  });

  const response = await syncImportUser(
    createRequest({ sourceUserId: "1234567890", workspaceId: "team-42" }) as never,
    createContext() as never
  );

  assert.equal(response.status, 200);
  assert.equal((response.jsonBody as { ok: boolean }).ok, true);
  assert.equal(upsertSyncSnapshotIncrementalMock.mock.calls.length, 1);
  assert.equal(upsertSyncSnapshotIncrementalMock.mock.calls[0]?.[1]?.userId, "ws:team-42");
  assert.equal(replaceSyncScopeEntityDocumentsMock.mock.calls.length, 1);
  assert.equal(replaceSyncScopeEntityDocumentsMock.mock.calls[0]?.[1]?.scopeKey, "ws:team-42");
  assert.equal(setSyncScopeEntityModesMock.mock.calls.length, 1);
  assert.equal(setSyncScopeEntityModesMock.mock.calls[0]?.[1]?.scopeKey, "ws:team-42");
  assert.equal((response.jsonBody as { targetScopeKey: string }).targetScopeKey, "ws:team-42");
  assert.equal((response.jsonBody as { workspaceId: string }).workspaceId, "team-42");
});

test("syncImportUser can read from a source workspace scope while writing to the target workspace", async () => {
  getEffectiveSyncSnapshotMock.mockResolvedValue({
    lots: [],
    salesByLot: {},
    wheelConfigs: [],
    activeWheelConfigId: null,
    version: 3,
    updatedAt: "2026-03-09T09:00:00.000Z"
  });

  const response = await syncImportUser(
    createRequest({
      sourceUserId: "1234567890",
      sourceWorkspaceId: "prod-team",
      workspaceId: "dev-team"
    }) as never,
    createContext() as never
  );

  assert.equal(response.status, 200);
  assert.equal(getEffectiveSyncSnapshotFromExternalSourceMock.mock.calls[0]?.[1], "ws:prod-team");
  assert.equal(getSyncMetaDocumentFromExternalSourceMock.mock.calls[0]?.[1], "ws:prod-team");
  assert.equal(getSyncScopeEntityDocumentsFromExternalSourceMock.mock.calls[0]?.[1], "ws:prod-team");
  assert.equal(upsertSyncSnapshotIncrementalMock.mock.calls[0]?.[1]?.userId, "ws:dev-team");
  assert.equal(replaceSyncScopeEntityDocumentsMock.mock.calls[0]?.[1]?.scopeKey, "ws:dev-team");
  assert.equal(setSyncScopeEntityModesMock.mock.calls[0]?.[1]?.scopeKey, "ws:dev-team");
  assert.equal((response.jsonBody as { sourceWorkspaceId: string }).sourceWorkspaceId, "prod-team");
  assert.equal((response.jsonBody as { sourceScopeKey: string }).sourceScopeKey, "ws:prod-team");
  assert.equal((response.jsonBody as { workspaceId: string }).workspaceId, "dev-team");
  assert.equal((response.jsonBody as { targetScopeKey: string }).targetScopeKey, "ws:dev-team");
});
