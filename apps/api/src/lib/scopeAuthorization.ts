import { hasWorkspaceMembership, getWorkspaceMembership } from "./cosmos/workspaceRepository";
import { resolveSyncScope } from "./syncScopeResolution";
import type { ApiConfig } from "../types";

export type ScopeAuthorizationDenialCode = "workspace_membership_required" | "workspace_owner_required";

export type ScopeAuthorizationResult =
  | {
      allowed: true;
      scope: ReturnType<typeof resolveSyncScope>;
      connectionScopeKey: string;
    }
  | {
      allowed: false;
      denialCode: ScopeAuthorizationDenialCode;
    };

export async function resolveScopeAuthorization(
  config: ApiConfig,
  actorUserId: string,
  workspaceId?: string,
  requireOwner = false
): Promise<ScopeAuthorizationResult> {
  const scope = resolveSyncScope(actorUserId, workspaceId);
  if (scope.scopeType === "workspace") {
    const hasActiveMembership = await hasWorkspaceMembership(config, scope.actorUserId, scope.scopeId);
    if (!hasActiveMembership) return { allowed: false, denialCode: "workspace_membership_required" };

    if (requireOwner) {
      const membership = await getWorkspaceMembership(config, scope.actorUserId, scope.scopeId);
      if (!membership || membership.status === "disabled" || membership.status === "removed") {
        return { allowed: false, denialCode: "workspace_membership_required" };
      }
      if (membership.role !== "owner") return { allowed: false, denialCode: "workspace_owner_required" };
    }
  }

  return {
    allowed: true,
    scope,
    connectionScopeKey: scope.scopeType === "workspace" ? scope.partitionKey : scope.actorUserId
  };
}
