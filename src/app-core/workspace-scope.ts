import type { AppStorageScope } from "./storageKeys.ts";
import type { WorkspaceSummary, WorkspaceScopeType } from "../types/app.ts";

export type ScopeState = {
  activeScopeType: WorkspaceScopeType;
  activeWorkspaceId: string | null;
};

const scopeRevisions = new WeakMap<object, number>();

export function getWorkspaceScopeRevision(state: ScopeState): number {
  return scopeRevisions.get(state) ?? 0;
}

/** A new visit must invalidate requests from an earlier visit to the same scope. */
export function setActiveWorkspaceScope(state: ScopeState, scopeType: WorkspaceScopeType, workspaceId: string | null): void {
  scopeRevisions.set(state, getWorkspaceScopeRevision(state) + 1);
  state.activeScopeType = scopeType;
  state.activeWorkspaceId = scopeType === "workspace" ? workspaceId : null;
}

export function captureWorkspaceScopeGuard(state: ScopeState & { googleAuthEpoch: number }): () => boolean {
  const scopeKey = resolveWorkspaceScopeContext(state).scopeKey;
  const authEpoch = state.googleAuthEpoch;
  const revision = getWorkspaceScopeRevision(state);
  return () => state.googleAuthEpoch === authEpoch
    && getWorkspaceScopeRevision(state) === revision
    && resolveWorkspaceScopeContext(state).scopeKey === scopeKey;
}

function normalizeWorkspaceId(workspaceId: string | null | undefined): string {
  return String(workspaceId ?? "").trim();
}

export type WorkspaceScopeContext = AppStorageScope & {
  workspaceId: string | null;
  isWorkspace: boolean;
  isPersonal: boolean;
  scopeKey: string;
};

export function getWorkspaceScopeKey(scope: AppStorageScope): string {
  return scope.scopeType === "workspace"
    ? `workspace:${normalizeWorkspaceId(scope.workspaceId)}`
    : "personal";
}

export function toWorkspaceScopeContext(scope: AppStorageScope): WorkspaceScopeContext {
  const workspaceId = normalizeWorkspaceId(scope.workspaceId) || null;
  if (scope.scopeType === "workspace" && workspaceId) {
    return {
      scopeType: "workspace",
      workspaceId,
      isWorkspace: true,
      isPersonal: false,
      scopeKey: getWorkspaceScopeKey({
        scopeType: "workspace",
        workspaceId
      })
    };
  }

  return {
    scopeType: "personal",
    workspaceId: null,
    isWorkspace: false,
    isPersonal: true,
    scopeKey: getWorkspaceScopeKey({ scopeType: "personal" })
  };
}

export function resolveWorkspaceScopeContext(state: ScopeState): WorkspaceScopeContext {
  const workspaceId = normalizeWorkspaceId(state.activeWorkspaceId) || null;
  if (state.activeScopeType === "workspace" && workspaceId) {
    return toWorkspaceScopeContext({
      scopeType: "workspace",
      workspaceId
    });
  }

  return toWorkspaceScopeContext({
    scopeType: "personal"
  });
}

export function getActiveStorageScope(state: ScopeState): AppStorageScope {
  const scope = resolveWorkspaceScopeContext(state);
  if (scope.isWorkspace) {
    return {
      scopeType: "workspace",
      workspaceId: scope.workspaceId
    };
  }
  return {
    scopeType: "personal"
  };
}

export function getActiveWorkspaceId(state: ScopeState): string | undefined {
  const scope = resolveWorkspaceScopeContext(state);
  return scope.isWorkspace ? scope.workspaceId || undefined : undefined;
}

export function sortWorkspacesByName(workspaces: WorkspaceSummary[]): WorkspaceSummary[] {
  return [...workspaces].sort((left, right) => left.name.localeCompare(right.name));
}
