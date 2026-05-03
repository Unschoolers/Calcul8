import type { AppContext, AppMethodState } from "../../../context-app.ts";
import { uiWorkspaceInviteMethods } from "./workspace-invite-methods.ts";
import { uiWorkspaceMembershipMethods } from "./workspace-membership-methods.ts";
import { uiWorkspaceScopeMethods } from "./workspace-scope-methods.ts";

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
  ...uiWorkspaceScopeMethods,
  ...uiWorkspaceInviteMethods,
  ...uiWorkspaceMembershipMethods
};