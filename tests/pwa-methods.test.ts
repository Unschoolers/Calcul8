import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

const { getAppRuntimeMock } = vi.hoisted(() => ({
  getAppRuntimeMock: vi.fn(() => "web")
}));

vi.mock("../src/app-core/platform/runtime.ts", () => ({
  getAppRuntime: getAppRuntimeMock
}));

import { pwaMethods } from "../src/app-core/methods/pwa.ts";
import type { BeforeInstallPromptEvent } from "../src/types/app.ts";

type PwaContext = Record<string, any>;
const DISMISSED_APP_UPDATE_SESSION_KEY = "whatfees_dismissed_app_update_worker";
const pwa = pwaMethods as Record<string, any>;

function callMaybe(callback: unknown): void {
  if (typeof callback === "function") {
    callback();
  }
}

function createContext(overrides: PwaContext = {}): PwaContext {
  return {
    isOffline: false,
    offlineReconnectIntervalId: null,
    deferredInstallPrompt: null,
    showInstallPrompt: false,
    showAppUpdatePrompt: false,
    isApplyingAppUpdate: false,
    appUpdateWorker: null,
    onlineListener: null,
    offlineListener: null,
    beforeInstallPromptListener: null,
    appInstalledListener: null,
    hasPwaUiHandlersBound: false,
    serviceWorkerLoadListener: null,
    serviceWorkerControllerChangeListener: null,
    serviceWorkerUpdateIntervalId: null,
    hasRegisteredServiceWorkerLifecycle: false,
    isGoogleSignedIn: true,
    notify: vi.fn(),
    debugLogEntitlement: vi.fn(async () => undefined),
    pushCloudSync: vi.fn(async () => undefined),
    retryPendingBuyerProfiles: vi.fn(async () => undefined),
    startOfflineReconnectScheduler: vi.fn(),
    stopOfflineReconnectScheduler: vi.fn(),
    ...overrides
  };
}

function createStorageMock(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.has(key) ? values.get(key) ?? null : null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, String(value));
    }
  } as Storage;
}

function stubWindow(overrides: Record<string, any> = {}): Record<string, any> {
  const baseWindow = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setTimeout: vi.fn(() => 2),
    setInterval: vi.fn(() => 1),
    clearInterval: vi.fn(),
    sessionStorage: createStorageMock(),
    location: {
      reload: vi.fn(),
      href: "https://app.whatfees.ca/",
      replace: vi.fn()
    }
  };
  const windowMock = { ...baseWindow, ...overrides };
  vi.stubGlobal("window", windowMock);
  return windowMock;
}

beforeEach(() => {
  vi.clearAllMocks();
  getAppRuntimeMock.mockReturnValue("web");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubDocument(overrides: Record<string, any> = {}): Record<string, any> {
  const documentMock = {
    readyState: "loading",
    ...overrides
  };
  vi.stubGlobal("document", documentMock);
  return documentMock;
}

test("setupPwaUiHandlers wires listeners and handles online/offline/install events", () => {
  const windowMock = stubWindow();
  vi.stubGlobal("navigator", { onLine: true });

  const context = createContext({
    isOffline: true,
    startOfflineReconnectScheduler: vi.fn(),
    stopOfflineReconnectScheduler: vi.fn()
  });

  pwa.setupPwaUiHandlers.call(context as never);

  assert.equal((windowMock.addEventListener as ReturnType<typeof vi.fn>).mock.calls.length, 4);
  assert.equal((context.startOfflineReconnectScheduler as ReturnType<typeof vi.fn>).mock.calls.length, 1);

  (context.onlineListener as () => void)();
  assert.equal(context.isOffline, false);
  assert.equal((context.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "Back online");
  assert.equal((context.stopOfflineReconnectScheduler as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal((context.debugLogEntitlement as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal((context.pushCloudSync as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal((context.retryPendingBuyerProfiles as ReturnType<typeof vi.fn>).mock.calls.length, 1);

  (context.offlineListener as () => void)();
  assert.equal(context.isOffline, true);
  assert.equal((context.startOfflineReconnectScheduler as ReturnType<typeof vi.fn>).mock.calls.length, 2);

  const preventDefault = vi.fn();
  const promptEvent: BeforeInstallPromptEvent = {
    preventDefault,
    prompt: vi.fn(async () => undefined),
    userChoice: Promise.resolve({ outcome: "accepted", platform: "web" })
  } as unknown as BeforeInstallPromptEvent;
  (context.beforeInstallPromptListener as (event: Event) => void)(promptEvent as unknown as Event);
  assert.equal(preventDefault.mock.calls.length, 1);
  assert.equal(context.deferredInstallPrompt, promptEvent);
  assert.equal(context.showInstallPrompt, true);

  (context.appInstalledListener as () => void)();
  assert.equal(context.showInstallPrompt, false);
  assert.equal(context.deferredInstallPrompt, null);
});

test("setupPwaUiHandlers is idempotent and does not duplicate global listeners", () => {
  const windowMock = stubWindow();
  vi.stubGlobal("navigator", { onLine: true });
  const context = createContext();

  pwa.setupPwaUiHandlers.call(context as never);
  pwa.setupPwaUiHandlers.call(context as never);

  assert.equal(context.hasPwaUiHandlersBound, true);
  assert.equal((windowMock.addEventListener as ReturnType<typeof vi.fn>).mock.calls.length, 4);
});

test("setupPwaUiHandlers does not push cloud sync while signed out", () => {
  stubWindow();
  vi.stubGlobal("navigator", { onLine: true });

  const context = createContext({
    isGoogleSignedIn: false
  });

  pwa.setupPwaUiHandlers.call(context as never);
  (context.onlineListener as () => void)();

  assert.equal((context.debugLogEntitlement as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal((context.pushCloudSync as ReturnType<typeof vi.fn>).mock.calls.length, 0);
  assert.equal((context.retryPendingBuyerProfiles as ReturnType<typeof vi.fn>).mock.calls.length, 0);
});

test("Android runtime keeps connectivity listeners but skips install and service-worker hooks", () => {
  getAppRuntimeMock.mockReturnValue("android");
  const windowMock = stubWindow();
  stubDocument({ readyState: "complete" });
  const register = vi.fn();
  vi.stubGlobal("navigator", {
    onLine: true,
    serviceWorker: { register }
  });
  const context = createContext();

  pwa.setupPwaUiHandlers.call(context as never);
  pwa.registerServiceWorker.call(context as never);

  assert.deepEqual(
    windowMock.addEventListener.mock.calls.map((call: unknown[]) => call[0]),
    ["online", "offline"]
  );
  assert.equal(register.mock.calls.length, 0);
  assert.equal(context.hasRegisteredServiceWorkerLifecycle, false);
});

test("startOfflineReconnectScheduler no-ops when already running and reconnects when online", () => {
  let intervalTick: (() => void) | null = null;
  const windowMock = stubWindow({
    setInterval: vi.fn((callback: () => void) => {
      intervalTick = callback;
      return 77;
    })
  });
  const navigatorMock = { onLine: false };
  vi.stubGlobal("navigator", navigatorMock);

  const context = createContext({
    isOffline: true,
    stopOfflineReconnectScheduler: vi.fn(() => {
      context.offlineReconnectIntervalId = null;
    })
  });

  context.offlineReconnectIntervalId = 12;
  pwa.startOfflineReconnectScheduler.call(context as never);
  assert.equal((windowMock.setInterval as ReturnType<typeof vi.fn>).mock.calls.length, 0);

  context.offlineReconnectIntervalId = null;
  pwa.startOfflineReconnectScheduler.call(context as never);
  assert.equal(context.offlineReconnectIntervalId, 77);
  assert.equal((windowMock.setInterval as ReturnType<typeof vi.fn>).mock.calls.length, 1);

  callMaybe(intervalTick);
  assert.equal((context.notify as ReturnType<typeof vi.fn>).mock.calls.length, 0);
  assert.equal((context.stopOfflineReconnectScheduler as ReturnType<typeof vi.fn>).mock.calls.length, 0);

  navigatorMock.onLine = true;
  callMaybe(intervalTick);
  assert.equal(context.isOffline, false);
  assert.equal((context.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "Connection restored. Syncing…");
  assert.equal((context.stopOfflineReconnectScheduler as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal((context.debugLogEntitlement as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal((context.pushCloudSync as ReturnType<typeof vi.fn>).mock.calls.length, 1);
});

test("startOfflineReconnectScheduler stops itself when app is no longer offline", () => {
  let intervalTick: (() => void) | null = null;
  stubWindow({
    setInterval: vi.fn((callback: () => void) => {
      intervalTick = callback;
      return 5;
    })
  });
  vi.stubGlobal("navigator", { onLine: true });

  const context = createContext({
    isOffline: false,
    stopOfflineReconnectScheduler: vi.fn()
  });

  pwa.startOfflineReconnectScheduler.call(context as never);
  callMaybe(intervalTick);

  assert.equal((context.stopOfflineReconnectScheduler as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal((context.notify as ReturnType<typeof vi.fn>).mock.calls.length, 0);
});

test("stopOfflineReconnectScheduler clears interval id", () => {
  const windowMock = stubWindow();
  const context = createContext({
    offlineReconnectIntervalId: 123
  });

  pwa.stopOfflineReconnectScheduler.call(context as never);
  assert.equal((windowMock.clearInterval as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal(context.offlineReconnectIntervalId, null);

  pwa.stopOfflineReconnectScheduler.call(context as never);
  assert.equal((windowMock.clearInterval as ReturnType<typeof vi.fn>).mock.calls.length, 1);
});

test("promptInstall prompts and notifies when accepted", async () => {
  const prompt = vi.fn(async () => undefined);
  const context = createContext({
    deferredInstallPrompt: {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted", platform: "web" })
    }
  });

  await pwa.promptInstall.call(context as never);

  assert.equal(prompt.mock.calls.length, 1);
  assert.equal(context.showInstallPrompt, false);
  assert.equal(context.deferredInstallPrompt, null);
  assert.equal((context.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "Install started");
});

test("promptInstall exits when no deferred prompt and does not notify dismissed outcome", async () => {
  const contextWithoutPrompt = createContext({
    deferredInstallPrompt: null,
    showInstallPrompt: true
  });

  await pwa.promptInstall.call(contextWithoutPrompt as never);
  assert.equal(contextWithoutPrompt.showInstallPrompt, true);
  assert.equal((contextWithoutPrompt.notify as ReturnType<typeof vi.fn>).mock.calls.length, 0);

  const contextDismissed = createContext({
    deferredInstallPrompt: {
      prompt: vi.fn(async () => undefined),
      userChoice: Promise.resolve({ outcome: "dismissed", platform: "web" })
    }
  });
  await pwa.promptInstall.call(contextDismissed as never);
  assert.equal((contextDismissed.notify as ReturnType<typeof vi.fn>).mock.calls.length, 0);
});

test("unregisterServiceWorkersForDev unregisters registrations and clears caches", async () => {
  const registrationA = { unregister: vi.fn(async () => true) };
  const registrationB = { unregister: vi.fn(async () => true) };
  const getRegistrations = vi.fn(async () => [registrationA, registrationB]);
  vi.stubGlobal("navigator", {
    serviceWorker: {
      getRegistrations
    }
  });

  const cachesMock = {
    keys: vi.fn(async () => ["a", "b"]),
    delete: vi.fn(async () => true)
  };
  vi.stubGlobal("caches", cachesMock);
  stubWindow({
    caches: cachesMock
  });

  await pwa.unregisterServiceWorkersForDev.call(createContext() as never);

  assert.equal(getRegistrations.mock.calls.length, 1);
  assert.equal(registrationA.unregister.mock.calls.length, 1);
  assert.equal(registrationB.unregister.mock.calls.length, 1);
  assert.equal(cachesMock.keys.mock.calls.length, 1);
  assert.deepEqual(
    (cachesMock.delete.mock.calls as unknown as Array<[string]>).map((call) => call[0]),
    ["a", "b"]
  );
});

test("unregisterServiceWorkersForDev warns on cleanup failure and no-ops without serviceWorker", async () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("navigator", {});
  stubWindow();

  await pwa.unregisterServiceWorkersForDev.call(createContext() as never);
  assert.equal(warnSpy.mock.calls.length, 0);

  vi.stubGlobal("navigator", {
    serviceWorker: {
      getRegistrations: vi.fn(async () => {
        throw new Error("boom");
      })
    }
  });
  await pwa.unregisterServiceWorkersForDev.call(createContext() as never);
  assert.equal(warnSpy.mock.calls[0]?.[0], "Failed to clean service workers in dev:");
});

test("registerServiceWorker queues updates and performs a cache-busted navigation only after applyAppUpdate", async () => {
  const windowListeners = new Map<string, (...args: unknown[]) => unknown>();
  stubDocument({ readyState: "loading" });
  const setInterval = vi.fn(() => 88);
  const windowMock = stubWindow({
    addEventListener: vi.fn((eventName: string, callback: (...args: unknown[]) => unknown) => {
      windowListeners.set(eventName, callback);
    }),
    setInterval
  });

  const swListeners = new Map<string, () => void>();
  const waitingWorker = {
    scriptURL: "https://app.whatfees.ca/sw.js?v=1",
    postMessage: vi.fn()
  };
  let stateChangeListener: (() => void) | null = null;
  const installingWorker = {
    state: "installing",
    addEventListener: vi.fn((eventName: string, callback: () => void) => {
      if (eventName === "statechange") {
        stateChangeListener = callback;
      }
    })
  };
  let updateFoundListener: (() => void) | null = null;
  const registration = {
    waiting: waitingWorker,
    installing: installingWorker,
    addEventListener: vi.fn((eventName: string, callback: () => void) => {
      if (eventName === "updatefound") {
        updateFoundListener = callback;
      }
    }),
    update: vi.fn(async () => undefined)
  };
  const register = vi.fn(async () => registration);
  vi.stubGlobal("navigator", {
    serviceWorker: {
      controller: {},
      register,
      removeEventListener: vi.fn(),
      addEventListener: vi.fn((eventName: string, callback: () => void) => {
        swListeners.set(eventName, callback);
      })
    }
  });

  const context = createContext();
  pwa.registerServiceWorker.call(context as never);
  assert.equal((windowMock.addEventListener as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "load");
  assert.equal(typeof context.serviceWorkerLoadListener, "function");

  const loadListener = windowListeners.get("load") as (() => Promise<void>) | undefined;
  assert.equal(typeof loadListener, "function");
  await loadListener?.();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(register.mock.calls.length, 1);
  const registerCalls = register.mock.calls as unknown as Array<[string, RegistrationOptions]>;
  assert.equal(registerCalls[0]?.[0], "./sw.js");
  assert.deepEqual(registerCalls[0]?.[1], { updateViaCache: "none" });
  assert.equal(context.showAppUpdatePrompt, true);
  assert.equal(context.appUpdateWorker, waitingWorker);
  assert.equal(waitingWorker.postMessage.mock.calls.length, 0);

  callMaybe(updateFoundListener);
  assert.equal(installingWorker.addEventListener.mock.calls.length, 1);
  installingWorker.state = "installed";
  callMaybe(stateChangeListener);
  assert.equal(context.showAppUpdatePrompt, true);
  assert.equal(context.appUpdateWorker, waitingWorker);
  assert.equal(waitingWorker.postMessage.mock.calls.length, 0);

  assert.equal(registration.update.mock.calls.length, 1);
  assert.equal(context.serviceWorkerUpdateIntervalId, 88);
  assert.equal(typeof context.serviceWorkerControllerChangeListener, "function");

  pwa.applyAppUpdate.call(context as never);
  assert.equal(context.isApplyingAppUpdate, true);
  assert.equal(context.showAppUpdatePrompt, false);
  assert.equal(waitingWorker.postMessage.mock.calls.length, 1);
  assert.equal((windowMock.setTimeout as ReturnType<typeof vi.fn>).mock.calls.length, 1);

  swListeners.get("controllerchange")?.();
  swListeners.get("controllerchange")?.();
  assert.equal(windowMock.location.replace.mock.calls.length, 1);
  const refreshUrl = String(windowMock.location.replace.mock.calls[0]?.[0] ?? "");
  assert.match(refreshUrl, /app-updated=/);
  assert.match(refreshUrl, /app-update-source=sw/);
  assert.equal(context.appUpdateWorker, null);
});

test("applyAppUpdate falls back to a direct refresh when controllerchange does not arrive", () => {
  let timeoutCallback: (() => void) | null = null;
  const windowMock = stubWindow({
    setTimeout: vi.fn((callback: () => void) => {
      timeoutCallback = callback;
      return 44;
    })
  });
  const waitingWorker = {
    postMessage: vi.fn()
  };
  const context = createContext({
    appUpdateWorker: waitingWorker,
    showAppUpdatePrompt: true
  });

  pwa.applyAppUpdate.call(context as never);

  assert.equal(waitingWorker.postMessage.mock.calls.length, 1);
  assert.equal((windowMock.setTimeout as ReturnType<typeof vi.fn>).mock.calls.length, 1);

  callMaybe(timeoutCallback);

  assert.equal(windowMock.location.replace.mock.calls.length, 1);
  const refreshUrl = String(windowMock.location.replace.mock.calls[0]?.[0] ?? "");
  assert.match(refreshUrl, /app-updated=/);
  assert.match(refreshUrl, /app-update-source=sw/);
});

test("dismissAppUpdate hides the prompt without applying the worker", () => {
  const sessionStorage = createStorageMock();
  stubWindow({
    sessionStorage
  });
  const waitingWorker = {
    scriptURL: "https://app.whatfees.ca/sw.js?v=2",
    postMessage: vi.fn()
  };
  const context = createContext({
    showAppUpdatePrompt: true,
    appUpdateWorker: waitingWorker
  });

  pwa.dismissAppUpdate.call(context as never);

  assert.equal(context.showAppUpdatePrompt, false);
  assert.equal(waitingWorker.postMessage.mock.calls.length, 0);
  assert.equal(
    sessionStorage.getItem(DISMISSED_APP_UPDATE_SESSION_KEY),
    "https://app.whatfees.ca/sw.js?v=2"
  );
});

test("registerServiceWorker keeps the same dismissed worker hidden but shows a newer worker", async () => {
  const waitingWorker = {
    scriptURL: "https://app.whatfees.ca/sw.js?v=2",
    postMessage: vi.fn()
  };
  const newerWaitingWorker = {
    scriptURL: "https://app.whatfees.ca/sw.js?v=3",
    postMessage: vi.fn()
  };
  const sessionStorage = createStorageMock();
  stubDocument({ readyState: "loading" });
  let stateChangeListener: (() => void) | null = null;
  const installingWorker = {
    state: "installing",
    addEventListener: vi.fn((eventName: string, callback: () => void) => {
      if (eventName === "statechange") {
        stateChangeListener = callback;
      }
    })
  };
  let updateFoundListener: (() => void) | null = null;
  let registration = {
    waiting: waitingWorker,
    installing: null as typeof installingWorker | null,
    addEventListener: vi.fn((eventName: string, callback: () => void) => {
      if (eventName === "updatefound") {
        updateFoundListener = callback;
      }
    }),
    update: vi.fn(async () => undefined)
  };
  const register = vi.fn(async () => registration);
  vi.stubGlobal("navigator", {
    serviceWorker: {
      controller: {},
      register,
      removeEventListener: vi.fn(),
      addEventListener: vi.fn()
    }
  });

  const firstWindowListeners = new Map<string, (...args: unknown[]) => unknown>();
  stubWindow({
    sessionStorage,
    addEventListener: vi.fn((eventName: string, callback: (...args: unknown[]) => unknown) => {
      firstWindowListeners.set(eventName, callback);
    })
  });

  const firstContext = createContext();
  pwa.registerServiceWorker.call(firstContext as never);
  const firstLoadListener = firstWindowListeners.get("load") as (() => Promise<void>) | undefined;
  await firstLoadListener?.();
  assert.equal(firstContext.showAppUpdatePrompt, true);

  pwa.dismissAppUpdate.call(firstContext as never);
  assert.equal(firstContext.showAppUpdatePrompt, false);
  assert.equal(
    sessionStorage.getItem(DISMISSED_APP_UPDATE_SESSION_KEY),
    "https://app.whatfees.ca/sw.js?v=2"
  );

  const secondWindowListeners = new Map<string, (...args: unknown[]) => unknown>();
  stubWindow({
    sessionStorage,
    addEventListener: vi.fn((eventName: string, callback: (...args: unknown[]) => unknown) => {
      secondWindowListeners.set(eventName, callback);
    })
  });

  const secondContext = createContext();
  pwa.registerServiceWorker.call(secondContext as never);
  const secondLoadListener = secondWindowListeners.get("load") as (() => Promise<void>) | undefined;
  await secondLoadListener?.();
  assert.equal(secondContext.showAppUpdatePrompt, false);
  assert.equal(secondContext.appUpdateWorker, waitingWorker);

  registration = {
    waiting: newerWaitingWorker,
    installing: installingWorker,
    addEventListener: vi.fn((eventName: string, callback: () => void) => {
      if (eventName === "updatefound") {
        updateFoundListener = callback;
      }
    }),
    update: vi.fn(async () => undefined)
  };

  const thirdWindowListeners = new Map<string, (...args: unknown[]) => unknown>();
  stubWindow({
    sessionStorage,
    addEventListener: vi.fn((eventName: string, callback: (...args: unknown[]) => unknown) => {
      thirdWindowListeners.set(eventName, callback);
    })
  });

  const thirdContext = createContext();
  pwa.registerServiceWorker.call(thirdContext as never);
  const thirdLoadListener = thirdWindowListeners.get("load") as (() => Promise<void>) | undefined;
  await thirdLoadListener?.();
  assert.equal(thirdContext.showAppUpdatePrompt, true);
  assert.equal(thirdContext.appUpdateWorker, newerWaitingWorker);

  callMaybe(updateFoundListener);
  installingWorker.state = "installed";
  callMaybe(stateChangeListener);

  assert.equal(thirdContext.showAppUpdatePrompt, true);
  assert.equal(thirdContext.appUpdateWorker, newerWaitingWorker);
  assert.equal(sessionStorage.getItem(DISMISSED_APP_UPDATE_SESSION_KEY), null);
});

test("registerServiceWorker no-ops without service worker support and warns on register failure", async () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const windowListeners = new Map<string, (...args: unknown[]) => unknown>();
  stubDocument({ readyState: "loading" });
  const windowMock = stubWindow({
    addEventListener: vi.fn((eventName: string, callback: (...args: unknown[]) => unknown) => {
      windowListeners.set(eventName, callback);
    })
  });

  vi.stubGlobal("navigator", {});
  pwa.registerServiceWorker.call(createContext() as never);
  assert.equal((windowMock.addEventListener as ReturnType<typeof vi.fn>).mock.calls.length, 0);

  vi.stubGlobal("navigator", {
    serviceWorker: {
      register: vi.fn(async () => {
        throw new Error("register failed");
      }),
      removeEventListener: vi.fn(),
      addEventListener: vi.fn()
    }
  });
  pwa.registerServiceWorker.call(createContext() as never);
  const loadListener = windowListeners.get("load") as (() => Promise<void>) | undefined;
  await loadListener?.();
  assert.equal(warnSpy.mock.calls[0]?.[0], "Service worker registration failed:");
});

test("registerServiceWorker is idempotent and can register immediately after load", async () => {
  stubDocument({ readyState: "complete" });
  const setInterval = vi.fn(() => 99);
  stubWindow({ setInterval });
  const register = vi.fn(async () => ({
    waiting: null,
    installing: null,
    addEventListener: vi.fn(),
    update: vi.fn(async () => undefined)
  }));
  vi.stubGlobal("navigator", {
    serviceWorker: {
      controller: {},
      register,
      removeEventListener: vi.fn(),
      addEventListener: vi.fn()
    }
  });

  const context = createContext();
  pwa.registerServiceWorker.call(context as never);
  pwa.registerServiceWorker.call(context as never);

  await Promise.resolve();
  await Promise.resolve();

  assert.equal(context.hasRegisteredServiceWorkerLifecycle, true);
  assert.equal(register.mock.calls.length, 1);
  assert.equal(context.serviceWorkerUpdateIntervalId, 99);
});
