import type { AppContext } from "../../context.ts";
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
  requestGoogleIdentityPrompt
} from "./entitlements-shared.ts";

type GoogleAccountsApi = NonNullable<Window["google"]>["accounts"]["id"];

export type SignInApp = Pick<
  AppContext,
  | "hasProAccess"
  | "hasLotSelected"
  | "targetProfitPercent"
  | "autoSaveSetup"
  | "showManualPurchaseVerify"
  | "showVerifyPurchaseModal"
  | "googleAuthEpoch"
  | "googleAvatarLoadFailed"
  | "notify"
  | "debugLogEntitlement"
>;

type SignInDeps = {
  readEntitlementCache: typeof readEntitlementCache;
  applyTargetProfitAccessDefaults: typeof applyTargetProfitAccessDefaults;
  cacheGoogleProfileFromToken: typeof cacheGoogleProfileFromToken;
  initGoogleAutoLoginWithRetry: typeof initGoogleAutoLoginWithRetry;
  requestGoogleIdentityPrompt: typeof requestGoogleIdentityPrompt;
  getGoogleClientId: () => string;
  getWindow: () => Window | undefined;
  getGoogleIdToken: () => string;
  setGoogleIdToken: (token: string) => void;
  schedule: (callback: () => void, delayMs: number) => void;
};

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

function readGoogleClientId(): string {
  const viteEnv = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
  const viteClientId = typeof viteEnv?.VITE_GOOGLE_CLIENT_ID === "string"
    ? viteEnv.VITE_GOOGLE_CLIENT_ID
    : "";
  if (viteClientId.trim()) return viteClientId.trim();

  const processEnv = (globalThis as { process?: { env?: Record<string, unknown> } }).process?.env;
  const processClientId = typeof processEnv?.VITE_GOOGLE_CLIENT_ID === "string"
    ? processEnv.VITE_GOOGLE_CLIENT_ID
    : "";
  return processClientId.trim();
}

const defaultDeps: SignInDeps = {
  readEntitlementCache,
  applyTargetProfitAccessDefaults,
  cacheGoogleProfileFromToken,
  initGoogleAutoLoginWithRetry,
  requestGoogleIdentityPrompt,
  getGoogleClientId: readGoogleClientId,
  getWindow: () => (globalThis as { window?: Window }).window,
  getGoogleIdToken: () => (localStorage.getItem(GOOGLE_TOKEN_KEY) || "").trim(),
  setGoogleIdToken: (token) => {
    localStorage.setItem(GOOGLE_TOKEN_KEY, token);
  },
  schedule: (callback, delayMs) => {
    const currentWindow = (globalThis as { window?: Window }).window;
    (currentWindow?.setTimeout ?? globalThis.setTimeout)(callback, delayMs);
  }
};

export function initGoogleAutoLoginFlow(app: SignInApp, deps: Partial<SignInDeps> = {}): void {
  const resolvedDeps = { ...defaultDeps, ...deps } satisfies SignInDeps;
  const currentWindow = resolvedDeps.getWindow();
  const origin = currentWindow?.location?.origin ?? "(unknown)";
  const clientId = resolvedDeps.getGoogleClientId();
  const existingToken = resolvedDeps.getGoogleIdToken();
  const hasGoogleApi = !!currentWindow?.google?.accounts?.id;

  logAuthDebug("init:auto:start", {
    origin,
    clientId: summarizeClientId(clientId),
    hasExistingToken: existingToken.length > 0,
    hasGoogleApi
  });

  const cachedEntitlement = resolvedDeps.readEntitlementCache();
  if (cachedEntitlement?.hasProAccess) {
    logAuthDebug("init:auto:using_cached_entitlement", {
      cachedUserId: cachedEntitlement.userId,
      cachedAt: cachedEntitlement.cachedAt,
      updatedAt: cachedEntitlement.updatedAt
    });
    app.hasProAccess = true;
    resolvedDeps.applyTargetProfitAccessDefaults(app);
  }

  if (existingToken) {
    logAuthDebug("init:auto:skip_prompt_existing_token", {
      tokenLength: existingToken.length
    });
    app.googleAuthEpoch += 1;
    resolvedDeps.cacheGoogleProfileFromToken(existingToken, GOOGLE_PROFILE_CACHE_KEY);
    return;
  }

  resolvedDeps.initGoogleAutoLoginWithRetry({
    clientId,
    getGoogleIdentity: () => currentWindow?.google?.accounts?.id,
    onCredential: (idToken: string) => {
      logAuthDebug("init:auto:credential_received", {
        tokenLength: idToken.length
      });
      resolvedDeps.setGoogleIdToken(idToken);
      app.googleAuthEpoch += 1;
      app.googleAvatarLoadFailed = false;
      resolvedDeps.cacheGoogleProfileFromToken(idToken, GOOGLE_PROFILE_CACHE_KEY);
      void app.debugLogEntitlement(true);
    },
    retryCount: GOOGLE_INIT_RETRY_COUNT,
    retryDelayMs: GOOGLE_INIT_RETRY_DELAY_MS,
    schedule: resolvedDeps.schedule
  });
}

export function promptGoogleSignInFlow(app: SignInApp, deps: Partial<SignInDeps> = {}): void {
  const resolvedDeps = { ...defaultDeps, ...deps } satisfies SignInDeps;
  const currentWindow = resolvedDeps.getWindow();
  const origin = currentWindow?.location?.origin ?? "(unknown)";
  logAuthDebug("signin:manual:start", {
    origin
  });

  const existingToken = resolvedDeps.getGoogleIdToken();
  if (existingToken) {
    logAuthDebug("signin:manual:skip_existing_token", {
      tokenLength: existingToken.length
    });
    app.googleAuthEpoch += 1;
    void app.debugLogEntitlement(true);
    return;
  }

  const clientId = resolvedDeps.getGoogleClientId();
  if (!clientId) {
    logAuthWarn("signin:manual:missing_client_id");
    app.notify("Google sign-in is not configured.", "error");
    return;
  }

  const googleId: GoogleAccountsApi | undefined = currentWindow?.google?.accounts?.id;
  if (!googleId) {
    logAuthWarn("signin:manual:google_api_unavailable", {
      hasWindowGoogle: !!currentWindow?.google,
      hasAccounts: !!currentWindow?.google?.accounts
    });
    app.notify("Google sign-in is not available yet. Please try again.", "warning");
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
        resolvedDeps.setGoogleIdToken(idToken);
        app.googleAuthEpoch += 1;
        app.googleAvatarLoadFailed = false;
        resolvedDeps.cacheGoogleProfileFromToken(idToken, GOOGLE_PROFILE_CACHE_KEY);
        app.notify("Signed in with Google.", "success");
        void app.debugLogEntitlement(true);
      }
    });

    logAuthDebug("signin:manual:prompt");
    const prompted = resolvedDeps.requestGoogleIdentityPrompt(
      googleId,
      resolvedDeps.schedule
    );
    if (!prompted) {
      logAuthDebug("signin:manual:prompt_suppressed_inflight");
    }
  } catch (error) {
    logAuthWarn("signin:manual:exception", {
      error: error instanceof Error ? error.message : String(error)
    });
    app.notify("Google sign-in failed to open. Please try again.", "error");
  }
}

export function openVerifyPurchaseModalFlow(app: Pick<SignInApp, "showManualPurchaseVerify" | "showVerifyPurchaseModal" | "notify">, deps: Partial<SignInDeps> = {}): void {
  const resolvedDeps = { ...defaultDeps, ...deps } satisfies SignInDeps;
  if (!app.showManualPurchaseVerify) {
    return;
  }

  const googleIdToken = resolvedDeps.getGoogleIdToken();
  if (!googleIdToken) {
    app.notify("Sign in with Google first to verify your purchase.", "warning");
    return;
  }

  app.showVerifyPurchaseModal = true;
}
