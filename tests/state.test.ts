import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

import { createInitialState } from "../src/app-core/state.ts";
import { STORAGE_KEYS } from "../src/app-core/storageKeys.ts";

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
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("createInitialState initializes expert/pro state from current storage keys", async () => {
  await withMockedLocalStorage(async (data) => {
    data.set(STORAGE_KEYS.PURCHASE_UI_MODE, "expert");
    data.set(STORAGE_KEYS.PRO_ACCESS, "1");
    vi.stubGlobal("navigator", { onLine: false });

    const state = createInitialState();

    assert.equal(state.purchaseUiMode, "expert");
    assert.equal(state.hasProAccess, true);
    assert.equal(state.targetProfitPercent, 15);
    assert.equal(state.isOffline, true);
    assert.equal(state.newSale.type, "pack");
    assert.equal(state.newSale.date, state.purchaseDate);
    assert.equal(state.purchaseDate, state.newSale.date);
    assert.match(state.purchaseDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(state.newSale.customer, "");
    assert.equal(state.chartView, "sparkline");
    assert.equal(state.syncStatus, "idle");
    assert.equal(state.workspaceRealtimeStatus, "idle");
  });
});

test("createInitialState initializes simple/non-pro defaults and empty collections", async () => {
  await withMockedLocalStorage(async (data) => {
    vi.stubGlobal("navigator", { onLine: true });
    data.set(STORAGE_KEYS.PURCHASE_UI_MODE, "expert");

    const state = createInitialState();

    assert.equal(state.purchaseUiMode, "simple");
    assert.equal(state.hasProAccess, false);
    assert.equal(state.targetProfitPercent, 0);
    assert.equal(state.isOffline, false);
    assert.deepEqual(state.sales, []);
    assert.deepEqual(state.lots, []);
    assert.deepEqual(state.singlesPurchases, []);
    assert.equal(state.currentLotId, null);
    assert.equal(state.showSinglesCsvMapperModal, false);
    assert.equal(state.singlesCsvImportMode, "merge");
    assert.equal(state.singlesCsvMapItem, null);
    assert.equal(state.singlesCsvMapMarketValue, null);
    assert.equal(state.activeScopeType, "personal");
    assert.equal(state.activeWorkspaceId, null);
    assert.deepEqual(state.availableWorkspaces, []);
    assert.equal(state.cloudSyncIntervalId, null);
    assert.equal(state.offlineReconnectIntervalId, null);
    assert.equal(state.workspaceRealtimeStatus, "idle");
  });
});

test("createInitialState prefers a stored language and falls back to browser locale", async () => {
  await withMockedLocalStorage(async (data) => {
    data.set(STORAGE_KEYS.LANGUAGE, "fr");
    vi.stubGlobal("navigator", { onLine: true });

    const withStoredLanguage = createInitialState();
    assert.equal(withStoredLanguage.preferredLanguage, "fr-CA");
  });

  await withMockedLocalStorage(async () => {
    vi.stubGlobal("navigator", { onLine: true, language: "fr-CA", languages: ["fr-CA", "en-US"] });

    const withBrowserLocale = createInitialState();
    assert.equal(withBrowserLocale.preferredLanguage, "fr-CA");
  });
});

test("createInitialState enables manual verify when VITE flag is true", async () => {
  await withMockedLocalStorage(async () => {
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubEnv("VITE_SHOW_MANUAL_PURCHASE_VERIFY", "true");

    const state = createInitialState();

    assert.equal(state.showManualPurchaseVerify, true);
  });
});

test("createInitialState restores saved workspace scope when workspace selection exists", async () => {
  await withMockedLocalStorage(async (data) => {
    vi.stubGlobal("navigator", { onLine: true });
    data.set(STORAGE_KEYS.ACTIVE_SCOPE_TYPE, "workspace");
    data.set(STORAGE_KEYS.ACTIVE_WORKSPACE_ID, "team-42");

    const state = createInitialState();

    assert.equal(state.activeScopeType, "workspace");
    assert.equal(state.activeWorkspaceId, "team-42");
  });
});
