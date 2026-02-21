import assert from "node:assert/strict";
import { test } from "vitest";
import {
  ENTITLEMENT_CACHE_KEY,
  PRO_ACCESS_KEY,
  submitPlayPurchaseVerification
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

test("submitPlayPurchaseVerification unlocks Pro immediately and persists cache", async () => {
  await withMockedLocalStorage(async () => {
    const originalFetch = globalThis.fetch;
    const originalWindow = (globalThis as { window?: Window }).window;
    const originalWarn = console.warn;
    Object.defineProperty(globalThis, "window", { configurable: true, value: globalThis });
    console.warn = () => {
      // Silence expected warning from rejected background refresh in this test.
    };

    let refreshCalled = 0;
    let fetchCalls = 0;
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: async () => {
        fetchCalls += 1;
        return new Response(
          JSON.stringify({
            ok: true,
            userId: "user-123",
            hasProAccess: true,
            updatedAt: "2026-02-19T15:00:00.000Z"
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
    });

    const app = {
      hasProAccess: false,
      notify(): void {
        // Not used in this test path.
      },
      async debugLogEntitlement(): Promise<void> {
        refreshCalled += 1;
        throw new Error("simulated refresh failure");
      }
    };

    try {
      const verified = await submitPlayPurchaseVerification(app as never, {
        baseUrl: "https://api.example.test",
        googleIdToken: "google-id-token",
        purchaseToken: "purchase-token",
        productId: "pro_access"
      });

      assert.equal(verified, true);
      assert.equal(fetchCalls, 1);
      assert.equal(refreshCalled, 1);
      assert.equal(app.hasProAccess, true);
      assert.equal(localStorage.getItem(PRO_ACCESS_KEY), "1");

      const cacheRaw = localStorage.getItem(ENTITLEMENT_CACHE_KEY);
      assert.ok(cacheRaw);
      const cache = JSON.parse(cacheRaw!);
      assert.equal(cache.userId, "user-123");
      assert.equal(cache.hasProAccess, true);
      assert.equal(cache.updatedAt, "2026-02-19T15:00:00.000Z");
      assert.equal(typeof cache.cachedAt, "number");
    } finally {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: originalFetch
      });
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow
      });
      console.warn = originalWarn;
    }
  });
});

test("submitPlayPurchaseVerification defaults to Pro=true on successful response without payload flags", async () => {
  await withMockedLocalStorage(async () => {
    const originalFetch = globalThis.fetch;
    const originalWindow = (globalThis as { window?: Window }).window;
    Object.defineProperty(globalThis, "window", { configurable: true, value: globalThis });

    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: async () => {
        return new Response("{}", {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    });

    const app = {
      hasProAccess: false,
      notify(): void {
        // Not used in this test path.
      },
      async debugLogEntitlement(): Promise<void> {
        // noop
      }
    };

    try {
      const verified = await submitPlayPurchaseVerification(app as never, {
        baseUrl: "https://api.example.test",
        googleIdToken: "google-id-token",
        purchaseToken: "purchase-token"
      });

      assert.equal(verified, true);
      assert.equal(app.hasProAccess, true);
      assert.equal(localStorage.getItem(PRO_ACCESS_KEY), "1");
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

test("submitPlayPurchaseVerification sends deterministic idempotencyKey", async () => {
  await withMockedLocalStorage(async () => {
    const originalFetch = globalThis.fetch;
    const originalWindow = (globalThis as { window?: Window }).window;
    Object.defineProperty(globalThis, "window", { configurable: true, value: globalThis });

    const capturedBodies: Array<Record<string, unknown>> = [];
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: async (_input: unknown, init?: RequestInit) => {
        const parsed = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        capturedBodies.push(parsed);
        return new Response("{}", {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    });

    const app = {
      hasProAccess: false,
      notify(): void {
        // Not used in this test path.
      },
      async debugLogEntitlement(): Promise<void> {
        // noop
      }
    };

    try {
      await submitPlayPurchaseVerification(app as never, {
        baseUrl: "https://api.example.test",
        googleIdToken: "google-id-token",
        purchaseToken: "purchase-token",
        productId: "pro_access"
      });
      await submitPlayPurchaseVerification(app as never, {
        baseUrl: "https://api.example.test",
        googleIdToken: "google-id-token",
        purchaseToken: "purchase-token",
        productId: "pro_access"
      });

      assert.equal(capturedBodies.length, 2);
      const idempotencyKeyOne = String(capturedBodies[0]?.idempotencyKey ?? "");
      const idempotencyKeyTwo = String(capturedBodies[1]?.idempotencyKey ?? "");
      assert.match(idempotencyKeyOne, /^play_[A-Za-z0-9_-]{8,120}$/);
      assert.equal(idempotencyKeyOne, idempotencyKeyTwo);
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

