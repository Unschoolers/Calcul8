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
  isPreconditionFailedErrorMock,
  withCosmosRetryMock
} = vi.hoisted(() => ({
  getContainersMock: vi.fn(),
  isConflictErrorMock: vi.fn(),
  isNotFoundErrorMock: vi.fn(),
  isPreconditionFailedErrorMock: vi.fn(),
  withCosmosRetryMock: vi.fn(async <T>(operation: () => Promise<T>) => operation())
}));

vi.mock("./core", () => ({
  getContainers: getContainersMock,
  isConflictError: isConflictErrorMock,
  isNotFoundError: isNotFoundErrorMock,
  isPreconditionFailedError: isPreconditionFailedErrorMock,
  withCosmosRetry: withCosmosRetryMock
}));

import {
  auditWorkspaceOwnerMemberships,
  createWorkspaceJoinLink,
  createWorkspaceWithOwner,
  deactivateWorkspaceMembership,
  hasWorkspaceMembership,
  listWorkspaceJoinLinks,
  listWorkspacesForUser,
  markWorkspaceJoinLinkUsed,
  revokeWorkspaceJoinLink,
  repairWorkspaceOwnerMembership,
  softDeleteWorkspace,
  transferWorkspaceOwnership,
  updateWorkspaceMembershipProfileSnapshot,
  upsertWorkspaceMembership
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
    migrationCosmosDatabaseId: "whatfees",
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
  isPreconditionFailedErrorMock.mockImplementation((error: unknown) => {
    const statusCode = (error as { statusCode?: unknown })?.statusCode;
    return statusCode === 412;
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
  const creatingMembership: WorkspaceMembershipDocument = {
    ...activeMembership,
    id: "m:user-1:ws-creating",
    workspaceId: "ws-creating"
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
  const creatingWorkspace: WorkspaceDocument = {
    ...activeWorkspace,
    id: "workspace:ws-creating",
    userId: "ws:ws-creating",
    workspaceId: "ws-creating",
    status: "creating"
  };

  entitlements.items.query.mockReturnValue({
    fetchAll: vi.fn().mockResolvedValue({
      resources: [activeMembership, deletedMembership, missingMembership, creatingMembership]
    })
  });
  entitlements.item.mockImplementation((id: string) => {
    if (id === "workspace:ws-active") {
      return { read: vi.fn().mockResolvedValue({ resource: activeWorkspace }) };
    }
    if (id === "workspace:ws-deleted") {
      return { read: vi.fn().mockResolvedValue({ resource: deletedWorkspace }) };
    }
    if (id === "workspace:ws-missing") {
      return { read: vi.fn().mockRejectedValue({ statusCode: 404 }) };
    }
    if (id === "workspace:ws-creating") {
      return { read: vi.fn().mockResolvedValue({ resource: creatingWorkspace }) };
    }
    return { read: vi.fn().mockResolvedValue({ resource: null }) };
  });
  getContainersMock.mockReturnValue({ entitlements });

  const result = await listWorkspacesForUser(createConfig(), "user-1");

  assert.equal(result.length, 1);
  assert.equal(result[0]?.workspace.workspaceId, "ws-active");
  assert.equal(result[0]?.membership.workspaceId, "ws-active");
  assert.equal(
    entitlements.item.mock.calls.some((call: unknown[]) =>
      call[0] === "workspace:ws-active" && call[1] === "ws:ws-active"
    ),
    true
  );
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
  assert.equal(entitlements.items.upsert.mock.calls[0]?.[0]?.displayName, undefined);
});

test("upsertWorkspaceMembership stores optional profile snapshots and preserves custom updatedAt", async () => {
  const entitlements = createEntitlementsContainer();
  entitlements.items.upsert.mockImplementation(async (document: WorkspaceMembershipDocument) => ({
    resource: document
  }));
  getContainersMock.mockReturnValue({ entitlements });

  const membership = await upsertWorkspaceMembership(createConfig(), {
    userId: "user-1",
    workspaceId: "ws-1",
    role: "member",
    status: "active",
    displayName: "User One",
    photoUrl: "https://example.test/user-1.png",
    updatedAt: "2026-03-18T00:00:00.000Z"
  });

  assert.equal(membership.displayName, "User One");
  assert.equal(membership.photoUrl, "https://example.test/user-1.png");
  assert.equal(membership.updatedAt, "2026-03-18T00:00:00.000Z");
});

test("createWorkspaceWithOwner rejects reuse of a creation key with changed input", async () => {
  const entitlements = createEntitlementsContainer();
  entitlements.items.create.mockRejectedValue({ statusCode: 409 });
  entitlements.item.mockReturnValue({
    read: vi.fn().mockResolvedValue({
      resource: {
        id: "workspace:ws-1",
        docType: "workspace",
        userId: "ws:ws-1",
        workspaceId: "ws-1",
        name: "Original Team",
        ownerUserId: "owner-1",
        status: "creation_failed",
        creationKeyHash: "key-hash",
        creationFingerprint: "original-fingerprint",
        creationAttemptCount: 1,
        createdAt: "2026-03-18T00:00:00.000Z",
        updatedAt: "2026-03-18T00:00:00.000Z"
      }
    })
  });
  getContainersMock.mockReturnValue({ entitlements });

  await assert.rejects(
    () => createWorkspaceWithOwner(createConfig(), {
      workspaceId: "ws-1",
      name: "Team One",
      ownerUserId: "owner-1",
      creationKeyHash: "key-hash",
      creationFingerprint: "changed-fingerprint"
    }),
    /idempotency key.*different request/i
  );
});

test("createWorkspaceWithOwner activates only after the owner membership is durable", async () => {
  const entitlements = createEntitlementsContainer();
  const replaceWorkspace = vi.fn(async (document: WorkspaceDocument) => ({
    resource: { ...document, _etag: "active-etag" }
  }));
  entitlements.items.create.mockImplementation(async (document: WorkspaceDocument) => ({
    resource: { ...document, _etag: "creating-etag" }
  }));
  entitlements.items.upsert.mockImplementation(async (document: WorkspaceMembershipDocument) => ({
    resource: document
  }));
  entitlements.item.mockReturnValue({ replace: replaceWorkspace });
  getContainersMock.mockReturnValue({ entitlements });

  const result = await createWorkspaceWithOwner(createConfig(), {
    workspaceId: "ws-ready",
    name: "Ready Team",
    ownerUserId: "owner-1",
    creationKeyHash: "key-hash",
    creationFingerprint: "fingerprint"
  });

  assert.equal(entitlements.items.create.mock.calls[0]?.[0]?.status, "creating");
  assert.equal(entitlements.items.upsert.mock.calls[0]?.[0]?.role, "owner");
  assert.equal(replaceWorkspace.mock.calls[0]?.[0]?.status, "active");
  assert.equal(result.workspace.status, "active");
  assert.equal(result.workspace.creationAttemptCount, 1);
  assert.equal(
    entitlements.items.upsert.mock.invocationCallOrder[0] < replaceWorkspace.mock.invocationCallOrder[0],
    true
  );
});

test("createWorkspaceWithOwner records a recoverable failure instead of deleting the workspace", async () => {
  const entitlements = createEntitlementsContainer();
  const replaceWorkspace = vi.fn(async (document: WorkspaceDocument) => ({ resource: document }));
  entitlements.items.create.mockImplementation(async (document: WorkspaceDocument) => ({
    resource: { ...document, _etag: "creating-etag" }
  }));
  entitlements.items.upsert.mockRejectedValue(new Error("membership unavailable"));
  entitlements.item.mockReturnValue({ replace: replaceWorkspace });
  getContainersMock.mockReturnValue({ entitlements });

  await assert.rejects(
    () => createWorkspaceWithOwner(createConfig(), {
      workspaceId: "ws-orphan",
      name: "Orphan Risk",
      ownerUserId: "owner-1",
      creationKeyHash: "key-hash",
      creationFingerprint: "fingerprint"
    }),
    /membership unavailable/
  );

  assert.equal(replaceWorkspace.mock.calls.length, 1);
  assert.equal(replaceWorkspace.mock.calls[0]?.[0]?.status, "creation_failed");
  assert.equal(replaceWorkspace.mock.calls[0]?.[0]?.creationErrorCode, "owner_membership_failed");
});

test("createWorkspaceWithOwner repairs a failed creation on retry", async () => {
  const entitlements = createEntitlementsContainer();
  const failedWorkspace: WorkspaceDocument = {
    id: "workspace:ws-retry",
    docType: "workspace",
    userId: "ws:ws-retry",
    workspaceId: "ws-retry",
    name: "Retry Team",
    ownerUserId: "owner-1",
    status: "creation_failed",
    creationKeyHash: "key-hash",
    creationFingerprint: "fingerprint",
    creationAttemptCount: 1,
    createdAt: "2026-03-18T00:00:00.000Z",
    updatedAt: "2026-03-18T00:00:00.000Z",
    _etag: "failed-etag"
  } as WorkspaceDocument;
  const readWorkspace = vi.fn().mockResolvedValue({ resource: failedWorkspace });
  const replaceWorkspace = vi.fn(async (document: WorkspaceDocument) => ({
    resource: { ...document, _etag: `etag-${document.status}` }
  }));
  entitlements.items.create.mockRejectedValue({ statusCode: 409 });
  entitlements.items.upsert.mockImplementation(async (document: WorkspaceMembershipDocument) => ({ resource: document }));
  entitlements.item.mockReturnValue({ read: readWorkspace, replace: replaceWorkspace });
  getContainersMock.mockReturnValue({ entitlements });

  const result = await createWorkspaceWithOwner(createConfig(), {
    workspaceId: "ws-retry",
    name: "Retry Team",
    ownerUserId: "owner-1",
    creationKeyHash: "key-hash",
    creationFingerprint: "fingerprint"
  });

  assert.equal(result.workspace.status, "active");
  assert.equal(result.workspace.creationAttemptCount, 2);
  assert.equal(entitlements.items.upsert.mock.calls.length, 1);
});

test("createWorkspaceWithOwner returns the winner when activation contention completes the same request", async () => {
  const entitlements = createEntitlementsContainer();
  const activeWorkspace: WorkspaceDocument = {
    id: "workspace:ws-race",
    docType: "workspace",
    userId: "ws:ws-race",
    workspaceId: "ws-race",
    name: "Race Team",
    ownerUserId: "owner-1",
    status: "active",
    creationKeyHash: "key-hash",
    creationFingerprint: "fingerprint",
    creationAttemptCount: 1,
    createdAt: "2026-03-18T00:00:00.000Z",
    updatedAt: "2026-03-18T00:01:00.000Z",
    _etag: "active-etag"
  } as WorkspaceDocument;
  entitlements.items.create.mockImplementation(async (document: WorkspaceDocument) => ({
    resource: { ...document, _etag: "creating-etag" }
  }));
  entitlements.items.upsert.mockImplementation(async (document: WorkspaceMembershipDocument) => ({ resource: document }));
  entitlements.item.mockReturnValue({
    replace: vi.fn().mockRejectedValue({ statusCode: 412 }),
    read: vi.fn().mockResolvedValue({ resource: activeWorkspace })
  });
  getContainersMock.mockReturnValue({ entitlements });

  const result = await createWorkspaceWithOwner(createConfig(), {
    workspaceId: "ws-race",
    name: "Race Team",
    ownerUserId: "owner-1",
    creationKeyHash: "key-hash",
    creationFingerprint: "fingerprint"
  });

  assert.equal(result.workspace.status, "active");
  assert.equal(result.workspace.workspaceId, "ws-race");
  assert.equal(entitlements.items.upsert.mock.calls.length, 2);
});

test("workspace owner audit is bounded and repair verifies the current owner", async () => {
  const entitlements = createEntitlementsContainer();
  const workspace: WorkspaceDocument = {
    id: "workspace:ws-audit",
    docType: "workspace",
    userId: "ws:ws-audit",
    workspaceId: "ws-audit",
    name: "Audit Team",
    ownerUserId: "owner-1",
    status: "active",
    createdAt: "2026-03-18T00:00:00.000Z",
    updatedAt: "2026-03-18T00:00:00.000Z"
  };
  (workspace as WorkspaceDocument & { _etag: string })._etag = "audit-etag";
  entitlements.item.mockImplementation((id: string) => ({
    read: vi.fn().mockResolvedValue({
      resource: id === "workspace:ws-audit" ? workspace : null
    }),
    replace: vi.fn(async (document: WorkspaceDocument) => ({ resource: document }))
  }));
  entitlements.items.upsert.mockImplementation(async (document: WorkspaceMembershipDocument) => ({ resource: document }));
  getContainersMock.mockReturnValue({ entitlements });

  const findings = await auditWorkspaceOwnerMemberships(createConfig(), ["ws-audit", "ws-audit"]);
  assert.deepEqual(findings, [{ workspaceId: "ws-audit", ownerUserId: "owner-1", reason: "missing" }]);

  const repaired = await repairWorkspaceOwnerMembership(createConfig(), "ws-audit", "owner-1");
  assert.equal(repaired.role, "owner");
  assert.equal(repaired.status, "active");
  await assert.rejects(
    () => repairWorkspaceOwnerMembership(createConfig(), "ws-audit", "owner-2"),
    /owner changed/i
  );
  await assert.rejects(
    () => auditWorkspaceOwnerMemberships(createConfig(), Array.from({ length: 101 }, (_, index) => `ws-${index}`)),
    /limited to 100/i
  );
});

test("workspace owner repair restores an existing member exactly when ownership changes concurrently", async () => {
  const entitlements = createEntitlementsContainer();
  const initialWorkspace = {
    id: "workspace:ws-race-repair",
    docType: "workspace" as const,
    userId: "ws:ws-race-repair",
    workspaceId: "ws-race-repair",
    name: "Repair Race",
    ownerUserId: "owner-1",
    status: "active" as const,
    createdAt: "2026-03-18T00:00:00.000Z",
    updatedAt: "2026-03-18T00:00:00.000Z",
    _etag: "workspace-etag-1"
  };
  const transferredWorkspace = {
    ...initialWorkspace,
    ownerUserId: "owner-2",
    _etag: "workspace-etag-2"
  };
  const priorMembership = {
    id: "m:owner-1:ws-race-repair",
    docType: "workspace_membership" as const,
    userId: "owner-1",
    workspaceId: "ws-race-repair",
    role: "member" as const,
    status: "active" as const,
    displayName: "Owner One",
    photoUrl: "https://example.test/owner-1.png",
    updatedAt: "2026-03-18T00:00:00.000Z",
    _etag: "membership-etag-1"
  };
  const workspaceRead = vi.fn()
    .mockResolvedValueOnce({ resource: initialWorkspace })
    .mockResolvedValueOnce({ resource: transferredWorkspace });
  const membershipReplace = vi.fn(async (document: WorkspaceMembershipDocument) => ({
    resource: { ...document, _etag: `membership-etag-${membershipReplace.mock.calls.length + 1}` }
  }));
  entitlements.item.mockImplementation((id: string) => {
    if (id === initialWorkspace.id) {
      return {
        read: workspaceRead,
        replace: vi.fn(async (document: WorkspaceDocument) => ({ resource: document }))
      };
    }
    return {
      read: vi.fn().mockResolvedValue({ resource: priorMembership }),
      replace: membershipReplace
    };
  });
  getContainersMock.mockReturnValue({ entitlements });

  await assert.rejects(
    () => repairWorkspaceOwnerMembership(createConfig(), "ws-race-repair", "owner-1"),
    /owner changed during/i
  );

  assert.equal(membershipReplace.mock.calls[0]?.[0]?.role, "owner");
  assert.equal(membershipReplace.mock.calls[0]?.[0]?.displayName, "Owner One");
  assert.equal(membershipReplace.mock.calls[1]?.[0]?.role, "member");
  assert.equal(membershipReplace.mock.calls[1]?.[0]?.status, "active");
  assert.equal(membershipReplace.mock.calls[1]?.[0]?.photoUrl, "https://example.test/owner-1.png");
});

test("hasWorkspaceMembership returns false for deleted workspaces and removed memberships", async () => {
  const entitlements = createEntitlementsContainer();
  const activeWorkspace: WorkspaceDocument = {
    id: "workspace:ws-1",
    docType: "workspace",
    userId: "ws:ws-1",
    workspaceId: "ws-1",
    name: "Workspace One",
    ownerUserId: "owner-1",
    status: "active",
    createdAt: "2026-03-18T00:00:00.000Z",
    updatedAt: "2026-03-18T00:00:00.000Z"
  };
  const deletedWorkspace: WorkspaceDocument = {
    ...activeWorkspace,
    status: "deleted"
  };
  const removedMembership: WorkspaceMembershipDocument = {
    id: "m:user-1:ws-1",
    docType: "workspace_membership",
    userId: "user-1",
    workspaceId: "ws-1",
    role: "member",
    status: "removed",
    updatedAt: "2026-03-18T00:00:00.000Z"
  };

  entitlements.item
    .mockImplementationOnce(() => ({
      read: vi.fn().mockResolvedValue({ resource: deletedWorkspace })
    }))
    .mockImplementationOnce(() => ({
      read: vi.fn().mockResolvedValue({ resource: removedMembership })
    }))
    .mockImplementationOnce(() => ({
      read: vi.fn().mockResolvedValue({ resource: activeWorkspace })
    }))
    .mockImplementationOnce(() => ({
      read: vi.fn().mockResolvedValue({ resource: removedMembership })
    }));
  getContainersMock.mockReturnValue({ entitlements });

  const deletedResult = await hasWorkspaceMembership(createConfig(), "user-1", "ws-1");
  const removedResult = await hasWorkspaceMembership(createConfig(), "user-1", "ws-1");

  assert.equal(deletedResult, false);
  assert.equal(removedResult, false);
});

test("hasWorkspaceMembership short-circuits before reading workspace when membership is missing", async () => {
  const entitlements = createEntitlementsContainer();
  entitlements.item.mockImplementation((id: string) => {
    if (id === "m:user-1:ws-1") {
      return {
        read: vi.fn().mockRejectedValue({ statusCode: 404 })
      };
    }

    return {
      read: vi.fn(() => {
        throw new Error("workspace should not be read when membership is missing");
      })
    };
  });
  getContainersMock.mockReturnValue({ entitlements });

  const result = await hasWorkspaceMembership(createConfig(), "user-1", "ws-1");

  assert.equal(result, false);
  assert.equal(entitlements.item.mock.calls.length, 1);
  assert.deepEqual(entitlements.item.mock.calls[0], ["m:user-1:ws-1", "user-1"]);
});

test("transferWorkspaceOwnership updates an active workspace owner", async () => {
  const entitlements = createEntitlementsContainer();
  const existingWorkspace: WorkspaceDocument = {
    id: "workspace:ws-1",
    docType: "workspace",
    userId: "ws:ws-1",
    workspaceId: "ws-1",
    name: "Workspace One",
    ownerUserId: "owner-1",
    status: "active",
    createdAt: "2026-03-18T00:00:00.000Z",
    updatedAt: "2026-03-18T00:00:00.000Z"
  };

  entitlements.item.mockReturnValue({
    read: vi.fn().mockResolvedValue({ resource: existingWorkspace })
  });
  entitlements.items.upsert.mockImplementation(async (document: WorkspaceDocument) => ({
    resource: document
  }));
  getContainersMock.mockReturnValue({ entitlements });

  const result = await transferWorkspaceOwnership(createConfig(), "ws-1", "owner-2");

  assert.equal(result?.ownerUserId, "owner-2");
  assert.equal(entitlements.items.upsert.mock.calls.length, 1);
  assert.equal(entitlements.items.upsert.mock.calls[0]?.[0]?.status, "active");
});

test("transferWorkspaceOwnership uses etag replacement and rejects stale owners", async () => {
  const entitlements = createEntitlementsContainer();
  const existingWorkspace = {
    id: "workspace:ws-1",
    docType: "workspace" as const,
    userId: "ws:ws-1",
    workspaceId: "ws-1",
    name: "Workspace One",
    ownerUserId: "owner-1",
    status: "active" as const,
    createdAt: "2026-03-18T00:00:00.000Z",
    updatedAt: "2026-03-18T00:00:00.000Z",
    _etag: "etag-1"
  };
  const replace = vi.fn(async (document: WorkspaceDocument, _options?: unknown) => ({
    resource: document
  }));

  entitlements.item.mockReturnValue({
    read: vi.fn().mockResolvedValue({ resource: existingWorkspace }),
    replace
  });
  getContainersMock.mockReturnValue({ entitlements });

  const staleResult = await transferWorkspaceOwnership(createConfig(), "ws-1", "owner-2", "other-owner");
  assert.equal(staleResult, null);
  assert.equal(replace.mock.calls.length, 0);

  const result = await transferWorkspaceOwnership(createConfig(), "ws-1", "owner-2", "owner-1");

  assert.equal(result?.ownerUserId, "owner-2");
  assert.equal(replace.mock.calls.length, 1);
  assert.deepEqual(replace.mock.calls[0]?.[1], {
    accessCondition: {
      type: "IfMatch",
      condition: "etag-1"
    }
  });
  assert.equal(entitlements.items.upsert.mock.calls.length, 0);
});

test("softDeleteWorkspace returns the existing document without writing when already deleted", async () => {
  const entitlements = createEntitlementsContainer();
  const deletedWorkspace: WorkspaceDocument = {
    id: "workspace:ws-1",
    docType: "workspace",
    userId: "ws:ws-1",
    workspaceId: "ws-1",
    name: "Workspace One",
    ownerUserId: "owner-1",
    status: "deleted",
    createdAt: "2026-03-18T00:00:00.000Z",
    updatedAt: "2026-03-18T00:00:00.000Z"
  };

  entitlements.item.mockReturnValue({
    read: vi.fn().mockResolvedValue({ resource: deletedWorkspace })
  });
  getContainersMock.mockReturnValue({ entitlements });

  const result = await softDeleteWorkspace(createConfig(), "ws-1");

  assert.equal(result, deletedWorkspace);
  assert.equal(entitlements.items.upsert.mock.calls.length, 0);
});

test("softDeleteWorkspace uses etag replacement and rejects stale owners", async () => {
  const entitlements = createEntitlementsContainer();
  const existingWorkspace = {
    id: "workspace:ws-1",
    docType: "workspace" as const,
    userId: "ws:ws-1",
    workspaceId: "ws-1",
    name: "Workspace One",
    ownerUserId: "owner-1",
    status: "active" as const,
    createdAt: "2026-03-18T00:00:00.000Z",
    updatedAt: "2026-03-18T00:00:00.000Z",
    _etag: "etag-delete"
  };
  const replace = vi.fn(async (document: WorkspaceDocument, _options?: unknown) => ({
    resource: document
  }));

  entitlements.item.mockReturnValue({
    read: vi.fn().mockResolvedValue({ resource: existingWorkspace }),
    replace
  });
  getContainersMock.mockReturnValue({ entitlements });

  const staleResult = await softDeleteWorkspace(createConfig(), "ws-1", "other-owner");
  assert.equal(staleResult, null);
  assert.equal(replace.mock.calls.length, 0);

  const result = await softDeleteWorkspace(createConfig(), "ws-1", "owner-1");

  assert.equal(result?.status, "deleted");
  assert.equal(replace.mock.calls.length, 1);
  assert.deepEqual(replace.mock.calls[0]?.[1], {
    accessCondition: {
      type: "IfMatch",
      condition: "etag-delete"
    }
  });
  assert.equal(entitlements.items.upsert.mock.calls.length, 0);
});

test("deactivateWorkspaceMembership treats etag precondition failures as conflicts", async () => {
  const entitlements = createEntitlementsContainer();
  const existingMembership = {
    id: "m:user-1:ws-1",
    docType: "workspace_membership" as const,
    userId: "user-1",
    workspaceId: "ws-1",
    role: "member" as const,
    status: "active" as const,
    updatedAt: "2026-03-18T00:00:00.000Z",
    _etag: "member-etag"
  };
  const replace = vi.fn().mockRejectedValue({ statusCode: 412 });

  entitlements.item.mockReturnValue({
    read: vi.fn().mockResolvedValue({ resource: existingMembership }),
    replace
  });
  getContainersMock.mockReturnValue({ entitlements });

  const result = await deactivateWorkspaceMembership(createConfig(), "user-1", "ws-1");

  assert.equal(result, false);
  assert.equal(replace.mock.calls.length, 1);
  assert.equal(entitlements.items.upsert.mock.calls.length, 0);
});

test("updateWorkspaceMembershipProfileSnapshot uses etag replacement and skips stale rows", async () => {
  const entitlements = createEntitlementsContainer();
  const existingMembership = {
    id: "m:user-1:ws-1",
    docType: "workspace_membership" as const,
    userId: "user-1",
    workspaceId: "ws-1",
    role: "member" as const,
    status: "active" as const,
    updatedAt: "2026-03-18T00:00:00.000Z",
    _etag: "snapshot-etag"
  };
  const replace = vi.fn()
    .mockRejectedValueOnce({ statusCode: 412 })
    .mockImplementationOnce(async (document: WorkspaceMembershipDocument) => ({
      resource: document
    }));

  entitlements.item.mockReturnValue({
    replace
  });
  getContainersMock.mockReturnValue({ entitlements });

  const staleResult = await updateWorkspaceMembershipProfileSnapshot(createConfig(), existingMembership, {
    displayName: "User One",
    photoUrl: "https://example.test/u1.png"
  });
  const result = await updateWorkspaceMembershipProfileSnapshot(createConfig(), existingMembership, {
    displayName: "User One",
    photoUrl: "https://example.test/u1.png"
  });

  assert.equal(staleResult, null);
  assert.equal(result?.displayName, "User One");
  assert.equal(result?.photoUrl, "https://example.test/u1.png");
  assert.equal(replace.mock.calls.length, 2);
  assert.equal(entitlements.items.upsert.mock.calls.length, 0);
});

test("workspace join links can be created, listed, revoked, and marked used", async () => {
  const entitlements = createEntitlementsContainer();
  const activeJoinLink = {
    id: "join_link:invite-1",
    docType: "workspace_join_link" as const,
    userId: "ws:ws-1",
    inviteId: "invite-1",
    workspaceId: "ws-1",
    createdByUserId: "owner-1",
    role: "member" as const,
    status: "active" as const,
    tokenHash: "hash-1",
    expiresAt: "2026-03-20T00:00:00.000Z",
    updatedAt: "2026-03-18T00:00:00.000Z"
  };

  entitlements.items.create.mockImplementation(async (document) => ({
    resource: document
  }));
  entitlements.items.upsert.mockImplementation(async (document) => ({
    resource: document
  }));
  entitlements.items.query
    .mockImplementationOnce(() => ({
      fetchAll: vi.fn().mockResolvedValue({ resources: [activeJoinLink] })
    }))
    .mockImplementationOnce(() => ({
      fetchAll: vi.fn().mockResolvedValue({ resources: [activeJoinLink] })
    }))
    .mockImplementationOnce(() => ({
      fetchAll: vi.fn().mockResolvedValue({ resources: [activeJoinLink] })
    }))
    .mockImplementationOnce(() => ({
      fetchAll: vi.fn().mockResolvedValue({ resources: [activeJoinLink] })
    }));
  getContainersMock.mockReturnValue({ entitlements });

  const created = await createWorkspaceJoinLink(createConfig(), {
    inviteId: "invite-1",
    workspaceId: "ws-1",
    createdByUserId: "owner-1",
    tokenHash: "hash-1",
    expiresAt: "2026-03-20T00:00:00.000Z"
  });
  const listed = await listWorkspaceJoinLinks(createConfig(), "ws-1");
  const revoked = await revokeWorkspaceJoinLink(createConfig(), "invite-1");
  const used = await markWorkspaceJoinLinkUsed(createConfig(), "invite-1", "user-2");

  assert.equal(created.inviteId, "invite-1");
  assert.equal(listed.length, 1);
  assert.equal(revoked?.status, "revoked");
  assert.equal(used?.status, "used");
  assert.equal(used?.usedByUserId, "user-2");
});

test("join link lifecycle writes use etag replacement and report stale consume races", async () => {
  const entitlements = createEntitlementsContainer();
  const activeJoinLink = {
    id: "join_link:invite-1",
    docType: "workspace_join_link" as const,
    userId: "ws:ws-1",
    inviteId: "invite-1",
    workspaceId: "ws-1",
    createdByUserId: "owner-1",
    role: "member" as const,
    status: "active" as const,
    tokenHash: "hash-1",
    expiresAt: "2026-03-20T00:00:00.000Z",
    updatedAt: "2026-03-18T00:00:00.000Z",
    _etag: "link-etag"
  };
  const replace = vi.fn()
    .mockImplementationOnce(async (document) => ({ resource: document }))
    .mockRejectedValueOnce({ statusCode: 412 });

  entitlements.items.query.mockReturnValue({
    fetchAll: vi.fn().mockResolvedValue({ resources: [activeJoinLink] })
  });
  entitlements.item.mockReturnValue({
    replace
  });
  getContainersMock.mockReturnValue({ entitlements });

  const revoked = await revokeWorkspaceJoinLink(createConfig(), "invite-1");
  const used = await markWorkspaceJoinLinkUsed(createConfig(), "invite-1", "user-2");

  assert.equal(revoked?.status, "revoked");
  assert.equal(used, null);
  assert.equal(replace.mock.calls.length, 2);
  assert.equal(entitlements.items.upsert.mock.calls.length, 0);
});

test("markWorkspaceJoinLinkUsed returns null without rewriting an inactive link", async () => {
  const entitlements = createEntitlementsContainer();
  const usedJoinLink = {
    id: "join_link:invite-1",
    docType: "workspace_join_link" as const,
    userId: "ws:ws-1",
    inviteId: "invite-1",
    workspaceId: "ws-1",
    createdByUserId: "owner-1",
    role: "member" as const,
    status: "used" as const,
    tokenHash: "hash-1",
    expiresAt: "2026-03-20T00:00:00.000Z",
    usedByUserId: "user-2",
    usedAt: "2026-03-18T00:00:00.000Z",
    updatedAt: "2026-03-18T00:00:00.000Z"
  };

  entitlements.items.query.mockReturnValue({
    fetchAll: vi.fn().mockResolvedValue({ resources: [usedJoinLink] })
  });
  getContainersMock.mockReturnValue({ entitlements });

  const result = await markWorkspaceJoinLinkUsed(createConfig(), "invite-1", "user-3");

  assert.equal(result, null);
  assert.equal(entitlements.items.upsert.mock.calls.length, 0);
});
