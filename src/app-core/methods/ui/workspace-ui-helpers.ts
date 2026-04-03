import type { AppContext } from "../../context-app.ts";
import type { WorkspaceSummary } from "../../../types/app.ts";
import { getLegacyStorageKeys, getScopedLastLotStorageKey, getScopedLastSyncedPayloadHashKey, STORAGE_KEYS } from "../../storageKeys.ts";
import { getActiveStorageScope, sortWorkspacesByName } from "../../workspace-scope.ts";

const LEGACY_KEYS = getLegacyStorageKeys();

type WorkspaceApiError = {
  error?: unknown;
  message?: unknown;
};

export type WorkspaceListResponse = {
  workspaces?: unknown;
};

export type WorkspaceCreateResponse = {
  workspace?: {
    workspaceId?: unknown;
  };
};

export type WorkspaceJoinLinkResponse = {
  inviteUrl?: unknown;
};

export type JoinPreviewResponse = {
  workspaceId?: unknown;
  workspaceName?: unknown;
};

export type LeaveWorkspaceResponse = {
  deletedWorkspace?: unknown;
  newOwnerUserId?: unknown;
};

export async function parseWorkspaceApiError(response: Response, fallbackMessage: string): Promise<string> {
  try {
    const body = (await response.json()) as WorkspaceApiError;
    const errorMessage = typeof body.error === "string" ? body.error.trim() : "";
    if (errorMessage) return errorMessage;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (message) return message;
  } catch {
    // Ignore JSON parsing errors and use fallback message.
  }

  return fallbackMessage;
}

export function normalizeWorkspaceSummary(value: unknown): WorkspaceSummary | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as {
    workspaceId?: unknown;
    name?: unknown;
    role?: unknown;
    status?: unknown;
  };
  const workspaceId = String(candidate.workspaceId ?? "").trim();
  const name = String(candidate.name ?? "").trim();
  const role = candidate.role === "owner" ? "owner" : candidate.role === "member" ? "member" : null;
  const status = candidate.status === "active" ? "active" : null;
  if (!workspaceId || !name || !role || !status) {
    return null;
  }

  return {
    workspaceId,
    name,
    role,
    status
  };
}

export function normalizeWorkspaceSummaries(value: unknown): WorkspaceSummary[] {
  if (!Array.isArray(value)) return [];
  return sortWorkspacesByName(
    value
      .map((entry) => normalizeWorkspaceSummary(entry))
      .filter((entry): entry is WorkspaceSummary => entry != null)
  );
}

export function clearInviteQueryParam(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("invite")) return;
    url.searchParams.delete("invite");
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, "", nextUrl || "/");
  } catch {
    // Ignore URL API failures.
  }
}

export function resetPendingWorkspaceInviteState(app: Pick<
  AppContext,
  | "pendingWorkspaceInviteToken"
  | "pendingWorkspaceInviteWorkspaceId"
  | "pendingWorkspaceInviteWorkspaceName"
  | "showWorkspaceJoinDialog"
>): void {
  app.pendingWorkspaceInviteToken = "";
  app.pendingWorkspaceInviteWorkspaceId = null;
  app.pendingWorkspaceInviteWorkspaceName = "";
  app.showWorkspaceJoinDialog = false;
}

export function persistActiveScopeSelection(app: Pick<AppContext, "activeScopeType" | "activeWorkspaceId">): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_SCOPE_TYPE, app.activeScopeType);
    if (app.activeScopeType === "workspace" && app.activeWorkspaceId) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_WORKSPACE_ID, app.activeWorkspaceId);
      return;
    }
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_WORKSPACE_ID);
  } catch {
    // Ignore storage write errors.
  }
}

export function loadScopedAppState(app: AppContext): void {
  const scope = getActiveStorageScope(app);
  const lastLotStorageKey = getScopedLastLotStorageKey(scope);
  const storedLastLotId = scope.scopeType === "workspace"
    ? localStorage.getItem(lastLotStorageKey)
    : localStorage.getItem(lastLotStorageKey) ?? localStorage.getItem(LEGACY_KEYS.LAST_LOT_ID);

  app.loadLotsFromStorage();
  app.loadWheelFromStorage();

  const nextLotId = Number(storedLastLotId);
  if (Number.isFinite(nextLotId) && nextLotId > 0 && app.lots.some((lot) => lot.id === nextLotId)) {
    app.currentLotId = nextLotId;
    app.loadLot();
  } else if (app.lots.length > 0) {
    app.currentLotId = app.lots[0].id;
    app.loadLot();
  } else {
    app.currentLotId = null;
    app.sales = [];
    app.singlesPurchases = [];
    app.clearLiveSinglesSelection();
    app.currentTab = "config";
  }

  try {
    app.lastSyncedPayloadHash = localStorage.getItem(
      getScopedLastSyncedPayloadHashKey(scope)
    );
  } catch {
    app.lastSyncedPayloadHash = null;
  }

  if (typeof app.syncGuidedOnboarding === "function") {
    app.syncGuidedOnboarding();
  }
}

export async function applyWorkspaceScope(
  app: AppContext,
  scopeType: "personal" | "workspace",
  workspaceId: string | null,
  options: {
    pullFromCloud?: boolean;
    getGoogleIdToken(): string;
  }
): Promise<void> {
  app.activeScopeType = scopeType;
  app.activeWorkspaceId = scopeType === "workspace" ? workspaceId : null;
  if (scopeType !== "workspace") {
    app.workspaceMembers = [];
    app.workspacePresenceByUserId = {};
  }
  persistActiveScopeSelection(app);
  loadScopedAppState(app);

  if (options.pullFromCloud !== false && options.getGoogleIdToken()) {
    await app.pullCloudSync();
  }
}

