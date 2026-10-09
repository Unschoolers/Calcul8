import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const { hasWorkspaceMembershipMock, getWorkspaceMembershipMock } = vi.hoisted(() => ({
  hasWorkspaceMembershipMock: vi.fn(),
  getWorkspaceMembershipMock: vi.fn()
}));

vi.mock("./cosmos/workspaceRepository", () => ({
  hasWorkspaceMembership: hasWorkspaceMembershipMock,
  getWorkspaceMembership: getWorkspaceMembershipMock
}));

import { resolveScopeAuthorization } from "./scopeAuthorization";

beforeEach(() => {
  vi.clearAllMocks();
  hasWorkspaceMembershipMock.mockResolvedValue(true);
  getWorkspaceMembershipMock.mockResolvedValue({ role: "owner", status: "active" });
});

test("personal scope is authorized without workspace membership lookups", async () => {
  const result = await resolveScopeAuthorization({} as never, "actor", undefined);
  assert.deepEqual(result, {
    allowed: true,
    scope: {
      actorUserId: "actor", requestedWorkspaceId: undefined, scopeType: "user", scopeId: "actor",
      partitionKey: "actor", workspaceScopeEnabled: true
    },
    connectionScopeKey: "actor"
  });
  assert.equal(hasWorkspaceMembershipMock.mock.calls.length, 0);
});

test("active workspace members can access the scope with stable partition and connection keys", async () => {
  const result = await resolveScopeAuthorization({} as never, "actor", " team-42 ");
  assert.equal(result.allowed, true);
  if (result.allowed) {
    assert.equal(result.scope.partitionKey, "ws:team-42");
    assert.equal(result.connectionScopeKey, "ws:team-42");
  }
});

test("workspace owner requirement denies an active non-owner with a structured code", async () => {
  getWorkspaceMembershipMock.mockResolvedValue({ role: "member", status: "active" });
  assert.deepEqual(await resolveScopeAuthorization({} as never, "actor", "team-42", true), {
    allowed: false, denialCode: "workspace_owner_required"
  });
});

test.each([null, { role: "owner", status: "disabled" }, { role: "owner", status: "removed" }])(
  "workspace membership must be active: %j",
  async membership => {
    hasWorkspaceMembershipMock.mockResolvedValue(false);
    getWorkspaceMembershipMock.mockResolvedValue(membership);
    assert.deepEqual(await resolveScopeAuthorization({} as never, "actor", "team-42", true), {
      allowed: false, denialCode: "workspace_membership_required"
    });
  }
);
