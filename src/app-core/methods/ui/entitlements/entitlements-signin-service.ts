import type { AppContext } from "../../../context-app.ts";
import {
  GOOGLE_INIT_RETRY_COUNT,
  GOOGLE_INIT_RETRY_DELAY_MS,
  readEntitlementCache
} from "../common/shared.ts";
import {
  GOOGLE_PROFILE_CACHE_KEY,
  enableGoogleAutoSignIn,
  getStoredGoogleIdToken,
  hasAuthSignal,
  isGoogleAutoSignInDisabled,
  setStoredGoogleIdToken
} from "../../../auth/index.ts";
import {
  applyTargetProfitAccessDefaults,
  cacheGoogleProfileFromToken,
  initGoogleAutoLoginWithRetry,
  requestGoogleIdentityPrompt
} from "./entitlements-shared.ts";

type GoogleAccountsApi = NonNullable<Window["google"]>["accounts"]["id"];

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleIdentityInitConfig {
  client_id: string;
  auto_select: boolean;
  itp_support: boolean;
  callback: (response: GoogleCredentialResponse) => void;
}

interface GoogleIdentityInitState {
  clientId: string;
  callback: (response: GoogleCredentialResponse) => void;
}

export type SignInApp = Pick<
  AppContext,
  | "hasProAccess"
  | "hasLotSelected"
  | "isAuthSessionResolving"
  | "isDark"
  | "preferredLanguage"
  | "showGoogleSignInFallback"
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
  getDocument: () => Document | undefined;
  getGoogleIdToken: () => string;
  isGoogleAutoSignInDisabled: () => boolean;
  enableGoogleAutoSignIn: () => void;
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
  getDocument: () => (globalThis as { document?: Document }).document,
  getGoogleIdToken: () => getStoredGoogleIdToken(),
  isGoogleAutoSignInDisabled: () => isGoogleAutoSignInDisabled(),
  enableGoogleAutoSignIn: () => enableGoogleAutoSignIn(),
  setGoogleIdToken: (token) => {
    setStoredGoogleIdToken(token);
  },
  schedule: (callback, delayMs) => {
    const currentWindow = (globalThis as { window?: Window }).window;
    (currentWindow?.setTimeout ?? globalThis.setTimeout)(callback, delayMs);
  }
};

const GOOGLE_SIGN_IN_BUTTON_CONTAINER_ID = "google-signin-button";
const initializedGoogleIdentityApis = new WeakMap<GoogleAccountsApi, GoogleIdentityInitState>();

function isAuthGateVisible(documentRef: Document | undefined): boolean {
  return !!documentRef?.getElementById(GOOGLE_SIGN_IN_BUTTON_CONTAINER_ID);
}

function createGoogleCredentialCallback(app: SignInApp, deps: SignInDeps) {
  return (response: GoogleCredentialResponse) => {
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
    void finalizeGoogleCredentialSignIn(app, deps, idToken, {
      notifySuccess: true
    });
  };
}

async function finalizeGoogleCredentialSignIn(
  app: SignInApp,
  deps: SignInDeps,
  idToken: string,
  options: {
    notifySuccess: boolean;
  }
): Promise<void> {
  deps.enableGoogleAutoSignIn();
  deps.setGoogleIdToken(idToken);
  app.googleAvatarLoadFailed = false;
  deps.cacheGoogleProfileFromToken(idToken, GOOGLE_PROFILE_CACHE_KEY);

  try {
    await app.debugLogEntitlement(true);
  } catch (error) {
    logAuthWarn("signin:session_bootstrap_failed", {
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    // The auth watcher starts workspace, Whatnot, realtime, and sync requests.
    // Keep that fan-out behind session bootstrap so session-first requests do
    // not race ahead, receive 401, and clear the fresh Google credential.
    app.googleAuthEpoch += 1;
  }

  if (options.notifySuccess) {
    app.notify("Signed in with Google.", "success");
  }
}

function initializeGoogleIdentityOnce(googleId: GoogleAccountsApi, config: GoogleIdentityInitConfig): void {
  const existing = initializedGoogleIdentityApis.get(googleId);
  if (existing?.clientId === config.client_id) {
    existing.callback = config.callback;
    return;
  }

  const state: GoogleIdentityInitState = {
    clientId: config.client_id,
    callback: config.callback
  };
  initializedGoogleIdentityApis.set(googleId, state);
  googleId.initialize({
    ...config,
    callback: (response: GoogleCredentialResponse) => {
      state.callback(response);
    }
  });
}

function normalizeGoogleButtonLocale(language: string): string | undefined {
  const normalized = String(language || "").trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized.startsWith("fr")) return "fr";
  if (normalized.startsWith("en")) return "en";
  return normalized;
}

export function initGoogleAutoLoginFlow(app: SignInApp, deps: Partial<SignInDeps> = {}): void {
  const resolvedDeps = { ...defaultDeps, ...deps } satisfies SignInDeps;
  const currentWindow = resolvedDeps.getWindow();
  const currentDocument = resolvedDeps.getDocument();
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

  if (resolvedDeps.isGoogleAutoSignInDisabled()) {
    logAuthDebug("init:auto:disabled_after_signout");
    return;
  }

  if (existingToken) {
    logAuthDebug("init:auto:skip_prompt_existing_token", {
      tokenLength: existingToken.length
    });
    app.googleAuthEpoch += 1;
    resolvedDeps.cacheGoogleProfileFromToken(existingToken, GOOGLE_PROFILE_CACHE_KEY);
    return;
  }

  if (app.isAuthSessionResolving) {
    logAuthDebug("init:auto:skip_prompt_session_resolving");
    return;
  }

  if (isAuthGateVisible(currentDocument)) {
    logAuthDebug("init:auto:skip_prompt_auth_gate_visible");
    return;
  }

  resolvedDeps.initGoogleAutoLoginWithRetry({
    clientId,
    getGoogleIdentity: () => currentWindow?.google?.accounts?.id,
    onCredential: (idToken: string) => {
      logAuthDebug("init:auto:credential_received", {
        tokenLength: idToken.length
      });
      void finalizeGoogleCredentialSignIn(app, resolvedDeps, idToken, {
        notifySuccess: false
      });
    },
    retryCount: GOOGLE_INIT_RETRY_COUNT,
    retryDelayMs: GOOGLE_INIT_RETRY_DELAY_MS,
    schedule: resolvedDeps.schedule
  });
}

export function renderGoogleSignInButtonFlow(
  app: SignInApp,
  deps: Partial<SignInDeps> = {},
  attemptsLeft = GOOGLE_INIT_RETRY_COUNT
): void {
  const resolvedDeps = { ...defaultDeps, ...deps } satisfies SignInDeps;
  const currentDocument = resolvedDeps.getDocument();
  const container = currentDocument?.getElementById(GOOGLE_SIGN_IN_BUTTON_CONTAINER_ID) as HTMLElement | null;
  if (!container) {
    return;
  }

  app.showGoogleSignInFallback = false;

  if (resolvedDeps.getGoogleIdToken()) {
    container.replaceChildren();
    app.showGoogleSignInFallback = false;
    return;
  }

  const clientId = resolvedDeps.getGoogleClientId();
  const googleId: GoogleAccountsApi | undefined = resolvedDeps.getWindow()?.google?.accounts?.id;
  if (!clientId || !googleId) {
    if (attemptsLeft <= 0) {
      app.showGoogleSignInFallback = true;
      return;
    }
    resolvedDeps.schedule(() => {
      renderGoogleSignInButtonFlow(app, resolvedDeps, attemptsLeft - 1);
    }, GOOGLE_INIT_RETRY_DELAY_MS);
    return;
  }

  try {
    initializeGoogleIdentityOnce(googleId, {
      client_id: clientId,
      auto_select: false,
      itp_support: true,
      callback: createGoogleCredentialCallback(app, resolvedDeps)
    });
    container.replaceChildren();
    googleId.renderButton(container, {
      type: "standard",
      theme: app.isDark ? "filled_black" : "outline",
      size: "large",
      text: "continue_with",
      shape: "rectangular",
      logo_alignment: "left",
      width: 320,
      locale: normalizeGoogleButtonLocale(app.preferredLanguage)
    });
    app.showGoogleSignInFallback = false;
  } catch (error) {
    logAuthWarn("signin:render_button:exception", {
      error: error instanceof Error ? error.message : String(error)
    });
    app.showGoogleSignInFallback = true;
  }
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
    resolvedDeps.enableGoogleAutoSignIn();
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
    resolvedDeps.enableGoogleAutoSignIn();
    logAuthDebug("signin:manual:initialize", {
      clientId: summarizeClientId(clientId)
    });

    initializeGoogleIdentityOnce(googleId, {
      client_id: clientId,
      auto_select: false,
      itp_support: true,
      callback: createGoogleCredentialCallback(app, resolvedDeps)
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

  if (!hasAuthSignal()) {
    app.notify("Sign in with Google first to verify your purchase.", "warning");
    return;
  }

  app.showVerifyPurchaseModal = true;
}

