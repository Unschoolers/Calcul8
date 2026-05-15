import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import type { ApiConfig, WorkspaceDocument, WorkspaceMembershipDocument } from "../../types";

const {
  getWorkspaceByIdMock,
  getWorkspaceMembershipMock
} = vi.hoisted(() => ({
  getWorkspaceByIdMock: vi.fn(),
  getWorkspaceMembershipMock: vi.fn()
}));

vi.mock("../../lib/cosmos/workspaceRepository", () => ({
  getWorkspaceById: getWorkspaceByIdMock,
  getWorkspaceMembership: getWorkspaceMembershipMock
}));

import { assertCanManageWorkspaceMembership } from "./helpers";

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

function workspace(status: WorkspaceDocument["status"] = "active"): WorkspaceDocument {
  return {
    id: "workspace:team-42",
    docType: "workspace",
    userId: "ws:team-42",
    workspaceId: "team-42",
    name: "Team 42",
    ownerUserId: "owner-1",
    status,
    createdAt: "2026-05-14T00:00:00.000Z",
    updatedAt: "2026-05-14T00:00:00.000Z"
  };
}

function ownerMembership(): WorkspaceMembershipDocument {
  return {
    id: "m:owner-1:team-42",
    docType: "workspace_membership",
    userId: "owner-1",
    workspaceId: "team-42",
    role: "owner",
    status: "active",
    updatedAt: "2026-05-14T00:00:00.000Z"
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getWorkspaceByIdMock.mockResolvedValue(workspace());
  getWorkspaceMembershipMock.mockResolvedValue(ownerMembership());
});

test("assertCanManageWorkspaceMembership rejects stale owner membership for deleted workspaces", async () => {
  getWorkspaceByIdMock.mockResolvedValue(workspace("deleted"));

  await assert.rejects(
    () => assertCanManageWorkspaceMembership(createConfig(), "owner-1", "team-42"),
    (error: { status?: number; message?: string }) =>
      error.status === 404 && error.message === "Workspace was not found."
  );
});
