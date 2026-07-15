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
  createWorkspaceWithOwnerMock,
  getWorkspaceByIdMock,
  hasWorkspaceMembershipMock,
  getWorkspaceMembershipMock,
  listWorkspaceMembershipsMock,
  listWorkspaceMembershipsForUserMock,
  listUserProfilesMock,
  listWorkspacesForUserMock,
  restoreWorkspaceDocumentMock,
  updateWorkspaceMembershipProfileSnapshotMock,
  upsertWorkspaceMembershipMock,
  deactivateWorkspaceMembershipMock,
  transferWorkspaceOwnershipMock,
  softDeleteWorkspaceMock,
  createWorkspaceJoinLinkMock,
  listWorkspaceJoinLinksMock,
  revokeWorkspaceJoinLinkMock,
  getWorkspaceJoinLinkByInviteIdMock,
  getWorkspaceJoinLinkByTokenHashMock,
  markWorkspaceJoinLinkUsedMock,
  resolveUserIdMock
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  createWorkspaceWithOwnerMock: vi.fn(),
  getWorkspaceByIdMock: vi.fn(),
  hasWorkspaceMembershipMock: vi.fn(),
  getWorkspaceMembershipMock: vi.fn(),
  listWorkspaceMembershipsMock: vi.fn(),
  listWorkspaceMembershipsForUserMock: vi.fn(),
  listUserProfilesMock: vi.fn(),
  listWorkspacesForUserMock: vi.fn(),
  restoreWorkspaceDocumentMock: vi.fn(),
  updateWorkspaceMembershipProfileSnapshotMock: vi.fn(),
  upsertWorkspaceMembershipMock: vi.fn(),
  deactivateWorkspaceMembershipMock: vi.fn(),
  transferWorkspaceOwnershipMock: vi.fn(),
  softDeleteWorkspaceMock: vi.fn(),
  createWorkspaceJoinLinkMock: vi.fn(),
  listWorkspaceJoinLinksMock: vi.fn(),
  revokeWorkspaceJoinLinkMock: vi.fn(),
  getWorkspaceJoinLinkByInviteIdMock: vi.fn(),
  getWorkspaceJoinLinkByTokenHashMock: vi.fn(),
  markWorkspaceJoinLinkUsedMock: vi.fn(),
  resolveUserIdMock: vi.fn(async (request: { headers: { get(name: string): string | null } }) => {
    const authHeader = request.headers.get("authorization") || "";
    return authHeader.replace(/^Bearer\s+/i, "").trim() || "test-user";
  })
}));

vi.mock("../lib/config", () => ({
  getConfig: getConfigMock
}));

vi.mock("../lib/cosmos/entitlementRepository", () => ({
  listUserProfiles: listUserProfilesMock
}));

vi.mock("../lib/cosmos/workspaceRepository", () => ({
  createWorkspaceWithOwner: createWorkspaceWithOwnerMock,
  getWorkspaceById: getWorkspaceByIdMock,
  hasWorkspaceMembership: hasWorkspaceMembershipMock,
  getWorkspaceMembership: getWorkspaceMembershipMock,
  listWorkspaceMemberships: listWorkspaceMembershipsMock,
  listWorkspaceMembershipsForUser: listWorkspaceMembershipsForUserMock,
  listWorkspacesForUser: listWorkspacesForUserMock,
  restoreWorkspaceDocument: restoreWorkspaceDocumentMock,
  updateWorkspaceMembershipProfileSnapshot: updateWorkspaceMembershipProfileSnapshotMock,
  upsertWorkspaceMembership: upsertWorkspaceMembershipMock,
  deactivateWorkspaceMembership: deactivateWorkspaceMembershipMock,
  transferWorkspaceOwnership: transferWorkspaceOwnershipMock,
  softDeleteWorkspace: softDeleteWorkspaceMock,
  createWorkspaceJoinLink: createWorkspaceJoinLinkMock,
  listWorkspaceJoinLinks: listWorkspaceJoinLinksMock,
  revokeWorkspaceJoinLink: revokeWorkspaceJoinLinkMock,
  getWorkspaceJoinLinkByInviteId: getWorkspaceJoinLinkByInviteIdMock,
  getWorkspaceJoinLinkByTokenHash: getWorkspaceJoinLinkByTokenHashMock,
  markWorkspaceJoinLinkUsed: markWorkspaceJoinLinkUsedMock
}));

vi.mock("../lib/auth", async () => {
  const actual = await vi.importActual<typeof import("../lib/auth")>("../lib/auth");
  return {
    ...actual,
    resolveUserId: resolveUserIdMock
  };
});

import {
  joinAccept,
  workspaceJoinLinksCreate,
  workspaceJoinLinksList,
  workspaceJoinLinksRemove,
  workspaceLeave,
  workspaceMembersAdd,
  workspaceMembersList,
  workspaceMembersRemove,
  workspacesCreate,
  workspacesMe
} from "./workspaces";

function createRequest(
  method: string,
  headers: Record<string, string> = {},
  body?: unknown,
  params: Record<string, string> = {}
) {
  return createHttpRequest({ method, headers, body, params });
}

function createContext() {
  return createInvocationContext();
}

beforeEach(() => {
  vi.resetAllMocks();
  getConfigMock.mockReturnValue(createApiConfig());
  updateWorkspaceMembershipProfileSnapshotMock.mockResolvedValue(null);
  createWorkspaceWithOwnerMock.mockResolvedValue({
    workspace: {
      workspaceId: "team-42",
      name: "Team 42",
      ownerUserId: "owner-user",
      status: "active"
    },
    ownerMembership: {
      userId: "owner-user",
      workspaceId: "team-42",
      role: "owner",
      status: "active",
      updatedAt: "2026-02-25T00:00:00.000Z"
    }
  });
  hasWorkspaceMembershipMock.mockResolvedValue(true);
  getWorkspaceMembershipMock.mockResolvedValue({
    userId: "owner-user",
    workspaceId: "team-42",
    role: "owner",
    status: "active",
    updatedAt: "2026-02-25T00:00:00.000Z"
  });
  listWorkspaceMembershipsMock.mockResolvedValue([]);
  listWorkspaceMembershipsForUserMock.mockResolvedValue([]);
  listUserProfilesMock.mockResolvedValue([]);
  listWorkspacesForUserMock.mockResolvedValue([]);
  upsertWorkspaceMembershipMock.mockResolvedValue({
    userId: "member-user",
    workspaceId: "team-42",
    role: "member",
    status: "active",
    updatedAt: "2026-02-25T00:00:00.000Z"
  });
  deactivateWorkspaceMembershipMock.mockResolvedValue(true);
  transferWorkspaceOwnershipMock.mockResolvedValue({
    workspaceId: "team-42",
    name: "Team 42",
    ownerUserId: "member-user"
  });
  softDeleteWorkspaceMock.mockResolvedValue({
    workspaceId: "team-42",
    name: "Team 42",
    ownerUserId: "owner-user",
    status: "deleted"
  });
  getWorkspaceByIdMock.mockResolvedValue(null);
  createWorkspaceJoinLinkMock.mockResolvedValue({
    inviteId: "invite-1",
    workspaceId: "team-42",
    status: "active",
    expiresAt: "2026-03-25T00:00:00.000Z"
  });
  listWorkspaceJoinLinksMock.mockResolvedValue([]);
  revokeWorkspaceJoinLinkMock.mockResolvedValue({
    inviteId: "invite-1",
    workspaceId: "team-42",
    status: "revoked",
    expiresAt: "2026-03-25T00:00:00.000Z"
  });
  getWorkspaceJoinLinkByInviteIdMock.mockResolvedValue({
    inviteId: "invite-1",
    workspaceId: "team-42",
    status: "active",
    expiresAt: "2026-03-25T00:00:00.000Z"
  });
  getWorkspaceJoinLinkByTokenHashMock.mockResolvedValue({
    inviteId: "invite-1",
    workspaceId: "team-42",
    status: "active",
    expiresAt: "2099-03-25T00:00:00.000Z",
    role: "member"
  });
  markWorkspaceJoinLinkUsedMock.mockResolvedValue({
    inviteId: "invite-1",
    workspaceId: "team-42",
    status: "used"
  });
});

test("workspacesCreate creates a new workspace with owner membership", async () => {
  const request = createRequest(
    "POST",
    { authorization: "Bearer owner-user" },
    { name: "Team 42", idempotencyKey: "create-team-42" }
  );
  const context = createContext();

  const response = await workspacesCreate(request as never, context as never);

  assert.equal(response.status, 201);
  assert.equal(createWorkspaceWithOwnerMock.mock.calls.length, 1);
  assert.match(String(createWorkspaceWithOwnerMock.mock.calls[0]?.[1]?.workspaceId ?? ""), /^ws_[0-9a-f]{16}$/);
  assert.equal(createWorkspaceWithOwnerMock.mock.calls[0]?.[1]?.ownerUserId, "owner-user");
  assert.match(String(createWorkspaceWithOwnerMock.mock.calls[0]?.[1]?.creationKeyHash ?? ""), /^[0-9a-f]{64}$/);
  assert.match(String(createWorkspaceWithOwnerMock.mock.calls[0]?.[1]?.creationFingerprint ?? ""), /^[0-9a-f]{64}$/);
});

test("workspacesCreate requires a valid idempotency key before writing", async () => {
  const response = await workspacesCreate(
    createRequest(
      "POST",
      { authorization: "Bearer owner-user" },
      { name: "Team 42", idempotencyKey: "short" }
    ) as never,
    createContext() as never
  );

  assert.equal(response.status, 400);
  assert.equal(createWorkspaceWithOwnerMock.mock.calls.length, 0);
});

test("workspacesCreate returns a stable conflict code when a key is reused with changed input", async () => {
  const conflict = new Error("Workspace idempotency key was already used for a different request.");
  conflict.name = "WorkspaceCreationConflictError";
  createWorkspaceWithOwnerMock.mockRejectedValueOnce(conflict);

  const response = await workspacesCreate(
    createRequest(
      "POST",
      { authorization: "Bearer owner-user" },
      { name: "Changed Team", idempotencyKey: "create-team-42" }
    ) as never,
    createContext() as never
  );

  assert.equal(response.status, 409);
  assert.equal((response.jsonBody as { code?: string }).code, "IDEMPOTENCY_MISMATCH");
});

test("workspacesCreate distinguishes same-request lifecycle contention", async () => {
  const inProgress = new Error("Workspace creation is already being activated.");
  inProgress.name = "WorkspaceCreationInProgressError";
  createWorkspaceWithOwnerMock.mockRejectedValueOnce(inProgress);

  const response = await workspacesCreate(
    createRequest(
      "POST",
      { authorization: "Bearer owner-user" },
      { name: "Team 42", idempotencyKey: "create-team-42" }
    ) as never,
    createContext() as never
  );

  assert.equal(response.status, 409);
  assert.equal((response.jsonBody as { code?: string }).code, "OPERATION_IN_PROGRESS");
});

test("workspacesMe returns all active workspaces for the caller", async () => {
  listWorkspacesForUserMock.mockResolvedValue([
    {
      workspace: { workspaceId: "team-42", name: "Team 42", status: "active" },
      membership: { userId: "owner-user", workspaceId: "team-42", role: "owner", status: "active" }
    },
    {
      workspace: { workspaceId: "alpha", name: "Alpha", status: "active" },
      membership: { userId: "owner-user", workspaceId: "alpha", role: "member", status: "active" }
    }
  ]);

  const response = await workspacesMe(
    createRequest("GET", { authorization: "Bearer owner-user" }) as never,
    createContext() as never
  );

  assert.equal(response.status, 200, JSON.stringify(response.jsonBody));
  assert.deepEqual((response.jsonBody as { workspaces: Array<{ workspaceId: string }> }).workspaces.map((row) => row.workspaceId), ["alpha", "team-42"]);
});

test("workspaceMembersAdd requires owner membership", async () => {
  getWorkspaceByIdMock.mockResolvedValue({
    workspaceId: "team-42",
    name: "Team 42",
    ownerUserId: "owner-user",
    status: "active"
  });
  getWorkspaceMembershipMock.mockResolvedValue({
    userId: "basic-user",
    workspaceId: "team-42",
    role: "member",
    status: "active"
  });
  const request = createRequest(
    "POST",
    { authorization: "Bearer basic-user" },
    { userId: "new-user", role: "member" },
    { workspaceId: "team-42" }
  );

  const context = createContext();
  const response = await workspaceMembersAdd(request as never, context as never);
  assert.equal(response.status, 403);
  assert.equal(upsertWorkspaceMembershipMock.mock.calls.length, 0);
  assert.equal(context.warn.mock.calls.length, 1);
  assert.equal(context.warn.mock.calls[0]?.[0], "api.telemetry");
  assert.equal(context.warn.mock.calls[0]?.[1]?.route, "workspace_members");
  assert.equal(context.warn.mock.calls[0]?.[1]?.workspace_scope, "workspace");
  assert.equal(context.warn.mock.calls[0]?.[1]?.outcome, "http_403");
});

test("workspaceMembersAdd rejects owner role changes outside the transfer flow", async () => {
  getWorkspaceByIdMock.mockResolvedValue({
    workspaceId: "team-42",
    name: "Team 42",
    ownerUserId: "owner-user",
    status: "active"
  });
  getWorkspaceMembershipMock.mockResolvedValue({
    userId: "owner-user",
    workspaceId: "team-42",
    role: "owner",
    status: "active"
  });

  const response = await workspaceMembersAdd(
    createRequest(
      "POST",
      { authorization: "Bearer owner-user" },
      { userId: "new-owner", role: "owner" },
      { workspaceId: "team-42" }
    ) as never,
    createContext() as never
  );

  assert.equal(response.status, 400);
  assert.equal(upsertWorkspaceMembershipMock.mock.calls.length, 0);
});

test("workspaceMembersList returns members for authorized user", async () => {
  listWorkspaceMembershipsMock.mockResolvedValue([
    {
      userId: "owner-user",
      workspaceId: "team-42",
      role: "owner",
      status: "active",
      displayName: "Owner Snapshot",
      photoUrl: "https://example.test/owner-snapshot.png",
      updatedAt: "2026-02-25T00:00:00.000Z"
    },
    { userId: "member-user", workspaceId: "team-42", role: "member", status: "active", updatedAt: "2026-02-25T00:00:00.000Z" }
  ]);
  listUserProfilesMock.mockResolvedValue([
    { userId: "member-user", displayName: "Member Name", photoUrl: "https://example.test/member.png" }
  ]);
  const request = createRequest(
    "GET",
    { authorization: "Bearer owner-user" },
    undefined,
    { workspaceId: "team-42" }
  );

  const response = await workspaceMembersList(request as never, createContext() as never);
  assert.equal(response.status, 200);
  assert.equal((response.jsonBody as { count: number }).count, 2);
  assert.deepEqual(listUserProfilesMock.mock.calls[0]?.[1], ["member-user"]);
  assert.equal(updateWorkspaceMembershipProfileSnapshotMock.mock.calls.length, 1);
  assert.equal(updateWorkspaceMembershipProfileSnapshotMock.mock.calls[0]?.[1]?.userId, "member-user");
  assert.deepEqual(updateWorkspaceMembershipProfileSnapshotMock.mock.calls[0]?.[2], {
    displayName: "Member Name",
    photoUrl: "https://example.test/member.png"
  });
  assert.equal(upsertWorkspaceMembershipMock.mock.calls.length, 0);
  assert.equal((response.jsonBody as { memberships: Array<{ displayName?: string }> }).memberships[0]?.displayName, "Owner Snapshot");
  assert.equal((response.jsonBody as { memberships: Array<{ displayName?: string }> }).memberships[1]?.displayName, "Member Name");
});

test("workspaceMembersRemove rejects removing owner membership", async () => {
  getWorkspaceByIdMock.mockResolvedValue({
    workspaceId: "team-42",
    name: "Team 42",
    ownerUserId: "owner-user",
    status: "active"
  });
  getWorkspaceMembershipMock
    .mockResolvedValueOnce({
      userId: "owner-user",
      workspaceId: "team-42",
      role: "owner",
      status: "active"
    })
    .mockResolvedValueOnce({
      userId: "owner-user",
      workspaceId: "team-42",
      role: "owner",
      status: "active"
    });

  const response = await workspaceMembersRemove(
    createRequest(
      "DELETE",
      { authorization: "Bearer owner-user" },
      undefined,
      { workspaceId: "team-42", memberUserId: "owner-user" }
    ) as never,
    createContext() as never
  );

  assert.equal(response.status, 400);
});

test("workspaceLeave removes a regular member from the workspace", async () => {
  getWorkspaceByIdMock.mockResolvedValue({
    workspaceId: "team-42",
    name: "Team 42",
    ownerUserId: "owner-user",
    status: "active"
  });
  getWorkspaceMembershipMock.mockResolvedValueOnce({
    userId: "member-user",
    workspaceId: "team-42",
    role: "member",
    status: "active"
  });

  const response = await workspaceLeave(
    createRequest(
      "POST",
      { authorization: "Bearer member-user" },
      {},
      { workspaceId: "team-42" }
    ) as never,
    createContext() as never
  );

  assert.equal(response.status, 200);
  assert.equal(deactivateWorkspaceMembershipMock.mock.calls.length, 1);
  assert.equal(deactivateWorkspaceMembershipMock.mock.calls[0]?.[1], "member-user");
});

test("workspaceLeave transfers ownership when owner leaves and members remain", async () => {
  getWorkspaceByIdMock.mockResolvedValue({
    workspaceId: "team-42",
    name: "Team 42",
    ownerUserId: "owner-user",
    status: "active"
  });
  getWorkspaceMembershipMock.mockResolvedValue({
    userId: "owner-user",
    workspaceId: "team-42",
    role: "owner",
    status: "active"
  });
  listWorkspaceMembershipsMock.mockResolvedValue([
    { userId: "owner-user", workspaceId: "team-42", role: "owner", status: "active", updatedAt: "2026-02-25T00:00:00.000Z" },
    { userId: "member-user", workspaceId: "team-42", role: "member", status: "active", updatedAt: "2026-02-25T00:00:00.000Z" }
  ]);

  const response = await workspaceLeave(
    createRequest(
      "POST",
      { authorization: "Bearer owner-user" },
      { newOwnerUserId: "member-user" },
      { workspaceId: "team-42" }
    ) as never,
    createContext() as never
  );

  assert.equal(response.status, 200);
  assert.equal(upsertWorkspaceMembershipMock.mock.calls[0]?.[1]?.role, "owner");
  assert.equal(deactivateWorkspaceMembershipMock.mock.calls[0]?.[1], "owner-user");
  assert.equal(transferWorkspaceOwnershipMock.mock.calls[0]?.[2], "member-user");
});

test("workspaceLeave rejects transfer when selected new owner is not an active member", async () => {
  getWorkspaceByIdMock.mockResolvedValue({
    workspaceId: "team-42",
    name: "Team 42",
    ownerUserId: "owner-user",
    status: "active"
  });
  getWorkspaceMembershipMock.mockResolvedValue({
    userId: "owner-user",
    workspaceId: "team-42",
    role: "owner",
    status: "active"
  });
  listWorkspaceMembershipsMock.mockResolvedValue([
    { userId: "owner-user", workspaceId: "team-42", role: "owner", status: "active", updatedAt: "2026-02-25T00:00:00.000Z" },
    { userId: "member-user", workspaceId: "team-42", role: "member", status: "active", updatedAt: "2026-02-25T00:00:00.000Z" }
  ]);

  const response = await workspaceLeave(
    createRequest(
      "POST",
      { authorization: "Bearer owner-user" },
      { newOwnerUserId: "missing-user" },
      { workspaceId: "team-42" }
    ) as never,
    createContext() as never
  );

  assert.equal(response.status, 400);
  assert.equal(upsertWorkspaceMembershipMock.mock.calls.length, 0);
  assert.equal(deactivateWorkspaceMembershipMock.mock.calls.length, 0);
  assert.equal(transferWorkspaceOwnershipMock.mock.calls.length, 0);
});

test("workspaceLeave requires delete confirmation for last owner", async () => {
  getWorkspaceByIdMock.mockResolvedValue({
    workspaceId: "team-42",
    name: "Team 42",
    ownerUserId: "owner-user",
    status: "active"
  });
  getWorkspaceMembershipMock.mockResolvedValue({
    userId: "owner-user",
    workspaceId: "team-42",
    role: "owner",
    status: "active"
  });
  listWorkspaceMembershipsMock.mockResolvedValue([
    { userId: "owner-user", workspaceId: "team-42", role: "owner", status: "active", updatedAt: "2026-02-25T00:00:00.000Z" }
  ]);

  const response = await workspaceLeave(
    createRequest(
      "POST",
      { authorization: "Bearer owner-user" },
      {},
      { workspaceId: "team-42" }
    ) as never,
    createContext() as never
  );

  assert.equal(response.status, 400);
  assert.equal(softDeleteWorkspaceMock.mock.calls.length, 0);
});

test("workspaceLeave soft deletes workspace when last owner confirms delete", async () => {
  getWorkspaceByIdMock.mockResolvedValue({
    workspaceId: "team-42",
    name: "Team 42",
    ownerUserId: "owner-user",
    status: "active"
  });
  getWorkspaceMembershipMock.mockResolvedValue({
    userId: "owner-user",
    workspaceId: "team-42",
    role: "owner",
    status: "active"
  });
  listWorkspaceMembershipsMock.mockResolvedValue([
    { userId: "owner-user", workspaceId: "team-42", role: "owner", status: "active", updatedAt: "2026-02-25T00:00:00.000Z" }
  ]);

  const response = await workspaceLeave(
    createRequest(
      "POST",
      { authorization: "Bearer owner-user" },
      { deleteWorkspace: true },
      { workspaceId: "team-42" }
    ) as never,
    createContext() as never
  );

  assert.equal(response.status, 200);
  assert.equal(softDeleteWorkspaceMock.mock.calls.length, 1);
  assert.equal(deactivateWorkspaceMembershipMock.mock.calls.length, 1);
});

test("workspaceJoinLinksCreate creates a one-time join link for owner", async () => {
  getWorkspaceByIdMock.mockResolvedValue({
    workspaceId: "team-42",
    name: "Team 42",
    ownerUserId: "owner-user",
    status: "active"
  });
  const response = await workspaceJoinLinksCreate(
    createRequest(
      "POST",
      { authorization: "Bearer owner-user" },
      {},
      { workspaceId: "team-42" }
    ) as never,
    createContext() as never
  );

  assert.equal(response.status, 201);
  assert.equal(createWorkspaceJoinLinkMock.mock.calls.length, 1);
  const body = response.jsonBody as { inviteUrl: string };
  assert.match(body.inviteUrl, /^\/\?invite=/);
});

test("workspaceJoinLinksCreate rejects deleted workspaces", async () => {
  getWorkspaceByIdMock.mockResolvedValue({
    workspaceId: "team-42",
    name: "Team 42",
    ownerUserId: "owner-user",
    status: "deleted"
  });

  const response = await workspaceJoinLinksCreate(
    createRequest(
      "POST",
      { authorization: "Bearer owner-user" },
      {},
      { workspaceId: "team-42" }
    ) as never,
    createContext() as never
  );

  assert.equal(response.status, 404);
  assert.equal(createWorkspaceJoinLinkMock.mock.calls.length, 0);
});

test("workspaceJoinLinksList returns join links for owner", async () => {
  getWorkspaceByIdMock.mockResolvedValue({
    workspaceId: "team-42",
    name: "Team 42",
    ownerUserId: "owner-user",
    status: "active"
  });
  listWorkspaceJoinLinksMock.mockResolvedValue([
    { inviteId: "invite-1", workspaceId: "team-42", status: "active", expiresAt: "2099-01-01T00:00:00.000Z" },
    { inviteId: "invite-2", workspaceId: "team-42", status: "used", expiresAt: "2099-01-01T00:00:00.000Z" }
  ]);

  const response = await workspaceJoinLinksList(
    createRequest(
      "GET",
      { authorization: "Bearer owner-user" },
      undefined,
      { workspaceId: "team-42" }
    ) as never,
    createContext() as never
  );

  assert.equal(response.status, 200);
  assert.equal((response.jsonBody as { links: unknown[] }).links.length, 2);
});

test("workspaceJoinLinksRemove revokes join link", async () => {
  getWorkspaceByIdMock.mockResolvedValue({
    workspaceId: "team-42",
    name: "Team 42",
    ownerUserId: "owner-user",
    status: "active"
  });
  const response = await workspaceJoinLinksRemove(
    createRequest(
      "DELETE",
      { authorization: "Bearer owner-user" },
      undefined,
      { workspaceId: "team-42", inviteId: "invite-1" }
    ) as never,
    createContext() as never
  );

  assert.equal(response.status, 200);
  assert.equal(revokeWorkspaceJoinLinkMock.mock.calls.length, 1);
});

test("joinAccept previews workspace before consuming invite", async () => {
  getWorkspaceByIdMock.mockResolvedValue({
    workspaceId: "team-42",
    name: "Team 42",
    ownerUserId: "owner-user",
    status: "active"
  });
  const response = await joinAccept(
    createRequest(
      "POST",
      { authorization: "Bearer joiner-user" },
      { inviteToken: "token-123", preview: true }
    ) as never,
    createContext() as never
  );

  assert.equal(response.status, 200);
  assert.equal(upsertWorkspaceMembershipMock.mock.calls.length, 0);
  assert.equal((response.jsonBody as { workspaceName: string }).workspaceName, "Team 42");
});

test("joinAccept creates member membership and marks link used", async () => {
  getWorkspaceMembershipMock.mockResolvedValue(null);
  getWorkspaceByIdMock.mockResolvedValue({
    workspaceId: "team-42",
    name: "Team 42",
    ownerUserId: "owner-user",
    status: "active"
  });

  const response = await joinAccept(
    createRequest(
      "POST",
      { authorization: "Bearer joiner-user" },
      { inviteToken: "token-123" }
    ) as never,
    createContext() as never
  );

  assert.equal(response.status, 200);
  assert.equal(upsertWorkspaceMembershipMock.mock.calls.length, 1);
  assert.equal(upsertWorkspaceMembershipMock.mock.calls[0]?.[1]?.role, "member");
  assert.equal(markWorkspaceJoinLinkUsedMock.mock.calls.length, 1);
  assert.equal(markWorkspaceJoinLinkUsedMock.mock.calls[0]?.[2], "joiner-user");
});

test("joinAccept rejects used join links", async () => {
  getWorkspaceByIdMock.mockResolvedValue({
    workspaceId: "team-42",
    name: "Team 42",
    ownerUserId: "owner-user",
    status: "active"
  });
  getWorkspaceJoinLinkByTokenHashMock.mockResolvedValue({
    inviteId: "invite-1",
    workspaceId: "team-42",
    status: "used",
    expiresAt: "2099-03-25T00:00:00.000Z",
    role: "member"
  });

  const response = await joinAccept(
    createRequest(
      "POST",
      { authorization: "Bearer joiner-user" },
      { inviteToken: "token-123" }
    ) as never,
    createContext() as never
  );

  assert.equal(response.status, 409);
});

test("joinAccept rejects revoked join links", async () => {
  getWorkspaceByIdMock.mockResolvedValue({
    workspaceId: "team-42",
    name: "Team 42",
    ownerUserId: "owner-user",
    status: "active"
  });
  getWorkspaceJoinLinkByTokenHashMock.mockResolvedValue({
    inviteId: "invite-1",
    workspaceId: "team-42",
    status: "revoked",
    expiresAt: "2099-03-25T00:00:00.000Z",
    role: "member"
  });

  const response = await joinAccept(
    createRequest(
      "POST",
      { authorization: "Bearer joiner-user" },
      { inviteToken: "token-123" }
    ) as never,
    createContext() as never
  );

  assert.equal(response.status, 410);
});

test("joinAccept rejects deleted workspaces", async () => {
  getWorkspaceByIdMock.mockResolvedValue({
    workspaceId: "team-42",
    name: "Team 42",
    ownerUserId: "owner-user",
    status: "deleted"
  });

  const response = await joinAccept(
    createRequest(
      "POST",
      { authorization: "Bearer joiner-user" },
      { inviteToken: "token-123" }
    ) as never,
    createContext() as never
  );

  assert.equal(response.status, 404);
  assert.equal(upsertWorkspaceMembershipMock.mock.calls.length, 0);
  assert.equal(markWorkspaceJoinLinkUsedMock.mock.calls.length, 0);
});
