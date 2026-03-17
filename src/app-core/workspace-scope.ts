import type { AppStorageScope } from "./storageKeys.ts";
import type { WorkspaceSummary, WorkspaceScopeType } from "../types/app.ts";

type ScopeState = {
  activeScopeType: WorkspaceScopeType;
  activeWorkspaceId: string | null;
};

function normalizeWorkspaceId(workspaceId: string | null | undefined): string {
  return String(workspaceId ?? "").trim();
}

export function getActiveStorageScope(state: ScopeState): AppStorageScope {
  const workspaceId = normalizeWorkspaceId(state.activeWorkspaceId);
  if (state.activeScopeType === "workspace" && workspaceId) {
    return {
      scopeType: "workspace",
      workspaceId
    };
  }

  return {
    scopeType: "personal"
  };
}

export function getActiveWorkspaceId(state: ScopeState): string | undefined {
  const scope = getActiveStorageScope(state);
  return scope.scopeType === "workspace" ? normalizeWorkspaceId(scope.workspaceId) || undefined : undefined;
}

export function sortWorkspacesByName(workspaces: WorkspaceSummary[]): WorkspaceSummary[] {
  return [...workspaces].sort((left, right) => left.name.localeCompare(right.name));
}

