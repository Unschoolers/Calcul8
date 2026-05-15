import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import type { ApiConfig, WorkspaceDocument, WorkspaceMembershipDocument } from "../../types";

const {
  deactivateWorkspaceMembershipMock,
  getWorkspaceByIdMock,
  getWorkspaceMembershipMock,
  listUserProfilesMock,
  listWorkspaceMembershipsMock,
  upsertWorkspaceMembershipMock
} = vi.hoisted(() => ({
  deactivateWorkspaceMembershipMock: vi.fn(),
  getWorkspaceByIdMock: vi.fn(),
  getWorkspaceMembershipMock: vi.fn(),
  listUserProfilesMock: vi.fn(),
  listWorkspaceMembershipsMock: vi.fn(),
  upsertWorkspaceMembershipMock: vi.fn()
}));

vi.mock("../../lib/cosmos/entitlementRepository", () => ({
  listUserProfiles: listUserProfilesMock
}));

vi.mock("../../lib/cosmos/workspaceRepository", () => ({
  deactivateWorkspaceMembership: deactivateWorkspaceMembershipMock,
  getWorkspaceById: getWorkspaceByIdMock,
  getWorkspaceMembership: getWorkspaceMembershipMock,
  hasWorkspaceMembership: vi.fn(),
  listWorkspaceMemberships: listWorkspaceMembershipsMock,
  upsertWorkspaceMembership: upsertWorkspaceMembershipMock
}));

import { removeWorkspaceMemberForActor } from "./membersService";

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
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:00:00.000Z"
  };
}

function membership(userId: string, role: "owner" | "member"): WorkspaceMembershipDocument {
  return {
    id: `m:${userId}:team-42`,
    docType: "workspace_membership",
    userId,
    workspaceId: "team-42",
    role,
    status: "active",
    updatedAt: "2026-05-15T00:00:00.000Z"
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getWorkspaceByIdMock.mockResolvedValue(workspace());
  getWorkspaceMembershipMock
    .mockResolvedValueOnce(membership("owner-1", "owner"))
    .mockResolvedValueOnce(membership("member-1", "member"));
  deactivateWorkspaceMembershipMock.mockResolvedValue(true);
});

test("removeWorkspaceMemberForActor reports a conflict when the member disappears before deactivation", async () => {
  deactivateWorkspaceMembershipMock.mockResolvedValue(false);

  await assert.rejects(
    () => removeWorkspaceMemberForActor(createConfig(), "owner-1", "team-42", "member-1"),
    (error: { status?: number; message?: string }) =>
      error.status === 409 && error.message === "Workspace member removal conflicted. Refresh and try again."
  );

  assert.equal(deactivateWorkspaceMembershipMock.mock.calls.length, 1);
  assert.equal(deactivateWorkspaceMembershipMock.mock.calls[0]?.[1], "member-1");
});
