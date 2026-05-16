import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import type { ApiConfig, WorkspaceMembershipDocument } from "../../types";

const {
  deactivateWorkspaceMembershipMock,
  getWorkspaceByIdMock,
  getWorkspaceMembershipMock,
  listWorkspaceMembershipsMock,
  restoreWorkspaceDocumentMock,
  softDeleteWorkspaceMock,
  transferWorkspaceOwnershipMock,
  upsertWorkspaceMembershipMock
} = vi.hoisted(() => ({
  deactivateWorkspaceMembershipMock: vi.fn(),
  getWorkspaceByIdMock: vi.fn(),
  getWorkspaceMembershipMock: vi.fn(),
  listWorkspaceMembershipsMock: vi.fn(),
  restoreWorkspaceDocumentMock: vi.fn(),
  softDeleteWorkspaceMock: vi.fn(),
  transferWorkspaceOwnershipMock: vi.fn(),
  upsertWorkspaceMembershipMock: vi.fn()
}));

vi.mock("../../lib/cosmos/workspaceRepository", () => ({
  deactivateWorkspaceMembership: deactivateWorkspaceMembershipMock,
  getWorkspaceById: getWorkspaceByIdMock,
  getWorkspaceMembership: getWorkspaceMembershipMock,
  listWorkspaceMemberships: listWorkspaceMembershipsMock,
  restoreWorkspaceDocument: restoreWorkspaceDocumentMock,
  softDeleteWorkspace: softDeleteWorkspaceMock,
  transferWorkspaceOwnership: transferWorkspaceOwnershipMock,
  upsertWorkspaceMembership: upsertWorkspaceMembershipMock
}));

import { leaveWorkspaceForActor } from "./leaveService";

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
    migrationCosmosDatabaseId: "whatfees_migrations",
    entitlementsContainerId: "entitlements",
    syncContainerId: "sync_data",
    migrationRunsContainerId: "migration_runs"
  };
}

function membership(userId: string, role: "owner" | "member"): WorkspaceMembershipDocument {
  return {
    id: `m:${userId}:ws-1`,
    docType: "workspace_membership",
    userId,
    workspaceId: "ws-1",
    role,
    status: "active",
    updatedAt: "2026-05-14T00:00:00.000Z"
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getWorkspaceByIdMock.mockResolvedValue({
    id: "workspace:ws-1",
    docType: "workspace",
    userId: "ws:ws-1",
    workspaceId: "ws-1",
    name: "Workspace 1",
    ownerUserId: "owner-1",
    status: "active",
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:00:00.000Z"
  });
});

test("leaveWorkspaceForActor rejects stale memberships for deleted workspaces without mutating membership", async () => {
  getWorkspaceByIdMock.mockResolvedValue({
    id: "workspace:ws-1",
    docType: "workspace",
    userId: "ws:ws-1",
    workspaceId: "ws-1",
    name: "Workspace 1",
    ownerUserId: "owner-1",
    status: "deleted",
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:00:00.000Z"
  });
  getWorkspaceMembershipMock.mockResolvedValue(membership("member-1", "member"));

  await assert.rejects(
    () => leaveWorkspaceForActor(createConfig(), "member-1", "ws-1", {
      newOwnerUserId: "",
      deleteWorkspace: false
    }),
    (error: { status?: number; message?: string }) =>
      error.status === 404 && error.message === "Workspace was not found."
  );

  assert.equal(deactivateWorkspaceMembershipMock.mock.calls.length, 0);
  assert.equal(listWorkspaceMembershipsMock.mock.calls.length, 0);
});

test("leaveWorkspaceForActor keeps the current owner active when ownership transfer fails", async () => {
  const actorMembership = membership("owner-1", "owner");
  const targetMembership = membership("member-1", "member");
  getWorkspaceMembershipMock.mockResolvedValue(actorMembership);
  listWorkspaceMembershipsMock.mockResolvedValue([actorMembership, targetMembership]);
  upsertWorkspaceMembershipMock.mockResolvedValue({ ...targetMembership, role: "owner" });
  transferWorkspaceOwnershipMock.mockRejectedValue(new Error("transfer failed"));
  deactivateWorkspaceMembershipMock.mockResolvedValue(true);

  await assert.rejects(
    () => leaveWorkspaceForActor(createConfig(), "owner-1", "ws-1", {
      newOwnerUserId: "member-1",
      deleteWorkspace: false
    }),
    /transfer failed/
  );

  assert.equal(deactivateWorkspaceMembershipMock.mock.calls.length, 0);
  assert.deepEqual(upsertWorkspaceMembershipMock.mock.calls.map((call) => call[1]?.role), ["owner", "member"]);
});

test("leaveWorkspaceForActor treats missing ownership transfer result as conflict and keeps memberships intact", async () => {
  const actorMembership = membership("owner-1", "owner");
  const targetMembership = membership("member-1", "member");
  getWorkspaceMembershipMock.mockResolvedValue(actorMembership);
  listWorkspaceMembershipsMock.mockResolvedValue([actorMembership, targetMembership]);
  upsertWorkspaceMembershipMock.mockResolvedValue({ ...targetMembership, role: "owner" });
  transferWorkspaceOwnershipMock.mockResolvedValue(null);
  deactivateWorkspaceMembershipMock.mockResolvedValue(true);

  await assert.rejects(
    () => leaveWorkspaceForActor(createConfig(), "owner-1", "ws-1", {
      newOwnerUserId: "member-1",
      deleteWorkspace: false
    }),
    (error: { status?: number; message?: string }) =>
      error.status === 409 && error.message === "Workspace ownership transfer conflicted. Refresh and try again."
  );

  assert.equal(deactivateWorkspaceMembershipMock.mock.calls.length, 0);
  assert.deepEqual(upsertWorkspaceMembershipMock.mock.calls.map((call) => call[1]?.role), ["owner", "member"]);
});

test("leaveWorkspaceForActor rolls back a completed owner transfer when owner removal conflicts", async () => {
  const actorMembership = membership("owner-1", "owner");
  const targetMembership = membership("member-1", "member");
  getWorkspaceMembershipMock.mockResolvedValue(actorMembership);
  listWorkspaceMembershipsMock.mockResolvedValue([actorMembership, targetMembership]);
  upsertWorkspaceMembershipMock.mockResolvedValue({ ...targetMembership, role: "owner" });
  transferWorkspaceOwnershipMock.mockResolvedValue({
    id: "workspace:ws-1",
    docType: "workspace",
    userId: "ws:ws-1",
    workspaceId: "ws-1",
    name: "Workspace 1",
    ownerUserId: "member-1",
    status: "active",
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:00:00.000Z"
  });
  deactivateWorkspaceMembershipMock.mockResolvedValue(false);

  await assert.rejects(
    () => leaveWorkspaceForActor(createConfig(), "owner-1", "ws-1", {
      newOwnerUserId: "member-1",
      deleteWorkspace: false
    }),
    (error: { status?: number; message?: string }) =>
      error.status === 409 && error.message === "Workspace leave conflicted. Refresh and try again."
  );

  assert.deepEqual(
    transferWorkspaceOwnershipMock.mock.calls.map((call) => call.slice(1)),
    [
      ["ws-1", "member-1", "owner-1"],
      ["ws-1", "owner-1", "member-1"]
    ]
  );
  assert.deepEqual(upsertWorkspaceMembershipMock.mock.calls.map((call) => ({
    userId: call[1]?.userId,
    role: call[1]?.role
  })), [
    { userId: "member-1", role: "owner" },
    { userId: "member-1", role: "member" },
    { userId: "owner-1", role: "owner" }
  ]);
});

test("leaveWorkspaceForActor treats missing delete result as conflict and keeps last owner membership", async () => {
  const actorMembership = membership("owner-1", "owner");
  getWorkspaceMembershipMock.mockResolvedValue(actorMembership);
  listWorkspaceMembershipsMock.mockResolvedValue([actorMembership]);
  softDeleteWorkspaceMock.mockResolvedValue(null);
  deactivateWorkspaceMembershipMock.mockResolvedValue(true);

  await assert.rejects(
    () => leaveWorkspaceForActor(createConfig(), "owner-1", "ws-1", {
      newOwnerUserId: "",
      deleteWorkspace: true
    }),
    (error: { status?: number; message?: string }) =>
      error.status === 409 && error.message === "Workspace deletion conflicted. Refresh and try again."
  );

  assert.equal(deactivateWorkspaceMembershipMock.mock.calls.length, 0);
});

test("leaveWorkspaceForActor restores the workspace when last-owner membership removal fails after deletion", async () => {
  const actorMembership = membership("owner-1", "owner");
  const activeWorkspace = {
    id: "workspace:ws-1",
    docType: "workspace" as const,
    userId: "ws:ws-1",
    workspaceId: "ws-1",
    name: "Workspace 1",
    ownerUserId: "owner-1",
    status: "active" as const,
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:00:00.000Z"
  };
  getWorkspaceByIdMock.mockResolvedValue(activeWorkspace);
  getWorkspaceMembershipMock.mockResolvedValue(actorMembership);
  listWorkspaceMembershipsMock.mockResolvedValue([actorMembership]);
  softDeleteWorkspaceMock.mockResolvedValue({ ...activeWorkspace, status: "deleted" });
  deactivateWorkspaceMembershipMock.mockRejectedValue(new Error("membership write failed"));
  restoreWorkspaceDocumentMock.mockResolvedValue(activeWorkspace);

  await assert.rejects(
    () => leaveWorkspaceForActor(createConfig(), "owner-1", "ws-1", {
      newOwnerUserId: "",
      deleteWorkspace: true
    }),
    /membership write failed/
  );

  assert.equal(restoreWorkspaceDocumentMock.mock.calls.length, 1);
  assert.deepEqual(restoreWorkspaceDocumentMock.mock.calls[0]?.[1], activeWorkspace);
});

test("leaveWorkspaceForActor restores the workspace when last-owner membership removal conflicts after deletion", async () => {
  const actorMembership = membership("owner-1", "owner");
  const activeWorkspace = {
    id: "workspace:ws-1",
    docType: "workspace" as const,
    userId: "ws:ws-1",
    workspaceId: "ws-1",
    name: "Workspace 1",
    ownerUserId: "owner-1",
    status: "active" as const,
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:00:00.000Z"
  };
  getWorkspaceByIdMock.mockResolvedValue(activeWorkspace);
  getWorkspaceMembershipMock.mockResolvedValue(actorMembership);
  listWorkspaceMembershipsMock.mockResolvedValue([actorMembership]);
  softDeleteWorkspaceMock.mockResolvedValue({ ...activeWorkspace, status: "deleted" });
  deactivateWorkspaceMembershipMock.mockResolvedValue(false);
  restoreWorkspaceDocumentMock.mockResolvedValue(activeWorkspace);

  await assert.rejects(
    () => leaveWorkspaceForActor(createConfig(), "owner-1", "ws-1", {
      newOwnerUserId: "",
      deleteWorkspace: true
    }),
    (error: { status?: number; message?: string }) =>
      error.status === 409 && error.message === "Workspace deletion conflicted. Refresh and try again."
  );

  assert.equal(restoreWorkspaceDocumentMock.mock.calls.length, 1);
  assert.deepEqual(restoreWorkspaceDocumentMock.mock.calls[0]?.[1], activeWorkspace);
});
