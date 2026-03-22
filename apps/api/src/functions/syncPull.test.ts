import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import {
  createApiConfig,
  createGoogleUserInfoFetch,
  createHttpRequest,
  createInvocationContext
} from "../test-support/function-test-helpers";

vi.mock("@azure/functions", () => ({
  app: {
    http: vi.fn()
  }
}));

const { getConfigMock, getEffectiveSyncSnapshotMock, hasWorkspaceMembershipMock } = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  getEffectiveSyncSnapshotMock: vi.fn(),
  hasWorkspaceMembershipMock: vi.fn()
}));

vi.mock("../lib/config", () => ({
  getConfig: getConfigMock
}));

vi.mock("../lib/cosmos/syncSnapshotRepository", () => ({
  getEffectiveSyncSnapshot: getEffectiveSyncSnapshotMock,
}));

vi.mock("../lib/cosmos/workspaceRepository", () => ({
  hasWorkspaceMembership: hasWorkspaceMembershipMock
}));

import { syncPull } from "./syncPull";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  hasWorkspaceMembershipMock.mockResolvedValue(true);
  globalThis.fetch = createGoogleUserInfoFetch();
  getConfigMock.mockReturnValue(createApiConfig());
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("syncPull returns empty snapshot when no cloud state exists", async () => {
  getEffectiveSyncSnapshotMock.mockResolvedValue(null);
  const request = createHttpRequest({ method: "POST", headers: { authorization: "Bearer user-1" } });
  const context = createInvocationContext();

  const response = await syncPull(request as never, context as never);
  assert.equal(response.status, 200);
  assert.deepEqual(response.jsonBody, {
    userId: "user-1",
    snapshot: {
      lots: [],
      salesByLot: {},
      version: 0,
      updatedAt: null
    }
  });
  assert.equal(hasWorkspaceMembershipMock.mock.calls.length, 0);
});

test("syncPull returns existing snapshot payload", async () => {
  getEffectiveSyncSnapshotMock.mockResolvedValue({
    lots: [{ id: 10 }],
    salesByLot: { "10": [{ id: 1 }] },
    version: 8,
    updatedAt: "2026-02-21T00:00:00.000Z"
  });
  const request = createHttpRequest({ method: "POST", headers: { authorization: "Bearer user-2" } });
  const context = createInvocationContext();

  const response = await syncPull(request as never, context as never);
  assert.equal(response.status, 200);
  assert.equal((response.jsonBody as { snapshot: { version: number } }).snapshot.version, 8);
});

test("syncPull returns server error when snapshot read fails", async () => {
  getEffectiveSyncSnapshotMock.mockRejectedValue(new Error("boom"));
  const request = createHttpRequest({ method: "POST", headers: { authorization: "Bearer user-3" } });
  const context = createInvocationContext();

  const response = await syncPull(request as never, context as never);
  assert.equal(response.status, 500);
  assert.equal((response.jsonBody as { error: string }).error, "Failed to load cloud sync data.");
  assert.equal(context.error.mock.calls.length, 1);
});

test("syncPull uses workspace partition when workspaceId is provided", async () => {
  getEffectiveSyncSnapshotMock.mockResolvedValue({
    lots: [{ id: 10 }],
    salesByLot: { "10": [] },
    version: 8,
    updatedAt: "2026-02-21T00:00:00.000Z"
  });
  const request = createHttpRequest({
    method: "POST",
    headers: { authorization: "Bearer user-ws" },
    body: { workspaceId: "team-42" }
  });
  const context = createInvocationContext();

  const response = await syncPull(request as never, context as never);
  assert.equal(response.status, 200);
  assert.equal(getEffectiveSyncSnapshotMock.mock.calls[0]?.[1], "ws:team-42");
  assert.equal(hasWorkspaceMembershipMock.mock.calls[0]?.[1], "user-ws");
  assert.equal(hasWorkspaceMembershipMock.mock.calls[0]?.[2], "team-42");
  assert.equal(context.warn.mock.calls.length, 0);
});

test("syncPull rejects workspace sync when user is not a member", async () => {
  hasWorkspaceMembershipMock.mockResolvedValue(false);
  const request = createHttpRequest({
    method: "POST",
    headers: { authorization: "Bearer user-ws" },
    body: { workspaceId: "team-42" }
  });
  const context = createInvocationContext();

  const response = await syncPull(request as never, context as never);
  assert.equal(response.status, 403);
  assert.equal((response.jsonBody as { error: string }).error, "User is not a member of this workspace.");
  assert.equal(getEffectiveSyncSnapshotMock.mock.calls.length, 0);
});
