import type { AppStorageScope } from "./storageKeys.ts";
import type { WorkspaceSummary, WorkspaceScopeType } from "../types/app.ts";

export type ScopeState = {
  activeScopeType: WorkspaceScopeType;
  activeWorkspaceId: string | null;
};

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
