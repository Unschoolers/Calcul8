import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import type { ApiConfig } from "../types";

vi.mock("@azure/functions", () => ({
  app: {
    http: vi.fn()
  }
}));

const {
  getConfigMock,
  getEffectiveSyncSnapshotMock,
  upsertSyncSnapshotIncrementalMock,
  hasWorkspaceMembershipMock,
  parseSyncLotsShapeMock,
  assertSafeSyncPushMock,
  publishWorkspaceLotRealtimeEventMock
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  getEffectiveSyncSnapshotMock: vi.fn(),
  upsertSyncSnapshotIncrementalMock: vi.fn(),
  hasWorkspaceMembershipMock: vi.fn(),
  parseSyncLotsShapeMock: vi.fn(),
  assertSafeSyncPushMock: vi.fn(),
  publishWorkspaceLotRealtimeEventMock: vi.fn()
}));

vi.mock("../lib/config", () => ({
  getConfig: getConfigMock
}));

vi.mock("../lib/cosmos/syncSnapshotRepository", () => ({
  getEffectiveSyncSnapshot: getEffectiveSyncSnapshotMock,
  upsertSyncSnapshotIncremental: upsertSyncSnapshotIncrementalMock
}));

vi.mock("../lib/cosmos/workspaceRepository", () => ({
  hasWorkspaceMembership: hasWorkspaceMembershipMock
}));

vi.mock("../lib/syncShape", () => ({
  parseSyncLotsShape: parseSyncLotsShapeMock
}));

vi.mock("../lib/syncSafety", () => ({
  assertSafeSyncPush: assertSafeSyncPushMock
}));

vi.mock("../lib/realtime", () => ({
  publishWorkspaceLotRealtimeEvent: publishWorkspaceLotRealtimeEventMock
}));

import { syncPush } from "./syncPush";

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

function createRequest(body: unknown, method = "POST", headers: Record<string, string> = {}) {
  const normalized = new Map<string, string>();
  for (const [key, value] of Object.entries(headers)) {
    normalized.set(key.toLowerCase(), value);
  }

  return {
    method,
    headers: {
      get(name: string) {
        return normalized.get(name.toLowerCase()) ?? null;
      }
    },
    async json() {
      return body;
    }
  };
}

function createContext() {
  return {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  };
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  hasWorkspaceMembershipMock.mockResolvedValue(true);
  publishWorkspaceLotRealtimeEventMock.mockResolvedValue(true);
  globalThis.fetch = (async (input: unknown) => {
    const raw = String(input);
    const tokenMatch = /[?&]id_token=([^&]+)/.exec(raw);
    const decodedToken = tokenMatch ? decodeURIComponent(tokenMatch[1]) : "unknown-user";
    return {
      ok: true,
      json: async () => ({
        sub: decodedToken
      })
    } as Response;
  }) as typeof fetch;
  getConfigMock.mockReturnValue(createConfig());
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("syncPush returns unchanged state when upsert reports no changes", async () => {
  parseSyncLotsShapeMock.mockReturnValue({
    lots: [{ id: 1 }],
    salesByLot: { "1": [] }
  });
  getEffectiveSyncSnapshotMock.mockResolvedValue({
    version: 5,
    updatedAt: "2026-02-21T10:00:00.000Z"
  });
  upsertSyncSnapshotIncrementalMock.mockResolvedValue({
    changed: false,
    upsertedCount: 0,
    deletedCount: 0
  });

  const request = createRequest(
    {
      lots: [{ id: 1 }],
      salesByLot: { "1": [] },
      clientVersion: 5
    },
    "POST",
    { authorization: "Bearer user-a" }
  );
  const context = createContext();

  const response = await syncPush(request as never, context as never);
  assert.equal(response.status, 200);
  assert.deepEqual(response.jsonBody, {
    ok: true,
    userId: "user-a",
    version: 5,
    updatedAt: "2026-02-21T10:00:00.000Z",
    changed: false
  });
  assert.equal(hasWorkspaceMembershipMock.mock.calls.length, 0);
});

test("syncPush computes next version and returns changed payload", async () => {
  parseSyncLotsShapeMock.mockReturnValue({
    lots: [{ id: 10 }, { id: 11 }],
    salesByLot: { "10": [], "11": [] }
  });
  getEffectiveSyncSnapshotMock.mockResolvedValue({
    version: 2,
    updatedAt: "2026-02-21T10:00:00.000Z"
  });
  upsertSyncSnapshotIncrementalMock.mockResolvedValue({
    changed: true,
    upsertedCount: 2,
    deletedCount: 1
  });

  const request = createRequest(
    {
      lots: [{ id: 10 }, { id: 11 }],
      salesByLot: { "10": [], "11": [] },
      clientVersion: 9
    },
    "POST",
    { authorization: "Bearer user-b" }
  );
  const context = createContext();

  const response = await syncPush(request as never, context as never);
  assert.equal(response.status, 200);

  const upsertArgs = upsertSyncSnapshotIncrementalMock.mock.calls[0]?.[1];
  assert.equal(upsertArgs.version, 10);
  assert.equal((response.jsonBody as { changed: boolean }).changed, true);
});

test("syncPush rejects stale clientVersion when cloud version is newer", async () => {
  parseSyncLotsShapeMock.mockReturnValue({
    lots: [{ id: 10 }],
    salesByLot: { "10": [] }
  });
  getEffectiveSyncSnapshotMock.mockResolvedValue({
    version: 7,
    updatedAt: "2026-02-21T10:00:00.000Z"
  });

  const request = createRequest(
    {
      lots: [{ id: 10 }],
      salesByLot: { "10": [] },
      clientVersion: 6
    },
    "POST",
    { authorization: "Bearer user-stale" }
  );
  const context = createContext();

  const response = await syncPush(request as never, context as never);
  assert.equal(response.status, 409);
  assert.equal(
    (response.jsonBody as { error: string }).error,
    "Cloud data changed since your last sync. Pull latest data and retry."
  );
  assert.equal(upsertSyncSnapshotIncrementalMock.mock.calls.length, 0);
  assert.equal(context.warn.mock.calls.length, 1);
  assert.equal(context.warn.mock.calls[0]?.[0], "api.telemetry");
  assert.equal(context.warn.mock.calls[0]?.[1]?.route, "sync_push");
  assert.equal(context.warn.mock.calls[0]?.[1]?.outcome, "http_409");
});

test("syncPush rejects duplicate lot ids with 400", async () => {
  parseSyncLotsShapeMock.mockReturnValue({
    lots: [{ id: 1 }, { id: 1 }],
    salesByLot: { "1": [] }
  });

  const request = createRequest(
    { lots: [{ id: 1 }, { id: 1 }], salesByLot: { "1": [] } },
    "POST",
    { authorization: "Bearer user-c" }
  );
  const context = createContext();

  const response = await syncPush(request as never, context as never);
  assert.equal(response.status, 400);
  assert.equal(
    (response.jsonBody as { error: string }).error,
    "Duplicate lot id '1' in payload."
  );
});

test("syncPush uses workspace partition when workspaceId is provided", async () => {
  parseSyncLotsShapeMock.mockReturnValue({
    lots: [{ id: 20 }],
    salesByLot: { "20": [] }
  });
  getEffectiveSyncSnapshotMock.mockResolvedValue({
    version: 1,
    updatedAt: "2026-02-21T10:00:00.000Z"
  });
  upsertSyncSnapshotIncrementalMock.mockResolvedValue({
    changed: true,
    upsertedCount: 1,
    deletedCount: 0
  });

  const request = createRequest(
    {
      lots: [{ id: 20 }],
      salesByLot: { "20": [] },
      clientVersion: 1,
      workspaceId: "team-42"
    },
    "POST",
    { authorization: "Bearer user-ws" }
  );
  const context = createContext();

  const response = await syncPush(request as never, context as never);
  assert.equal(response.status, 200);
  assert.equal(getEffectiveSyncSnapshotMock.mock.calls[0]?.[1], "ws:team-42");
  assert.equal(upsertSyncSnapshotIncrementalMock.mock.calls[0]?.[1]?.userId, "ws:team-42");
  assert.equal(hasWorkspaceMembershipMock.mock.calls[0]?.[1], "user-ws");
  assert.equal(hasWorkspaceMembershipMock.mock.calls[0]?.[2], "team-42");
  assert.equal(context.warn.mock.calls.length, 0);
});

test("syncPush publishes lot.config.updated for changed workspace config pushes with active lot id", async () => {
  parseSyncLotsShapeMock.mockReturnValue({
    lots: [{ id: 20 }],
    salesByLot: { "20": [] }
  });
  getEffectiveSyncSnapshotMock.mockResolvedValue({
    version: 1,
    updatedAt: "2026-02-21T10:00:00.000Z"
  });
  upsertSyncSnapshotIncrementalMock.mockResolvedValue({
    changed: true,
    upsertedCount: 1,
    deletedCount: 0
  });

  const request = createRequest(
    {
      lots: [{ id: 20 }],
      salesByLot: { "20": [] },
      clientVersion: 1,
      workspaceId: "team-42",
      activeLotId: 20
    },
    "POST",
    { authorization: "Bearer user-ws" }
  );
  const context = createContext();

  const response = await syncPush(request as never, context as never);
  assert.equal(response.status, 200);
  assert.equal(publishWorkspaceLotRealtimeEventMock.mock.calls.length, 1);
  const publishArgs = publishWorkspaceLotRealtimeEventMock.mock.calls[0]?.[1];
  assert.equal(publishArgs?.workspaceId, "team-42");
  assert.equal(publishArgs?.lotId, "20");
  assert.equal(publishArgs?.eventType, "lot.config.updated");
  assert.equal(publishArgs?.data?.lotId, "20");
  assert.equal(publishArgs?.data?.version, 2);
  assert.equal(typeof publishArgs?.data?.updatedAt, "string");
  assert.equal(publishArgs?.logger, context);
});

test("syncPush does not publish config invalidation for unchanged or personal pushes", async () => {
  parseSyncLotsShapeMock.mockReturnValue({
    lots: [{ id: 1 }],
    salesByLot: { "1": [] }
  });
  getEffectiveSyncSnapshotMock.mockResolvedValue({
    version: 5,
    updatedAt: "2026-02-21T10:00:00.000Z"
  });
  upsertSyncSnapshotIncrementalMock.mockResolvedValue({
    changed: false,
    upsertedCount: 0,
    deletedCount: 0
  });

  const unchangedResponse = await syncPush(
    createRequest(
      {
        lots: [{ id: 1 }],
        salesByLot: { "1": [] },
        clientVersion: 5,
        workspaceId: "team-42",
        activeLotId: 1
      },
      "POST",
      { authorization: "Bearer user-a" }
    ) as never,
    createContext() as never
  );
  assert.equal(unchangedResponse.status, 200);

  upsertSyncSnapshotIncrementalMock.mockResolvedValueOnce({
    changed: true,
    upsertedCount: 1,
    deletedCount: 0
  });

  const personalResponse = await syncPush(
    createRequest(
      {
        lots: [{ id: 1 }],
        salesByLot: { "1": [] },
        clientVersion: 5,
        activeLotId: 1
      },
      "POST",
      { authorization: "Bearer user-a" }
    ) as never,
    createContext() as never
  );
  assert.equal(personalResponse.status, 200);
  assert.equal(publishWorkspaceLotRealtimeEventMock.mock.calls.length, 0);
});

test("syncPush ignores invalid activeLotId metadata instead of publishing config invalidation", async () => {
  parseSyncLotsShapeMock.mockReturnValue({
    lots: [{ id: 20 }],
    salesByLot: { "20": [] }
  });
  getEffectiveSyncSnapshotMock.mockResolvedValue({
    version: 1,
    updatedAt: "2026-02-21T10:00:00.000Z"
  });
  upsertSyncSnapshotIncrementalMock.mockResolvedValue({
    changed: true,
    upsertedCount: 1,
    deletedCount: 0
  });

  const response = await syncPush(
    createRequest(
      {
        lots: [{ id: 20 }],
        salesByLot: { "20": [] },
        clientVersion: 1,
        workspaceId: "team-42",
        activeLotId: "banana"
      },
      "POST",
      { authorization: "Bearer user-ws" }
    ) as never,
    createContext() as never
  );

  assert.equal(response.status, 200);
  assert.equal(publishWorkspaceLotRealtimeEventMock.mock.calls.length, 0);
});

test("syncPush does not publish config invalidation when activeLotId metadata is missing", async () => {
  parseSyncLotsShapeMock.mockReturnValue({
    lots: [{ id: 20 }],
    salesByLot: { "20": [] }
  });
  getEffectiveSyncSnapshotMock.mockResolvedValue({
    version: 1,
    updatedAt: "2026-02-21T10:00:00.000Z"
  });
  upsertSyncSnapshotIncrementalMock.mockResolvedValue({
    changed: true,
    upsertedCount: 1,
    deletedCount: 0
  });

  const response = await syncPush(
    createRequest(
      {
        lots: [{ id: 20 }],
        salesByLot: { "20": [] },
        clientVersion: 1,
        workspaceId: "team-42"
      },
      "POST",
      { authorization: "Bearer user-ws" }
    ) as never,
    createContext() as never
  );

  assert.equal(response.status, 200);
  assert.equal(publishWorkspaceLotRealtimeEventMock.mock.calls.length, 0);
});

test("syncPush rejects workspace sync when user is not a member", async () => {
  parseSyncLotsShapeMock.mockReturnValue({
    lots: [{ id: 21 }],
    salesByLot: { "21": [] }
  });
  hasWorkspaceMembershipMock.mockResolvedValue(false);

  const request = createRequest(
    {
      lots: [{ id: 21 }],
      salesByLot: { "21": [] },
      workspaceId: "team-nope"
    },
    "POST",
    { authorization: "Bearer user-denied" }
  );
  const context = createContext();

  const response = await syncPush(request as never, context as never);
  assert.equal(response.status, 403);
  assert.equal((response.jsonBody as { error: string }).error, "User is not a member of this workspace.");
  assert.equal(getEffectiveSyncSnapshotMock.mock.calls.length, 0);
  assert.equal(upsertSyncSnapshotIncrementalMock.mock.calls.length, 0);
  assert.equal(context.warn.mock.calls.length, 1);
  assert.equal(context.warn.mock.calls[0]?.[1]?.route, "sync_push");
  assert.equal(context.warn.mock.calls[0]?.[1]?.workspace_scope, "workspace");
  assert.equal(context.warn.mock.calls[0]?.[1]?.outcome, "http_403");
});
