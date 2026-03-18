import type {
  ApiConfig,
  WorkspaceDocument,
  WorkspaceJoinLinkDocument,
  WorkspaceMembershipDocument,
  WorkspaceMembershipStatus,
  WorkspaceRole
} from "../../types";
import { getContainers, isConflictError, isNotFoundError, withCosmosRetry } from "./core";
import {
  workspaceDocumentId,
  workspaceDocumentPartitionKey,
  workspaceJoinLinkId,
  workspaceMembershipId
} from "./ids";

export interface CreateWorkspaceWithOwnerInput {
  workspaceId: string;
  name: string;
  ownerUserId: string;
}

export interface CreateWorkspaceWithOwnerResult {
  workspace: WorkspaceDocument;
  ownerMembership: WorkspaceMembershipDocument;
}

interface UpsertWorkspaceMembershipInput {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  status?: WorkspaceMembershipStatus;
  displayName?: string;
  photoUrl?: string;
  updatedAt?: string;
}

export interface CreateWorkspaceJoinLinkInput {
  inviteId: string;
  workspaceId: string;
  createdByUserId: string;
  tokenHash: string;
  expiresAt: string;
}

function isWorkspaceDeleted(workspace: WorkspaceDocument | null | undefined): boolean {
  return workspace?.status === "deleted";
}

function isActiveWorkspaceMembershipStatus(status: WorkspaceMembershipStatus | undefined): boolean {
  return status !== "disabled" && status !== "removed";
}

export async function getWorkspaceById(
  config: ApiConfig,
  workspaceId: string
): Promise<WorkspaceDocument | null> {
  const { entitlements } = getContainers(config);
  const id = workspaceDocumentId(workspaceId);
  const querySpec = {
    query: "SELECT TOP 1 * FROM c WHERE c.id = @id AND c.docType = @docType",
    parameters: [
      { name: "@id", value: id },
      { name: "@docType", value: "workspace" }
    ]
  };

  const iterator = entitlements.items.query<WorkspaceDocument>(querySpec, {
    maxItemCount: 1
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return resources?.[0] ?? null;
}

export async function upsertWorkspaceDocument(
  config: ApiConfig,
  workspace: WorkspaceDocument
): Promise<WorkspaceDocument> {
  const { entitlements } = getContainers(config);
  const document: WorkspaceDocument = {
    ...workspace,
    userId: String(workspace.userId || "").trim() || workspaceDocumentPartitionKey(workspace.workspaceId),
    status: workspace.status ?? "active",
    updatedAt: new Date().toISOString()
  };

  const { resource } = await withCosmosRetry(() =>
    entitlements.items.upsert<WorkspaceDocument>(document)
  );

  if (!resource) {
    throw new Error("Failed to upsert workspace.");
  }

  return resource;
}

export async function getWorkspaceMembership(
  config: ApiConfig,
  userId: string,
  workspaceId: string
): Promise<WorkspaceMembershipDocument | null> {
  const { entitlements } = getContainers(config);
  const id = workspaceMembershipId(userId, workspaceId);

  try {
    const { resource } = await withCosmosRetry(() =>
      entitlements.item(id, userId).read<WorkspaceMembershipDocument>()
    );
    if (!resource) return null;
    if (resource.docType !== "workspace_membership") return null;
    if (resource.userId !== userId || resource.workspaceId !== workspaceId) return null;
    return resource;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export async function listWorkspaceMemberships(
  config: ApiConfig,
  workspaceId: string
): Promise<WorkspaceMembershipDocument[]> {
  const { entitlements } = getContainers(config);
  const querySpec = {
    query: "SELECT * FROM c WHERE c.docType = @docType AND c.workspaceId = @workspaceId AND (NOT IS_DEFINED(c.status) OR c.status = @activeStatus)",
    parameters: [
      { name: "@docType", value: "workspace_membership" },
      { name: "@workspaceId", value: workspaceId },
      { name: "@activeStatus", value: "active" }
    ]
  };

  const iterator = entitlements.items.query<WorkspaceMembershipDocument>(querySpec);
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return resources ?? [];
}

export async function listWorkspaceMembershipsForUser(
  config: ApiConfig,
  userId: string
): Promise<WorkspaceMembershipDocument[]> {
  const { entitlements } = getContainers(config);
  const querySpec = {
    query: "SELECT * FROM c WHERE c.docType = @docType AND c.userId = @userId AND (NOT IS_DEFINED(c.status) OR c.status = @activeStatus)",
    parameters: [
      { name: "@docType", value: "workspace_membership" },
      { name: "@userId", value: userId },
      { name: "@activeStatus", value: "active" }
    ]
  };

  const iterator = entitlements.items.query<WorkspaceMembershipDocument>(querySpec, {
    partitionKey: userId
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return resources ?? [];
}

export async function listWorkspacesForUser(
  config: ApiConfig,
  userId: string
): Promise<Array<{ workspace: WorkspaceDocument; membership: WorkspaceMembershipDocument }>> {
  const memberships = await listWorkspaceMembershipsForUser(config, userId);
  const workspaces = await Promise.all(memberships.map(async (membership) => ({
    membership,
    workspace: await getWorkspaceById(config, membership.workspaceId)
  })));

  return workspaces
    .filter((entry): entry is { workspace: WorkspaceDocument; membership: WorkspaceMembershipDocument } =>
      !!entry.workspace && !isWorkspaceDeleted(entry.workspace)
    );
}

export async function upsertWorkspaceMembership(
  config: ApiConfig,
  input: UpsertWorkspaceMembershipInput
): Promise<WorkspaceMembershipDocument> {
  const { entitlements } = getContainers(config);
  const document: WorkspaceMembershipDocument = {
    id: workspaceMembershipId(input.userId, input.workspaceId),
    docType: "workspace_membership",
    userId: input.userId,
    workspaceId: input.workspaceId,
    role: input.role,
    status: input.status ?? "active",
    displayName: String(input.displayName || "").trim() || undefined,
    photoUrl: String(input.photoUrl || "").trim() || undefined,
    updatedAt: input.updatedAt || new Date().toISOString()
  };

  const { resource } = await withCosmosRetry(() =>
    entitlements.items.upsert<WorkspaceMembershipDocument>(document)
  );

  if (!resource) {
    throw new Error("Failed to upsert workspace membership.");
  }

  return resource;
}

export async function createWorkspaceWithOwner(
  config: ApiConfig,
  input: CreateWorkspaceWithOwnerInput
): Promise<CreateWorkspaceWithOwnerResult> {
  const { entitlements } = getContainers(config);
  const now = new Date().toISOString();
  const workspace: WorkspaceDocument = {
    id: workspaceDocumentId(input.workspaceId),
    docType: "workspace",
    userId: workspaceDocumentPartitionKey(input.workspaceId),
    workspaceId: input.workspaceId,
    name: input.name,
    ownerUserId: input.ownerUserId,
    status: "active",
    createdAt: now,
    updatedAt: now
  };

  try {
    const { resource } = await withCosmosRetry(() =>
      entitlements.items.create<WorkspaceDocument>(workspace)
    );
    if (!resource) {
      throw new Error("Failed to create workspace.");
    }

    const ownerMembership = await upsertWorkspaceMembership(config, {
      userId: input.ownerUserId,
      workspaceId: input.workspaceId,
      role: "owner",
      status: "active"
    });

    return {
      workspace: resource,
      ownerMembership
    };
  } catch (error) {
    if (isConflictError(error)) {
      throw new Error("Workspace already exists.");
    }
    throw error;
  }
}

export async function deactivateWorkspaceMembership(
  config: ApiConfig,
  userId: string,
  workspaceId: string
): Promise<boolean> {
  const existing = await getWorkspaceMembership(config, userId, workspaceId);
  if (!existing) return false;
  if (existing.status === "disabled" || existing.status === "removed") {
    return false;
  }

  await upsertWorkspaceMembership(config, {
    userId,
    workspaceId,
    role: existing.role ?? "member",
    status: "removed",
    displayName: existing.displayName,
    photoUrl: existing.photoUrl
  });
  return true;
}

export async function hasWorkspaceMembership(
  config: ApiConfig,
  userId: string,
  workspaceId: string
): Promise<boolean> {
  const workspace = await getWorkspaceById(config, workspaceId);
  if (!workspace || isWorkspaceDeleted(workspace)) return false;
  const membership = await getWorkspaceMembership(config, userId, workspaceId);
  if (!membership) return false;
  if (!isActiveWorkspaceMembershipStatus(membership.status)) return false;
  return true;
}

export async function transferWorkspaceOwnership(
  config: ApiConfig,
  workspaceId: string,
  newOwnerUserId: string
): Promise<WorkspaceDocument | null> {
  const existing = await getWorkspaceById(config, workspaceId);
  if (!existing || isWorkspaceDeleted(existing)) return null;

  return upsertWorkspaceDocument(config, {
    ...existing,
    ownerUserId: newOwnerUserId,
    status: existing.status ?? "active"
  });
}

export async function softDeleteWorkspace(
  config: ApiConfig,
  workspaceId: string
): Promise<WorkspaceDocument | null> {
  const existing = await getWorkspaceById(config, workspaceId);
  if (!existing) return null;
  if (isWorkspaceDeleted(existing)) return existing;

  return upsertWorkspaceDocument(config, {
    ...existing,
    status: "deleted"
  });
}

export async function createWorkspaceJoinLink(
  config: ApiConfig,
  input: CreateWorkspaceJoinLinkInput
): Promise<WorkspaceJoinLinkDocument> {
  const { entitlements } = getContainers(config);
  const now = new Date().toISOString();
  const document: WorkspaceJoinLinkDocument = {
    id: workspaceJoinLinkId(input.inviteId),
    docType: "workspace_join_link",
    userId: workspaceDocumentPartitionKey(input.workspaceId),
    inviteId: input.inviteId,
    workspaceId: input.workspaceId,
    createdByUserId: input.createdByUserId,
    role: "member",
    status: "active",
    tokenHash: input.tokenHash,
    expiresAt: input.expiresAt,
    updatedAt: now
  };

  const { resource } = await withCosmosRetry(() =>
    entitlements.items.create<WorkspaceJoinLinkDocument>(document)
  );

  if (!resource) {
    throw new Error("Failed to create workspace join link.");
  }

  return resource;
}

export async function getWorkspaceJoinLinkByInviteId(
  config: ApiConfig,
  inviteId: string
): Promise<WorkspaceJoinLinkDocument | null> {
  const { entitlements } = getContainers(config);
  const querySpec = {
    query: "SELECT TOP 1 * FROM c WHERE c.id = @id AND c.docType = @docType",
    parameters: [
      { name: "@id", value: workspaceJoinLinkId(inviteId) },
      { name: "@docType", value: "workspace_join_link" }
    ]
  };

  const iterator = entitlements.items.query<WorkspaceJoinLinkDocument>(querySpec, {
    maxItemCount: 1
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return resources?.[0] ?? null;
}

export async function getWorkspaceJoinLinkByTokenHash(
  config: ApiConfig,
  tokenHash: string
): Promise<WorkspaceJoinLinkDocument | null> {
  const { entitlements } = getContainers(config);
  const querySpec = {
    query: "SELECT TOP 1 * FROM c WHERE c.docType = @docType AND c.tokenHash = @tokenHash",
    parameters: [
      { name: "@docType", value: "workspace_join_link" },
      { name: "@tokenHash", value: tokenHash }
    ]
  };

  const iterator = entitlements.items.query<WorkspaceJoinLinkDocument>(querySpec, {
    maxItemCount: 1
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return resources?.[0] ?? null;
}

export async function listWorkspaceJoinLinks(
  config: ApiConfig,
  workspaceId: string
): Promise<WorkspaceJoinLinkDocument[]> {
  const { entitlements } = getContainers(config);
  const querySpec = {
    query: "SELECT * FROM c WHERE c.docType = @docType AND c.workspaceId = @workspaceId ORDER BY c.updatedAt DESC",
    parameters: [
      { name: "@docType", value: "workspace_join_link" },
      { name: "@workspaceId", value: workspaceId }
    ]
  };

  const iterator = entitlements.items.query<WorkspaceJoinLinkDocument>(querySpec);
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return resources ?? [];
}

export async function revokeWorkspaceJoinLink(
  config: ApiConfig,
  inviteId: string
): Promise<WorkspaceJoinLinkDocument | null> {
  const existing = await getWorkspaceJoinLinkByInviteId(config, inviteId);
  if (!existing) return null;
  if (existing.status === "revoked") return existing;

  const { entitlements } = getContainers(config);
  const updated: WorkspaceJoinLinkDocument = {
    ...existing,
    status: "revoked",
    updatedAt: new Date().toISOString()
  };

  const { resource } = await withCosmosRetry(() =>
    entitlements.items.upsert<WorkspaceJoinLinkDocument>(updated)
  );
  return resource ?? null;
}

export async function markWorkspaceJoinLinkUsed(
  config: ApiConfig,
  inviteId: string,
  usedByUserId: string
): Promise<WorkspaceJoinLinkDocument | null> {
  const existing = await getWorkspaceJoinLinkByInviteId(config, inviteId);
  if (!existing) return null;

  const now = new Date().toISOString();
  const { entitlements } = getContainers(config);
  const updated: WorkspaceJoinLinkDocument = {
    ...existing,
    status: "used",
    usedByUserId,
    usedAt: now,
    updatedAt: now
  };

  const { resource } = await withCosmosRetry(() =>
    entitlements.items.upsert<WorkspaceJoinLinkDocument>(updated)
  );
  return resource ?? null;
}
