import type { AppContext, AppMethodState } from "../../context.ts";
import { fetchWithRetry, GOOGLE_TOKEN_KEY, handleExpiredAuth, resolveApiBaseUrl } from "./shared.ts";
import { createSyncPayload } from "./sync-payload.ts";
import { runCloudSyncPush } from "./sync-service.ts";
import { buildAuthenticatedHeaders, getStoredGoogleIdToken } from "../../auth/index.ts";
import {
  getLegacyStorageKeys,
  STORAGE_KEYS
} from "../../storageKeys.ts";
import type { WorkspaceMember, WorkspaceSummary } from "../../../types/app.ts";
import {
  formatRelativeLastSeen,
  getTransferCandidates,
  getWorkspaceMemberPresenceStateFromApp,
  loadWorkspaceMembers
} from "./workspace-members.ts";
import {
  applyWorkspaceScope,
  clearInviteQueryParam,
  JoinPreviewResponse,
  LeaveWorkspaceResponse,
  normalizeWorkspaceSummaries,
  parseWorkspaceApiError,
  resetPendingWorkspaceInviteState,
  type WorkspaceCreateResponse,
  type WorkspaceJoinLinkResponse,
  type WorkspaceListResponse
} from "./workspace-ui-helpers.ts";

const LEGACY_KEYS = getLegacyStorageKeys();

function getGoogleIdToken(): string {
  return getStoredGoogleIdToken();
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

  let response: Response;
  try {
    const requestUrl = `${baseUrl}${path}`;
    response = await fetchWithRetry(requestUrl, {
      ...init,
      headers: buildAuthenticatedHeaders(
        "session-preferred",
        init.headers as Record<string, string> | undefined,
        requestUrl
      )
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const isOfflineFailure =
      message.includes("Failed to fetch")
      || message.includes("NetworkError")
      || message.includes("Load failed")
      || message.includes("fetch");
    app.notify(
      isOfflineFailure
        ? "You're offline. Workspace data will refresh when the connection returns."
        : fallbackMessage,
      "warning"
    );
    return { ok: false, handled: true };
  }

  if (response.status === 401) {
    handleExpiredAuth(app);
    app.notify("Your sign-in expired. Please sign in again.", "warning");
    return { ok: false, handled: true };
  }

  if (!response.ok) {
    app.notify(await parseWorkspaceApiError(response, fallbackMessage), "error");
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
  | "getWorkspaceMemberPresenceState"
  | "getWorkspaceMemberPresenceLabel"
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
          pullFromCloud: false,
          getGoogleIdToken
        });
      } else if (this.activeScopeType === "workspace" && this.activeWorkspaceId) {
        void loadWorkspaceMembers(this, {
          setLoadingState: false,
          expireAuthOn401: false
        });
      }
    } finally {
      this.isWorkspaceLoading = false;
    }
  },

  async switchToPersonalWorkspace(): Promise<void> {
    this.isWorkspaceLoading = true;
    try {
      await applyWorkspaceScope(this, "personal", null, { getGoogleIdToken });
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
      await applyWorkspaceScope(this, "workspace", normalizedWorkspaceId, { getGoogleIdToken });
      await loadWorkspaceMembers(this, {
        setLoadingState: false,
        expireAuthOn401: false
      });
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
        wheelConfigs: this.wheelConfigs,
        activeWheelConfigId: this.activeWheelConfigId,
        workspaceId: createdWorkspaceId
      });

      await runCloudSyncPush(
        this,
        true,
        {
          resolveApiBaseUrl: () => baseUrl,
          createSyncPayload: () => seedPayload,
          hasStorageItem: () => true
        },
        {
          scopeOverride: {
            scopeType: "workspace",
            workspaceId: createdWorkspaceId
          },
          treatConflictAsSuccess: true
        }
      );

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

    this.showWorkspaceMembersModal = true;
    await loadWorkspaceMembers(this, {
      resetBeforeLoad: true,
      setLoadingState: true,
      expireAuthOn401: false
    });
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
      await applyWorkspaceScope(this, "personal", null, { getGoogleIdToken });
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
      await applyWorkspaceScope(this, "personal", null, { getGoogleIdToken });
    }

    this.notify("You no longer have access to that workspace. Switched back to Personal.", "warning");
  },

  getWorkspaceMemberPresenceState(member: Pick<WorkspaceMember, "userId">): "online" | "recent" | "offline" {
    return getWorkspaceMemberPresenceStateFromApp(this, member);
  },

  getWorkspaceMemberPresenceLabel(member: Pick<WorkspaceMember, "userId">): string {
    const state = getWorkspaceMemberPresenceStateFromApp(this, member);
    if (state === "online") return "Online now";

    const presence = this.workspacePresenceByUserId[String(member.userId || "").trim()];
    if (state === "recent") {
      return formatRelativeLastSeen(presence?.lastSeenAt);
    }

    return "Offline";
  }
};
