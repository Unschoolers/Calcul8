import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

const {
  migrateLegacyStorageKeysMock,
  getLegacyStorageKeysMock,
  readStorageWithLegacyMock
} = vi.hoisted(() => ({
  migrateLegacyStorageKeysMock: vi.fn(),
  getLegacyStorageKeysMock: vi.fn(() => ({
    LAST_LOT_ID: "legacy_last_lot_id",
    PRESETS: "legacy_presets",
    ENTITLEMENT_CACHE: "legacy_entitlement_cache",
    PRO_ACCESS: "legacy_pro_access",
    GOOGLE_ID_TOKEN: "legacy_google_id_token",
    GOOGLE_PROFILE_CACHE: "legacy_google_profile_cache",
    DEBUG_USER_ID: "legacy_debug_user_id",
    SYNC_CLIENT_VERSION: "legacy_sync_client_version"
  })),
  readStorageWithLegacyMock: vi.fn()
}));

vi.mock("../src/app-core/storageKeys.ts", async () => {
  const actual = await vi.importActual<typeof import("../src/app-core/storageKeys.ts")>(
    "../src/app-core/storageKeys.ts"
  );
  return {
    ...actual,
    migrateLegacyStorageKeys: migrateLegacyStorageKeysMock,
    getLegacyStorageKeys: getLegacyStorageKeysMock,
    readStorageWithLegacy: readStorageWithLegacyMock
  };
});

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
  readStorageWithLegacyMock.mockReturnValue("0");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("createInitialState runs storage migration and initializes expert/pro state", async () => {
  await withMockedLocalStorage(async (data) => {
    data.set(STORAGE_KEYS.PURCHASE_UI_MODE, "expert");
    readStorageWithLegacyMock.mockReturnValue("1");
    vi.stubGlobal("navigator", { onLine: false });

    const state = createInitialState();

    assert.equal(migrateLegacyStorageKeysMock.mock.calls.length, 1);
    assert.equal(getLegacyStorageKeysMock.mock.calls.length, 1);
    assert.equal(readStorageWithLegacyMock.mock.calls.length, 1);
    assert.equal(state.purchaseUiMode, "expert");
    assert.equal(state.hasProAccess, true);
    assert.equal(state.targetProfitPercent, 15);
    assert.equal(state.isOffline, true);
    assert.equal(state.newSale.type, "pack");
    assert.equal(state.newSale.date, state.purchaseDate);
    assert.equal(state.purchaseDate, state.newSale.date);
    assert.match(state.purchaseDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(state.syncStatus, "idle");
  });
});

test("createInitialState initializes simple/non-pro defaults and empty collections", async () => {
  await withMockedLocalStorage(async (data) => {
    vi.stubGlobal("navigator", { onLine: true });
    data.set(STORAGE_KEYS.PURCHASE_UI_MODE, "expert");
    readStorageWithLegacyMock.mockReturnValue("0");

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
    assert.equal(state.cloudSyncIntervalId, null);
    assert.equal(state.offlineReconnectIntervalId, null);
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
