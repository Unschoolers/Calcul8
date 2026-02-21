import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

const {
  fetchWithRetryMock,
  handleExpiredAuthMock,
  resolveApiBaseUrlMock
} = vi.hoisted(() => ({
  fetchWithRetryMock: vi.fn(),
  handleExpiredAuthMock: vi.fn(),
  resolveApiBaseUrlMock: vi.fn()
}));

vi.mock("../src/app-core/methods/ui/shared.ts", () => ({
  CLOUD_SYNC_INTERVAL_MS: 2500,
  GOOGLE_TOKEN_KEY: "whatfees_google_token",
  SYNC_CLIENT_VERSION_KEY: "whatfees_sync_client_version",
  SYNC_STATUS_RESET_MS: 1000,
  fetchWithRetry: fetchWithRetryMock,
  handleExpiredAuth: handleExpiredAuthMock,
  resolveApiBaseUrl: resolveApiBaseUrlMock
}));

import { uiSyncMethods } from "../src/app-core/methods/ui/sync.ts";

type MockStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
};

function createMockStorage(seed: Record<string, string> = {}): MockStorage {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem(key: string): string | null {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      map.set(key, String(value));
    },
    removeItem(key: string): void {
      map.delete(key);
    },
    clear(): void {
      map.clear();
    }
  };
}

function createContext() {
  return {
    lots: [{ id: 1 }],
    sales: [],
    currentLotId: 1,
    cloudSyncIntervalId: null as number | null,
    syncStatusResetTimeoutId: null as number | null,
    syncStatus: "idle",
    isOffline: false,
    lastSyncedPayloadHash: "",
    loadSalesForLotId: vi.fn().mockReturnValue([]),
    startOfflineReconnectScheduler: vi.fn(),
    saveLotsToStorage: vi.fn(),
    getSalesStorageKey: (lotId: number) => `whatfees_sales_${lotId}`,
    loadLot: vi.fn(),
    notify: vi.fn(),
    pushCloudSync: vi.fn()
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  let intervalId = 1;
  vi.stubGlobal("window", {
    setTimeout: vi.fn(() => 77),
    clearTimeout: vi.fn(),
    setInterval: vi.fn(() => intervalId++),
    clearInterval: vi.fn()
  });
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("localStorage", createMockStorage({
    whatfees_google_token: "token-abc",
    whatfees_sync_client_version: "2"
  }));
  resolveApiBaseUrlMock.mockReturnValue("https://api.example");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("pushCloudSync skips network when payload hash is unchanged", async () => {
  const ctx = createContext();
  ctx.lastSyncedPayloadHash = JSON.stringify({
    lots: ctx.lots,
    salesByLot: { "1": [] }
  });

  await uiSyncMethods.pushCloudSync.call(ctx, false);
  assert.equal(fetchWithRetryMock.mock.calls.length, 0);
});

test("pushCloudSync handles auth expiry and marks sync as error", async () => {
  const ctx = createContext();
  fetchWithRetryMock.mockResolvedValue({
    ok: false,
    status: 401,
    statusText: "Unauthorized",
    json: async () => ({})
  });

  await uiSyncMethods.pushCloudSync.call(ctx, true);

  assert.equal(handleExpiredAuthMock.mock.calls.length, 1);
  assert.equal(ctx.syncStatus, "error");
});

test("pullCloudSync applies newer cloud snapshot and stores version", async () => {
  const storage = createMockStorage({
    whatfees_google_token: "token-abc",
    whatfees_sync_client_version: "1"
  });
  vi.stubGlobal("localStorage", storage);

  const ctx = createContext();
  ctx.currentLotId = 999;
  fetchWithRetryMock.mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      snapshot: {
        lots: [{ id: 2, name: "Cloud lot" }],
        salesByLot: {
          "2": [{ id: 2001, type: "pack", quantity: 1, packsCount: 1, price: 10, date: "2026-02-21" }]
        },
        version: 3
      }
    })
  });

  await uiSyncMethods.pullCloudSync.call(ctx);

  assert.equal(Array.isArray(ctx.lots), true);
  assert.equal((ctx.lots as Array<{ id: number }>)[0]?.id, 2);
  assert.equal(ctx.currentLotId, 2);
  assert.equal(ctx.saveLotsToStorage.mock.calls.length, 1);
  assert.equal(ctx.loadLot.mock.calls.length, 1);
  assert.equal(ctx.notify.mock.calls.length, 1);
  assert.equal(storage.getItem("whatfees_sync_client_version"), "3");
  assert.equal(ctx.syncStatus, "success");
});

test("startCloudSyncScheduler and stopCloudSyncScheduler manage interval", () => {
  const ctx = createContext();

  uiSyncMethods.startCloudSyncScheduler.call(ctx);
  assert.equal(ctx.cloudSyncIntervalId, 1);

  uiSyncMethods.stopCloudSyncScheduler.call(ctx);
  assert.equal(ctx.cloudSyncIntervalId, null);
});
