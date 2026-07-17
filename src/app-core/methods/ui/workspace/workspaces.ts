import type { AppMethodImplementation } from "../../../context-app.ts";
import { uiWorkspaceInviteMethods } from "./workspace-invite-methods.ts";
import { uiWorkspaceMembershipMethods } from "./workspace-membership-methods.ts";
import { uiWorkspaceRealtimeMethods } from "./workspace-realtime-methods.ts";
import { uiWorkspaceScopeMethods } from "./workspace-scope-methods.ts";

export const uiWorkspaceMethods = {
  ...uiWorkspaceScopeMethods,
  ...uiWorkspaceInviteMethods,
  ...uiWorkspaceMembershipMethods,
  ...uiWorkspaceRealtimeMethods
} satisfies AppMethodImplementation;
