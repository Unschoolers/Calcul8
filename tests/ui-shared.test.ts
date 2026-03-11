import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import {
  CSRF_TOKEN_KEY,
  ENTITLEMENT_CACHE_KEY,
  GOOGLE_PROFILE_CACHE_KEY,
  GOOGLE_TOKEN_KEY,
  PRO_ACCESS_KEY,
  clearEntitlementCache,
  fetchWithRetry,
  getEntitlementTtlMs,
  handleExpiredAuth,
  readEntitlementCache,
  resolveApiBaseUrl,
  resolvePurchaseProvider,
  submitPlayPurchaseVerification,
  writeEntitlementCache
} from "../src/app-core/methods/ui/shared.ts";

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

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.stubGlobal("window", {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test("resolvePurchaseProvider and entitlement TTL read env values safely", () => {
  vi.stubEnv("VITE_PURCHASE_PROVIDER", "stripe");
  assert.equal(resolvePurchaseProvider(), "stripe");

  vi.stubEnv("VITE_PURCHASE_PROVIDER", "auto");
  assert.equal(resolvePurchaseProvider(), "auto");

  vi.stubEnv("VITE_PURCHASE_PROVIDER", "unknown");
  assert.equal(resolvePurchaseProvider(), "play");

  vi.stubEnv("VITE_ENTITLEMENT_TTL_MINUTES", "15");
  assert.equal(getEntitlementTtlMs(), 15 * 60 * 1000);

  vi.stubEnv("VITE_ENTITLEMENT_TTL_MINUTES", "0");
  assert.equal(getEntitlementTtlMs(), 7 * 24 * 60 * 60 * 1000);
});

test("resolveApiBaseUrl normalizes configured value and caches it locally", async () => {
  await withMockedLocalStorage(async (data) => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.test///");

    const baseUrl = resolveApiBaseUrl();

    assert.equal(baseUrl, "https://api.example.test");
    assert.equal(data.get("whatfees_api_base_url"), "https://api.example.test");
  });
});

test("entitlement cache helpers parse valid payloads and reject malformed ones", async () => {
  await withMockedLocalStorage(async (data) => {
    writeEntitlementCache({
      userId: "user-1",
      hasProAccess: true,
      updatedAt: "2026-03-11T00:00:00Z",
      cachedAt: 123
    });

    assert.deepEqual(readEntitlementCache(), {
      userId: "user-1",
      hasProAccess: true,
      updatedAt: "2026-03-11T00:00:00Z",
      cachedAt: 123
    });

    data.set(ENTITLEMENT_CACHE_KEY, JSON.stringify({
      userId: "user-2",
      hasProAccess: "yes",
      cachedAt: 123
    }));
    assert.equal(readEntitlementCache(), null);

    data.set(ENTITLEMENT_CACHE_KEY, "{bad json");
    assert.equal(readEntitlementCache(), null);

    data.set("rtyh_entitlement_cache_v1", JSON.stringify({
      userId: "legacy-user",
      hasProAccess: false,
      updatedAt: null,
      cachedAt: 999
    }));
    data.delete(ENTITLEMENT_CACHE_KEY);
    assert.deepEqual(readEntitlementCache(), {
      userId: "legacy-user",
      hasProAccess: false,
      updatedAt: null,
      cachedAt: 999
    });

    clearEntitlementCache();
    assert.equal(data.has(ENTITLEMENT_CACHE_KEY), false);
    assert.equal(data.has("rtyh_entitlement_cache_v1"), false);
  });
});

test("handleExpiredAuth clears auth tokens and restores cached entitlement state", async () => {
  await withMockedLocalStorage(async (data) => {
    data.set(GOOGLE_TOKEN_KEY, "google-token");
    data.set("rtyh_google_id_token", "legacy-google-token");
    data.set(GOOGLE_PROFILE_CACHE_KEY, JSON.stringify({ name: "Alice" }));
    data.set("rtyh_google_profile_cache_v1", JSON.stringify({ name: "Legacy Alice" }));
    data.set(CSRF_TOKEN_KEY, "csrf-token");
    writeEntitlementCache({
      userId: "user-9",
      hasProAccess: true,
      updatedAt: "2026-03-11T00:00:00Z",
      cachedAt: 321
    });

    const app = {
      googleAuthEpoch: 2,
      hasProAccess: false
    };

    handleExpiredAuth(app as never);

    assert.equal(app.googleAuthEpoch, 3);
    assert.equal(app.hasProAccess, true);
    assert.equal(data.has(GOOGLE_TOKEN_KEY), false);
    assert.equal(data.has("rtyh_google_id_token"), false);
    assert.equal(data.has(GOOGLE_PROFILE_CACHE_KEY), false);
    assert.equal(data.has("rtyh_google_profile_cache_v1"), false);
    assert.equal(data.has(CSRF_TOKEN_KEY), false);
    assert.equal(data.get(PRO_ACCESS_KEY), "1");
  });
});

test("fetchWithRetry retries retryable responses and network errors", async () => {
  await withMockedLocalStorage(async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(new Response("{}", {
        status: 429,
        headers: {
          "retry-after": "0"
        }
      }))
      .mockRejectedValueOnce(new TypeError("temporary network issue"))
      .mockResolvedValueOnce(new Response("{}", {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchWithRetry("https://api.example.test/retry", {
      method: "POST",
      body: "{}"
    }, {
      maxAttempts: 3,
      baseDelayMs: 1,
      timeoutMs: 50
    });

    await vi.runAllTimersAsync();
    const response = await promise;

    assert.equal(response.status, 200);
    assert.equal(fetchMock.mock.calls.length, 3);
  });
});

test("submitPlayPurchaseVerification handles expired auth", async () => {
  await withMockedLocalStorage(async () => {
    const originalFetch = globalThis.fetch;
    const originalWindow = (globalThis as { window?: Window }).window;
    try {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
          setTimeout: globalThis.setTimeout,
          clearTimeout: globalThis.clearTimeout
        }
      });

      const notify = vi.fn();
      const debugLogEntitlement = vi.fn(async () => undefined);
      const app = {
        googleAuthEpoch: 0,
        hasProAccess: false,
        notify,
        debugLogEntitlement
      };

      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: vi.fn(async () => new Response("{}", { status: 401 }))
      });
      writeEntitlementCache({
        userId: "user-1",
        hasProAccess: true,
        updatedAt: "2026-03-11T00:00:00Z",
        cachedAt: 111
      });
      let verified = await submitPlayPurchaseVerification(app as never, {
        baseUrl: "https://api.example.test",
        purchaseToken: "purchase-token"
      });
      assert.equal(verified, false);
      assert.equal(app.googleAuthEpoch, 1);
      assert.equal(app.hasProAccess, true);
      assert.equal(notify.mock.calls.at(-1)?.[0], "Your sign-in expired. Please sign in again.");
    } finally {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: originalFetch
      });
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow
      });
    }
  });
});

test("submitPlayPurchaseVerification handles pending purchases", async () => {
  await withMockedLocalStorage(async () => {
    const originalFetch = globalThis.fetch;
    const originalWindow = (globalThis as { window?: Window }).window;
    try {
      const notify = vi.fn();
      const debugLogEntitlement = vi.fn(async () => undefined);
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
          setTimeout: (callback: TimerHandler): number => {
            if (typeof callback === "function") {
              callback();
            }
            return 1;
          },
          clearTimeout: globalThis.clearTimeout
        }
      });
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: vi.fn(async () => new Response(JSON.stringify({
          message: "Still pending"
        }), {
          status: 202,
          headers: { "Content-Type": "application/json" }
        }))
      });

      const verified = await submitPlayPurchaseVerification({
        googleAuthEpoch: 0,
        hasProAccess: false,
        notify,
        debugLogEntitlement
      } as never, {
        baseUrl: "https://api.example.test",
        purchaseToken: "purchase-token"
      });

      assert.equal(verified, false);
      assert.equal(notify.mock.calls.at(-1)?.[0], "Still pending");
      assert.equal(debugLogEntitlement.mock.calls.length, 1);
      assert.equal(debugLogEntitlement.mock.calls.at(-1)?.[0], true);
    } finally {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: originalFetch
      });
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow
      });
    }
  });
});

test("submitPlayPurchaseVerification handles API errors", async () => {
  await withMockedLocalStorage(async () => {
    const originalFetch = globalThis.fetch;
    const originalWindow = (globalThis as { window?: Window }).window;
    try {
      const notify = vi.fn();
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
          setTimeout: globalThis.setTimeout,
          clearTimeout: globalThis.clearTimeout
        }
      });
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: vi.fn(async () => new Response(JSON.stringify({
          error: "Verification failed upstream"
        }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }))
      });

      const verified = await submitPlayPurchaseVerification({
        googleAuthEpoch: 0,
        hasProAccess: false,
        notify,
        debugLogEntitlement: vi.fn(async () => undefined)
      } as never, {
        baseUrl: "https://api.example.test",
        purchaseToken: "purchase-token"
      });

      assert.equal(verified, false);
      assert.equal(notify.mock.calls.at(-1)?.[0], "Verification failed upstream");
    } finally {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: originalFetch
      });
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow
      });
    }
  });
});
