import type { AppStorageScope } from "../../../storageKeys.ts";
import {
  getWorkspaceScopeKey,
  resolveWorkspaceScopeContext,
  toWorkspaceScopeContext,
  type ScopeState,
  type WorkspaceScopeContext
} from "../../../workspace-scope.ts";

export type SyncScopeState = ScopeState;
export type SyncScopeContext = WorkspaceScopeContext;

export function getSyncScopeKey(scope: AppStorageScope): string {
  return getWorkspaceScopeKey(scope);
}

export function toSyncScopeContext(scope: AppStorageScope): SyncScopeContext {
  return toWorkspaceScopeContext(scope);
}

export function resolveSyncScopeContext(state: SyncScopeState): SyncScopeContext {
  return resolveWorkspaceScopeContext(state);
}
