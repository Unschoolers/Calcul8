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

function summarizeClientId(clientId: string): string {
  if (!clientId) return "(missing)";
  const prefix = clientId.slice(0, 12);
  const suffix = clientId.slice(-20);
  return `${prefix}...${suffix}`;
}

function logAuthDebug(event: string, details: Record<string, unknown> = {}): void {
  console.info("[whatfees][auth]", event, details);
}

function logAuthWarn(event: string, details: Record<string, unknown> = {}): void {
  console.warn("[whatfees][auth]", event, details);
}

export const uiEntitlementSignInMethods: UiEntitlementMethodSubset<
  "initGoogleAutoLogin" | "promptGoogleSignIn" | "openVerifyPurchaseModal"
> = {
  initGoogleAutoLogin(): void {
    const currentWindow = (globalThis as { window?: Window }).window;
    const origin = currentWindow?.location?.origin ?? "(unknown)";
    const viteEnv = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
    const clientId = (typeof viteEnv?.VITE_GOOGLE_CLIENT_ID === "string"
      ? viteEnv.VITE_GOOGLE_CLIENT_ID
      : ""
    ).trim();
    const existingToken = (localStorage.getItem(GOOGLE_TOKEN_KEY) || "").trim();
    const hasGoogleApi = !!currentWindow?.google?.accounts?.id;

    logAuthDebug("init:auto:start", {
      origin,
      clientId: summarizeClientId(clientId),
      hasExistingToken: existingToken.length > 0,
      hasGoogleApi
    });

    const cachedEntitlement = readEntitlementCache();
    if (cachedEntitlement?.hasProAccess) {
      logAuthDebug("init:auto:using_cached_entitlement", {
        cachedUserId: cachedEntitlement.userId,
        cachedAt: cachedEntitlement.cachedAt,
        updatedAt: cachedEntitlement.updatedAt
      });
      this.hasProAccess = true;
      applyTargetProfitAccessDefaults(this);
    }

    if (existingToken) {
      logAuthDebug("init:auto:skip_prompt_existing_token", {
        tokenLength: existingToken.length
      });
      cacheGoogleProfileFromToken(existingToken, GOOGLE_PROFILE_CACHE_KEY);
      return;
    }

    initGoogleAutoLoginWithRetry({
      clientId,
      getGoogleIdentity: () => currentWindow?.google?.accounts?.id,
      onCredential: (idToken: string) => {
        logAuthDebug("init:auto:credential_received", {
          tokenLength: idToken.length
        });
        localStorage.setItem(GOOGLE_TOKEN_KEY, idToken);
        this.googleAvatarLoadFailed = false;
        cacheGoogleProfileFromToken(idToken, GOOGLE_PROFILE_CACHE_KEY);
        void this.debugLogEntitlement(true);
      },
      retryCount: GOOGLE_INIT_RETRY_COUNT,
      retryDelayMs: GOOGLE_INIT_RETRY_DELAY_MS,
      schedule: (callback: () => void, delayMs: number) => {
        (currentWindow?.setTimeout ?? globalThis.setTimeout)(callback, delayMs);
      }
    });
  },

  promptGoogleSignIn(): void {
    const currentWindow = (globalThis as { window?: Window }).window;
    const origin = currentWindow?.location?.origin ?? "(unknown)";
    logAuthDebug("signin:manual:start", {
      origin
    });

    const existingToken = (localStorage.getItem(GOOGLE_TOKEN_KEY) || "").trim();
    if (existingToken) {
      logAuthDebug("signin:manual:skip_existing_token", {
        tokenLength: existingToken.length
      });
      void this.debugLogEntitlement(true);
      return;
    }

    const viteEnv = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
    const clientId = (typeof viteEnv?.VITE_GOOGLE_CLIENT_ID === "string"
      ? viteEnv.VITE_GOOGLE_CLIENT_ID
      : ""
    ).trim();
    if (!clientId) {
      logAuthWarn("signin:manual:missing_client_id");
      this.notify("Google sign-in is not configured.", "error");
      return;
    }

    const googleId = currentWindow?.google?.accounts?.id;
    if (!googleId) {
      logAuthWarn("signin:manual:google_api_unavailable", {
        hasWindowGoogle: !!currentWindow?.google,
        hasAccounts: !!currentWindow?.google?.accounts
      });
      this.notify("Google sign-in is not available yet. Please try again.", "warning");
      return;
    }

    try {
      logAuthDebug("signin:manual:initialize", {
        clientId: summarizeClientId(clientId)
      });

      googleId.initialize({
        client_id: clientId,
        auto_select: false,
        itp_support: true,
        callback: (response) => {
          const idToken = response.credential?.trim();
          if (!idToken) {
            logAuthWarn("signin:manual:empty_credential_callback", {
              responseKeys: Object.keys(response ?? {})
            });
            return;
          }
          logAuthDebug("signin:manual:credential_received", {
            tokenLength: idToken.length
          });
          localStorage.setItem(GOOGLE_TOKEN_KEY, idToken);
          this.googleAvatarLoadFailed = false;
          cacheGoogleProfileFromToken(idToken, GOOGLE_PROFILE_CACHE_KEY);
          this.notify("Signed in with Google.", "success");
          void this.debugLogEntitlement(true);
        }
      });

      logAuthDebug("signin:manual:prompt");
      googleId.prompt();
    } catch (error) {
      logAuthWarn("signin:manual:exception", {
        error: error instanceof Error ? error.message : String(error)
      });
      this.notify("Google sign-in failed to open. Please try again.", "error");
    }
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
