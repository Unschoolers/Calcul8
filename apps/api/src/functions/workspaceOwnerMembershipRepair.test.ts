import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { createApiConfig, createHttpRequest, createInvocationContext } from "../test-support/function-test-helpers";

vi.mock("@azure/functions", () => ({ app: { http: vi.fn() } }));

const {
  getConfigMock,
  assertMigrationAdminAccessMock,
  resolveMigrationActorMock,
  auditWorkspaceOwnerMembershipsMock,
  repairWorkspaceOwnerMembershipMock,
  logApiTelemetryMock
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  assertMigrationAdminAccessMock: vi.fn(),
  resolveMigrationActorMock: vi.fn(() => "admin-user"),
  auditWorkspaceOwnerMembershipsMock: vi.fn(),
  repairWorkspaceOwnerMembershipMock: vi.fn(),
  logApiTelemetryMock: vi.fn()
}));

vi.mock("../lib/config", () => ({ getConfig: getConfigMock }));
vi.mock("../lib/migrations/adminAuth", () => ({
  assertMigrationAdminAccess: assertMigrationAdminAccessMock,
  resolveMigrationActor: resolveMigrationActorMock
}));
vi.mock("../lib/cosmos/workspaceRepository", () => ({
  auditWorkspaceOwnerMemberships: auditWorkspaceOwnerMembershipsMock,
  repairWorkspaceOwnerMembership: repairWorkspaceOwnerMembershipMock
}));
vi.mock("../lib/telemetry", () => ({ logApiTelemetry: logApiTelemetryMock }));

import { workspaceOwnerMembershipRepair } from "./workspaceOwnerMembershipRepair";

beforeEach(() => {
  vi.clearAllMocks();
  getConfigMock.mockReturnValue(createApiConfig({ migrationsAdminKey: "secret-key" }));
  resolveMigrationActorMock.mockReturnValue("admin-user");
  auditWorkspaceOwnerMembershipsMock.mockResolvedValue([{
    workspaceId: "ws-1",
    ownerUserId: "owner-1",
    reason: "missing"
  }]);
  repairWorkspaceOwnerMembershipMock.mockResolvedValue({
    userId: "owner-1",
    workspaceId: "ws-1",
    role: "owner",
    status: "active"
  });
});

test("workspaceOwnerMembershipRepair audits and repairs a bounded admin-selected set", async () => {
  const request = createHttpRequest({
    method: "POST",
    body: { workspaceIds: [" ws-1 ", "ws-1"], applyRepairs: true }
  });
  const context = createInvocationContext();

  const response = await workspaceOwnerMembershipRepair(request as never, context as never);

  assert.equal(response.status, 200);
  assert.deepEqual(auditWorkspaceOwnerMembershipsMock.mock.calls[0]?.[1], ["ws-1"]);
  assert.deepEqual(repairWorkspaceOwnerMembershipMock.mock.calls[0]?.slice(1), ["ws-1", "owner-1"]);
  assert.deepEqual(response.jsonBody, {
    ok: true,
    requestedBy: "admin-user",
    mode: "repair",
    auditedCount: 1,
    findings: [{ workspaceId: "ws-1", ownerUserId: "owner-1", reason: "missing" }],
    repairedWorkspaceIds: ["ws-1"]
  });
  assert.equal(logApiTelemetryMock.mock.calls[0]?.[0]?.outcome, "repair_succeeded");
});

test("workspaceOwnerMembershipRepair rejects unbounded requests before repository access", async () => {
  const request = createHttpRequest({
    method: "POST",
    body: { workspaceIds: Array.from({ length: 101 }, (_, index) => `ws-${index}`) }
  });

  const response = await workspaceOwnerMembershipRepair(request as never, createInvocationContext() as never);

  assert.equal(response.status, 400);
  assert.equal(auditWorkspaceOwnerMembershipsMock.mock.calls.length, 0);
});
