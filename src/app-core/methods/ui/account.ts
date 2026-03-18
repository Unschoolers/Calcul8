import type { AppContext, AppMethodState } from "../../context.ts";
import { clearEntitlementCache, fetchWithRetry, handleExpiredAuth, resolveApiBaseUrl } from "./shared.ts";
import {
  disableGoogleAutoSignIn,
  buildAuthenticatedHeaders,
  clearStoredCsrfToken,
  clearStoredGoogleIdToken,
  clearStoredGoogleProfileCache
} from "../../auth/index.ts";
import { STORAGE_KEYS } from "../../storageKeys.ts";

type AccountActionApp = Pick<
  AppContext,
  | "googleAuthEpoch"
  | "hasProAccess"
  | "availableWorkspaces"
  | "workspaceMembers"
  | "showWorkspaceMembersModal"
  | "showLeaveWorkspaceModal"
  | "activeScopeType"
  | "activeWorkspaceId"
  | "notify"
>;

function clearAppLocalStorage(): void {
  try {
    const keys: string[] = [];
    if (typeof localStorage.length === "number" && typeof localStorage.key === "function") {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (typeof key === "string") keys.push(key);
      }
    }

    for (const key of keys) {
      if (!key.startsWith("whatfees_") && !key.startsWith("rtyh_")) continue;
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage cleanup failures.
  }
}

function clearLocalAuthState(app: AccountActionApp): void {
  clearStoredGoogleIdToken();
  clearStoredGoogleProfileCache();
  clearStoredCsrfToken();
  clearEntitlementCache();
  try {
    localStorage.removeItem(STORAGE_KEYS.PRO_ACCESS);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_SCOPE_TYPE);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_WORKSPACE_ID);
  } catch {
    // Ignore storage cleanup failures.
  }
  app.hasProAccess = false;
  app.availableWorkspaces = [];
  app.workspaceMembers = [];
  app.showWorkspaceMembersModal = false;
  app.showLeaveWorkspaceModal = false;
  app.activeScopeType = "personal";
  app.activeWorkspaceId = null;
  app.googleAuthEpoch += 1;
}

function reloadAppSoon(): void {
  try {
    window.setTimeout(() => window.location.reload(), 180);
  } catch {
    // Ignore reload failures.
  }
}

function disableGoogleIdentityAutoSelect(): void {
  try {
    const googleId = (window as Window & {
      google?: {
        accounts?: {
          id?: {
            disableAutoSelect?: () => void;
            cancel?: () => void;
          };
        };
      };
    }).google?.accounts?.id;

    googleId?.cancel?.();
    googleId?.disableAutoSelect?.();
  } catch {
    // Ignore Google Identity cleanup failures.
  }
}

async function postAccountAction(
  app: AccountActionApp,
  path: string,
  fallbackMessage: string
): Promise<Response | null> {
  const baseUrl = resolveApiBaseUrl();
  if (!baseUrl) {
    app.notify("Account actions are unavailable until the API base URL is configured.", "warning");
    return null;
  }

  const response = await fetchWithRetry(`${baseUrl}${path}`, {
    method: "POST",
    headers: buildAuthenticatedHeaders("session-preferred")
  });

  if (response.status === 401) {
    handleExpiredAuth(app);
    app.notify("Your sign-in expired. Please sign in again.", "warning");
    return null;
  }

  if (!response.ok) {
    app.notify(fallbackMessage, "error");
    return null;
  }

  return response;
}

export const uiAccountMethods: ThisType<AppContext> & Pick<
  AppMethodState,
  "logoutCurrentSession" | "clearPersonalAccountData"
> = {
  async logoutCurrentSession(): Promise<void> {
    const response = await postAccountAction(this, "/auth/logout", "Failed to sign out.");
    if (!response) return;

    disableGoogleAutoSignIn();
    disableGoogleIdentityAutoSelect();
    clearLocalAuthState(this);
    this.notify("Signed out.", "success");
    reloadAppSoon();
  },

  async clearPersonalAccountData(): Promise<void> {
    const response = await postAccountAction(
      this,
      "/account/delete",
      "Failed to clear your account data."
    );
    if (!response) return;

    clearAppLocalStorage();
    disableGoogleAutoSignIn();
    disableGoogleIdentityAutoSelect();
    clearLocalAuthState(this);
    this.notify("Your personal cloud and local app data were cleared.", "success");
    reloadAppSoon();
  }
};
