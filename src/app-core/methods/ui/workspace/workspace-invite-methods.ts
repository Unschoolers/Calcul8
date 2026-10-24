import type { WorkspaceInviteMethodImplementation } from "../../../context/workspace.ts";
import {
  clearInviteQueryParam,
  resetPendingWorkspaceInviteState,
  type JoinPreviewResponse,
  type WorkspaceJoinLinkResponse
} from "./workspace-ui-helpers.ts";
import { fetchWorkspaceJson } from "./workspace-api.ts";
import { translateAppMessage } from "../../../i18n/index.ts";

export const uiWorkspaceInviteMethods = {
  async createWorkspaceJoinLink(): Promise<void> {
    if (!this.activeWorkspaceId) {
      this.notify(translateAppMessage(this.preferredLanguage, "workspaceInviteRequiresSharedNotice"), "warning");
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
        translateAppMessage(this.preferredLanguage, "workspaceInviteCreateFailedNotice")
      );
      if (!result.ok) return;

      const body = result.body as WorkspaceJoinLinkResponse;
      const invitePath = String(body.inviteUrl ?? "").trim();
      if (!invitePath) {
        this.notify(translateAppMessage(this.preferredLanguage, "workspaceInviteLinkMissingUrlNotice"), "warning");
        return;
      }

      const absoluteInviteUrl = invitePath.startsWith("http")
        ? invitePath
        : `${window.location.origin}${invitePath}`;

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(absoluteInviteUrl);
        this.notify(translateAppMessage(this.preferredLanguage, "workspaceInviteCopiedNotice"), "success");
        return;
      }

      window.prompt(translateAppMessage(this.preferredLanguage, "workspaceInvitePromptTitle"), absoluteInviteUrl);
      this.notify(translateAppMessage(this.preferredLanguage, "workspaceInviteReadyNotice"), "success");
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
        translateAppMessage(this.preferredLanguage, "workspaceInvitePreviewFailedNotice")
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
        translateAppMessage(this.preferredLanguage, "workspaceJoinFailedNotice")
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
        workspaceName
          ? translateAppMessage(this.preferredLanguage, "workspaceJoinedNotice", { name: workspaceName })
          : translateAppMessage(this.preferredLanguage, "workspaceJoinCompleteNotice"),
        "success"
      );
    } finally {
      this.isAcceptingWorkspaceInvite = false;
    }
  },

  dismissPendingWorkspaceInvite(): void {
    resetPendingWorkspaceInviteState(this);
    clearInviteQueryParam();
  }
} satisfies WorkspaceInviteMethodImplementation;
