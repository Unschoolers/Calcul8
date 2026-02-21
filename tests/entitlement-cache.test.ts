import assert from "node:assert/strict";
import { test } from "vitest";
import { uiEntitlementMethods } from "../src/app-core/methods/ui/entitlements.ts";
import { ENTITLEMENT_CACHE_KEY } from "../src/app-core/methods/ui/shared.ts";

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

function withMockedWindow(run: () => Promise<void> | void): Promise<void> | void {
  const globals = globalThis as typeof globalThis & { window?: unknown };
  const originalWindow = globals.window;

  Object.defineProperty(globals, "window", {
    configurable: true,
    value: {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      google: undefined
    }
  });

  const restore = () => {
    Object.defineProperty(globals, "window", {
      configurable: true,
      value: originalWindow
    });
  };

  try {
    const result = run();
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

test("initGoogleAutoLogin keeps pro access from entitlement cache without login token", async () => {
  await withMockedWindow(async () => withMockedLocalStorage(async (data) => {
    data.set(
      ENTITLEMENT_CACHE_KEY,
      JSON.stringify({
        userId: "cached-user",
        hasProAccess: true,
        updatedAt: "2026-02-18T00:00:00.000Z",
        cachedAt: Date.now()
      })
    );

    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: async () => {
        fetchCalled = true;
        throw new Error("fetch should not be called on valid cache hit");
      }
    });

    try {
      let autoSaveCalled = false;

      const context = {
        hasLotSelected: true,
        targetProfitPercent: 0,
        autoSaveSetup() {
          autoSaveCalled = true;
        },
        hasProAccess: false
      } as unknown as Parameters<typeof uiEntitlementMethods.initGoogleAutoLogin>[0];

      uiEntitlementMethods.initGoogleAutoLogin.call(context);

      assert.equal(context.hasProAccess, true);
      assert.equal(context.targetProfitPercent, 15);
      assert.equal(autoSaveCalled, true);
      assert.equal(fetchCalled, false);
    } finally {
      Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: originalFetch
      });
    }
  }));
});

