import type { AppContext, AppMethodState } from "../../context.ts";
import { fetchWithRetry, GOOGLE_TOKEN_KEY, handleExpiredAuth, resolveApiBaseUrl } from "./shared.ts";
import { requestCloudSyncPush } from "./sync-network.ts";
import { createSyncPayload } from "./sync-payload.ts";
import { buildAuthenticatedHeaders, getStoredGoogleIdToken } from "../../auth/index.ts";
import {
  getLegacyStorageKeys,
  getScopedLastLotStorageKey,
  getScopedLastSyncedPayloadHashKey,
  STORAGE_KEYS
} from "../../storageKeys.ts";
import { getActiveStorageScope, sortWorkspacesByName } from "../../workspace-scope.ts";
import type { WorkspaceMember, WorkspaceSummary } from "../../../types/app.ts";

const LEGACY_KEYS = getLegacyStorageKeys();

type WorkspaceApiError = {
  error?: unknown;
  message?: unknown;
};

type WorkspaceListResponse = {
  workspaces?: unknown;
};

type WorkspaceMembersResponse = {
  memberships?: unknown;
};

type WorkspaceCreateResponse = {
  workspace?: {
    workspaceId?: unknown;
  };
};

type WorkspaceJoinLinkResponse = {
  inviteUrl?: unknown;
};

type JoinPreviewResponse = {
  workspaceId?: unknown;
  workspaceName?: unknown;
};

type LeaveWorkspaceResponse = {
  deletedWorkspace?: unknown;
  newOwnerUserId?: unknown;
};

function getGoogleIdToken(): string {
  return getStoredGoogleIdToken();
}

async function parseApiError(response: Response, fallbackMessage: string): Promise<string> {
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

function normalizeWorkspaceSummary(value: unknown): WorkspaceSummary | null {
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

function normalizeWorkspaceMember(value: unknown): WorkspaceMember | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as {
    userId?: unknown;
    workspaceId?: unknown;
    role?: unknown;
    status?: unknown;
    updatedAt?: unknown;
    displayName?: unknown;
    photoUrl?: unknown;
  };
  const userId = String(candidate.userId ?? "").trim();
  const workspaceId = String(candidate.workspaceId ?? "").trim();
  const role = candidate.role === "owner" ? "owner" : candidate.role === "member" ? "member" : null;
  const status = candidate.status === "disabled" || candidate.status === "removed" ? candidate.status : "active";
  const updatedAt = String(candidate.updatedAt ?? "").trim();
  if (!userId || !workspaceId || !role || !updatedAt) {
    return null;
  }

  return {
    userId,
    workspaceId,
    role,
    status,
    updatedAt,
    displayName: typeof candidate.displayName === "string" && candidate.displayName.trim()
      ? candidate.displayName.trim()
      : undefined,
    photoUrl: typeof candidate.photoUrl === "string" && candidate.photoUrl.trim()
      ? candidate.photoUrl.trim()
      : undefined
  };
}

function normalizeWorkspaceSummaries(value: unknown): WorkspaceSummary[] {
  if (!Array.isArray(value)) return [];
  return sortWorkspacesByName(
    value
      .map((entry) => normalizeWorkspaceSummary(entry))
      .filter((entry): entry is WorkspaceSummary => entry != null)
  );
}

function normalizeWorkspaceMembers(value: unknown): WorkspaceMember[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeWorkspaceMember(entry))
    .filter((entry): entry is WorkspaceMember => entry != null);
}

function clearInviteQueryParam(): void {
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

function resetPendingWorkspaceInviteState(app: Pick<
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

function persistActiveScopeSelection(app: Pick<AppContext, "activeScopeType" | "activeWorkspaceId">): void {
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

function loadScopedAppState(app: AppContext): void {
  const scope = getActiveStorageScope(app);
  const lastLotStorageKey = getScopedLastLotStorageKey(scope);
  const storedLastLotId = scope.scopeType === "workspace"
    ? localStorage.getItem(lastLotStorageKey)
    : localStorage.getItem(lastLotStorageKey) ?? localStorage.getItem(LEGACY_KEYS.LAST_LOT_ID);

  app.loadLotsFromStorage();

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
}

async function applyWorkspaceScope(
  app: AppContext,
  scopeType: "personal" | "workspace",
  workspaceId: string | null,
  options: {
    pullFromCloud?: boolean;
  } = {}
): Promise<void> {
  app.activeScopeType = scopeType;
  app.activeWorkspaceId = scopeType === "workspace" ? workspaceId : null;
  persistActiveScopeSelection(app);
  loadScopedAppState(app);

  if (options.pullFromCloud !== false && getGoogleIdToken()) {
    await app.pullCloudSync();
  }
}

function getTransferCandidates(app: AppContext): WorkspaceMember[] {
  return app.workspaceMembers.filter(
    (member) => member.status === "active" && member.role === "member"
  );
}

async function fetchWorkspaceJson(
  app: AppContext,
  path: string,
  init: RequestInit,
  fallbackMessage: string
): Promise<{ ok: true; response: Response; body: unknown } | { ok: false; handled: true }> {
  const baseUrl = resolveApiBaseUrl();
  if (!baseUrl) {
    app.notify("Workspace features are unavailable until the API base URL is configured.", "warning");
    return { ok: false, handled: true };
  }

  const googleIdToken = getGoogleIdToken();
  if (!googleIdToken) {
    app.notify("Sign in with Google first.", "warning");
    return { ok: false, handled: true };
  }

  const response = await fetchWithRetry(`${baseUrl}${path}`, {
    ...init,
    headers: buildAuthenticatedHeaders("session-preferred", init.headers as Record<string, string> | undefined)
  });

  if (response.status === 401) {
    handleExpiredAuth(app);
    app.notify("Your sign-in expired. Please sign in again.", "warning");
    return { ok: false, handled: true };
  }

  if (!response.ok) {
    app.notify(await parseApiError(response, fallbackMessage), "error");
    return { ok: false, handled: true };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return {
    ok: true,
    response,
    body
  };
}

export const uiWorkspaceMethods: ThisType<AppContext> & Pick<
  AppMethodState,
  | "refreshWorkspaces"
  | "switchToPersonalWorkspace"
  | "switchToWorkspace"
  | "createWorkspace"
  | "openWorkspaceMembersModal"
  | "createWorkspaceJoinLink"
  | "previewPendingWorkspaceInvite"
  | "acceptPendingWorkspaceInvite"
  | "dismissPendingWorkspaceInvite"
  | "openLeaveWorkspaceModal"
  | "leaveCurrentWorkspace"
  | "removeWorkspaceMember"
  | "handleWorkspaceAccessLost"
> = {
  async refreshWorkspaces(): Promise<void> {
    const googleIdToken = getGoogleIdToken();
    if (!googleIdToken) {
      this.availableWorkspaces = [];
      return;
    }

    this.isWorkspaceLoading = true;
    try {
      const result = await fetchWorkspaceJson(this, "/workspaces/me", { method: "GET" }, "Failed to load workspaces.");
      if (!result.ok) return;

      const body = result.body as WorkspaceListResponse;
      this.availableWorkspaces = normalizeWorkspaceSummaries(body.workspaces);

      if (
        this.activeScopeType === "workspace" &&
        (!this.activeWorkspaceId ||
          !this.availableWorkspaces.some((workspace) => workspace.workspaceId === this.activeWorkspaceId))
      ) {
        await applyWorkspaceScope(this, "personal", null, {
          pullFromCloud: false
        });
      }
    } finally {
      this.isWorkspaceLoading = false;
    }
  },

  async switchToPersonalWorkspace(): Promise<void> {
    this.isWorkspaceLoading = true;
    try {
      await applyWorkspaceScope(this, "personal", null);
    } finally {
      this.isWorkspaceLoading = false;
    }
  },

  async switchToWorkspace(workspaceId: string): Promise<void> {
    const normalizedWorkspaceId = String(workspaceId || "").trim();
    if (!normalizedWorkspaceId) return;

    if (!this.availableWorkspaces.some((workspace) => workspace.workspaceId === normalizedWorkspaceId)) {
      await this.refreshWorkspaces();
      if (!this.availableWorkspaces.some((workspace) => workspace.workspaceId === normalizedWorkspaceId)) {
        this.notify("That workspace is no longer available.", "warning");
        return;
      }
    }

    this.isWorkspaceLoading = true;
    try {
      await applyWorkspaceScope(this, "workspace", normalizedWorkspaceId);
    } finally {
      this.isWorkspaceLoading = false;
    }
  },

  async createWorkspace(): Promise<void> {
    if (this.activeScopeType !== "personal") {
      this.notify("Create shared workspaces from Personal mode for now.", "warning");
      return;
    }

    const name = String(this.newWorkspaceName || "").trim();
    if (!name) {
      this.notify("Enter a workspace name.", "warning");
      return;
    }

    const baseUrl = resolveApiBaseUrl();
    const googleIdToken = getGoogleIdToken();
    if (!baseUrl) {
      this.notify("Workspace features are unavailable until the API base URL is configured.", "warning");
      return;
    }
    if (!googleIdToken) {
      this.notify("Sign in with Google first.", "warning");
      return;
    }

    this.isCreatingWorkspace = true;
    try {
      const createResult = await fetchWorkspaceJson(
        this,
        "/workspaces",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name
          })
        },
        "Failed to create workspace."
      );
      if (!createResult.ok) return;

      const createBody = createResult.body as WorkspaceCreateResponse;
      const createdWorkspaceId = String(createBody.workspace?.workspaceId ?? "").trim();
      if (!createdWorkspaceId) {
        this.notify("Workspace created, but no workspace ID was returned.", "warning");
        return;
      }
      const seedPayload = createSyncPayload({
        lots: this.lots,
        currentLotId: this.currentLotId,
        sales: this.sales,
        loadSalesForLotId: this.loadSalesForLotId,
        workspaceId: createdWorkspaceId
      });

      const seedResponse = await requestCloudSyncPush(baseUrl, seedPayload, "session-preferred");
      if (!seedResponse.ok && seedResponse.status !== 409) {
        this.notify(
          await parseApiError(seedResponse, "Workspace created, but initial data copy failed."),
          "warning"
        );
      }

      this.newWorkspaceName = "";
      this.showCreateWorkspaceModal = false;

      await this.refreshWorkspaces();
      await this.switchToWorkspace(createdWorkspaceId);
      this.notify("Workspace created", "success");
    } finally {
      this.isCreatingWorkspace = false;
    }
  },

  async openWorkspaceMembersModal(): Promise<void> {
    if (!this.activeWorkspaceId) {
      this.notify("Switch to a shared workspace first.", "warning");
      return;
    }

    this.workspaceMembers = [];
    this.showWorkspaceMembersModal = true;
    this.isWorkspaceMembersLoading = true;
    try {
      const result = await fetchWorkspaceJson(
        this,
        `/workspaces/${encodeURIComponent(this.activeWorkspaceId)}/members`,
        {
          method: "GET"
        },
        "Failed to load workspace members."
      );
      if (!result.ok) return;

      const body = result.body as WorkspaceMembersResponse;
      this.workspaceMembers = normalizeWorkspaceMembers(body.memberships);
      this.leaveWorkspaceTransferMemberUserId = getTransferCandidates(this)[0]?.userId ?? "";
    } finally {
      this.isWorkspaceMembersLoading = false;
    }
  },

  async createWorkspaceJoinLink(): Promise<void> {
    if (!this.activeWorkspaceId) {
      this.notify("Switch to a shared workspace first.", "warning");
      return;
    }

    this.isCreatingWorkspaceJoinLink = true;
    try {
      const result = await fetchWorkspaceJson(
        this,
        `/workspaces/${encodeURIComponent(this.activeWorkspaceId)}/join-links`,
        {
          method: "POST"
        },
        "Failed to create workspace invite link."
      );
      if (!result.ok) return;

      const body = result.body as WorkspaceJoinLinkResponse;
      const invitePath = String(body.inviteUrl ?? "").trim();
      if (!invitePath) {
        this.notify("Invite link was created, but the URL was missing.", "warning");
        return;
      }

      const absoluteInviteUrl = invitePath.startsWith("http")
        ? invitePath
        : `${window.location.origin}${invitePath}`;

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(absoluteInviteUrl);
        this.notify("Invite link copied", "success");
        return;
      }

      window.prompt("Copy workspace invite link", absoluteInviteUrl);
      this.notify("Invite link ready to share", "success");
    } finally {
      this.isCreatingWorkspaceJoinLink = false;
    }
  },

  async previewPendingWorkspaceInvite(): Promise<void> {
    if (!this.pendingWorkspaceInviteToken || this.isResolvingWorkspaceInvite) {
      return;
    }

    this.isResolvingWorkspaceInvite = true;
    try {
      const result = await fetchWorkspaceJson(
        this,
        "/join/accept",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            inviteToken: this.pendingWorkspaceInviteToken,
            preview: true
          })
        },
        "Failed to preview the workspace invite."
      );
      if (!result.ok) {
        resetPendingWorkspaceInviteState(this);
        clearInviteQueryParam();
        return;
      }

      const body = result.body as JoinPreviewResponse;
      this.pendingWorkspaceInviteWorkspaceId = String(body.workspaceId ?? "").trim() || null;
      this.pendingWorkspaceInviteWorkspaceName = String(body.workspaceName ?? "").trim();
      this.showWorkspaceJoinDialog = true;
    } finally {
      this.isResolvingWorkspaceInvite = false;
    }
  },

  async acceptPendingWorkspaceInvite(): Promise<void> {
    if (!this.pendingWorkspaceInviteToken) return;

    this.isAcceptingWorkspaceInvite = true;
    try {
      const result = await fetchWorkspaceJson(
        this,
        "/join/accept",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            inviteToken: this.pendingWorkspaceInviteToken
          })
        },
        "Failed to join the workspace."
      );
      if (!result.ok) return;

      const body = result.body as JoinPreviewResponse;
      const workspaceId = String(body.workspaceId ?? "").trim();
      const workspaceName = String(body.workspaceName ?? "").trim();

      resetPendingWorkspaceInviteState(this);
      clearInviteQueryParam();

      await this.refreshWorkspaces();
      if (workspaceId) {
        await this.switchToWorkspace(workspaceId);
      }
      this.notify(
        workspaceName ? `Joined ${workspaceName}` : "Workspace joined",
        "success"
      );
    } finally {
      this.isAcceptingWorkspaceInvite = false;
    }
  },

  dismissPendingWorkspaceInvite(): void {
    resetPendingWorkspaceInviteState(this);
    clearInviteQueryParam();
  },

  async openLeaveWorkspaceModal(): Promise<void> {
    if (!this.activeWorkspaceId) {
      this.notify("Switch to a shared workspace first.", "warning");
      return;
    }

    if (this.isCurrentWorkspaceOwner && this.workspaceMembers.length === 0) {
      await this.openWorkspaceMembersModal();
    }

    this.leaveWorkspaceTransferMemberUserId = getTransferCandidates(this)[0]?.userId ?? "";
    this.leaveWorkspaceDeleteConfirmation = false;
    this.showLeaveWorkspaceModal = true;
  },

  async leaveCurrentWorkspace(): Promise<void> {
    if (!this.activeWorkspaceId) return;

    const body: Record<string, unknown> = {};
    const transferCandidates = getTransferCandidates(this);
    const currentWorkspaceId = this.activeWorkspaceId;

    if (this.isCurrentWorkspaceOwner) {
      if (transferCandidates.length > 0) {
        if (!this.leaveWorkspaceTransferMemberUserId) {
          this.notify("Choose a new owner before leaving.", "warning");
          return;
        }
        body.newOwnerUserId = this.leaveWorkspaceTransferMemberUserId;
      } else if (!this.leaveWorkspaceDeleteConfirmation) {
        this.notify("Confirm workspace deletion before leaving as the last owner.", "warning");
        return;
      } else {
        body.deleteWorkspace = true;
      }
    }

    this.isLeavingWorkspace = true;
    try {
      const result = await fetchWorkspaceJson(
        this,
        `/workspaces/${encodeURIComponent(currentWorkspaceId)}/leave`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body)
        },
        "Failed to leave the workspace."
      );
      if (!result.ok) return;

      const leaveBody = result.body as LeaveWorkspaceResponse;
      await applyWorkspaceScope(this, "personal", null);
      await this.refreshWorkspaces();

      this.showLeaveWorkspaceModal = false;
      this.showWorkspaceMembersModal = false;
      this.workspaceMembers = [];
      this.leaveWorkspaceTransferMemberUserId = "";
      this.leaveWorkspaceDeleteConfirmation = false;

      if (leaveBody.deletedWorkspace === true) {
        this.notify("Workspace deleted", "success");
      } else if (typeof leaveBody.newOwnerUserId === "string" && leaveBody.newOwnerUserId.trim()) {
        this.notify("Ownership transferred and workspace left", "success");
      } else {
        this.notify("Workspace left", "success");
      }
    } finally {
      this.isLeavingWorkspace = false;
    }
  },

  async removeWorkspaceMember(memberUserId: string): Promise<void> {
    if (!this.activeWorkspaceId) return;
    const normalizedUserId = String(memberUserId || "").trim();
    if (!normalizedUserId) return;

    const result = await fetchWorkspaceJson(
      this,
      `/workspaces/${encodeURIComponent(this.activeWorkspaceId)}/members/${encodeURIComponent(normalizedUserId)}`,
      {
        method: "DELETE"
      },
      "Failed to remove workspace member."
    );
    if (!result.ok) return;

    this.workspaceMembers = this.workspaceMembers.filter((member) => member.userId !== normalizedUserId);
    this.leaveWorkspaceTransferMemberUserId = getTransferCandidates(this)[0]?.userId ?? "";
    this.notify("Member removed", "success");
  },

  async handleWorkspaceAccessLost(workspaceId?: string): Promise<void> {
    const lostWorkspaceId = String(workspaceId ?? this.activeWorkspaceId ?? "").trim();
    await this.refreshWorkspaces();

    if (!lostWorkspaceId) return;
    if (this.availableWorkspaces.some((workspace) => workspace.workspaceId === lostWorkspaceId)) {
      return;
    }

    if (this.activeScopeType === "workspace" && this.activeWorkspaceId === lostWorkspaceId) {
      await applyWorkspaceScope(this, "personal", null);
    }

    this.notify("You no longer have access to that workspace. Switched back to Personal.", "warning");
  }
};
