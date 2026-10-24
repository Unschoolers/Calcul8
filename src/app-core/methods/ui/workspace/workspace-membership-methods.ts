import type { WorkspaceMembershipMethodImplementation } from "../../../context/workspace.ts";
import type { WorkspaceMember } from "../../../../types/app.ts";
import {
  formatRelativeLastSeen,
  getTransferCandidates,
  getWorkspaceMemberPresenceStateFromApp,
  loadWorkspaceMembers
} from "./workspace-members.ts";
import {
  applyWorkspaceScope,
  type LeaveWorkspaceResponse
} from "./workspace-ui-helpers.ts";
import { fetchWorkspaceJson, getGoogleIdToken } from "./workspace-api.ts";
import { translateAppMessage } from "../../../i18n/index.ts";

export const uiWorkspaceMembershipMethods = {
  async openWorkspaceMembersModal(): Promise<void> {
    if (!this.activeWorkspaceId) {
      this.notify(translateAppMessage(this.preferredLanguage, "workspaceLeaveRequiresSharedNotice"), "warning");
      return;
    }

    this.showWorkspaceMembersModal = true;
    await loadWorkspaceMembers(this, {
      resetBeforeLoad: true,
      setLoadingState: true,
      expireAuthOn401: false
    });
  },

  async openLeaveWorkspaceModal(): Promise<void> {
    if (!this.activeWorkspaceId) {
      this.notify(translateAppMessage(this.preferredLanguage, "workspaceLeaveRequiresSharedNotice"), "warning");
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
          this.notify(translateAppMessage(this.preferredLanguage, "workspaceChooseNewOwnerNotice"), "warning");
          return;
        }
        body.newOwnerUserId = this.leaveWorkspaceTransferMemberUserId;
      } else if (!this.leaveWorkspaceDeleteConfirmation) {
        this.notify(translateAppMessage(this.preferredLanguage, "workspaceConfirmDeleteNotice"), "warning");
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
        translateAppMessage(this.preferredLanguage, "workspaceLeaveFailedNotice")
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
        this.notify(translateAppMessage(this.preferredLanguage, "workspaceDeletedNotice"), "success");
      } else if (typeof leaveBody.newOwnerUserId === "string" && leaveBody.newOwnerUserId.trim()) {
        this.notify(translateAppMessage(this.preferredLanguage, "workspaceOwnershipTransferredAndLeftNotice"), "success");
      } else {
        this.notify(translateAppMessage(this.preferredLanguage, "workspaceLeftNotice"), "success");
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
      translateAppMessage(this.preferredLanguage, "workspaceRemoveMemberFailedNotice")
    );
    if (!result.ok) return;

    this.workspaceMembers = this.workspaceMembers.filter((member) => member.userId !== normalizedUserId);
    this.leaveWorkspaceTransferMemberUserId = getTransferCandidates(this)[0]?.userId ?? "";
    this.notify(translateAppMessage(this.preferredLanguage, "workspaceMemberRemovedNotice"), "success");
  },

  getWorkspaceMemberPresenceState(member: Pick<WorkspaceMember, "userId">): "online" | "recent" | "offline" {
    return getWorkspaceMemberPresenceStateFromApp(this, member);
  },

  getWorkspaceMemberPresenceLabel(member: Pick<WorkspaceMember, "userId">): string {
    const state = getWorkspaceMemberPresenceStateFromApp(this, member);
    if (state === "online") return translateAppMessage(this.preferredLanguage, "workspacePresenceOnline");

    const presence = this.workspacePresenceByUserId[String(member.userId || "").trim()];
    if (state === "recent") {
      return formatRelativeLastSeen(presence?.lastSeenAt, this.preferredLanguage);
    }

    return translateAppMessage(this.preferredLanguage, "workspacePresenceOffline");
  }
} satisfies WorkspaceMembershipMethodImplementation;
