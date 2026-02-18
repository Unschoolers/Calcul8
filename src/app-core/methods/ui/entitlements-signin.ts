import {
  GOOGLE_INIT_RETRY_COUNT,
  GOOGLE_INIT_RETRY_DELAY_MS,
  GOOGLE_PROFILE_CACHE_KEY,
  GOOGLE_TOKEN_KEY,
  readEntitlementCache
} from "./shared.ts";
import {
  applyTargetProfitAccessDefaults,
  cacheGoogleProfileFromToken,
  initGoogleAutoLoginWithRetry,
  type UiEntitlementMethodSubset
} from "./entitlements-shared.ts";

export const uiEntitlementSignInMethods: UiEntitlementMethodSubset<
  "initGoogleAutoLogin" | "promptGoogleSignIn" | "openVerifyPurchaseModal"
> = {
  initGoogleAutoLogin(): void {
    const viteEnv = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
    const clientId = (typeof viteEnv?.VITE_GOOGLE_CLIENT_ID === "string"
      ? viteEnv.VITE_GOOGLE_CLIENT_ID
      : ""
    ).trim();
    const existingToken = (localStorage.getItem(GOOGLE_TOKEN_KEY) || "").trim();

    const cachedEntitlement = readEntitlementCache();
    if (cachedEntitlement?.hasProAccess) {
      this.hasProAccess = true;
      applyTargetProfitAccessDefaults(this);
    }

    if (existingToken) {
      cacheGoogleProfileFromToken(existingToken, GOOGLE_PROFILE_CACHE_KEY);
      return;
    }

    initGoogleAutoLoginWithRetry({
      clientId,
      getGoogleIdentity: () => window.google?.accounts?.id,
      onCredential: (idToken: string) => {
        localStorage.setItem(GOOGLE_TOKEN_KEY, idToken);
        this.googleAvatarLoadFailed = false;
        cacheGoogleProfileFromToken(idToken, GOOGLE_PROFILE_CACHE_KEY);
        void this.debugLogEntitlement(true);
      },
      retryCount: GOOGLE_INIT_RETRY_COUNT,
      retryDelayMs: GOOGLE_INIT_RETRY_DELAY_MS,
      schedule: (callback: () => void, delayMs: number) => {
        window.setTimeout(callback, delayMs);
      }
    });
  },

  promptGoogleSignIn(): void {
    const existingToken = (localStorage.getItem(GOOGLE_TOKEN_KEY) || "").trim();
    if (existingToken) {
      void this.debugLogEntitlement(true);
      return;
    }

    const viteEnv = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
    const clientId = (typeof viteEnv?.VITE_GOOGLE_CLIENT_ID === "string"
      ? viteEnv.VITE_GOOGLE_CLIENT_ID
      : ""
    ).trim();
    if (!clientId) {
      this.notify("Google sign-in is not configured.", "error");
      return;
    }

    const googleId = window.google?.accounts?.id;
    if (!googleId) {
      this.notify("Google sign-in is not available yet. Please try again.", "warning");
      return;
    }

    googleId.initialize({
      client_id: clientId,
      auto_select: false,
      itp_support: true,
      callback: (response) => {
        const idToken = response.credential?.trim();
        if (!idToken) return;
        localStorage.setItem(GOOGLE_TOKEN_KEY, idToken);
        this.googleAvatarLoadFailed = false;
        cacheGoogleProfileFromToken(idToken, GOOGLE_PROFILE_CACHE_KEY);
        this.notify("Signed in with Google.", "success");
        void this.debugLogEntitlement(true);
      }
    });

    googleId.prompt();
  },

  openVerifyPurchaseModal(): void {
    if (!this.showManualPurchaseVerify) {
      return;
    }

    const googleIdToken = (localStorage.getItem(GOOGLE_TOKEN_KEY) || "").trim();
    if (!googleIdToken) {
      this.notify("Sign in with Google first to verify your purchase.", "warning");
      return;
    }

    this.showVerifyPurchaseModal = true;
  }
};
