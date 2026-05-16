import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import type {
  ApiConfig,
  WorkspaceDocument,
  WorkspaceJoinLinkDocument,
  WorkspaceMembershipDocument
} from "../../types";

const {
  deactivateWorkspaceMembershipMock,
  getWorkspaceByIdMock,
  getWorkspaceJoinLinkByTokenHashMock,
  getWorkspaceMembershipMock,
  markWorkspaceJoinLinkUsedMock,
  upsertWorkspaceMembershipMock
} = vi.hoisted(() => ({
  deactivateWorkspaceMembershipMock: vi.fn(),
  getWorkspaceByIdMock: vi.fn(),
  getWorkspaceJoinLinkByTokenHashMock: vi.fn(),
  getWorkspaceMembershipMock: vi.fn(),
  markWorkspaceJoinLinkUsedMock: vi.fn(),
  upsertWorkspaceMembershipMock: vi.fn()
}));

vi.mock("../../lib/cosmos/workspaceRepository", () => ({
  deactivateWorkspaceMembership: deactivateWorkspaceMembershipMock,
  getWorkspaceById: getWorkspaceByIdMock,
  getWorkspaceJoinLinkByTokenHash: getWorkspaceJoinLinkByTokenHashMock,
  getWorkspaceMembership: getWorkspaceMembershipMock,
  markWorkspaceJoinLinkUsed: markWorkspaceJoinLinkUsedMock,
  upsertWorkspaceMembership: upsertWorkspaceMembershipMock
}));

import { acceptWorkspaceJoinLinkForActor } from "./joinAcceptService";

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

function workspace(): WorkspaceDocument {
  return {
    id: "workspace:team-42",
    docType: "workspace",
    userId: "ws:team-42",
    workspaceId: "team-42",
    name: "Team 42",
    ownerUserId: "owner-1",
    status: "active",
    createdAt: "2026-05-14T00:00:00.000Z",
    updatedAt: "2026-05-14T00:00:00.000Z"
  };
}

function joinLink(status: WorkspaceJoinLinkDocument["status"] = "active"): WorkspaceJoinLinkDocument {
  return {
    id: "join_link:invite-1",
    docType: "workspace_join_link",
    userId: "ws:team-42",
    inviteId: "invite-1",
    workspaceId: "team-42",
    createdByUserId: "owner-1",
    role: "member",
    status,
    tokenHash: "token-hash",
    expiresAt: "2099-05-14T00:00:00.000Z",
    updatedAt: "2026-05-14T00:00:00.000Z"
  };
}

function membership(): WorkspaceMembershipDocument {
  return {
    id: "m:joiner-1:team-42",
    docType: "workspace_membership",
    userId: "joiner-1",
    workspaceId: "team-42",
    role: "member",
    status: "active",
    updatedAt: "2026-05-14T00:00:00.000Z"
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getWorkspaceJoinLinkByTokenHashMock.mockResolvedValue(joinLink());
  getWorkspaceByIdMock.mockResolvedValue(workspace());
  getWorkspaceMembershipMock.mockResolvedValue(null);
  upsertWorkspaceMembershipMock.mockResolvedValue(membership());
  markWorkspaceJoinLinkUsedMock.mockResolvedValue({
    ...joinLink("used"),
    usedByUserId: "joiner-1"
  });
  deactivateWorkspaceMembershipMock.mockResolvedValue(true);
});

test("acceptWorkspaceJoinLinkForActor removes created membership when consuming the invite fails", async () => {
  markWorkspaceJoinLinkUsedMock.mockResolvedValue(null);

  await assert.rejects(
    () => acceptWorkspaceJoinLinkForActor(createConfig(), "joiner-1", {
      inviteToken: "token-123",
      preview: false
    }),
    /Workspace join link has already been used\./
  );

  assert.equal(upsertWorkspaceMembershipMock.mock.calls.length, 1);
  assert.equal(deactivateWorkspaceMembershipMock.mock.calls.length, 1);
  assert.deepEqual(deactivateWorkspaceMembershipMock.mock.calls[0]?.slice(1), ["joiner-1", "team-42"]);
});

test("acceptWorkspaceJoinLinkForActor removes created membership when consuming the invite throws", async () => {
  markWorkspaceJoinLinkUsedMock.mockRejectedValue(new Error("consume race"));

  await assert.rejects(
    () => acceptWorkspaceJoinLinkForActor(createConfig(), "joiner-1", {
      inviteToken: "token-123",
      preview: false
    }),
    /consume race/
  );

  assert.equal(upsertWorkspaceMembershipMock.mock.calls.length, 1);
  assert.equal(deactivateWorkspaceMembershipMock.mock.calls.length, 1);
  assert.deepEqual(deactivateWorkspaceMembershipMock.mock.calls[0]?.slice(1), ["joiner-1", "team-42"]);
});
