import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const {
  fetchWithRetryMock,
  getEntitlementTtlMsMock,
  handleExpiredAuthMock,
  readEntitlementCacheMock,
  resolveApiBaseUrlMock,
  applyCachedEntitlementMock,
  applyFetchedEntitlementMock,
  parseEntitlementPayloadMock,
  shouldUseCachedEntitlementMock
} = vi.hoisted(() => ({
  fetchWithRetryMock: vi.fn(),
  getEntitlementTtlMsMock: vi.fn(),
  handleExpiredAuthMock: vi.fn(),
  readEntitlementCacheMock: vi.fn(),
  resolveApiBaseUrlMock: vi.fn(),
  applyCachedEntitlementMock: vi.fn(),
  applyFetchedEntitlementMock: vi.fn(),
  parseEntitlementPayloadMock: vi.fn(),
  shouldUseCachedEntitlementMock: vi.fn()
}));

vi.mock("../src/app-core/methods/ui/shared.ts", () => ({
  fetchWithRetry: fetchWithRetryMock,
  getEntitlementTtlMs: getEntitlementTtlMsMock,
  GOOGLE_TOKEN_KEY: "whatfees_google_id_token",
  handleExpiredAuth: handleExpiredAuthMock,
  readEntitlementCache: readEntitlementCacheMock,
  resolveApiBaseUrl: resolveApiBaseUrlMock
}));

vi.mock("../src/app-core/methods/ui/entitlements-status-service.ts", () => ({
  applyCachedEntitlement: applyCachedEntitlementMock,
  applyFetchedEntitlement: applyFetchedEntitlementMock,
  parseEntitlementPayload: parseEntitlementPayloadMock,
  shouldUseCachedEntitlement: shouldUseCachedEntitlementMock
}));

import { uiEntitlementStatusMethods } from "../src/app-core/methods/ui/entitlements-status.ts";

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

function createContext(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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
  shouldUseCachedEntitlementMock.mockReturnValue(false);
  parseEntitlementPayloadMock.mockImplementation((data: { userId?: string; hasProAccess?: boolean; updatedAt?: string }) => ({
    userId: data.userId ?? null,
    hasProAccess: Boolean(data.hasProAccess),
    updatedAt: data.updatedAt ?? null
  }));
});

test("debugLogEntitlement returns early when API base URL is missing", async () => {
  resolveApiBaseUrlMock.mockReturnValue("");

  await withMockedLocalStorage(async () => {
    await uiEntitlementStatusMethods.debugLogEntitlement.call(createContext() as never);
  });

  assert.equal(fetchWithRetryMock.mock.calls.length, 0);
  assert.equal(applyCachedEntitlementMock.mock.calls.length, 0);
});

test("debugLogEntitlement uses cached entitlement and pulls cloud sync when token exists", async () => {
  await withMockedLocalStorage(async (data) => {
    data.set("whatfees_google_id_token", "google-token");
    readEntitlementCacheMock.mockReturnValue({
      userId: "u_1",
      hasProAccess: true,
      updatedAt: "2026-02-20T00:00:00Z",
      cachedAt: Date.now()
    });
    shouldUseCachedEntitlementMock.mockReturnValue(true);
    const context = createContext();

    await uiEntitlementStatusMethods.debugLogEntitlement.call(context as never);

    assert.equal(applyCachedEntitlementMock.mock.calls.length, 1);
    assert.equal((context.pullCloudSync as ReturnType<typeof vi.fn>).mock.calls.length, 1);
    assert.equal(fetchWithRetryMock.mock.calls.length, 0);
  });
});

test("debugLogEntitlement fetches entitlement when token is missing (cookie-first)", async () => {
  await withMockedLocalStorage(async () => {
    fetchWithRetryMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        userId: "u_cookie",
        hasProAccess: false,
        updatedAt: "2026-03-09T00:00:00Z"
      })
    });
    parseEntitlementPayloadMock.mockReturnValue({
      userId: "u_cookie",
      hasProAccess: false,
      updatedAt: "2026-03-09T00:00:00Z"
    });
    const context = createContext();

    await uiEntitlementStatusMethods.debugLogEntitlement.call(context as never);

    assert.equal(fetchWithRetryMock.mock.calls.length, 1);
    const init = fetchWithRetryMock.mock.calls[0]?.[1] as { headers?: Record<string, string> } | undefined;
    assert.ok(init);
    assert.deepEqual(init?.headers ?? {}, {});
    assert.equal(applyFetchedEntitlementMock.mock.calls.length, 1);
    assert.equal((context.pullCloudSync as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  });
});

test("debugLogEntitlement handles 401 by expiring auth and notifying", async () => {
  await withMockedLocalStorage(async (data) => {
    data.set("whatfees_google_id_token", "google-token");
    fetchWithRetryMock.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({})
    });
    const context = createContext();

    await uiEntitlementStatusMethods.debugLogEntitlement.call(context as never);

    assert.equal(handleExpiredAuthMock.mock.calls.length, 1);
    assert.equal((context.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "Your sign-in expired. Please sign in again.");
    assert.equal(applyFetchedEntitlementMock.mock.calls.length, 0);
  });
});

test("debugLogEntitlement logs non-ok responses without mutating entitlement state", async () => {
  await withMockedLocalStorage(async (data) => {
    data.set("whatfees_google_id_token", "google-token");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      fetchWithRetryMock.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Server Error",
        json: async () => ({})
      });
      const context = createContext();
      await uiEntitlementStatusMethods.debugLogEntitlement.call(context as never);

      assert.equal(applyFetchedEntitlementMock.mock.calls.length, 0);
      assert.equal(warnSpy.mock.calls.length > 0, true);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

test("debugLogEntitlement fetches and applies entitlement payload then pulls cloud sync", async () => {
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
    parseEntitlementPayloadMock.mockReturnValue({
      userId: "u_2",
      hasProAccess: true,
      updatedAt: "2026-02-21T00:00:00Z"
    });
    const context = createContext();

    await uiEntitlementStatusMethods.debugLogEntitlement.call(context as never, true);

    assert.equal(parseEntitlementPayloadMock.mock.calls.length, 1);
    assert.equal(applyFetchedEntitlementMock.mock.calls.length, 1);
    assert.equal((context.pullCloudSync as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  });
});

test("debugLogEntitlement marks offline and starts reconnect scheduler on network failure", async () => {
  await withMockedLocalStorage(async (data) => {
    data.set("whatfees_google_id_token", "google-token");
    fetchWithRetryMock.mockRejectedValue(new Error("network down"));
    vi.stubGlobal("navigator", { onLine: false });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const context = createContext();
      await uiEntitlementStatusMethods.debugLogEntitlement.call(context as never);

      assert.equal(context.isOffline, true);
      assert.equal((context.startOfflineReconnectScheduler as ReturnType<typeof vi.fn>).mock.calls.length, 1);
      assert.equal(warnSpy.mock.calls.length > 0, true);
    } finally {
      warnSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
