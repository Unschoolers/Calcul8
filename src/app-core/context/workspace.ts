import type {
  AppState,
  WorkspaceMember,
  WorkspacePresenceState,
  WorkspaceSummary
} from "../../types/app.ts";
import type { AuthComputedState, AuthSessionBootstrapContext } from "./auth.ts";
import type { BuyerMethodState } from "./buyers.ts";
import type { CommerceMethodState } from "./commerce.ts";
import type { GameMethodState, GameSessionStateContext } from "./game.ts";
import type { RuntimeMethodState, FeatureMethodImplementation } from "./runtime.ts";
import type { SyncMethodState, SyncServiceContext } from "./sync.ts";

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
  workspaceRealtimeTitle: string;
  workspaceRealtimeSubtitle: string;
  workspaceRealtimeIcon: string;
  workspaceRealtimeManualRefreshVisible: boolean;
  workspaceRealtimeManualRefreshLabel: string;
  pendingWorkspaceInviteTargetName: string;
  authGateTitle: string;
  authGateSubtitle: string;
}

export type WorkspaceComputedContext = Pick<
  AppState,
  | "activeScopeType"
  | "activeWorkspaceId"
  | "availableWorkspaces"
  | "pendingWorkspaceInviteToken"
  | "pendingWorkspaceInviteWorkspaceId"
  | "pendingWorkspaceInviteWorkspaceName"
  | "preferredLanguage"
  | "workspaceMembers"
  | "workspacePresenceByUserId"
  | "workspaceRealtimeStatus"
> &
  Pick<AuthComputedState, "googleProfileUserId"> &
  Pick<WorkspaceComputedState, "currentWorkspaceName" | "currentWorkspaceSummary" | "isWorkspaceScopeActive">;

export type WorkspaceComputedObject = {
  [Key in keyof WorkspaceComputedState]: (
    this: WorkspaceComputedContext
  ) => WorkspaceComputedState[Key];
};

export interface WorkspaceMethodState {
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
}

/** Capabilities used by authenticated workspace HTTP requests. */
export type WorkspaceApiContext = AuthSessionBootstrapContext &
  Pick<AppState, "hasProAccess"> &
  Pick<RuntimeMethodState, "notify">;

export type WorkspaceMembershipContext = WorkspaceApiContext &
  Pick<
    AppState,
    | "activeWorkspaceId"
    | "workspaceMembers"
    | "workspacePresenceByUserId"
    | "workspaceRealtimeStatus"
    | "isWorkspaceMembersLoading"
    | "leaveWorkspaceTransferMemberUserId"
  > &
  Pick<AuthComputedState, "googleProfileUserId">;

export type WorkspaceInviteContext = WorkspaceApiContext &
  Pick<
    AppState,
    | "activeWorkspaceId"
    | "isCreatingWorkspaceJoinLink"
    | "isResolvingWorkspaceInvite"
    | "isAcceptingWorkspaceInvite"
    | "pendingWorkspaceInviteToken"
    | "pendingWorkspaceInviteWorkspaceId"
    | "pendingWorkspaceInviteWorkspaceName"
    | "showWorkspaceJoinDialog"
  > &
  Pick<WorkspaceMethodState, "refreshWorkspaces" | "switchToWorkspace">;

export type WorkspaceUiHelperContext = Pick<
  AppState,
  | "pendingWorkspaceInviteToken"
  | "pendingWorkspaceInviteWorkspaceId"
  | "pendingWorkspaceInviteWorkspaceName"
  | "showWorkspaceJoinDialog"
  | "activeScopeType"
  | "activeWorkspaceId"
  | "workspaceMembers"
  | "workspacePresenceByUserId"
  | "lots"
  | "currentLotId"
  | "sales"
  | "singlesPurchases"
  | "currentTab"
  | "lastSyncedPayloadHash"
> &
  Pick<CommerceMethodState, "loadLotsFromStorage" | "loadLot" | "clearLiveSinglesSelection"> &
  Pick<GameMethodState, "loadWheelFromStorage"> &
  Pick<RuntimeMethodState, "syncGuidedOnboarding"> &
  Pick<SyncMethodState, "pullCloudSync">;

export type WorkspaceScopeMethodContext = WorkspaceApiContext &
  WorkspaceUiHelperContext &
  WorkspaceMembershipContext &
  SyncServiceContext &
  Pick<
    AppState,
    | "availableWorkspaces"
    | "isWorkspaceLoading"
    | "isCreatingWorkspace"
    | "newWorkspaceName"
    | "newWorkspaceIdempotencyKey"
    | "newWorkspaceIdempotencyName"
    | "showCreateWorkspaceModal"
    | "preferredLanguage"
  > &
  Pick<WorkspaceMethodState, "refreshWorkspaces" | "switchToWorkspace">;

export type WorkspaceMembershipMethodContext = WorkspaceMembershipContext &
  WorkspaceUiHelperContext &
  Pick<
    AppState,
    | "showWorkspaceMembersModal"
    | "showLeaveWorkspaceModal"
    | "leaveWorkspaceDeleteConfirmation"
    | "isLeavingWorkspace"
  > &
  Pick<WorkspaceComputedState, "isCurrentWorkspaceOwner"> &
  Pick<WorkspaceMethodState, "openWorkspaceMembersModal" | "refreshWorkspaces">;

export type WorkspaceRealtimeContext = Pick<
  AppState,
  | "activeScopeType"
  | "activeWorkspaceId"
  | "currentLotId"
  | "currentTab"
  | "isOffline"
  | "lots"
  | "lastSyncedPayloadHash"
  | "systemPricingDefaults"
  | "sales"
  | "liveSpotPrice"
  | "liveBoxPriceSell"
  | "livePackPrice"
  | "currentLivePricingVersion"
  | "workspaceRealtimeStatus"
  | "workspacePresenceByUserId"
  | "wheelConfigs"
  | "activeWheelConfigId"
> &
  Pick<CommerceMethodState, "loadSalesForLotId" | "getSalesStorageKey"> &
  Pick<SyncMethodState, "pullCloudSync"> &
  Pick<BuyerMethodState, "hydrateBuyerProfiles"> &
  Pick<WorkspaceMethodState, "handleWorkspaceAccessLost"> &
  WorkspaceApiContext &
  GameSessionStateContext;

export type WorkspaceScopeMethodImplementation = FeatureMethodImplementation<
  WorkspaceScopeMethodContext,
  Pick<
    WorkspaceMethodState,
    | "refreshWorkspaces"
    | "switchToPersonalWorkspace"
    | "switchToWorkspace"
    | "createWorkspace"
    | "handleWorkspaceAccessLost"
  >
>;

export type WorkspaceInviteMethodImplementation = FeatureMethodImplementation<
  WorkspaceInviteContext,
  Pick<
    WorkspaceMethodState,
    | "createWorkspaceJoinLink"
    | "previewPendingWorkspaceInvite"
    | "acceptPendingWorkspaceInvite"
    | "dismissPendingWorkspaceInvite"
  >
>;

export type WorkspaceMembershipMethodImplementation = FeatureMethodImplementation<
  WorkspaceMembershipMethodContext,
  Pick<
    WorkspaceMethodState,
    | "openWorkspaceMembersModal"
    | "openLeaveWorkspaceModal"
    | "leaveCurrentWorkspace"
    | "removeWorkspaceMember"
    | "getWorkspaceMemberPresenceState"
    | "getWorkspaceMemberPresenceLabel"
  >
>;

export type WorkspaceRealtimeMethodImplementation = FeatureMethodImplementation<
  WorkspaceRealtimeContext,
  Pick<WorkspaceMethodState, "recoverWorkspaceRealtimeNow">
>;

export type WorkspaceMethodImplementation = FeatureMethodImplementation<
  WorkspaceScopeMethodContext & WorkspaceInviteContext & WorkspaceMembershipMethodContext & WorkspaceRealtimeContext,
  Pick<
    WorkspaceMethodState,
    | "refreshWorkspaces"
    | "switchToPersonalWorkspace"
    | "switchToWorkspace"
    | "createWorkspace"
    | "handleWorkspaceAccessLost"
    | "createWorkspaceJoinLink"
    | "previewPendingWorkspaceInvite"
    | "acceptPendingWorkspaceInvite"
    | "dismissPendingWorkspaceInvite"
    | "openWorkspaceMembersModal"
    | "openLeaveWorkspaceModal"
    | "leaveCurrentWorkspace"
    | "removeWorkspaceMember"
    | "getWorkspaceMemberPresenceState"
    | "getWorkspaceMemberPresenceLabel"
    | "recoverWorkspaceRealtimeNow"
  >
>;
