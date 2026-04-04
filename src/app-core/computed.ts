import type { AppComputedObject } from "./context-contracts.ts";
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
import { compareLocalizedText, translateAppMessage } from "./i18n/index.ts";

const WORKSPACE_AVATAR_STACK_LIMIT = 3;
const WORKSPACE_MEMBER_RECENT_WINDOW_MS = 10 * 60 * 1000;

function getWorkspacePresenceStateForUser(
  presenceByUserId: Record<string, { isOnline: boolean; lastSeenAt?: string }>,
  userId: string,
  options?: {
    currentUserId?: string;
    workspaceRealtimeStatus?: WorkspaceRealtimeStatus;
  }
): WorkspacePresenceState {
  const presence = presenceByUserId[userId];
  if (!presence) {
    const currentUserId = String(options?.currentUserId || "").trim();
    if (
      currentUserId
      && currentUserId === userId
      && options?.workspaceRealtimeStatus === "connected"
    ) {
      return "online";
    }
    return "offline";
  }
  if (presence.isOnline) return "online";

  const lastSeenAt = Date.parse(String(presence.lastSeenAt || ""));
  if (Number.isFinite(lastSeenAt) && (Date.now() - lastSeenAt) <= WORKSPACE_MEMBER_RECENT_WINDOW_MS) {
    return "recent";
  }

  return "offline";
}

function sortWorkspaceMembersForAvatarStack(
  members: WorkspaceMember[],
  presenceByUserId: Record<string, { isOnline: boolean; lastSeenAt?: string }>,
  options?: {
    currentUserId?: string;
    workspaceRealtimeStatus?: WorkspaceRealtimeStatus;
  },
  preferredLanguage?: string
): WorkspaceMember[] {
  return [...members].sort((left, right) => {
    const leftPresence = getWorkspacePresenceStateForUser(presenceByUserId, left.userId, options);
    const rightPresence = getWorkspacePresenceStateForUser(presenceByUserId, right.userId, options);
    const presenceRank = { online: 0, recent: 1, offline: 2 } as const;
    if (leftPresence !== rightPresence) {
      return presenceRank[leftPresence] - presenceRank[rightPresence];
    }

    if (left.role !== right.role) {
      return left.role === "owner" ? -1 : 1;
    }

    return compareLocalizedText(
      String(left.displayName || left.userId),
      String(right.displayName || right.userId),
      preferredLanguage
    );
  });
}

function getWorkspaceRealtimeDisplay(
  status: WorkspaceRealtimeStatus,
  preferredLanguage: string
): { title: string; subtitle: string; icon: string } {
  if (status === "connected") {
    return {
      title: translateAppMessage(preferredLanguage, "workspaceRealtimeConnectedTitle"),
      subtitle: translateAppMessage(preferredLanguage, "workspaceRealtimeConnectedSubtitle"),
      icon: "mdi-lan-connect"
    };
  }
  if (status === "connecting") {
    return {
      title: translateAppMessage(preferredLanguage, "workspaceRealtimeConnectingTitle"),
      subtitle: translateAppMessage(preferredLanguage, "workspaceRealtimeConnectingSubtitle"),
      icon: "mdi-sync"
    };
  }
  if (status === "reconnecting") {
    return {
      title: translateAppMessage(preferredLanguage, "workspaceRealtimeReconnectingTitle"),
      subtitle: translateAppMessage(preferredLanguage, "workspaceRealtimeReconnectingSubtitle"),
      icon: "mdi-sync"
    };
  }
  if (status === "disconnected") {
    return {
      title: translateAppMessage(preferredLanguage, "workspaceRealtimeDisconnectedTitle"),
      subtitle: translateAppMessage(preferredLanguage, "workspaceRealtimeDisconnectedSubtitle"),
      icon: "mdi-lan-disconnect"
    };
  }
  return {
    title: translateAppMessage(preferredLanguage, "workspaceRealtimeIdleTitle"),
    subtitle: translateAppMessage(preferredLanguage, "workspaceRealtimeIdleSubtitle"),
    icon: "mdi-lan-disconnect"
  };
}

function getSyncStatusDisplay(status: SyncStatus, preferredLanguage: string): { title: string; subtitle: string; icon: string } {
  if (status === "syncing") {
    return {
      title: translateAppMessage(preferredLanguage, "syncingTitle"),
      subtitle: translateAppMessage(preferredLanguage, "syncingSubtitle"),
      icon: "mdi-sync"
    };
  }
  if (status === "success") {
    return {
      title: translateAppMessage(preferredLanguage, "syncedSuccessfullyTitle"),
      subtitle: translateAppMessage(preferredLanguage, "syncedSuccessfullySubtitle"),
      icon: "mdi-check-circle-outline"
    };
  }
  if (status === "error") {
    return {
      title: translateAppMessage(preferredLanguage, "reviewSyncStatusTitle"),
      subtitle: translateAppMessage(preferredLanguage, "reviewSyncStatusSubtitle"),
      icon: "mdi-alert-circle-outline"
    };
  }
  return {
    title: translateAppMessage(preferredLanguage, "checkSyncStatusTitle"),
    subtitle: translateAppMessage(preferredLanguage, "checkSyncStatusSubtitle"),
    icon: "mdi-sync"
  };
}

function getWhatnotConnectionDisplay(
  connectionStatus: WhatnotConnectionStatus,
  syncStatus: WhatnotSyncStatus,
  connected: boolean,
  displayName: string,
  pendingReviewCount: number,
  activeScopeType: "personal" | "workspace",
  preferredLanguage: string
): { title: string; subtitle: string; icon: string } {
  let title = translateAppMessage(preferredLanguage, "whatnotNeedsAttentionTitle");
  if (connectionStatus === "connected") title = translateAppMessage(preferredLanguage, "whatnotConnectedTitle");
  else if (connectionStatus === "connecting") title = translateAppMessage(preferredLanguage, "whatnotConnectingTitle");
  else if (connectionStatus === "disconnected") title = translateAppMessage(preferredLanguage, "whatnotDisconnectedTitle");

  let subtitle = activeScopeType === "workspace"
    ? translateAppMessage(preferredLanguage, "whatnotSharedWorkspaceSubtitle")
    : translateAppMessage(preferredLanguage, "whatnotPersonalSubtitle");
  if (connected) {
    subtitle = translateAppMessage(preferredLanguage, "whatnotConnectedSummary", {
      name: displayName || "Connected seller",
      pendingCountSuffix: pendingReviewCount > 0 ? ` • ${pendingReviewCount} pending review${pendingReviewCount === 1 ? "" : "s"}` : ""
    });
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

    return translateAppMessage(this.preferredLanguage, "personalWorkspaceName");
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
      : translateAppMessage(this.preferredLanguage, "personalLabel");
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
      this.workspacePresenceByUserId,
      {
        currentUserId: this.googleProfileUserId,
        workspaceRealtimeStatus: this.workspaceRealtimeStatus
      },
      this.preferredLanguage
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
    return getWorkspaceRealtimeDisplay(this.workspaceRealtimeStatus, this.preferredLanguage).title;
  },
  workspaceRealtimeSubtitle() {
    return getWorkspaceRealtimeDisplay(this.workspaceRealtimeStatus, this.preferredLanguage).subtitle;
  },
  workspaceRealtimeIcon() {
    return getWorkspaceRealtimeDisplay(this.workspaceRealtimeStatus, this.preferredLanguage).icon;
  },
  syncStatusTitle() {
    return getSyncStatusDisplay(this.syncStatus, this.preferredLanguage).title;
  },
  syncStatusSubtitle() {
    return getSyncStatusDisplay(this.syncStatus, this.preferredLanguage).subtitle;
  },
  syncStatusIcon() {
    return getSyncStatusDisplay(this.syncStatus, this.preferredLanguage).icon;
  },
  whatnotConnectionTitle() {
    return getWhatnotConnectionDisplay(
      this.whatnotConnectionStatus,
      this.whatnotSyncStatus,
      this.whatnotConnectionSummary?.connected === true,
      this.whatnotConnectionSummary?.displayName || "",
      this.whatnotConnectionSummary?.pendingReviewCount || 0,
      this.activeScopeType,
      this.preferredLanguage
    ).title;
  },
  whatnotConnectionSubtitle() {
    return getWhatnotConnectionDisplay(
      this.whatnotConnectionStatus,
      this.whatnotSyncStatus,
      this.whatnotConnectionSummary?.connected === true,
      this.whatnotConnectionSummary?.displayName || "",
      this.whatnotConnectionSummary?.pendingReviewCount || 0,
      this.activeScopeType,
      this.preferredLanguage
    ).subtitle;
  },
  whatnotConnectionIcon() {
    return getWhatnotConnectionDisplay(
      this.whatnotConnectionStatus,
      this.whatnotSyncStatus,
      this.whatnotConnectionSummary?.connected === true,
      this.whatnotConnectionSummary?.displayName || "",
      this.whatnotConnectionSummary?.pendingReviewCount || 0,
      this.activeScopeType,
      this.preferredLanguage
    ).icon;
  },
  whatnotConnectActionTitle() {
    return this.whatnotConnectionStatus === "connecting"
      ? translateAppMessage(this.preferredLanguage, "connectingWhatnotActionTitle")
      : translateAppMessage(this.preferredLanguage, "connectWhatnotActionTitle");
  },
  whatnotSyncActionTitle() {
    return this.whatnotSyncStatus === "syncing"
      ? translateAppMessage(this.preferredLanguage, "syncingWhatnotSalesActionTitle")
      : translateAppMessage(this.preferredLanguage, "syncWhatnotSalesActionTitle");
  },
  pendingWorkspaceInviteTargetName() {
    return this.pendingWorkspaceInviteWorkspaceName
      || this.pendingWorkspaceInviteWorkspaceId
      || translateAppMessage(this.preferredLanguage, "pendingWorkspaceInviteTargetName");
  },
  authGateTitle() {
    return this.pendingWorkspaceInviteToken
      ? translateAppMessage(this.preferredLanguage, "signInToJoinWorkspace")
      : translateAppMessage(this.preferredLanguage, "signInToContinue");
  },
  authGateSubtitle() {
    return this.pendingWorkspaceInviteToken
      ? translateAppMessage(this.preferredLanguage, "signInToJoinWorkspaceSubtitle")
      : translateAppMessage(this.preferredLanguage, "authGateSubtitle");
  },
  ...singlesComputed,
  ...forecastComputed,
  ...portfolioComputed
};

