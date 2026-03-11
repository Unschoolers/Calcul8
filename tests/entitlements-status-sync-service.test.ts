import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const {
  fetchWithRetryMock,
  getEntitlementTtlMsMock,
  handleExpiredAuthMock,
  readEntitlementCacheMock,
  resolveApiBaseUrlMock
} = vi.hoisted(() => ({
  fetchWithRetryMock: vi.fn(),
  getEntitlementTtlMsMock: vi.fn(),
  handleExpiredAuthMock: vi.fn(),
  readEntitlementCacheMock: vi.fn(),
  resolveApiBaseUrlMock: vi.fn()
}));

vi.mock("../src/app-core/methods/ui/shared.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/app-core/methods/ui/shared.ts")>();
  return {
    ...actual,
    fetchWithRetry: fetchWithRetryMock,
    getEntitlementTtlMs: getEntitlementTtlMsMock,
    GOOGLE_TOKEN_KEY: "whatfees_google_id_token",
    handleExpiredAuth: handleExpiredAuthMock,
    readEntitlementCache: readEntitlementCacheMock,
    resolveApiBaseUrl: resolveApiBaseUrlMock
  };
});

import {
  applyCachedEntitlement,
  applyFetchedEntitlement,
  parseEntitlementPayload,
  shouldUseCachedEntitlement,
  syncEntitlementStatus
} from "../src/app-core/methods/ui/entitlements-status-service.ts";

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

function createApp(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    googleAuthEpoch: 0,
    hasProAccess: false,
    isOffline: false,
    pullCloudSync: vi.fn(async () => undefined),
    notify: vi.fn(),
    startOfflineReconnectScheduler: vi.fn(),
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveApiBaseUrlMock.mockReturnValue("https://api.example.test");
  getEntitlementTtlMsMock.mockReturnValue(10 * 60 * 1000);
  readEntitlementCacheMock.mockReturnValue(null);
});

test("syncEntitlementStatus uses cached entitlement and pulls cloud sync when allowed", async () => {
  await withMockedLocalStorage(async (data) => {
    data.set("whatfees_google_id_token", "google-token");
    readEntitlementCacheMock.mockReturnValue({
      userId: "u_1",
      hasProAccess: true,
      updatedAt: "2026-02-20T00:00:00Z",
      cachedAt: Date.now()
    });
    const app = createApp();

    await syncEntitlementStatus(app as never, false, {
      shouldUseCachedEntitlement,
      applyCachedEntitlement,
      applyFetchedEntitlement,
      parseEntitlementPayload
    });

    assert.equal(app.hasProAccess, true);
    assert.equal((app.pullCloudSync as ReturnType<typeof vi.fn>).mock.calls.length, 1);
    assert.equal(fetchWithRetryMock.mock.calls.length, 0);
  });
});

test("syncEntitlementStatus handles 401 by expiring auth and notifying", async () => {
  await withMockedLocalStorage(async (data) => {
    data.set("whatfees_google_id_token", "google-token");
    fetchWithRetryMock.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({})
    });
    const app = createApp();

    await syncEntitlementStatus(app as never, false, {
      shouldUseCachedEntitlement,
      applyCachedEntitlement,
      applyFetchedEntitlement,
      parseEntitlementPayload
    });

    assert.equal(handleExpiredAuthMock.mock.calls.length, 1);
    assert.equal((app.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "Your sign-in expired. Please sign in again.");
  });
});

test("syncEntitlementStatus fetches entitlement payload, applies it, and pulls cloud sync", async () => {
  await withMockedLocalStorage(async (data) => {
    data.set("whatfees_google_id_token", "google-token");
    fetchWithRetryMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        userId: "u_2",
        hasProAccess: true,
        updatedAt: "2026-02-21T00:00:00Z"
      })
    });
    const app = createApp({
      hasLotSelected: false,
      targetProfitPercent: 0,
      autoSaveSetup: vi.fn()
    });

    await syncEntitlementStatus(app as never, true, {
      shouldUseCachedEntitlement,
      applyCachedEntitlement,
      applyFetchedEntitlement,
      parseEntitlementPayload
    });

    assert.equal(app.hasProAccess, true);
    assert.equal((app.pullCloudSync as ReturnType<typeof vi.fn>).mock.calls.length, 1);
    assert.equal(fetchWithRetryMock.mock.calls.length, 1);
  });
});
