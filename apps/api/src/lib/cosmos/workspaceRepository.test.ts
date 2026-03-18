import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import type {
  ApiConfig,
  WorkspaceDocument,
  WorkspaceMembershipDocument
} from "../../types";

const {
  getContainersMock,
  isConflictErrorMock,
  isNotFoundErrorMock,
  withCosmosRetryMock
} = vi.hoisted(() => ({
  getContainersMock: vi.fn(),
  isConflictErrorMock: vi.fn(),
  isNotFoundErrorMock: vi.fn(),
  withCosmosRetryMock: vi.fn(async <T>(operation: () => Promise<T>) => operation())
}));

vi.mock("./core", () => ({
  getContainers: getContainersMock,
  isConflictError: isConflictErrorMock,
  isNotFoundError: isNotFoundErrorMock,
  withCosmosRetry: withCosmosRetryMock
}));

import {
  createWorkspaceWithOwner,
  deactivateWorkspaceMembership,
  listWorkspacesForUser
} from "./workspaceRepository";

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
    entitlementsContainerId: "entitlements",
    syncContainerId: "sync_data",
    migrationRunsContainerId: "migration_runs"
  };
}

function createEntitlementsContainer() {
  return {
    items: {
      upsert: vi.fn(),
      create: vi.fn(),
      query: vi.fn()
    },
    item: vi.fn()
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  isConflictErrorMock.mockImplementation((error: unknown) => {
    const statusCode = (error as { statusCode?: unknown })?.statusCode;
    return statusCode === 409;
  });
  isNotFoundErrorMock.mockImplementation((error: unknown) => {
    const statusCode = (error as { statusCode?: unknown })?.statusCode;
    return statusCode === 404;
  });
});

test("listWorkspacesForUser filters deleted and missing workspaces", async () => {
  const entitlements = createEntitlementsContainer();
  const activeMembership: WorkspaceMembershipDocument = {
    id: "m:user-1:ws-active",
    docType: "workspace_membership",
    userId: "user-1",
    workspaceId: "ws-active",
    role: "member",
    status: "active",
    updatedAt: "2026-03-18T00:00:00.000Z"
  };
  const deletedMembership: WorkspaceMembershipDocument = {
    ...activeMembership,
    id: "m:user-1:ws-deleted",
    workspaceId: "ws-deleted"
  };
  const missingMembership: WorkspaceMembershipDocument = {
    ...activeMembership,
    id: "m:user-1:ws-missing",
    workspaceId: "ws-missing"
  };
  const activeWorkspace: WorkspaceDocument = {
    id: "workspace:ws-active",
    docType: "workspace",
    userId: "ws:ws-active",
    workspaceId: "ws-active",
    name: "Active Workspace",
    ownerUserId: "owner-1",
    status: "active",
    createdAt: "2026-03-18T00:00:00.000Z",
    updatedAt: "2026-03-18T00:00:00.000Z"
  };
  const deletedWorkspace: WorkspaceDocument = {
    ...activeWorkspace,
    id: "workspace:ws-deleted",
    workspaceId: "ws-deleted",
    status: "deleted"
  };

  entitlements.items.query.mockImplementation((querySpec: { parameters?: Array<{ name: string; value: string }> }) => {
    const id = querySpec.parameters?.find((parameter) => parameter.name === "@id")?.value;
    if (id === "workspace:ws-active") {
      return { fetchAll: vi.fn().mockResolvedValue({ resources: [activeWorkspace] }) };
    }
    if (id === "workspace:ws-deleted") {
      return { fetchAll: vi.fn().mockResolvedValue({ resources: [deletedWorkspace] }) };
    }
    if (id === "workspace:ws-missing") {
      return { fetchAll: vi.fn().mockResolvedValue({ resources: [] }) };
    }
    return {
      fetchAll: vi.fn().mockResolvedValue({
        resources: [activeMembership, deletedMembership, missingMembership]
      })
    };
  });
  getContainersMock.mockReturnValue({ entitlements });

  const result = await listWorkspacesForUser(createConfig(), "user-1");

  assert.equal(result.length, 1);
  assert.equal(result[0]?.workspace.workspaceId, "ws-active");
  assert.equal(result[0]?.membership.workspaceId, "ws-active");
});

test("deactivateWorkspaceMembership marks active memberships as removed", async () => {
  const entitlements = createEntitlementsContainer();
  const existingMembership: WorkspaceMembershipDocument = {
    id: "m:user-1:ws-1",
    docType: "workspace_membership",
    userId: "user-1",
    workspaceId: "ws-1",
    role: "owner",
    status: "active",
    updatedAt: "2026-03-18T00:00:00.000Z"
  };

  entitlements.item.mockReturnValue({
    read: vi.fn().mockResolvedValue({ resource: existingMembership })
  });
  entitlements.items.upsert.mockImplementation(async (document: WorkspaceMembershipDocument) => ({
    resource: document
  }));
  getContainersMock.mockReturnValue({ entitlements });

  const changed = await deactivateWorkspaceMembership(createConfig(), "user-1", "ws-1");

  assert.equal(changed, true);
  assert.equal(entitlements.items.upsert.mock.calls.length, 1);
  assert.equal(entitlements.items.upsert.mock.calls[0]?.[0]?.status, "removed");
  assert.equal(entitlements.items.upsert.mock.calls[0]?.[0]?.role, "owner");
});

test("createWorkspaceWithOwner maps Cosmos conflicts to a friendly error", async () => {
  const entitlements = createEntitlementsContainer();
  entitlements.items.create.mockRejectedValue({ statusCode: 409 });
  getContainersMock.mockReturnValue({ entitlements });

  await assert.rejects(
    () => createWorkspaceWithOwner(createConfig(), {
      workspaceId: "ws-1",
      name: "Team One",
      ownerUserId: "owner-1"
    }),
    /Workspace already exists\./
  );
});
