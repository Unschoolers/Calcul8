import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import type {
  ApiConfig,
  WorkspaceDocument,
  WorkspaceJoinLinkDocument,
  WorkspaceMembershipDocument
} from "../../types";

const {
  createWorkspaceJoinLinkMock,
  getWorkspaceByIdMock,
  getWorkspaceJoinLinkByInviteIdMock,
  getWorkspaceMembershipMock,
  listWorkspaceJoinLinksMock,
  revokeWorkspaceJoinLinkMock
} = vi.hoisted(() => ({
  createWorkspaceJoinLinkMock: vi.fn(),
  getWorkspaceByIdMock: vi.fn(),
  getWorkspaceJoinLinkByInviteIdMock: vi.fn(),
  getWorkspaceMembershipMock: vi.fn(),
  listWorkspaceJoinLinksMock: vi.fn(),
  revokeWorkspaceJoinLinkMock: vi.fn()
}));

vi.mock("../../lib/cosmos/workspaceRepository", () => ({
  createWorkspaceJoinLink: createWorkspaceJoinLinkMock,
  getWorkspaceById: getWorkspaceByIdMock,
  getWorkspaceJoinLinkByInviteId: getWorkspaceJoinLinkByInviteIdMock,
  getWorkspaceMembership: getWorkspaceMembershipMock,
  listWorkspaceJoinLinks: listWorkspaceJoinLinksMock,
  revokeWorkspaceJoinLink: revokeWorkspaceJoinLinkMock
}));

import { revokeWorkspaceJoinLinkForActor } from "./joinLinksService";

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

function workspace(workspaceId = "team-42"): WorkspaceDocument {
  return {
    id: `workspace:${workspaceId}`,
    docType: "workspace",
    userId: `ws:${workspaceId}`,
    workspaceId,
    name: "Team 42",
    ownerUserId: "owner-1",
    status: "active",
    createdAt: "2026-05-14T00:00:00.000Z",
    updatedAt: "2026-05-14T00:00:00.000Z"
  };
}

function ownerMembership(workspaceId = "team-42"): WorkspaceMembershipDocument {
  return {
    id: `m:owner-1:${workspaceId}`,
    docType: "workspace_membership",
    userId: "owner-1",
    workspaceId,
    role: "owner",
    status: "active",
    updatedAt: "2026-05-14T00:00:00.000Z"
  };
}

function joinLink(workspaceId = "team-42"): WorkspaceJoinLinkDocument {
  return {
    id: "join_link:invite-1",
    docType: "workspace_join_link",
    userId: `ws:${workspaceId}`,
    inviteId: "invite-1",
    workspaceId,
    createdByUserId: "owner-1",
    role: "member",
    status: "active",
    tokenHash: "token-hash",
    expiresAt: "2099-05-14T00:00:00.000Z",
    updatedAt: "2026-05-14T00:00:00.000Z"
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getWorkspaceByIdMock.mockResolvedValue(workspace());
  getWorkspaceMembershipMock.mockResolvedValue(ownerMembership());
  getWorkspaceJoinLinkByInviteIdMock.mockResolvedValue(joinLink());
  listWorkspaceJoinLinksMock.mockResolvedValue([]);
  createWorkspaceJoinLinkMock.mockResolvedValue(joinLink());
  revokeWorkspaceJoinLinkMock.mockResolvedValue({ ...joinLink(), status: "revoked" });
});

test("revokeWorkspaceJoinLinkForActor does not revoke a link from another workspace", async () => {
  getWorkspaceJoinLinkByInviteIdMock.mockResolvedValue(joinLink("other-team"));
  revokeWorkspaceJoinLinkMock.mockResolvedValue({ ...joinLink("other-team"), status: "revoked" });

  await assert.rejects(
    () => revokeWorkspaceJoinLinkForActor(createConfig(), "owner-1", "team-42", "invite-1"),
    (error: { status?: number; message?: string }) =>
      error.status === 404 && error.message === "Workspace join link was not found."
  );

  assert.equal(revokeWorkspaceJoinLinkMock.mock.calls.length, 0);
});
