import type {
  BuyerProfile,
  WorkspaceMember,
  WorkspacePresenceState,
  WorkspaceSummary
} from "../../types/app.ts";

export interface WorkspaceComputedState {
  isWorkspaceScopeActive: boolean;
  currentWorkspaceSummary: WorkspaceSummary | null;
  currentWorkspaceName: string;
  scopeChipClass: string;
  scopeChipIcon: string;
  scopeChipLabel: string;
  isCurrentWorkspaceOwner: boolean;
  activeWorkspaceVisibleMembers: WorkspaceMember[];
  activeWorkspaceOverflowMemberCount: number;
  accountSyncBadgeVisible: boolean;
  accountSyncBadgeClass: string;
  accountSyncIcon: string;
  accountSyncIconSize: number;
  accountSyncIconClass: string;
  workspaceRealtimeTitle: string;
  workspaceRealtimeSubtitle: string;
  workspaceRealtimeIcon: string;
  workspaceRealtimeManualRefreshVisible: boolean;
  workspaceRealtimeManualRefreshLabel: string;
  syncStatusTitle: string;
  syncStatusSubtitle: string;
  syncStatusIcon: string;
  pendingWorkspaceInviteTargetName: string;
  authGateTitle: string;
  authGateSubtitle: string;
}

export interface WorkspaceMethodState {
  pullCloudSync(forceApply?: boolean): Promise<void>;
  pushCloudSync(force?: boolean, options?: { allowEmptyOverwrite?: boolean }): Promise<void>;
  startCloudSyncScheduler(): void;
  stopCloudSyncScheduler(): void;
  refreshWorkspaces(): Promise<boolean>;
  switchToPersonalWorkspace(): Promise<void>;
  switchToWorkspace(workspaceId: string): Promise<void>;
  createWorkspace(): Promise<void>;
  openWorkspaceMembersModal(): Promise<void>;
  createWorkspaceJoinLink(): Promise<void>;
  previewPendingWorkspaceInvite(): Promise<void>;
  acceptPendingWorkspaceInvite(): Promise<void>;
  dismissPendingWorkspaceInvite(): void;
  openLeaveWorkspaceModal(): Promise<void>;
  leaveCurrentWorkspace(): Promise<void>;
  removeWorkspaceMember(memberUserId: string): Promise<void>;
  handleWorkspaceAccessLost(workspaceId?: string): Promise<void>;
  recoverWorkspaceRealtimeNow(): Promise<void>;
  getWorkspaceMemberPresenceState(member: Pick<WorkspaceMember, "userId">): WorkspacePresenceState;
  getWorkspaceMemberPresenceLabel(member: Pick<WorkspaceMember, "userId">): string;
  hydrateBuyerProfiles(): Promise<void>;
  getBuyerProfile(username: string): BuyerProfile | null;
  saveBuyerProfile(draft: { username: string; preferredName?: string; tags: string[] }): Promise<"saved" | "pending" | "conflict" | "error">;
  retryPendingBuyerProfiles(): Promise<void>;
  resolveBuyerProfileConflict(username: string, strategy: "retry" | "reload"): Promise<"saved" | "pending" | "error" | "reloaded">;
}
