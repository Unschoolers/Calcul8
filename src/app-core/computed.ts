import type { AppComputedObject } from "./context.ts";
import { authProfileComputed } from "./computed/auth-profile.ts";
import { singlesComputed } from "./computed/singles.ts";
import { forecastComputed } from "./computed/forecast.ts";
import { portfolioComputed } from "./computed/portfolio.ts";
import type { WorkspaceMember, WorkspacePresenceState } from "../types/app.ts";

const WORKSPACE_AVATAR_STACK_LIMIT = 3;
const WORKSPACE_MEMBER_RECENT_WINDOW_MS = 10 * 60 * 1000;

function getWorkspacePresenceStateForUser(
  presenceByUserId: Record<string, { isOnline: boolean; lastSeenAt?: string }>,
  userId: string
): WorkspacePresenceState {
  const presence = presenceByUserId[userId];
  if (!presence) return "offline";
  if (presence.isOnline) return "online";

  const lastSeenAt = Date.parse(String(presence.lastSeenAt || ""));
  if (Number.isFinite(lastSeenAt) && (Date.now() - lastSeenAt) <= WORKSPACE_MEMBER_RECENT_WINDOW_MS) {
    return "recent";
  }

  return "offline";
}

function sortWorkspaceMembersForAvatarStack(
  members: WorkspaceMember[],
  presenceByUserId: Record<string, { isOnline: boolean; lastSeenAt?: string }>
): WorkspaceMember[] {
  return [...members].sort((left, right) => {
    const leftPresence = getWorkspacePresenceStateForUser(presenceByUserId, left.userId);
    const rightPresence = getWorkspacePresenceStateForUser(presenceByUserId, right.userId);
    const presenceRank = { online: 0, recent: 1, offline: 2 } as const;
    if (leftPresence !== rightPresence) {
      return presenceRank[leftPresence] - presenceRank[rightPresence];
    }

    if (left.role !== right.role) {
      return left.role === "owner" ? -1 : 1;
    }

    const leftName = (left.displayName || left.userId).toLocaleLowerCase();
    const rightName = (right.displayName || right.userId).toLocaleLowerCase();
    return leftName.localeCompare(rightName);
  });
}

export const appComputed: AppComputedObject = {
  ...authProfileComputed,
  isWorkspaceScopeActive() {
    return this.activeScopeType === "workspace" && !!this.activeWorkspaceId;
  },
  currentWorkspaceSummary() {
    if (this.activeScopeType !== "workspace" || !this.activeWorkspaceId) {
      return null;
    }

    return this.availableWorkspaces.find((workspace) => workspace.workspaceId === this.activeWorkspaceId) ?? null;
  },
  currentWorkspaceName() {
    if (this.currentWorkspaceSummary) {
      return this.currentWorkspaceSummary.name;
    }

    return "Personal";
  },
  isCurrentWorkspaceOwner() {
    return this.currentWorkspaceSummary?.role === "owner";
  },
  activeWorkspaceVisibleMembers() {
    if (!this.isWorkspaceScopeActive) {
      return [];
    }

    return sortWorkspaceMembersForAvatarStack(
      this.workspaceMembers.filter((member) => member.status === "active"),
      this.workspacePresenceByUserId
    ).slice(0, WORKSPACE_AVATAR_STACK_LIMIT);
  },
  activeWorkspaceOverflowMemberCount() {
    if (!this.isWorkspaceScopeActive) {
      return 0;
    }

    return Math.max(
      0,
      this.workspaceMembers.filter((member) => member.status === "active").length - WORKSPACE_AVATAR_STACK_LIMIT
    );
  },
  ...singlesComputed,
  ...forecastComputed,
  ...portfolioComputed
};
