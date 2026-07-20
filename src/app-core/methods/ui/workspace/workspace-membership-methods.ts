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

export const uiWorkspaceMembershipMethods = {
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
} satisfies WorkspaceMembershipMethodImplementation;
