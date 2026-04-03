import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import {
  createApiConfig,
  createHttpRequest,
  createInvocationContext
} from "../test-support/function-test-helpers";

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
  publishWorkspaceLotRealtimeEventMock,
  resolveUserIdMock
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  getEffectiveSyncSnapshotMock: vi.fn(),
  upsertSyncSnapshotIncrementalMock: vi.fn(),
  hasWorkspaceMembershipMock: vi.fn(),
  parseSyncLotsShapeMock: vi.fn(),
  assertSafeSyncPushMock: vi.fn(),
  publishWorkspaceLotRealtimeEventMock: vi.fn(),
  resolveUserIdMock: vi.fn(async (request: { headers: { get(name: string): string | null } }) => {
    const authHeader = request.headers.get("authorization") || "";
    return authHeader.replace(/^Bearer\s+/i, "").trim() || "test-user";
  })
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
  publishWorkspaceLotRealtimeEvent: publishWorkspaceLotRealtimeEventMock,
  publishWorkspaceLotRealtimeEventBestEffort: vi.fn((config: unknown, args: unknown) => {
    void publishWorkspaceLotRealtimeEventMock(config, args).catch(() => false);
  })
}));

vi.mock("../lib/auth", async () => {
  const actual = await vi.importActual<typeof import("../lib/auth")>("../lib/auth");
  return {
    ...actual,
    resolveUserId: resolveUserIdMock
  };
});

import { syncPush } from "./syncPush";

function createRequest(body: unknown, method = "POST", headers: Record<string, string> = {}) {
  return createHttpRequest({ body, method, headers });
}

function createContext() {
  return createInvocationContext();
}

beforeEach(() => {
  vi.clearAllMocks();
  hasWorkspaceMembershipMock.mockResolvedValue(true);
  publishWorkspaceLotRealtimeEventMock.mockResolvedValue(true);
  getConfigMock.mockReturnValue(createApiConfig());
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

  const request = createHttpRequest({
    body: {
      lots: [{ id: 1 }],
      salesByLot: { "1": [] },
      wheelConfigs: [{
        id: 91,
        name: "Wheel A",
        spinPrice: 10,
        targetMargin: 40,
        createdAt: "",
        tiers: []
      }],
      activeWheelConfigId: 91,
      clientVersion: 5
    },
    method: "POST",
    headers: { authorization: "Bearer user-a" }
  });
  const context = createInvocationContext();

  const response = await syncPush(request as never, context as never);
  assert.equal(response.status, 200);
  assert.deepEqual(response.jsonBody, {
    ok: true,
    userId: "user-a",
    version: 5,
    updatedAt: "2026-02-21T10:00:00.000Z",
    changed: false
  });
  assert.deepEqual(assertSafeSyncPushMock.mock.calls[0]?.[0], {
    version: 5,
    updatedAt: "2026-02-21T10:00:00.000Z"
  });
  assert.deepEqual(assertSafeSyncPushMock.mock.calls[0]?.[1], [{ id: 1 }]);
  assert.deepEqual(assertSafeSyncPushMock.mock.calls[0]?.[2], { "1": [] });
  assert.deepEqual(assertSafeSyncPushMock.mock.calls[0]?.[3], [{
    id: 91,
    name: "Wheel A",
    spinPrice: 10,
    targetMargin: 40,
    createdAt: "",
    tiers: []
  }]);
  assert.equal(assertSafeSyncPushMock.mock.calls[0]?.[4], false);
  assert.deepEqual(upsertSyncSnapshotIncrementalMock.mock.calls[0]?.[1]?.wheelConfigs, [{
    id: 91,
    name: "Wheel A",
    spinPrice: 10,
    targetMargin: 40,
    createdAt: "",
    tiers: []
  }]);
  assert.equal(upsertSyncSnapshotIncrementalMock.mock.calls[0]?.[1]?.activeWheelConfigId, 91);
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

  const request = createHttpRequest({
    body: {
      lots: [{ id: 10 }, { id: 11 }],
      salesByLot: { "10": [], "11": [] },
      wheelConfigs: [{
        id: 55,
        name: "Wheel B",
        spinPrice: 15,
        targetMargin: 35,
        createdAt: "",
        tiers: []
      }],
      activeWheelConfigId: 55,
      clientVersion: 9
    },
    method: "POST",
    headers: { authorization: "Bearer user-b" }
  });
  const context = createInvocationContext();

  const response = await syncPush(request as never, context as never);
  assert.equal(response.status, 200);

  const upsertArgs = upsertSyncSnapshotIncrementalMock.mock.calls[0]?.[1];
  assert.equal(upsertArgs.version, 10);
  assert.deepEqual(upsertArgs.wheelConfigs, [{
    id: 55,
    name: "Wheel B",
    spinPrice: 15,
    targetMargin: 35,
    createdAt: "",
    tiers: []
  }]);
  assert.equal(upsertArgs.activeWheelConfigId, 55);
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

  const request = createHttpRequest({
    body: {
      lots: [{ id: 10 }],
      salesByLot: { "10": [] },
      clientVersion: 6
    },
    method: "POST",
    headers: { authorization: "Bearer user-stale" }
  });
  const context = createInvocationContext();

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

  const request = createHttpRequest({
    body: { lots: [{ id: 1 }, { id: 1 }], salesByLot: { "1": [] } },
    method: "POST",
    headers: { authorization: "Bearer user-c" }
  });
  const context = createInvocationContext();

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

  const request = createHttpRequest({
    body: {
      lots: [{ id: 20 }],
      salesByLot: { "20": [] },
      clientVersion: 1,
      workspaceId: "team-42"
    },
    method: "POST",
    headers: { authorization: "Bearer user-ws" }
  });
  const context = createInvocationContext();

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

  const request = createHttpRequest({
    body: {
      lots: [{ id: 20 }],
      salesByLot: { "20": [] },
      clientVersion: 1,
      workspaceId: "team-42",
      activeLotId: 20
    },
    method: "POST",
    headers: { authorization: "Bearer user-ws" }
  });
  const context = createInvocationContext();

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

test("syncPush returns before realtime publish settles", async () => {
  let resolvePublish: ((value: boolean) => void) | null = null;
  publishWorkspaceLotRealtimeEventMock.mockReturnValue(new Promise<boolean>((resolve) => {
    resolvePublish = resolve;
  }));
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
        activeLotId: 20
      },
      "POST",
      { authorization: "Bearer user-ws" }
    ) as never,
    createContext() as never
  );

  assert.equal(response.status, 200);
  assert.equal(publishWorkspaceLotRealtimeEventMock.mock.calls.length, 1);
  resolvePublish?.(true);
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
    createInvocationContext() as never
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
    createInvocationContext() as never
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
