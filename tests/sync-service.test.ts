import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

const {
  handleExpiredAuthMock,
  resolveApiBaseUrlMock
} = vi.hoisted(() => ({
  handleExpiredAuthMock: vi.fn(),
  resolveApiBaseUrlMock: vi.fn()
}));

vi.mock("../src/app-core/methods/ui/shared.ts", () => ({
  CLOUD_SYNC_INTERVAL_MS: 2500,
  GOOGLE_TOKEN_KEY: "whatfees_google_token",
  SYNC_CLIENT_VERSION_KEY: "whatfees_sync_client_version",
  handleExpiredAuth: handleExpiredAuthMock,
  resolveApiBaseUrl: resolveApiBaseUrlMock
}));

import { runCloudSyncPull, runCloudSyncPush } from "../src/app-core/methods/ui/sync-service.ts";

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

function createApp() {
  return {
    lots: [{ id: 1 }],
    sales: [],
    currentLotId: 1,
    cloudSyncIntervalId: null as number | null,
    syncStatusResetTimeoutId: null as number | null,
    syncStatus: "idle" as "idle" | "syncing" | "success" | "error",
    isOffline: false,
    lastSyncedPayloadHash: "",
    loadSalesForLotId: vi.fn().mockReturnValue([]),
    startOfflineReconnectScheduler: vi.fn(),
    saveLotsToStorage: vi.fn(),
    getSalesStorageKey: (lotId: number) => `whatfees_sales_${lotId}`,
    loadLot: vi.fn(),
    notify: vi.fn(),
    pullCloudSync: vi.fn(async () => undefined),
    googleAuthEpoch: 0,
    hasProAccess: false
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", {
    setTimeout: vi.fn(() => 77),
    clearTimeout: vi.fn(),
    setInterval: vi.fn(() => 1),
    clearInterval: vi.fn()
  });
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("localStorage", createMockStorage({
    whatfees_google_token: "token-abc",
    whatfees_sync_client_version: "2",
    whatfees_presets: JSON.stringify([{ id: 1 }])
  }));
  resolveApiBaseUrlMock.mockReturnValue("https://api.example");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("runCloudSyncPush handles auth expiry and marks sync as error", async () => {
  const app = createApp();
  const requestCloudSyncPush = vi.fn().mockResolvedValue({
    ok: false,
    status: 401,
    statusText: "Unauthorized",
    json: async () => ({})
  });

  await runCloudSyncPush(app, false, {
    requestCloudSyncPush,
    createSyncPayload: () => ({ lots: [], salesByLot: {} }),
    getSyncPayloadSignature: () => "sig",
    startSyncStatus: (target) => {
      target.syncStatus = "syncing";
    },
    setSyncStatusSuccess: (target) => {
      target.syncStatus = "success";
    },
    setSyncStatusError: (target) => {
      target.syncStatus = "error";
    }
  });

  assert.equal(requestCloudSyncPush.mock.calls.length, 1);
  assert.equal(handleExpiredAuthMock.mock.calls.length, 1);
  assert.equal(app.syncStatus, "error");
});

test("runCloudSyncPull applies newer cloud snapshot and stores version", async () => {
  const storage = createMockStorage({
    whatfees_google_token: "token-abc",
    whatfees_sync_client_version: "1"
  });
  vi.stubGlobal("localStorage", storage);

  const app = createApp();
  app.currentLotId = 999;
  const requestCloudSyncPull = vi.fn().mockResolvedValue({
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

  await runCloudSyncPull(app, {
    requestCloudSyncPull,
    createSyncPayload: () => ({ lots: app.lots, salesByLot: { "1": [] } }),
    getSyncPayloadSignature: () => "sig",
    parseCloudSnapshot: (snapshot) => ({
      lots: (snapshot as { lots: unknown[] }).lots,
      salesByLot: (snapshot as { salesByLot: Record<string, unknown[]> }).salesByLot,
      version: 3,
      hasData: true
    }),
    shouldApplyCloudSnapshot: () => true,
    applyCloudSnapshotToLocal: (target, parsed) => {
      target.lots = parsed.lots as typeof target.lots;
      target.currentLotId = 2;
      target.saveLotsToStorage();
      target.loadLot();
      localStorage.setItem("whatfees_sync_client_version", String(parsed.version));
    },
    startSyncStatus: (target) => {
      target.syncStatus = "syncing";
    },
    setSyncStatusSuccess: (target) => {
      target.syncStatus = "success";
    },
    setSyncStatusError: (target) => {
      target.syncStatus = "error";
    }
  });

  assert.equal(Array.isArray(app.lots), true);
  assert.equal((app.lots as Array<{ id: number }>)[0]?.id, 2);
  assert.equal(app.currentLotId, 2);
  assert.equal(app.saveLotsToStorage.mock.calls.length, 1);
  assert.equal(app.loadLot.mock.calls.length, 1);
  assert.equal(app.notify.mock.calls.length, 1);
  assert.equal(storage.getItem("whatfees_sync_client_version"), "3");
  assert.equal(app.syncStatus, "success");
});

test("runCloudSyncPush skips upload and pulls cloud when local storage was cleared mid-session", async () => {
  vi.stubGlobal("localStorage", createMockStorage({
    whatfees_google_token: "token-abc"
  }));

  const app = createApp();
  app.lastSyncedPayloadHash = "{\"lots\":[{\"id\":1}],\"salesByLot\":{\"1\":[{\"id\":5}]}}";
  app.sales = [
    {
      id: 5,
      type: "pack",
      quantity: 1,
      packsCount: 1,
      price: 20,
      date: "2026-03-09"
    }
  ];
  const pullCloudSyncMock = vi.fn(async () => undefined);
  app.pullCloudSync = pullCloudSyncMock;

  await runCloudSyncPush(app, false, {
    requestCloudSyncPush: vi.fn(),
    createSyncPayload: () => ({ lots: app.lots, salesByLot: { "1": app.sales } }),
    getSyncPayloadSignature: () => "sig",
    startSyncStatus: vi.fn(),
    setSyncStatusSuccess: vi.fn(),
    setSyncStatusError: vi.fn(),
    now: () => 1000
  });

  assert.equal(pullCloudSyncMock.mock.calls.length, 1);
});
