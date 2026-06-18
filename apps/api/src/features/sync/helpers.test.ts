import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import type { ApiConfig } from "../../types";
import { resolveSyncScope } from "../../lib/syncScopeResolution";

const { hasWorkspaceMembershipMock } = vi.hoisted(() => ({
  hasWorkspaceMembershipMock: vi.fn()
}));

vi.mock("../../lib/cosmos/workspaceRepository", () => ({
  hasWorkspaceMembership: hasWorkspaceMembershipMock
}));

import { assertAuthorizedSyncScopeStillActive } from "./helpers";

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

beforeEach(() => {
  vi.clearAllMocks();
});

test("assertAuthorizedSyncScopeStillActive no-ops for personal sync scopes", async () => {
  await assertAuthorizedSyncScopeStillActive(createConfig(), resolveSyncScope("user-1"));

  assert.equal(hasWorkspaceMembershipMock.mock.calls.length, 0);
});

test("assertAuthorizedSyncScopeStillActive rechecks workspace membership", async () => {
  hasWorkspaceMembershipMock.mockResolvedValueOnce(false);

  await assert.rejects(
    () => assertAuthorizedSyncScopeStillActive(createConfig(), resolveSyncScope("user-1", "team-42")),
    (error: { status?: number; message?: string }) =>
      error.status === 403 && error.message === "User is not a member of this workspace."
  );

  assert.deepEqual(hasWorkspaceMembershipMock.mock.calls[0]?.slice(1), ["user-1", "team-42"]);
});
