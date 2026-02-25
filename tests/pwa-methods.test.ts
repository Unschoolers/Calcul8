import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import { APP_VERSION } from "../src/constants.ts";
import { pwaMethods } from "../src/app-core/methods/pwa.ts";
import type { BeforeInstallPromptEvent } from "../src/types/app.ts";

type PwaContext = Record<string, unknown>;

function createContext(overrides: PwaContext = {}): PwaContext {
  return {
    isOffline: false,
    offlineReconnectIntervalId: null,
    deferredInstallPrompt: null,
    showInstallPrompt: false,
    onlineListener: null,
    offlineListener: null,
    beforeInstallPromptListener: null,
    appInstalledListener: null,
    notify: vi.fn(),
    debugLogEntitlement: vi.fn(async () => undefined),
    pushCloudSync: vi.fn(async () => undefined),
    startOfflineReconnectScheduler: vi.fn(),
    stopOfflineReconnectScheduler: vi.fn(),
    ...overrides
  };
}

function stubWindow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const baseWindow = {
    addEventListener: vi.fn(),
    setInterval: vi.fn(() => 1),
    clearInterval: vi.fn(),
    location: {
      reload: vi.fn()
    }
  };
  const windowMock = { ...baseWindow, ...overrides };
  vi.stubGlobal("window", windowMock);
  return windowMock;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("setupPwaUiHandlers wires listeners and handles online/offline/install events", () => {
  const windowMock = stubWindow();
  vi.stubGlobal("navigator", { onLine: true });

  const context = createContext({
    isOffline: true,
    startOfflineReconnectScheduler: vi.fn(),
    stopOfflineReconnectScheduler: vi.fn()
  });

  pwaMethods.setupPwaUiHandlers.call(context as never);

  assert.equal((windowMock.addEventListener as ReturnType<typeof vi.fn>).mock.calls.length, 4);
  assert.equal((context.startOfflineReconnectScheduler as ReturnType<typeof vi.fn>).mock.calls.length, 1);

  (context.onlineListener as () => void)();
  assert.equal(context.isOffline, false);
  assert.equal((context.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "Back online");
  assert.equal((context.stopOfflineReconnectScheduler as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal((context.debugLogEntitlement as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal((context.pushCloudSync as ReturnType<typeof vi.fn>).mock.calls.length, 1);

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
  pwaMethods.startOfflineReconnectScheduler.call(context as never);
  assert.equal((windowMock.setInterval as ReturnType<typeof vi.fn>).mock.calls.length, 0);

  context.offlineReconnectIntervalId = null;
  pwaMethods.startOfflineReconnectScheduler.call(context as never);
  assert.equal(context.offlineReconnectIntervalId, 77);
  assert.equal((windowMock.setInterval as ReturnType<typeof vi.fn>).mock.calls.length, 1);

  intervalTick?.();
  assert.equal((context.notify as ReturnType<typeof vi.fn>).mock.calls.length, 0);
  assert.equal((context.stopOfflineReconnectScheduler as ReturnType<typeof vi.fn>).mock.calls.length, 0);

  navigatorMock.onLine = true;
  intervalTick?.();
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

  pwaMethods.startOfflineReconnectScheduler.call(context as never);
  intervalTick?.();

  assert.equal((context.stopOfflineReconnectScheduler as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal((context.notify as ReturnType<typeof vi.fn>).mock.calls.length, 0);
});

test("stopOfflineReconnectScheduler clears interval id", () => {
  const windowMock = stubWindow();
  const context = createContext({
    offlineReconnectIntervalId: 123
  });

  pwaMethods.stopOfflineReconnectScheduler.call(context as never);
  assert.equal((windowMock.clearInterval as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal(context.offlineReconnectIntervalId, null);

  pwaMethods.stopOfflineReconnectScheduler.call(context as never);
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

  await pwaMethods.promptInstall.call(context as never);

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

  await pwaMethods.promptInstall.call(contextWithoutPrompt as never);
  assert.equal(contextWithoutPrompt.showInstallPrompt, true);
  assert.equal((contextWithoutPrompt.notify as ReturnType<typeof vi.fn>).mock.calls.length, 0);

  const contextDismissed = createContext({
    deferredInstallPrompt: {
      prompt: vi.fn(async () => undefined),
      userChoice: Promise.resolve({ outcome: "dismissed", platform: "web" })
    }
  });
  await pwaMethods.promptInstall.call(contextDismissed as never);
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

  await pwaMethods.unregisterServiceWorkersForDev.call(createContext() as never);

  assert.equal(getRegistrations.mock.calls.length, 1);
  assert.equal(registrationA.unregister.mock.calls.length, 1);
  assert.equal(registrationB.unregister.mock.calls.length, 1);
  assert.equal(cachesMock.keys.mock.calls.length, 1);
  assert.deepEqual(
    cachesMock.delete.mock.calls.map((call) => call[0]),
    ["a", "b"]
  );
});

test("unregisterServiceWorkersForDev warns on cleanup failure and no-ops without serviceWorker", async () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("navigator", {});
  stubWindow();

  await pwaMethods.unregisterServiceWorkersForDev.call(createContext() as never);
  assert.equal(warnSpy.mock.calls.length, 0);

  vi.stubGlobal("navigator", {
    serviceWorker: {
      getRegistrations: vi.fn(async () => {
        throw new Error("boom");
      })
    }
  });
  await pwaMethods.unregisterServiceWorkersForDev.call(createContext() as never);
  assert.equal(warnSpy.mock.calls[0]?.[0], "Failed to clean service workers in dev:");
});

test("registerServiceWorker registers on load, handles updates, and refreshes once on controllerchange", async () => {
  const windowListeners = new Map<string, (...args: unknown[]) => unknown>();
  const setInterval = vi.fn(() => 88);
  const windowMock = stubWindow({
    addEventListener: vi.fn((eventName: string, callback: (...args: unknown[]) => unknown) => {
      windowListeners.set(eventName, callback);
    }),
    setInterval
  });

  const swListeners = new Map<string, () => void>();
  const waitingWorker = {
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
      addEventListener: vi.fn((eventName: string, callback: () => void) => {
        swListeners.set(eventName, callback);
      })
    }
  });

  pwaMethods.registerServiceWorker.call(createContext() as never);
  assert.equal((windowMock.addEventListener as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "load");

  const loadListener = windowListeners.get("load") as (() => Promise<void>) | undefined;
  assert.equal(typeof loadListener, "function");
  await loadListener?.();

  assert.equal(register.mock.calls.length, 1);
  assert.equal(register.mock.calls[0]?.[0], `./sw.js?v=${encodeURIComponent(APP_VERSION)}`);
  assert.deepEqual(register.mock.calls[0]?.[1], { updateViaCache: "none" });
  assert.equal(waitingWorker.postMessage.mock.calls.length, 1);

  updateFoundListener?.();
  assert.equal(installingWorker.addEventListener.mock.calls.length, 1);
  installingWorker.state = "installed";
  stateChangeListener?.();
  assert.equal(waitingWorker.postMessage.mock.calls.length, 2);

  assert.equal(registration.update.mock.calls.length, 1);
  assert.equal(setInterval.mock.calls[0]?.[1], 60 * 1000);

  swListeners.get("controllerchange")?.();
  swListeners.get("controllerchange")?.();
  assert.equal(windowMock.location.reload.mock.calls.length, 1);
});

test("registerServiceWorker no-ops without service worker support and warns on register failure", async () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const windowListeners = new Map<string, (...args: unknown[]) => unknown>();
  const windowMock = stubWindow({
    addEventListener: vi.fn((eventName: string, callback: (...args: unknown[]) => unknown) => {
      windowListeners.set(eventName, callback);
    })
  });

  vi.stubGlobal("navigator", {});
  pwaMethods.registerServiceWorker.call(createContext() as never);
  assert.equal((windowMock.addEventListener as ReturnType<typeof vi.fn>).mock.calls.length, 0);

  vi.stubGlobal("navigator", {
    serviceWorker: {
      register: vi.fn(async () => {
        throw new Error("register failed");
      }),
      addEventListener: vi.fn()
    }
  });
  pwaMethods.registerServiceWorker.call(createContext() as never);
  const loadListener = windowListeners.get("load") as (() => Promise<void>) | undefined;
  await loadListener?.();
  assert.equal(warnSpy.mock.calls[0]?.[0], "Service worker registration failed:");
});
