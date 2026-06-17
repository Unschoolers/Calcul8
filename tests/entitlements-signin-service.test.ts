import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import {
    getStoredGoogleIdToken,
    setStoredGoogleIdToken
} from "../src/app-core/auth/index.ts";

const {
  readEntitlementCacheMock,
  applyTargetProfitAccessDefaultsMock,
  cacheGoogleProfileFromTokenMock,
  initGoogleAutoLoginWithRetryMock,
  requestGoogleIdentityPromptMock
} = vi.hoisted(() => ({
  readEntitlementCacheMock: vi.fn(),
  applyTargetProfitAccessDefaultsMock: vi.fn(),
  cacheGoogleProfileFromTokenMock: vi.fn(),
  initGoogleAutoLoginWithRetryMock: vi.fn(),
  requestGoogleIdentityPromptMock: vi.fn()
}));

vi.mock("../src/app-core/methods/ui/common/shared.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/app-core/methods/ui/common/shared.ts")>();
  return {
    ...actual,
    GOOGLE_INIT_RETRY_COUNT: 20,
    GOOGLE_INIT_RETRY_DELAY_MS: 250,
    GOOGLE_PROFILE_CACHE_KEY: "whatfees_google_profile_cache",
    readEntitlementCache: readEntitlementCacheMock
  };
});

vi.mock("../src/app-core/methods/ui/entitlements/entitlements-shared.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/app-core/methods/ui/entitlements/entitlements-shared.ts")>();
  return {
    ...actual,
    applyTargetProfitAccessDefaults: applyTargetProfitAccessDefaultsMock,
    cacheGoogleProfileFromToken: cacheGoogleProfileFromTokenMock,
    initGoogleAutoLoginWithRetry: initGoogleAutoLoginWithRetryMock,
    requestGoogleIdentityPrompt: requestGoogleIdentityPromptMock
  };
});

import {
    initGoogleAutoLoginFlow,
    openVerifyPurchaseModalFlow,
    promptGoogleSignInFlow,
    renderGoogleSignInButtonFlow
} from "../src/app-core/methods/ui/entitlements/entitlements-signin-service.ts";

type MockStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
};

function withMockedLocalStorage(run: (data: Map<string, string>) => Promise<void> | void): Promise<void> | void {
  const original = (globalThis as { localStorage?: MockStorage }).localStorage;
  const data = new Map<string, string>();
  const storage: MockStorage = {
    getItem(key: string): string | null {
      return data.has(key) ? data.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      data.set(key, String(value));
    },
    removeItem(key: string): void {
      data.delete(key);
    },
    clear(): void {
      data.clear();
    }
  };

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage
  });

  const restore = () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: original
    });
  };

  try {
    const result = run(data);
    if (result && typeof (result as Promise<void>).then === "function") {
      return (result as Promise<void>).finally(restore);
    }
    restore();
    return;
  } catch (error) {
    restore();
    throw error;
  }
}

function stubWindow(googleIdApi?: { initialize: (config: { callback: (response: { credential?: string }) => void }) => void; prompt: () => void; renderButton?: (...args: unknown[]) => void }): void {
  vi.stubGlobal("window", {
    location: { origin: "https://localhost" },
    setTimeout: vi.fn((callback: () => void) => {
      callback();
      return 1;
    }),
    google: googleIdApi
      ? {
        accounts: {
          id: googleIdApi
        }
      }
      : undefined
  });
}

function stubDocumentWithButtonContainer() {
  const container = {
    replaceChildren: vi.fn()
  } as unknown as HTMLElement;
  vi.stubGlobal("document", {
    getElementById: vi.fn((id: string) => id === "google-signin-button" ? container : null)
  });
  return container;
}

function createContext(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    hasProAccess: false,
    hasLotSelected: false,
    isDark: true,
    preferredLanguage: "en",
    showGoogleSignInFallback: false,
    targetProfitPercent: 0,
    autoSaveSetup: vi.fn(),
    showManualPurchaseVerify: true,
    showVerifyPurchaseModal: false,
    googleAuthEpoch: 0,
    googleAvatarLoadFailed: true,
    notify: vi.fn(),
    debugLogEntitlement: vi.fn(async () => undefined),
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "test-google-client-id");
  readEntitlementCacheMock.mockReturnValue(null);
  requestGoogleIdentityPromptMock.mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("initGoogleAutoLoginFlow applies cached entitlement and skips prompt when token already exists", async () => {
  await withMockedLocalStorage(async (data) => {
    stubWindow();
    data.set("whatfees_google_id_token", "existing-token");
    readEntitlementCacheMock.mockReturnValue({
      userId: "u_1",
      hasProAccess: true,
      updatedAt: "2026-02-24T00:00:00Z",
      cachedAt: Date.now()
    });
    const context = createContext();

    initGoogleAutoLoginFlow(context as never);

    assert.equal(context.hasProAccess, true);
    assert.equal(context.googleAuthEpoch, 1);
    assert.equal(applyTargetProfitAccessDefaultsMock.mock.calls.length, 1);
    assert.equal(initGoogleAutoLoginWithRetryMock.mock.calls.length, 0);
    assert.equal(cacheGoogleProfileFromTokenMock.mock.calls.at(-1)?.[0], "existing-token");
  });
});

test("initGoogleAutoLoginFlow stays signed out after an intentional logout", async () => {
  await withMockedLocalStorage(async (data) => {
    stubWindow({
      initialize: vi.fn(),
      prompt: vi.fn()
    });
    data.set("whatfees_google_auto_signin_disabled_v1", "1");
    const context = createContext();

    initGoogleAutoLoginFlow(context as never);

    assert.equal(initGoogleAutoLoginWithRetryMock.mock.calls.length, 0);
    assert.equal(context.googleAuthEpoch, 0);
  });
});

test("initGoogleAutoLoginFlow skips auto prompt while auth gate is visible", async () => {
  await withMockedLocalStorage(async () => {
    const container = stubDocumentWithButtonContainer();
    void container;
    stubWindow({
      initialize: vi.fn(),
      prompt: vi.fn()
    });
    const context = createContext();

    initGoogleAutoLoginFlow(context as never);

    assert.equal(initGoogleAutoLoginWithRetryMock.mock.calls.length, 0);
    assert.equal(context.googleAuthEpoch, 0);
  });
});

test("initGoogleAutoLoginFlow starts retry flow and credential callback persists token", async () => {
  await withMockedLocalStorage(async (data) => {
    const setTimeoutSpy = vi.fn();
    vi.stubGlobal("window", {
      location: { origin: "https://localhost" },
      setTimeout: setTimeoutSpy,
      google: {
        accounts: {
          id: {
            initialize: vi.fn(),
            prompt: vi.fn()
          }
        }
      }
    });
    const context = createContext();

    initGoogleAutoLoginFlow(context as never);

    assert.equal(initGoogleAutoLoginWithRetryMock.mock.calls.length, 1);
    const params = initGoogleAutoLoginWithRetryMock.mock.calls[0]?.[0] as {
      onCredential: (token: string) => void;
      schedule: (callback: () => void, delayMs: number) => void;
    };
    params.schedule(() => undefined, 250);
    assert.equal(setTimeoutSpy.mock.calls.length, 1);

    params.onCredential("auto-token");
    assert.equal(getStoredGoogleIdToken(), "auto-token");
    assert.equal(context.googleAuthEpoch, 1);
    assert.equal(context.googleAvatarLoadFailed, false);
    assert.equal(cacheGoogleProfileFromTokenMock.mock.calls.at(-1)?.[0], "auto-token");
    assert.equal((context.debugLogEntitlement as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], true);
  });
});

test("promptGoogleSignInFlow initializes, prompts, and handles credential callback", async () => {
  await withMockedLocalStorage(async (data) => {
    let callback: (response: { credential?: string }) => void = () => {
      throw new Error("Credential callback was not initialized.");
    };
    const initialize = vi.fn((config: { callback: (response: { credential?: string }) => void }) => {
      callback = config.callback;
    });
    stubWindow({ initialize, prompt: vi.fn() });
    const context = createContext({
      googleAvatarLoadFailed: true
    });
    data.set("whatfees_google_auto_signin_disabled_v1", "1");

    promptGoogleSignInFlow(context as never);
    callback({ credential: "  signed-token  " });

    assert.equal(initialize.mock.calls.length, 1);
    assert.equal(requestGoogleIdentityPromptMock.mock.calls.length, 1);
    assert.equal(data.get("whatfees_google_auto_signin_disabled_v1"), undefined);
    assert.equal(getStoredGoogleIdToken(), "signed-token");
    assert.equal(context.googleAuthEpoch, 1);
    assert.equal(context.googleAvatarLoadFailed, false);
    assert.equal((context.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "Signed in with Google.");
    assert.equal(cacheGoogleProfileFromTokenMock.mock.calls.at(-1)?.[0], "signed-token");
    assert.equal((context.debugLogEntitlement as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], true);
  });
});

test("renderGoogleSignInButtonFlow initializes GIS button and handles credential callback", async () => {
  await withMockedLocalStorage(async (data) => {
    let callback: (response: { credential?: string }) => void = () => {
      throw new Error("Credential callback was not initialized.");
    };
    const initialize = vi.fn((config: { callback: (response: { credential?: string }) => void }) => {
      callback = config.callback;
    });
    const renderButton = vi.fn();
    stubWindow({ initialize, prompt: vi.fn(), renderButton });
    const container = stubDocumentWithButtonContainer();
    const context = createContext({
      preferredLanguage: "fr-CA"
    });

    renderGoogleSignInButtonFlow(context as never);
    callback({ credential: "  rendered-token  " });

    assert.equal(initialize.mock.calls.length, 1);
    assert.equal(renderButton.mock.calls.length, 1);
    assert.equal(renderButton.mock.calls[0]?.[0], container);
    assert.equal(renderButton.mock.calls[0]?.[1]?.locale, "fr");
    assert.equal(renderButton.mock.calls[0]?.[1]?.theme, "filled_black");
    assert.equal(getStoredGoogleIdToken(), "rendered-token");
    assert.equal(context.googleAuthEpoch, 1);
    assert.equal(context.showGoogleSignInFallback, false);
    assert.equal((context.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "Signed in with Google.");
  });
});

test("renderGoogleSignInButtonFlow exposes fallback after GIS button render exhausts retries", async () => {
  await withMockedLocalStorage(async () => {
    stubWindow();
    stubDocumentWithButtonContainer();
    const context = createContext({
      showGoogleSignInFallback: false
    });

    renderGoogleSignInButtonFlow(context as never, {}, 0);

    assert.equal(context.showGoogleSignInFallback, true);
  });
});

test("openVerifyPurchaseModalFlow respects manual mode and token requirements", async () => {
  await withMockedLocalStorage(async (data) => {
    const manualOff = createContext({
      showManualPurchaseVerify: false,
      showVerifyPurchaseModal: false
    });
    openVerifyPurchaseModalFlow(manualOff as never);
    assert.equal(manualOff.showVerifyPurchaseModal, false);

    const missingToken = createContext({
      showManualPurchaseVerify: true,
      showVerifyPurchaseModal: false
    });
    openVerifyPurchaseModalFlow(missingToken as never);
    assert.equal((missingToken.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "Sign in with Google first to verify your purchase.");
    assert.equal(missingToken.showVerifyPurchaseModal, false);

    setStoredGoogleIdToken("signed-token");
    const withToken = createContext({
      showManualPurchaseVerify: true,
      showVerifyPurchaseModal: false
    });
    openVerifyPurchaseModalFlow(withToken as never);
    assert.equal(withToken.showVerifyPurchaseModal, true);
  });
});
