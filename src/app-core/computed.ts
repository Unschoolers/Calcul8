import type { AppComputedObject } from "./context.ts";
import { authProfileComputed } from "./computed/auth-profile.ts";
import { singlesComputed } from "./computed/singles.ts";
import { forecastComputed } from "./computed/forecast.ts";
import { portfolioComputed } from "./computed/portfolio.ts";
import type {
  SyncStatus,
  WhatnotConnectionStatus,
  WhatnotSyncStatus,
  WorkspaceMember,
  WorkspacePresenceState,
  WorkspaceRealtimeStatus
} from "../types/app.ts";

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

function getWorkspaceRealtimeDisplay(status: WorkspaceRealtimeStatus): { title: string; subtitle: string; icon: string } {
  if (status === "connected") {
    return {
      title: "Workspace realtime connected",
      subtitle: "Live workspace updates are active",
      icon: "mdi-lan-connect"
    };
  }
  if (status === "connecting") {
    return {
      title: "Workspace realtime connecting",
      subtitle: "Opening realtime connection",
      icon: "mdi-sync"
    };
  }
  if (status === "reconnecting") {
    return {
      title: "Workspace realtime reconnecting",
      subtitle: "Retrying with backoff",
      icon: "mdi-sync"
    };
  }
  if (status === "disconnected") {
    return {
      title: "Workspace realtime disconnected",
      subtitle: "Last realtime attempt failed",
      icon: "mdi-lan-disconnect"
    };
  }
  return {
    title: "Workspace realtime idle",
    subtitle: "Realtime not active for this view",
    icon: "mdi-lan-disconnect"
  };
}

function getSyncStatusDisplay(status: SyncStatus): { title: string; subtitle: string; icon: string } {
  if (status === "syncing") {
    return {
      title: "Syncing",
      subtitle: "Cloud sync in progress",
      icon: "mdi-sync"
    };
  }
  if (status === "success") {
    return {
      title: "Re-check Pro access",
      subtitle: "Synced successfully",
      icon: "mdi-check-circle-outline"
    };
  }
  if (status === "error") {
    return {
      title: "Review sync status",
      subtitle: "Last sync needs attention",
      icon: "mdi-alert-circle-outline"
    };
  }
  return {
    title: "Check sync status",
    subtitle: "",
    icon: "mdi-sync"
  };
}

function getWhatnotConnectionDisplay(
  connectionStatus: WhatnotConnectionStatus,
  syncStatus: WhatnotSyncStatus,
  connected: boolean,
  displayName: string,
  pendingReviewCount: number,
  activeScopeType: "personal" | "workspace"
): { title: string; subtitle: string; icon: string } {
  let title = "Whatnot needs attention";
  if (connectionStatus === "connected") title = "Whatnot connected";
  else if (connectionStatus === "connecting") title = "Connecting Whatnot";
  else if (connectionStatus === "disconnected") title = "Whatnot disconnected";

  let subtitle = activeScopeType === "workspace"
    ? "Connect your Whatnot account for this shared workspace"
    : "Connect your Whatnot account to import orders into Personal";
  if (connected) {
    subtitle = `${displayName || "Connected seller"}${pendingReviewCount > 0 ? ` • ${pendingReviewCount} pending review` : ""}`;
  }

  const icon = connectionStatus === "connected"
    ? "mdi-shopping"
    : ((connectionStatus === "connecting" || syncStatus === "syncing")
      ? "mdi-sync"
      : "mdi-shopping-outline");

  return { title, subtitle, icon };
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
  scopeChipClass() {
    return this.activeScopeType === "workspace"
      ? "app-bar-scope-chip--workspace"
      : "app-bar-scope-chip--personal";
  },
  scopeChipIcon() {
    return this.activeScopeType === "workspace"
      ? "mdi-account-group-outline"
      : "mdi-home-account";
  },
  scopeChipLabel() {
    return this.activeScopeType === "workspace"
      ? this.currentWorkspaceName
      : "Personal";
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
  accountSyncBadgeVisible() {
    return (this.isWorkspaceScopeActive && this.workspaceRealtimeStatus !== "idle")
      || (!this.isWorkspaceScopeActive && this.syncStatus !== "idle");
  },
  accountSyncBadgeClass() {
    if (this.isWorkspaceScopeActive) {
      if (this.workspaceRealtimeStatus === "connected") return "account-menu-sync-badge--success";
      if (this.workspaceRealtimeStatus === "disconnected") return "account-menu-sync-badge--error";
      return "account-menu-sync-badge--syncing";
    }
    if (this.syncStatus === "syncing") return "account-menu-sync-badge--syncing";
    if (this.syncStatus === "success") return "account-menu-sync-badge--success";
    return "account-menu-sync-badge--error";
  },
  accountSyncIcon() {
    if (this.isWorkspaceScopeActive) {
      return (this.workspaceRealtimeStatus === "connecting" || this.workspaceRealtimeStatus === "reconnecting")
        ? "mdi-sync"
        : (this.workspaceRealtimeStatus === "connected" ? "mdi-check-bold" : "mdi-alert");
    }
    return this.syncStatus === "syncing"
      ? "mdi-sync"
      : (this.syncStatus === "success" ? "mdi-check-bold" : "mdi-alert");
  },
  accountSyncIconSize() {
    const isSpinning = (this.isWorkspaceScopeActive
      && (this.workspaceRealtimeStatus === "connecting" || this.workspaceRealtimeStatus === "reconnecting"))
      || (!this.isWorkspaceScopeActive && this.syncStatus === "syncing");
    return isSpinning ? 10 : 11;
  },
  accountSyncIconClass() {
    const isSpinning = (this.isWorkspaceScopeActive
      && (this.workspaceRealtimeStatus === "connecting" || this.workspaceRealtimeStatus === "reconnecting"))
      || (!this.isWorkspaceScopeActive && this.syncStatus === "syncing");
    return isSpinning ? "sync-spinning" : "";
  },
  workspaceRealtimeTitle() {
    return getWorkspaceRealtimeDisplay(this.workspaceRealtimeStatus).title;
  },
  workspaceRealtimeSubtitle() {
    return getWorkspaceRealtimeDisplay(this.workspaceRealtimeStatus).subtitle;
  },
  workspaceRealtimeIcon() {
    return getWorkspaceRealtimeDisplay(this.workspaceRealtimeStatus).icon;
  },
  syncStatusTitle() {
    return getSyncStatusDisplay(this.syncStatus).title;
  },
  syncStatusSubtitle() {
    return getSyncStatusDisplay(this.syncStatus).subtitle;
  },
  syncStatusIcon() {
    return getSyncStatusDisplay(this.syncStatus).icon;
  },
  whatnotConnectionTitle() {
    return getWhatnotConnectionDisplay(
      this.whatnotConnectionStatus,
      this.whatnotSyncStatus,
      this.whatnotConnectionSummary?.connected === true,
      this.whatnotConnectionSummary?.displayName || "",
      this.whatnotConnectionSummary?.pendingReviewCount || 0,
      this.activeScopeType
    ).title;
  },
  whatnotConnectionSubtitle() {
    return getWhatnotConnectionDisplay(
      this.whatnotConnectionStatus,
      this.whatnotSyncStatus,
      this.whatnotConnectionSummary?.connected === true,
      this.whatnotConnectionSummary?.displayName || "",
      this.whatnotConnectionSummary?.pendingReviewCount || 0,
      this.activeScopeType
    ).subtitle;
  },
  whatnotConnectionIcon() {
    return getWhatnotConnectionDisplay(
      this.whatnotConnectionStatus,
      this.whatnotSyncStatus,
      this.whatnotConnectionSummary?.connected === true,
      this.whatnotConnectionSummary?.displayName || "",
      this.whatnotConnectionSummary?.pendingReviewCount || 0,
      this.activeScopeType
    ).icon;
  },
  whatnotConnectActionTitle() {
    return this.whatnotConnectionStatus === "connecting"
      ? "Connecting Whatnot..."
      : "Connect Whatnot";
  },
  whatnotSyncActionTitle() {
    return this.whatnotSyncStatus === "syncing"
      ? "Syncing Whatnot sales..."
      : "Sync Whatnot sales";
  },
  pendingWorkspaceInviteTargetName() {
    return this.pendingWorkspaceInviteWorkspaceName || this.pendingWorkspaceInviteWorkspaceId || "this workspace";
  },
  authGateTitle() {
    return this.pendingWorkspaceInviteToken ? "Sign in to join workspace" : "Sign in to continue";
  },
  authGateSubtitle() {
    return this.pendingWorkspaceInviteToken
      ? "Use your Google account to accept this workspace invite and keep your Personal workspace too."
      : "Your lots, cloud sync, and Pro access are tied to your Google account.";
  },
  ...singlesComputed,
  ...forecastComputed,
  ...portfolioComputed
};
