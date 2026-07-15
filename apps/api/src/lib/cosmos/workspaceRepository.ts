import type {
  ApiConfig,
  WorkspaceDocument,
  WorkspaceJoinLinkDocument,
  WorkspaceMembershipDocument,
  WorkspaceMembershipStatus,
  WorkspaceRole
} from "../../types";
import { getContainers, isConflictError, isNotFoundError, isPreconditionFailedError, withCosmosRetry } from "./core";
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
  creationKeyHash: string;
  creationFingerprint: string;
}

export interface CreateWorkspaceWithOwnerResult {
  workspace: WorkspaceDocument;
  ownerMembership: WorkspaceMembershipDocument;
}

export class WorkspaceCreationConflictError extends Error {
  readonly status = 409;

  constructor(message: string) {
    super(message);
    this.name = "WorkspaceCreationConflictError";
  }
}

export class WorkspaceCreationInProgressError extends Error {
  readonly status = 409;

  constructor(message: string) {
    super(message);
    this.name = "WorkspaceCreationInProgressError";
  }
}

export interface WorkspaceOwnerMembershipAuditFinding {
  workspaceId: string;
  ownerUserId: string;
  reason: "missing" | "inactive";
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

interface WorkspaceMemberProfileSnapshotInput {
  displayName?: string;
  photoUrl?: string;
}

function isWorkspaceActive(workspace: WorkspaceDocument | null | undefined): boolean {
  return !!workspace && (!workspace.status || workspace.status === "active");
}

function matchesWorkspaceCreation(
  workspace: WorkspaceDocument,
  input: CreateWorkspaceWithOwnerInput
): boolean {
  return workspace.ownerUserId === input.ownerUserId
    && workspace.creationKeyHash === input.creationKeyHash
    && workspace.creationFingerprint === input.creationFingerprint;
}

async function returnActiveWorkspaceWithOwner(
  config: ApiConfig,
  workspace: WorkspaceDocument,
  ownerUserId: string
): Promise<CreateWorkspaceWithOwnerResult> {
  const ownerMembership = await upsertWorkspaceMembership(config, {
    userId: ownerUserId,
    workspaceId: workspace.workspaceId,
    role: "owner",
    status: "active"
  });
  return { workspace, ownerMembership };
}

function isActiveWorkspaceMembershipStatus(status: WorkspaceMembershipStatus | undefined): boolean {
  return status !== "disabled" && status !== "removed";
}

function readCosmosEtag(document: unknown): string {
  if (!document || typeof document !== "object") return "";
  return String((document as { _etag?: unknown })._etag ?? "").trim();
}

function readWorkspaceOverride<K extends keyof WorkspaceDocument>(
  workspace: WorkspaceDocument,
  overrides: Partial<WorkspaceDocument>,
  key: K
): WorkspaceDocument[K] {
  return (Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : workspace[key]) as WorkspaceDocument[K];
}

function buildWorkspaceWriteDocument(
  workspace: WorkspaceDocument,
  overrides: Partial<WorkspaceDocument> = {}
): WorkspaceDocument {
  const workspaceId = String(workspace.workspaceId || "").trim();
  return {
    id: workspace.id || workspaceDocumentId(workspaceId),
    docType: "workspace",
    userId: String(workspace.userId || "").trim() || workspaceDocumentPartitionKey(workspaceId),
    workspaceId,
    name: overrides.name ?? workspace.name,
    ownerUserId: overrides.ownerUserId ?? workspace.ownerUserId,
    status: overrides.status ?? workspace.status ?? "active",
    createdAt: workspace.createdAt,
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
    creationKeyHash: readWorkspaceOverride(workspace, overrides, "creationKeyHash"),
    creationFingerprint: readWorkspaceOverride(workspace, overrides, "creationFingerprint"),
    creationAttemptCount: readWorkspaceOverride(workspace, overrides, "creationAttemptCount"),
    creationLastAttemptAt: readWorkspaceOverride(workspace, overrides, "creationLastAttemptAt"),
    creationErrorCode: readWorkspaceOverride(workspace, overrides, "creationErrorCode"),
    creationErrorMessage: readWorkspaceOverride(workspace, overrides, "creationErrorMessage")
  };
}

function buildWorkspaceMembershipWriteDocument(
  membership: WorkspaceMembershipDocument,
  overrides: Partial<Pick<
    WorkspaceMembershipDocument,
    "role" | "status" | "displayName" | "photoUrl" | "updatedAt"
  >> = {}
): WorkspaceMembershipDocument {
  return {
    id: membership.id || workspaceMembershipId(membership.userId, membership.workspaceId),
    docType: "workspace_membership",
    userId: membership.userId,
    workspaceId: membership.workspaceId,
    role: overrides.role ?? membership.role ?? "member",
    status: overrides.status ?? membership.status ?? "active",
    displayName: String(overrides.displayName ?? membership.displayName ?? "").trim() || undefined,
    photoUrl: String(overrides.photoUrl ?? membership.photoUrl ?? "").trim() || undefined,
    updatedAt: overrides.updatedAt ?? new Date().toISOString()
  };
}

async function replaceWorkspaceDocumentIfUnchanged(
  config: ApiConfig,
  existing: WorkspaceDocument,
  overrides: Partial<WorkspaceDocument> = {}
): Promise<WorkspaceDocument | null> {
  const { entitlements } = getContainers(config);
  const document = buildWorkspaceWriteDocument(existing, overrides);
  const etag = readCosmosEtag(existing);

  try {
    if (etag) {
      const { resource } = await withCosmosRetry(() =>
        entitlements.item(document.id, document.userId).replace<WorkspaceDocument>(document, {
          accessCondition: {
            type: "IfMatch",
            condition: etag
          }
        })
      );
      if (!resource) {
        throw new Error("Failed to replace workspace.");
      }
      return resource;
    }

    return upsertWorkspaceDocument(config, document);
  } catch (error) {
    if (isPreconditionFailedError(error)) return null;
    throw error;
  }
}

async function replaceWorkspaceMembershipIfUnchanged(
  config: ApiConfig,
  existing: WorkspaceMembershipDocument,
  overrides: Partial<Pick<
    WorkspaceMembershipDocument,
    "role" | "status" | "displayName" | "photoUrl" | "updatedAt"
  >> = {}
): Promise<WorkspaceMembershipDocument | null> {
  const { entitlements } = getContainers(config);
  const document = buildWorkspaceMembershipWriteDocument(existing, overrides);
  const etag = readCosmosEtag(existing);

  try {
    if (etag) {
      const { resource } = await withCosmosRetry(() =>
        entitlements.item(document.id, document.userId).replace<WorkspaceMembershipDocument>(document, {
          accessCondition: {
            type: "IfMatch",
            condition: etag
          }
        })
      );
      return resource ?? null;
    }

    return upsertWorkspaceMembership(config, {
      userId: document.userId,
      workspaceId: document.workspaceId,
      role: document.role ?? "member",
      status: document.status,
      displayName: document.displayName,
      photoUrl: document.photoUrl,
      updatedAt: document.updatedAt
    });
  } catch (error) {
    if (isPreconditionFailedError(error)) return null;
    throw error;
  }
}

async function replaceWorkspaceJoinLinkIfUnchanged(
  config: ApiConfig,
  existing: WorkspaceJoinLinkDocument,
  updated: WorkspaceJoinLinkDocument
): Promise<WorkspaceJoinLinkDocument | null> {
  const { entitlements } = getContainers(config);
  const etag = readCosmosEtag(existing);

  try {
    if (etag) {
      const { resource } = await withCosmosRetry(() =>
        entitlements.item(updated.id, updated.userId).replace<WorkspaceJoinLinkDocument>(updated, {
          accessCondition: {
            type: "IfMatch",
            condition: etag
          }
        })
      );
      return resource ?? null;
    }

    const { resource } = await withCosmosRetry(() =>
      entitlements.items.upsert<WorkspaceJoinLinkDocument>(updated)
    );
    return resource ?? null;
  } catch (error) {
    if (isPreconditionFailedError(error)) return null;
    throw error;
  }
}

export async function getWorkspaceById(
  config: ApiConfig,
  workspaceId: string
): Promise<WorkspaceDocument | null> {
  const { entitlements } = getContainers(config);
  const id = workspaceDocumentId(workspaceId);
  const partitionKey = workspaceDocumentPartitionKey(workspaceId);

  try {
    const { resource } = await withCosmosRetry(() =>
      entitlements.item(id, partitionKey).read<WorkspaceDocument>()
    );
    if (!resource || resource.docType !== "workspace") return null;
    if (resource.workspaceId !== workspaceId || resource.userId !== partitionKey) return null;
    return resource;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export async function upsertWorkspaceDocument(
  config: ApiConfig,
  workspace: WorkspaceDocument
): Promise<WorkspaceDocument> {
  const { entitlements } = getContainers(config);
  const document = buildWorkspaceWriteDocument(workspace);

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
      !!entry.workspace && isWorkspaceActive(entry.workspace)
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
  const proposedWorkspace: WorkspaceDocument = {
    id: workspaceDocumentId(input.workspaceId),
    docType: "workspace",
    userId: workspaceDocumentPartitionKey(input.workspaceId),
    workspaceId: input.workspaceId,
    name: input.name,
    ownerUserId: input.ownerUserId,
    status: "creating",
    createdAt: now,
    updatedAt: now,
    creationKeyHash: input.creationKeyHash,
    creationFingerprint: input.creationFingerprint,
    creationAttemptCount: 1,
    creationLastAttemptAt: now
  };

  let workspace: WorkspaceDocument;
  try {
    const { resource } = await withCosmosRetry(() =>
      entitlements.items.create<WorkspaceDocument>(proposedWorkspace)
    );
    if (!resource) {
      throw new Error("Failed to create workspace.");
    }
    workspace = resource;
  } catch (error) {
    if (!isConflictError(error)) throw error;
    const existing = await getWorkspaceById(config, input.workspaceId);
    if (!existing) throw new WorkspaceCreationConflictError("Workspace creation conflicted. Retry the request.");
    if (!matchesWorkspaceCreation(existing, input)) {
      throw new WorkspaceCreationConflictError(
        "Workspace idempotency key was already used for a different request."
      );
    }

    if (isWorkspaceActive(existing)) {
      return returnActiveWorkspaceWithOwner(config, existing, input.ownerUserId);
    }
    if (existing.status === "deleted") {
      throw new WorkspaceCreationConflictError("Workspace creation key belongs to a deleted workspace.");
    }

    const resumed = await replaceWorkspaceDocumentIfUnchanged(config, existing, {
      status: "creating",
      creationAttemptCount: Math.max(1, existing.creationAttemptCount ?? 1) + 1,
      creationLastAttemptAt: now,
      creationErrorCode: undefined,
      creationErrorMessage: undefined
    });
    if (!resumed) {
      const current = await getWorkspaceById(config, input.workspaceId);
      if (current && matchesWorkspaceCreation(current, input) && isWorkspaceActive(current)) {
        return returnActiveWorkspaceWithOwner(config, current, input.ownerUserId);
      }
      throw new WorkspaceCreationInProgressError("Workspace creation is already being retried.");
    }
    workspace = resumed;
  }

  try {
    const ownerMembership = await upsertWorkspaceMembership(config, {
      userId: input.ownerUserId,
      workspaceId: input.workspaceId,
      role: "owner",
      status: "active"
    });
    const activeWorkspace = await replaceWorkspaceDocumentIfUnchanged(config, workspace, {
      status: "active",
      creationErrorCode: undefined,
      creationErrorMessage: undefined
    });
    if (!activeWorkspace) {
      const current = await getWorkspaceById(config, input.workspaceId);
      if (current && matchesWorkspaceCreation(current, input) && isWorkspaceActive(current)) {
        return returnActiveWorkspaceWithOwner(config, current, input.ownerUserId);
      }
      throw new WorkspaceCreationInProgressError("Workspace creation is already being activated.");
    }
    return { workspace: activeWorkspace, ownerMembership };
  } catch (error) {
    if (error instanceof WorkspaceCreationInProgressError) {
      throw error;
    }
    const failedWorkspace = await replaceWorkspaceDocumentIfUnchanged(config, workspace, {
      status: "creation_failed",
      creationErrorCode: error instanceof WorkspaceCreationConflictError
        ? "activation_conflict"
        : "owner_membership_failed",
      creationErrorMessage: error instanceof WorkspaceCreationConflictError
        ? "Workspace activation conflicted with another lifecycle update."
        : "Workspace owner membership could not be completed."
    }).catch(() => null);
    if (!failedWorkspace && error && typeof error === "object") {
      (error as { recoveryStateWriteFailed?: boolean }).recoveryStateWriteFailed = true;
    }
    throw error;
  }
}

export async function auditWorkspaceOwnerMemberships(
  config: ApiConfig,
  workspaceIds: readonly string[]
): Promise<WorkspaceOwnerMembershipAuditFinding[]> {
  const normalizedIds = Array.from(new Set(workspaceIds.map((value) => String(value).trim()).filter(Boolean)));
  if (normalizedIds.length > 100) {
    throw new Error("Workspace owner-membership audits are limited to 100 workspaces per run.");
  }

  const findings: WorkspaceOwnerMembershipAuditFinding[] = [];
  for (const workspaceId of normalizedIds) {
    const workspace = await getWorkspaceById(config, workspaceId);
    if (!workspace || !isWorkspaceActive(workspace)) continue;
    const membership = await getWorkspaceMembership(config, workspace.ownerUserId, workspace.workspaceId);
    if (!membership) {
      findings.push({ workspaceId, ownerUserId: workspace.ownerUserId, reason: "missing" });
    } else if (!isActiveWorkspaceMembershipStatus(membership.status) || membership.role !== "owner") {
      findings.push({ workspaceId, ownerUserId: workspace.ownerUserId, reason: "inactive" });
    }
  }
  return findings;
}

export async function repairWorkspaceOwnerMembership(
  config: ApiConfig,
  workspaceId: string,
  expectedOwnerUserId: string
): Promise<WorkspaceMembershipDocument> {
  const normalizedWorkspaceId = String(workspaceId).trim();
  const normalizedOwnerUserId = String(expectedOwnerUserId).trim();
  const workspace = await getWorkspaceById(config, normalizedWorkspaceId);
  if (!workspace || !isWorkspaceActive(workspace)) {
    throw new WorkspaceCreationConflictError("Only an active workspace can have its owner membership repaired.");
  }
  if (workspace.ownerUserId !== normalizedOwnerUserId) {
    throw new WorkspaceCreationConflictError("Workspace owner changed before membership repair.");
  }
  const priorMembership = await getWorkspaceMembership(config, normalizedOwnerUserId, normalizedWorkspaceId);
  if (!readCosmosEtag(workspace)) {
    throw new WorkspaceCreationConflictError("Workspace version is unavailable for a safe membership repair.");
  }
  const verifiedWorkspace = await replaceWorkspaceDocumentIfUnchanged(config, workspace, {
    status: "active",
    updatedAt: workspace.updatedAt
  });
  if (!verifiedWorkspace || verifiedWorkspace.ownerUserId !== normalizedOwnerUserId) {
    throw new WorkspaceCreationConflictError("Workspace owner changed before membership repair.");
  }

  const repaired = priorMembership
    ? await replaceWorkspaceMembershipIfUnchanged(config, priorMembership, {
      role: "owner",
      status: "active",
      displayName: priorMembership.displayName,
      photoUrl: priorMembership.photoUrl,
      updatedAt: priorMembership.updatedAt
    })
    : await upsertWorkspaceMembership(config, {
      userId: normalizedOwnerUserId,
      workspaceId: normalizedWorkspaceId,
      role: "owner",
      status: "active"
    });
  if (!repaired) {
    throw new WorkspaceCreationConflictError("Workspace membership changed before repair completed.");
  }
  const currentWorkspace = await getWorkspaceById(config, normalizedWorkspaceId);
  if (!currentWorkspace || !isWorkspaceActive(currentWorkspace) || currentWorkspace.ownerUserId !== normalizedOwnerUserId) {
    if (priorMembership) {
      await replaceWorkspaceMembershipIfUnchanged(config, repaired, {
        role: priorMembership.role ?? "member",
        status: priorMembership.status ?? "active",
        displayName: priorMembership.displayName,
        photoUrl: priorMembership.photoUrl,
        updatedAt: priorMembership.updatedAt
      }).catch(() => null);
    } else {
      await replaceWorkspaceMembershipIfUnchanged(config, repaired, {
        role: repaired.role ?? "owner",
        status: "removed",
        displayName: repaired.displayName,
        photoUrl: repaired.photoUrl,
        updatedAt: repaired.updatedAt
      }).catch(() => null);
    }
    throw new WorkspaceCreationConflictError("Workspace owner changed during membership repair.");
  }
  return repaired;
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

  const removed = await replaceWorkspaceMembershipIfUnchanged(config, existing, {
    role: existing.role ?? "member",
    status: "removed",
    displayName: existing.displayName,
    photoUrl: existing.photoUrl
  });
  return !!removed;
}

export async function updateWorkspaceMembershipProfileSnapshot(
  config: ApiConfig,
  membership: WorkspaceMembershipDocument,
  snapshot: WorkspaceMemberProfileSnapshotInput
): Promise<WorkspaceMembershipDocument | null> {
  if (!isActiveWorkspaceMembershipStatus(membership.status)) return null;

  const displayName = String(snapshot.displayName || "").trim();
  if (!displayName) return null;

  return replaceWorkspaceMembershipIfUnchanged(config, membership, {
    role: membership.role ?? "member",
    status: membership.status ?? "active",
    displayName,
    photoUrl: String(snapshot.photoUrl || "").trim() || undefined,
    updatedAt: membership.updatedAt
  });
}

export async function hasWorkspaceMembership(
  config: ApiConfig,
  userId: string,
  workspaceId: string
): Promise<boolean> {
  const membership = await getWorkspaceMembership(config, userId, workspaceId);
  if (!membership) return false;
  if (!isActiveWorkspaceMembershipStatus(membership.status)) return false;
  const workspace = await getWorkspaceById(config, workspaceId);
  if (!isWorkspaceActive(workspace)) return false;
  return true;
}

export async function transferWorkspaceOwnership(
  config: ApiConfig,
  workspaceId: string,
  newOwnerUserId: string,
  expectedCurrentOwnerUserId?: string
): Promise<WorkspaceDocument | null> {
  const existing = await getWorkspaceById(config, workspaceId);
  if (!existing || !isWorkspaceActive(existing)) return null;
  if (expectedCurrentOwnerUserId && existing.ownerUserId !== expectedCurrentOwnerUserId) return null;

  return replaceWorkspaceDocumentIfUnchanged(config, existing, {
    ownerUserId: newOwnerUserId,
    status: existing.status ?? "active"
  });
}

export async function softDeleteWorkspace(
  config: ApiConfig,
  workspaceId: string,
  expectedOwnerUserId?: string
): Promise<WorkspaceDocument | null> {
  const existing = await getWorkspaceById(config, workspaceId);
  if (!existing) return null;
  if (existing.status === "deleted") return existing;
  if (expectedOwnerUserId && existing.ownerUserId !== expectedOwnerUserId) return null;

  return replaceWorkspaceDocumentIfUnchanged(config, existing, {
    status: "deleted"
  });
}

export async function restoreWorkspaceDocument(
  config: ApiConfig,
  workspace: WorkspaceDocument
): Promise<WorkspaceDocument> {
  return upsertWorkspaceDocument(config, {
    ...workspace,
    status: workspace.status ?? "active"
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

  const updated: WorkspaceJoinLinkDocument = {
    ...existing,
    status: "revoked",
    updatedAt: new Date().toISOString()
  };

  return replaceWorkspaceJoinLinkIfUnchanged(config, existing, updated);
}

export async function markWorkspaceJoinLinkUsed(
  config: ApiConfig,
  inviteId: string,
  usedByUserId: string
): Promise<WorkspaceJoinLinkDocument | null> {
  const existing = await getWorkspaceJoinLinkByInviteId(config, inviteId);
  if (!existing) return null;
  if (existing.status !== "active") return null;

  const now = new Date().toISOString();
  const updated: WorkspaceJoinLinkDocument = {
    ...existing,
    status: "used",
    usedByUserId,
    usedAt: now,
    updatedAt: now
  };

  return replaceWorkspaceJoinLinkIfUnchanged(config, existing, updated);
}
