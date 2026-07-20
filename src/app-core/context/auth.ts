import type { AppState } from "../../types/app.ts";
import type { RuntimeMethodState } from "./runtime.ts";

export interface AuthComputedState {
  isGoogleSignedIn: boolean;
  googleProfileUserId: string;
  googleProfileName: string;
  googleProfileEmail: string;
  googleProfilePicture: string;
}

export type AuthProfileContext = Pick<AppState, "googleAuthEpoch">;

/** Mutable identity state needed when an authenticated session expires. */
export type AuthSessionContext = Pick<AppState, "googleAuthEpoch">;

/** Identity state used while reconciling a server session with the local profile cache. */
export type AuthSessionBootstrapContext = AuthSessionContext &
  Partial<Pick<AppState, "googleAvatarLoadFailed">>;

/** Account cleanup crosses local identity, entitlement, and workspace state by design. */
export type AuthAccountContext = Pick<
  AppState,
  | "googleAuthEpoch"
  | "hasProAccess"
  | "availableWorkspaces"
  | "workspaceMembers"
  | "showWorkspaceMembersModal"
  | "showLeaveWorkspaceModal"
  | "activeScopeType"
  | "activeWorkspaceId"
> & Pick<RuntimeMethodState, "notify">;

export type AuthProfileComputedObject = {
  isGoogleSignedIn(this: AuthProfileContext): AuthComputedState["isGoogleSignedIn"];
  googleProfileUserId(this: AuthProfileContext): AuthComputedState["googleProfileUserId"];
  googleProfileName(this: AuthProfileContext): AuthComputedState["googleProfileName"];
  googleProfileEmail(this: AuthProfileContext): AuthComputedState["googleProfileEmail"];
  googleProfilePicture(this: AuthProfileContext): AuthComputedState["googleProfilePicture"];
};

export interface AuthMethodState {
  initGoogleAutoLogin(): void;
  renderGoogleSignInButton(): void;
  promptGoogleSignIn(): void;
  logoutCurrentSession(): Promise<void>;
  clearPersonalAccountData(): Promise<void>;
}
