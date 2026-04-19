import type { AppStorageScope } from "../../storageKeys.ts";
import { getActiveStorageScope } from "../../workspace-scope.ts";

export type SyncScopeState = {
  activeScopeType: "personal" | "workspace";
  activeWorkspaceId: string | null;
};

export type SyncScopeContext = AppStorageScope & {
  scopeKey: string;
};

export function getSyncScopeKey(scope: AppStorageScope): string {
  return scope.scopeType === "workspace"
    ? `workspace:${String(scope.workspaceId ?? "").trim()}`
    : "personal";
}

export function toSyncScopeContext(scope: AppStorageScope): SyncScopeContext {
  if (scope.scopeType === "workspace") {
    return {
      scopeType: "workspace",
      workspaceId: String(scope.workspaceId ?? "").trim() || null,
      scopeKey: getSyncScopeKey(scope)
    };
  }

  return {
    scopeType: "personal",
    scopeKey: getSyncScopeKey(scope)
  };
}

export function resolveSyncScopeContext(state: SyncScopeState): SyncScopeContext {
  return toSyncScopeContext(getActiveStorageScope(state));
}
