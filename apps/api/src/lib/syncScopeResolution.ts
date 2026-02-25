import { HttpError } from "./auth";
import { buildSyncScopePartitionKey, type ScopeType } from "./scopeKeys";

function normalizeScopeId(raw: string | undefined): string {
  return String(raw || "").trim();
}

function resolveLegacyPersonalPartitionKey(userId: string): string {
  // Keep current partition format for personal scope until workspace sync is enabled.
  return userId;
}

export interface ResolvedSyncScope {
  actorUserId: string;
  requestedWorkspaceId?: string;
  scopeType: ScopeType;
  scopeId: string;
  partitionKey: string;
  workspaceScopeEnabled: boolean;
}

export function resolveSyncScope(actorUserId: string, workspaceId?: string): ResolvedSyncScope {
  const normalizedUserId = normalizeScopeId(actorUserId);
  if (!normalizedUserId) {
    throw new HttpError(401, "Authentication is required.");
  }

  const normalizedWorkspaceId = normalizeScopeId(workspaceId);

  if (normalizedWorkspaceId) {
    const partitionKey = buildSyncScopePartitionKey("workspace", normalizedWorkspaceId);
    if (!partitionKey) {
      throw new HttpError(400, "Field 'workspaceId' has an invalid format.");
    }

    return {
      actorUserId: normalizedUserId,
      requestedWorkspaceId: normalizedWorkspaceId,
      scopeType: "workspace",
      scopeId: normalizedWorkspaceId,
      partitionKey,
      workspaceScopeEnabled: true
    };
  }

  return {
    actorUserId: normalizedUserId,
    requestedWorkspaceId: normalizedWorkspaceId || undefined,
    scopeType: "user",
    scopeId: normalizedUserId,
    partitionKey: resolveLegacyPersonalPartitionKey(normalizedUserId),
    workspaceScopeEnabled: true
  };
}

export function shouldWarnWorkspaceScopeFallback(scope: ResolvedSyncScope): boolean {
  return !!scope.requestedWorkspaceId && !scope.workspaceScopeEnabled;
}

export async function assertSyncScopeAccess(
  scope: ResolvedSyncScope,
  hasWorkspaceAccess?: (actorUserId: string, workspaceId: string) => Promise<boolean>
): Promise<void> {
  if (scope.scopeType !== "workspace") return;
  if (typeof hasWorkspaceAccess !== "function") {
    throw new HttpError(500, "Workspace access verification is not configured.");
  }

  const allowed = await hasWorkspaceAccess(scope.actorUserId, scope.scopeId);
  if (!allowed) {
    throw new HttpError(403, "User is not a member of this workspace.");
  }
}
