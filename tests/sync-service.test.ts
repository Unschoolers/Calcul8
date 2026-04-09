import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import { applyCloudSnapshotToLocal, parseCloudSnapshot, shouldApplyCloudSnapshot } from "../src/app-core/methods/ui/sync-apply.ts";
import { getSalesCacheStatusKey } from "../src/app-core/storageKeys.ts";

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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(times = 3): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve();
  }
}

function createApp() {
  return {
    lots: [{ id: 1 }],
    wheelConfigs: [],
    activeWheelConfigId: null as number | null,
    sales: [],
    currentLotId: 1,
    cloudSyncIntervalId: null as number | null,
    syncStatusResetTimeoutId: null as number | null,
    syncStatus: "idle" as "idle" | "syncing" | "success" | "error",
    isOffline: false,
    lastSyncedPayloadHash: "",
    activeScopeType: "personal" as "personal" | "workspace",
    activeWorkspaceId: null as string | null,
    loadSalesForLotId: vi.fn().mockReturnValue([]),
    startOfflineReconnectScheduler: vi.fn(),
    saveLotsToStorage: vi.fn(),
    saveWheelConfigsToStorage: vi.fn(),
    getSalesStorageKey: (lotId: number) => `whatfees_sales_${lotId}`,
    loadLot: vi.fn(),
    notify: vi.fn(),
    pullCloudSync: vi.fn(async () => undefined),
    stopCloudSyncScheduler: vi.fn(),
    handleWorkspaceAccessLost: vi.fn(async () => undefined),
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
    createSyncPayload: () => ({ lots: [], salesByLot: {}, wheelConfigs: [], activeWheelConfigId: null }),
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
  assert.equal(app.stopCloudSyncScheduler.mock.calls.length, 1);
  assert.equal(app.syncStatus, "error");
});

test("runCloudSyncPull shares one in-flight request across overlapping callers", async () => {
  const app = createApp();
  const pullDeferred = createDeferred<{
    ok: boolean;
    status: number;
    statusText: string;
    json: () => Promise<{ snapshot?: undefined }>;
  }>();
  const requestCloudSyncPull = vi.fn().mockReturnValue(pullDeferred.promise);

  const first = runCloudSyncPull(app, {
    requestCloudSyncPull,
    createSyncPayload: () => ({ lots: app.lots, salesByLot: {}, wheelConfigs: [], activeWheelConfigId: null }),
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
  const second = runCloudSyncPull(app, {
    requestCloudSyncPull,
    createSyncPayload: () => ({ lots: app.lots, salesByLot: {}, wheelConfigs: [], activeWheelConfigId: null }),
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

  assert.equal(requestCloudSyncPull.mock.calls.length, 1);

  pullDeferred.resolve({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({})
  });

  await Promise.all([first, second]);

  assert.equal(requestCloudSyncPull.mock.calls.length, 1);
  assert.equal(app.syncStatus, "success");
});

test("runCloudSyncPush pulls latest data on stale-version conflict", async () => {
  const app = createApp();
  const requestCloudSyncPush = vi.fn().mockResolvedValue({
    ok: false,
    status: 409,
    statusText: "Conflict",
    json: async () => ({
      error: "Cloud data changed since your last sync. Pull latest data and retry."
    })
  });

  await runCloudSyncPush(app, false, {
    requestCloudSyncPush,
    createSyncPayload: () => ({ lots: [{ id: 1 }], salesByLot: { "1": [] }, wheelConfigs: [], activeWheelConfigId: null }),
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
  assert.equal(app.pullCloudSync.mock.calls.length, 1);
  assert.equal(app.syncStatus, "error");
  assert.deepEqual(
    app.notify.mock.calls.at(-1),
    ["Cloud data changed. Pulled latest data. Please retry your change.", "warning"]
  );
});

test("runCloudSyncPush can treat scoped seed conflicts as success", async () => {
  const app = createApp();
  const requestCloudSyncPush = vi.fn().mockResolvedValue({
    ok: false,
    status: 409,
    statusText: "Conflict",
    json: async () => ({
      error: "conflict"
    })
  });

  await runCloudSyncPush(app, true, {
    requestCloudSyncPush,
    createSyncPayload: () => ({ lots: [], salesByLot: {}, wheelConfigs: [], activeWheelConfigId: null }),
    getSyncPayloadSignature: () => "sig-seed",
    startSyncStatus: (target) => {
      target.syncStatus = "syncing";
    },
    setSyncStatusSuccess: (target) => {
      target.syncStatus = "success";
    },
    setSyncStatusError: (target) => {
      target.syncStatus = "error";
    },
    hasStorageItem: () => true
  }, {
    scopeOverride: {
      scopeType: "workspace",
      workspaceId: "ws_created"
    },
    treatConflictAsSuccess: true
  });

  assert.equal(requestCloudSyncPush.mock.calls.length, 1);
  assert.equal(app.pullCloudSync.mock.calls.length, 0);
  assert.equal(app.notify.mock.calls.length, 0);
  assert.equal(app.syncStatus, "success");
});

test("runCloudSyncPush waits for an in-flight pull before pushing", async () => {
  const app = createApp();
  const pullDeferred = createDeferred<{
    ok: boolean;
    status: number;
    statusText: string;
    json: () => Promise<{ snapshot?: undefined }>;
  }>();
  const requestCloudSyncPull = vi.fn().mockReturnValue(pullDeferred.promise);
  const requestCloudSyncPush = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ version: 3 })
  });
  const deps = {
    requestCloudSyncPull,
    requestCloudSyncPush,
    createSyncPayload: () => ({
      lots: app.lots,
      salesByLot: {},
      wheelConfigs: [],
      activeWheelConfigId: null
    }),
    getSyncPayloadSignature: (payload: unknown) => JSON.stringify(payload),
    startSyncStatus: (target: ReturnType<typeof createApp>) => {
      target.syncStatus = "syncing";
    },
    setSyncStatusSuccess: (target: ReturnType<typeof createApp>) => {
      target.syncStatus = "success";
    },
    setSyncStatusError: (target: ReturnType<typeof createApp>) => {
      target.syncStatus = "error";
    },
    hasStorageItem: () => true
  };

  const pullPromise = runCloudSyncPull(app, deps);
  const pushPromise = runCloudSyncPush(app, true, deps);

  assert.equal(requestCloudSyncPull.mock.calls.length, 1);
  assert.equal(requestCloudSyncPush.mock.calls.length, 0);

  pullDeferred.resolve({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({})
  });
  await flushMicrotasks();

  await Promise.all([pullPromise, pushPromise]);

  assert.equal(requestCloudSyncPull.mock.calls.length, 1);
  assert.equal(requestCloudSyncPush.mock.calls.length, 1);
});

test("runCloudSyncPull does not block a later push in a different scope", async () => {
  const app = createApp();
  const personalPullDeferred = createDeferred<{
    ok: boolean;
    status: number;
    statusText: string;
    json: () => Promise<{ snapshot?: undefined }>;
  }>();
  const workspacePushDeferred = createDeferred<{
    ok: boolean;
    status: number;
    statusText: string;
    json: () => Promise<{ version: number }>;
  }>();
  const requestCloudSyncPull = vi.fn().mockReturnValue(personalPullDeferred.promise);
  const requestCloudSyncPush = vi.fn().mockReturnValue(workspacePushDeferred.promise);
  const deps = {
    requestCloudSyncPull,
    requestCloudSyncPush,
    createSyncPayload: () => ({
      lots: app.lots,
      salesByLot: {},
      wheelConfigs: [],
      activeWheelConfigId: null
    }),
    getSyncPayloadSignature: (payload: unknown) => JSON.stringify(payload),
    startSyncStatus: (target: ReturnType<typeof createApp>) => {
      target.syncStatus = "syncing";
    },
    setSyncStatusSuccess: (target: ReturnType<typeof createApp>) => {
      target.syncStatus = "success";
    },
    setSyncStatusError: (target: ReturnType<typeof createApp>) => {
      target.syncStatus = "error";
    },
    hasStorageItem: () => true
  };

  app.activeScopeType = "personal";
  app.activeWorkspaceId = null;
  const pullPromise = runCloudSyncPull(app, deps);

  app.activeScopeType = "workspace";
  app.activeWorkspaceId = "team-42";
  const pushPromise = runCloudSyncPush(app, true, deps);

  assert.equal(requestCloudSyncPull.mock.calls.length, 1);
  assert.equal(requestCloudSyncPush.mock.calls.length, 1);

  personalPullDeferred.resolve({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({})
  });

  workspacePushDeferred.resolve({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ version: 4 })
  });

  await Promise.all([pullPromise, pushPromise]);

  assert.equal(requestCloudSyncPull.mock.calls.length, 1);
  assert.equal(requestCloudSyncPush.mock.calls.length, 1);
});

test("runCloudSyncPush collapses overlapping push requests and reruns once with the latest state", async () => {
  const app = createApp();
  const firstPushDeferred = createDeferred<{
    ok: boolean;
    status: number;
    statusText: string;
    json: () => Promise<{ version: number }>;
  }>();
  const secondPushDeferred = createDeferred<{
    ok: boolean;
    status: number;
    statusText: string;
    json: () => Promise<{ version: number }>;
  }>();
  const requestCloudSyncPush = vi
    .fn()
    .mockReturnValueOnce(firstPushDeferred.promise)
    .mockReturnValueOnce(secondPushDeferred.promise);
  const deps = {
    requestCloudSyncPush,
    createSyncPayload: () => ({
      lots: app.lots,
      salesByLot: {},
      wheelConfigs: [],
      activeWheelConfigId: app.currentLotId
    }),
    getSyncPayloadSignature: (payload: unknown) => JSON.stringify(payload),
    startSyncStatus: (target: ReturnType<typeof createApp>) => {
      target.syncStatus = "syncing";
    },
    setSyncStatusSuccess: (target: ReturnType<typeof createApp>) => {
      target.syncStatus = "success";
    },
    setSyncStatusError: (target: ReturnType<typeof createApp>) => {
      target.syncStatus = "error";
    }
  };

  const first = runCloudSyncPush(app, true, deps);
  app.currentLotId = 2;
  const second = runCloudSyncPush(app, true, deps);
  const third = runCloudSyncPush(app, true, deps);

  assert.equal(requestCloudSyncPush.mock.calls.length, 1);
  assert.equal(requestCloudSyncPush.mock.calls[0]?.[1]?.activeWheelConfigId, 1);

  firstPushDeferred.resolve({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ version: 3 })
  });
  await flushMicrotasks();

  assert.equal(requestCloudSyncPush.mock.calls.length, 2);
  assert.equal(requestCloudSyncPush.mock.calls[1]?.[1]?.activeWheelConfigId, 2);

  secondPushDeferred.resolve({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ version: 4 })
  });

  await Promise.all([first, second, third]);

  assert.equal(requestCloudSyncPush.mock.calls.length, 2);
  assert.equal(app.syncStatus, "success");
});

test("runCloudSyncPush forwards intentional empty-overwrite flag for confirmed destructive syncs", async () => {
  const app = createApp();
  app.lots = [];
  app.currentLotId = null;

  const requestCloudSyncPush = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      version: 3
    })
  });

  await runCloudSyncPush(app, true, {
    requestCloudSyncPush,
    createSyncPayload: () => ({ lots: [], salesByLot: {}, wheelConfigs: [], activeWheelConfigId: null }),
    getSyncPayloadSignature: () => "sig-empty",
    startSyncStatus: vi.fn(),
    setSyncStatusSuccess: vi.fn(),
    setSyncStatusError: vi.fn()
  }, {
    allowEmptyOverwrite: true
  });

  assert.equal(requestCloudSyncPush.mock.calls.length, 1);
  assert.deepEqual(requestCloudSyncPush.mock.calls[0]?.[1], {
    lots: [],
    salesByLot: {},
    wheelConfigs: [],
    activeWheelConfigId: null,
    allowEmptyOverwrite: true
  });
  assert.equal(requestCloudSyncPush.mock.calls[0]?.[2], "session-preferred");
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
        wheelConfigs: [{ id: 91, name: "Cloud wheel", spinPrice: 10, targetMargin: 40, createdAt: "", tiers: [] }],
        activeWheelConfigId: 91,
        version: 3
      }
    })
  });

  await runCloudSyncPull(app, {
    requestCloudSyncPull,
    createSyncPayload: () => ({
      lots: app.lots,
      salesByLot: { "1": [] },
      wheelConfigs: app.wheelConfigs,
      activeWheelConfigId: app.activeWheelConfigId
    }),
    getSyncPayloadSignature: () => "sig",
    parseCloudSnapshot: (snapshot) => ({
      lots: (snapshot as { lots: unknown[] }).lots,
      salesByLot: (snapshot as { salesByLot: Record<string, unknown[]> }).salesByLot,
      wheelConfigs: (snapshot as { wheelConfigs: unknown[] }).wheelConfigs,
      activeWheelConfigId: (snapshot as { activeWheelConfigId: number | null }).activeWheelConfigId,
      version: 3,
      hasData: true
    }),
    shouldApplyCloudSnapshot: () => true,
    applyCloudSnapshotToLocal: (target, parsed) => {
      target.lots = parsed.lots as typeof target.lots;
      target.wheelConfigs = parsed.wheelConfigs as typeof target.wheelConfigs;
      target.activeWheelConfigId = parsed.activeWheelConfigId;
      target.currentLotId = 2;
      target.saveLotsToStorage();
      target.saveWheelConfigsToStorage();
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
  assert.equal((app.wheelConfigs as Array<{ id: number }>)[0]?.id, 91);
  assert.equal(app.activeWheelConfigId, 91);
  assert.equal(app.currentLotId, 2);
  assert.equal(app.saveLotsToStorage.mock.calls.length, 1);
  assert.equal(app.saveWheelConfigsToStorage.mock.calls.length, 1);
  assert.equal(app.loadLot.mock.calls.length, 1);
  assert.equal(app.notify.mock.calls.length, 1);
  assert.equal(storage.getItem("whatfees_sync_client_version"), "3");
  assert.equal(app.syncStatus, "success");
});

test("runCloudSyncPull ignores empty cloud snapshots even when the version is newer", async () => {
  const app = createApp();
  app.lots = [{ id: 1, name: "Local lot" }];
  app.wheelConfigs = [{ id: 91, name: "Local wheel", spinPrice: 10, targetMargin: 40, createdAt: "", tiers: [] }];
  app.currentLotId = 1;
  const requestCloudSyncPull = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      snapshot: {
        lots: [],
        salesByLot: {},
        wheelConfigs: [],
        activeWheelConfigId: null,
        version: 99
      }
    })
  });

  await runCloudSyncPull(app, {
    requestCloudSyncPull,
    createSyncPayload: () => ({
      lots: app.lots,
      salesByLot: {},
      wheelConfigs: app.wheelConfigs,
      activeWheelConfigId: app.activeWheelConfigId
    }),
    getSyncPayloadSignature: () => "sig",
    parseCloudSnapshot,
    shouldApplyCloudSnapshot,
    applyCloudSnapshotToLocal: vi.fn(),
    startSyncStatus: vi.fn(),
    setSyncStatusSuccess: vi.fn(),
    setSyncStatusError: vi.fn()
  });

  assert.equal(app.lots.length, 1);
  assert.equal(app.wheelConfigs.length, 1);
});

test("runCloudSyncPull ignores partial cloud snapshots even when the version is newer", async () => {
  const app = createApp();
  app.lots = [{ id: 1, name: "Local lot" }];
  app.wheelConfigs = [{ id: 91, name: "Local wheel", spinPrice: 10, targetMargin: 40, createdAt: "", tiers: [] }];
  app.currentLotId = 1;
  const requestCloudSyncPull = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      snapshot: {
        lots: [{ id: 2, name: "Cloud lot" }],
        version: 100
      }
    })
  });

  await runCloudSyncPull(app, {
    requestCloudSyncPull,
    createSyncPayload: () => ({
      lots: app.lots,
      salesByLot: {},
      wheelConfigs: app.wheelConfigs,
      activeWheelConfigId: app.activeWheelConfigId
    }),
    getSyncPayloadSignature: () => "sig",
    parseCloudSnapshot,
    shouldApplyCloudSnapshot,
    applyCloudSnapshotToLocal: vi.fn(),
    startSyncStatus: vi.fn(),
    setSyncStatusSuccess: vi.fn(),
    setSyncStatusError: vi.fn()
  });

  assert.equal(app.lots.length, 1);
  assert.equal(app.wheelConfigs.length, 1);
});

test("applyCloudSnapshotToLocal sanitizes incoming wheel configs before saving", () => {
  const storage = createMockStorage();
  vi.stubGlobal("localStorage", storage);
  const saves: Array<string> = [];
  const app = {
    lots: [{
      id: 1,
      name: "Singles lot",
      lotType: "singles",
      singlesPurchases: [{ id: 7, item: "Card A", quantity: 1, cost: 5, marketValue: 0, currency: "CAD" }]
    }],
    wheelConfigs: [],
    activeWheelConfigId: null as number | null,
    currentLotId: 1,
    sales: [],
    salesByLotId: new Map([[999, [{ id: 999 }]]]),
    activeScopeType: "personal" as const,
    activeWorkspaceId: null as string | null,
    saveLotsToStorage() {
      saves.push("lots");
    },
    saveWheelConfigsToStorage() {
      saves.push("wheel");
    },
    loadLot() {
      saves.push("loadLot");
    },
    getSalesStorageKey: (lotId: number) => `whatfees_sales_${lotId}`
  };

  applyCloudSnapshotToLocal(app as never, {
    lots: app.lots,
    salesByLot: {
      "1": [{
        id: 301,
        type: "wheel",
        quantity: 1,
        packsCount: 1,
        price: 10,
        buyerShipping: 0,
        date: "2026-03-30",
        netRevenue: 8.61
      }]
    },
    wheelConfigs: [{
      id: 91,
      name: "Cloud wheel",
      spinPrice: 10,
      targetMargin: 40,
      createdAt: "",
      tiers: [{
        id: "tier-1",
        label: "Tier 1",
        color: "#f00",
        slots: 3,
        costPerTier: 5,
        packsCount: 4,
        deductionType: "packs",
        sets: [],
        boundLotId: 1,
        boundSinglesId: 7,
        isChase: true
      }]
    }],
    activeWheelConfigId: 91,
    version: 4,
    hasData: true
  });

  const wheelConfig = (app.wheelConfigs as Array<{
    tiers: Array<{ deductionType: string; packsCount: number; isChase: boolean }>;
  }>)[0];
  assert.equal(wheelConfig?.tiers[0]?.deductionType, "singles");
  assert.equal(wheelConfig?.tiers[0]?.packsCount, 1);
  assert.equal(wheelConfig?.tiers[0]?.isChase, true);
  assert.equal(storage.getItem("whatfees_sales_1"), JSON.stringify([{
    id: 301,
    type: "wheel",
    quantity: 1,
    packsCount: 1,
    price: 10,
    buyerShipping: 0,
    date: "2026-03-30",
    netRevenue: 8.61
  }]));
  assert.equal(storage.getItem(getSalesCacheStatusKey(1)), "loaded");
  assert.equal(app.salesByLotId.has(999), false);
  assert.deepEqual(app.salesByLotId.get(1), [{
    id: 301,
    type: "wheel",
    quantity: 1,
    packsCount: 1,
    price: 10,
    buyerShipping: 0,
    date: "2026-03-30",
    netRevenue: 8.61
  }]);
  assert.deepEqual(saves, ["lots", "wheel", "loadLot"]);
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
    createSyncPayload: () => ({
      lots: app.lots,
      salesByLot: { "1": app.sales },
      wheelConfigs: app.wheelConfigs,
      activeWheelConfigId: app.activeWheelConfigId
    }),
    getSyncPayloadSignature: () => "sig",
    startSyncStatus: vi.fn(),
    setSyncStatusSuccess: vi.fn(),
    setSyncStatusError: vi.fn(),
    now: () => 1000
  });

  assert.equal(pullCloudSyncMock.mock.calls.length, 1);
});

test("runCloudSyncPull passes workspaceId for shared scopes", async () => {
  const app = createApp();
  app.activeScopeType = "workspace";
  app.activeWorkspaceId = "team-42";
  const requestCloudSyncPull = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      snapshot: {
        lots: [],
        salesByLot: {},
        version: 1
      }
    })
  });

  await runCloudSyncPull(app, {
    requestCloudSyncPull,
    createSyncPayload: () => ({
      lots: [],
      salesByLot: {},
      wheelConfigs: [],
      activeWheelConfigId: null,
      workspaceId: "team-42"
    }),
    getSyncPayloadSignature: () => "sig",
    parseCloudSnapshot: () => ({
      lots: [],
      salesByLot: {},
      wheelConfigs: [],
      activeWheelConfigId: null,
      version: 1,
      hasData: false
    }),
    shouldApplyCloudSnapshot: () => false,
    applyCloudSnapshotToLocal: vi.fn(),
    startSyncStatus: vi.fn(),
    setSyncStatusSuccess: vi.fn(),
    setSyncStatusError: vi.fn()
  });

  assert.equal(requestCloudSyncPull.mock.calls[0]?.[1], "team-42");
  assert.equal(requestCloudSyncPull.mock.calls[0]?.[2], "session-preferred");
});
