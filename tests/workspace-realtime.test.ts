import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import { createSyncPayload, getSyncPayloadSignature } from "../src/app-core/methods/ui/sync/sync-payload.ts";
import { runCloudSyncPull } from "../src/app-core/methods/ui/sync/sync-service.ts";
import { setActiveWorkspaceScope } from "../src/app-core/workspace-scope.ts";
import { markWorkspaceRealtimeDataChanged } from "../src/app-core/methods/ui/workspace/workspace-realtime-state.ts";

const {
  canUseAuthoritativeSalesLiveApiMock,
  fetchWorkspaceRealtimeSubscribeTokenMock,
  fetchWorkspacePresenceRealtimeSubscribeTokenMock,
  cacheAuthoritativeSalesMock,
  fetchAuthoritativeSalesMock,
  fetchAuthoritativeLivePricingMock,
  normalizeSaleMock,
  normalizeLivePricingMock,
  reconcileIncomingLivePricingSnapshotMock
} = vi.hoisted(() => ({
  canUseAuthoritativeSalesLiveApiMock: vi.fn(),
  fetchWorkspaceRealtimeSubscribeTokenMock: vi.fn(),
  fetchWorkspacePresenceRealtimeSubscribeTokenMock: vi.fn(),
  cacheAuthoritativeSalesMock: vi.fn(),
  fetchAuthoritativeSalesMock: vi.fn(),
  fetchAuthoritativeLivePricingMock: vi.fn(),
  normalizeSaleMock: vi.fn(),
  normalizeLivePricingMock: vi.fn(),
  reconcileIncomingLivePricingSnapshotMock: vi.fn()
}));

vi.mock("../src/app-core/methods/entity-api-shared.ts", () => ({
  canUseAuthoritativeSalesLiveApi: canUseAuthoritativeSalesLiveApiMock
}));

vi.mock("../src/app-core/methods/workspace-realtime-api.ts", () => ({
  fetchWorkspaceRealtimeSubscribeToken: fetchWorkspaceRealtimeSubscribeTokenMock,
  fetchWorkspacePresenceRealtimeSubscribeToken: fetchWorkspacePresenceRealtimeSubscribeTokenMock
}));

vi.mock("../src/app-core/methods/lot-sales-api.ts", () => ({
  cacheAuthoritativeSales: cacheAuthoritativeSalesMock,
  fetchAuthoritativeSales: fetchAuthoritativeSalesMock,
  normalizeSale: normalizeSaleMock
}));

vi.mock("../src/app-core/methods/lot-live-pricing-api.ts", () => ({
  fetchAuthoritativeLivePricing: fetchAuthoritativeLivePricingMock,
  normalizeLivePricing: normalizeLivePricingMock
}));

vi.mock("../src/app-core/methods/ui/sync/lot-entity-polling.ts", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/app-core/methods/ui/sync/lot-entity-polling.ts")>(),
  reconcileIncomingLivePricingSnapshot: reconcileIncomingLivePricingSnapshotMock
}));

import {
  refreshWorkspaceRealtime,
  stopWorkspaceRealtime
} from "../src/app-core/methods/ui/workspace/workspace-realtime.ts";
import { applyRealtimeMessage } from "../src/app-core/methods/ui/workspace/workspace-realtime-events.ts";

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  closeCalls: Array<{ code?: number; reason?: string }> = [];
  private listeners = new Map<string, Set<(event?: unknown) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event?: unknown) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  send(message: string): void {
    this.sent.push(message);
  }

  close(code?: number, reason?: string): void {
    if (code !== undefined && code !== 1000 && (code < 3000 || code > 4999)) {
      throw new DOMException(
        `The close code must be either 1000, or between 3000 and 4999. ${code} is neither.`,
        "InvalidAccessError"
      );
    }
    this.closeCalls.push({ code, reason });
    this.readyState = FakeWebSocket.CLOSED;
  }

  triggerOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open");
  }

  triggerMessage(data: unknown): void {
    this.emit("message", { data: JSON.stringify(data) });
  }

  triggerClose(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close");
  }

  triggerError(): void {
    this.emit("error");
  }

  private emit(type: string, event?: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function createApp(overrides: Record<string, any> = {}): any {
  return {
    activeScopeType: "workspace",
    activeWorkspaceId: "ws_dcb4d6f021637411",
    currentLotId: 1773766061603,
    currentTab: "live",
    isOffline: false,
    lots: [{ id: 1773766061603, name: "Lot A" }] as any[],
    sales: [] as any[],
    liveSpotPrice: 0,
    liveBoxPriceSell: 0,
    livePackPrice: 0,
    currentLivePricingVersion: null,
    lastSyncedPayloadHash: null,
    workspaceRealtimeStatus: "idle",
    workspacePresenceByUserId: {},
    wheelConfigs: [] as any[],
    activeWheelConfigId: null as number | null,
    wheelTotalSpins: 0,
    wheelSpinCounts: [] as number[],
    wheelLastResult: "",
    wheelSessionUpdatedAt: 0,
    wheelPendingChase: null,
    wheelSkippedDeductions: [],
    wheelSessionNetRevenue: 0,
    wheelSessionCostAdjustment: 0,
    wheelFairnessHistory: [] as Array<{
      spinNumber: number;
      label: string;
      color: string;
      hash: string;
      seed: string;
      timestamp: number;
    }>,
    wheelChaseTallyHistory: [] as Array<{ tierId: string; label: string; color: string; count: number }>,
    wheelGridLayoutSeed: "",
    wheelPreviewGridLayoutSeed: "",
    wheelGridReveals: [] as Array<{
      cellIndex: number;
      slotIndex: number;
      label: string;
      color: string;
      tier: string;
      spinNumber: number;
      timestamp: number;
    }>,
    wheelPreviewGridReveals: [] as Array<{
      cellIndex: number;
      slotIndex: number;
      label: string;
      color: string;
      tier: string;
      spinNumber: number;
      timestamp: number;
    }>,
    wheelCurrentAngle: 0,
    wheelLastResultColor: "",
    notify: vi.fn(),
    pullCloudSync: vi.fn(async () => ({ kind: "confirmed", persistence: "cloud", cache: "not-applicable", cloud: "confirmed" })),
    hydrateBuyerProfiles: vi.fn(async () => undefined),
    handleWorkspaceAccessLost: vi.fn(async () => undefined),
    getSalesStorageKey: (lotId: number) => `sales:${lotId}`,
    loadSalesForLotId: vi.fn(() => []),
    ...overrides
  };
}

function createCurrentWorkspaceSignature(app: any): string {
  return getSyncPayloadSignature(createSyncPayload({
    lots: app.lots,
    currentLotId: app.currentLotId,
    wheelConfigs: app.wheelConfigs,
    activeWheelConfigId: app.activeWheelConfigId,
    workspaceId: app.activeWorkspaceId
  }));
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubEnv("VITE_REALTIME_SOCKET_URL", "");
  FakeWebSocket.instances = [];
  canUseAuthoritativeSalesLiveApiMock.mockReturnValue(true);
  fetchWorkspaceRealtimeSubscribeTokenMock.mockResolvedValue({
    room: "workspace:ws_dcb4d6f021637411:lot:1773766061603",
    rooms: [
      "workspace:ws_dcb4d6f021637411:lot:1773766061603",
      "workspace:ws_dcb4d6f021637411:presence",
      "workspace:ws_dcb4d6f021637411:wheel"
    ],
    token: "signed-token",
    expiresAt: 1760000000
  });
  fetchWorkspacePresenceRealtimeSubscribeTokenMock.mockResolvedValue({
    room: "workspace:ws_dcb4d6f021637411:presence",
    rooms: [
      "workspace:ws_dcb4d6f021637411:presence"
    ],
    token: "presence-token",
    expiresAt: 1760000000
  });
  normalizeSaleMock.mockImplementation((value: unknown) => value);
  normalizeLivePricingMock.mockImplementation((value: unknown) => value);
  fetchAuthoritativeSalesMock.mockResolvedValue(null);
  fetchAuthoritativeLivePricingMock.mockResolvedValue(null);
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal("window", {
    location: {
      hostname: "app.whatfees.ca"
    },
    setTimeout,
    clearTimeout
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test("refreshWorkspaceRealtime connects to prod socket host and subscribes with a signed token", async () => {
  const app = createApp({ loadLot: vi.fn() });
  app.lastSyncedPayloadHash = createCurrentWorkspaceSignature(app);

  refreshWorkspaceRealtime(app as never);
  assert.equal(app.workspaceRealtimeStatus, "connecting");

  assert.equal(FakeWebSocket.instances.length, 1);
  const socket = FakeWebSocket.instances[0]!;
  assert.equal(socket.url, "wss://ws.whatfees.ca/socket");

  socket.triggerOpen();
  await flushMicrotasks();

  assert.equal(fetchWorkspaceRealtimeSubscribeTokenMock.mock.calls.length, 1);
  assert.equal(fetchWorkspaceRealtimeSubscribeTokenMock.mock.calls[0]?.[1], 1773766061603);
  assert.deepEqual(JSON.parse(socket.sent[0] || "{}"), {
    type: "subscribe",
    rooms: [
      "workspace:ws_dcb4d6f021637411:lot:1773766061603",
      "workspace:ws_dcb4d6f021637411:presence",
      "workspace:ws_dcb4d6f021637411:wheel"
    ],
    token: "signed-token"
  });

  socket.triggerMessage({
    type: "subscribed",
    rooms: [
      "workspace:ws_dcb4d6f021637411:lot:1773766061603",
      "workspace:ws_dcb4d6f021637411:presence",
      "workspace:ws_dcb4d6f021637411:wheel"
    ]
  });
  await flushMicrotasks();

  assert.equal(app.workspaceRealtimeStatus, "recovered");
});

test("refreshWorkspaceRealtime keeps workspace presence alive without a selected lot", async () => {
  const app = createApp({
    currentLotId: null,
    currentTab: "config"
  });
  app.lastSyncedPayloadHash = createCurrentWorkspaceSignature(app);

  refreshWorkspaceRealtime(app as never);
  assert.equal(app.workspaceRealtimeStatus, "connecting");

  assert.equal(FakeWebSocket.instances.length, 1);
  const socket = FakeWebSocket.instances[0]!;
  assert.equal(socket.url, "wss://ws.whatfees.ca/socket");

  socket.triggerOpen();
  await flushMicrotasks();

  assert.equal(fetchWorkspaceRealtimeSubscribeTokenMock.mock.calls.length, 0);
  assert.equal(fetchWorkspacePresenceRealtimeSubscribeTokenMock.mock.calls.length, 1);
  assert.equal(fetchWorkspacePresenceRealtimeSubscribeTokenMock.mock.calls[0]?.[0], app);
  assert.deepEqual(JSON.parse(socket.sent[0] || "{}"), {
    type: "subscribe",
    rooms: [
      "workspace:ws_dcb4d6f021637411:presence"
    ],
    token: "presence-token"
  });

  socket.triggerMessage({
    type: "subscribed",
    rooms: [
      "workspace:ws_dcb4d6f021637411:presence"
    ]
  });
  await flushMicrotasks();

  assert.equal(app.workspaceRealtimeStatus, "recovered");
});

test("workspace realtime catch-up refreshes authoritative lot state and marks recovered", async () => {
  const app = createApp();
  app.lastSyncedPayloadHash = createCurrentWorkspaceSignature(app);
  fetchAuthoritativeSalesMock.mockResolvedValueOnce([{
    id: 9,
    type: "pack",
    quantity: 1,
    packsCount: 1,
    price: 15,
    buyerShipping: 0,
    date: "2026-05-23"
  }]);
  fetchAuthoritativeLivePricingMock.mockResolvedValueOnce({
    livePackPrice: 11,
    liveBoxPriceSell: 22,
    liveSpotPrice: 33,
    version: 4
  });

  const { runWorkspaceRealtimeCatchUp } = await import(
    "../src/app-core/methods/ui/workspace/workspace-realtime-recovery.ts"
  );
  await runWorkspaceRealtimeCatchUp(app as never, { reason: "manual" });

  assert.equal(app.workspaceRealtimeStatus, "recovered");
  assert.deepEqual(app.sales, [{
    id: 9,
    type: "pack",
    quantity: 1,
    packsCount: 1,
    price: 15,
    buyerShipping: 0,
    date: "2026-05-23"
  }]);
  assert.equal(fetchAuthoritativeSalesMock.mock.calls.length, 1);
  assert.equal(fetchAuthoritativeLivePricingMock.mock.calls.length, 1);
  assert.equal(reconcileIncomingLivePricingSnapshotMock.mock.calls.length, 1);
  assert.equal(app.pullCloudSync.mock.calls.length, 1);
});

test("workspace realtime catch-up blocks broad cloud pull when local state is dirty", async () => {
  const app = createApp({
    lastSyncedPayloadHash: "old-signature",
    sales: [{
      id: 5,
      type: "pack",
      quantity: 1,
      packsCount: 1,
      price: 20,
      buyerShipping: 0,
      date: "2026-05-23"
    }]
  });
  fetchAuthoritativeSalesMock.mockResolvedValueOnce(app.sales);
  fetchAuthoritativeLivePricingMock.mockResolvedValueOnce(null);

  const { runWorkspaceRealtimeCatchUp } = await import(
    "../src/app-core/methods/ui/workspace/workspace-realtime-recovery.ts"
  );
  await runWorkspaceRealtimeCatchUp(app as never, { reason: "manual" });

  assert.equal(app.workspaceRealtimeStatus, "stale");
  assert.equal(app.pullCloudSync.mock.calls.length, 0);
});

test("workspace catch-up full sync cannot overwrite a newer websocket sale", async () => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, String(value)); },
    removeItem: (key: string) => { storage.delete(key); }
  });
  const app = createApp({ loadLot: vi.fn() });
  app.lastSyncedPayloadHash = createCurrentWorkspaceSignature(app);
  fetchAuthoritativeSalesMock.mockResolvedValueOnce(null);
  fetchAuthoritativeLivePricingMock.mockResolvedValueOnce(null);
  const pullResponse = createDeferred<Response>();
  let pullCalls = 0;
  app.pullCloudSync = (forceApply = false, options = {}) => runCloudSyncPull(app, {
    resolveApiBaseUrl: () => "https://api.example",
    isOnline: () => true,
    requestCloudSyncPull: () => {
      pullCalls += 1;
      return pullResponse.promise;
    },
    createSyncPayload: (target, _version, scope) => createSyncPayload({
      lots: target.lots,
      currentLotId: target.currentLotId,
      wheelConfigs: target.wheelConfigs,
      activeWheelConfigId: target.activeWheelConfigId,
      systemPricingDefaults: target.systemPricingDefaults,
      workspaceId: scope?.workspaceId ?? undefined
    }),
    getStoredClientVersion: () => 0,
    setStoredClientVersion: () => {},
    setStoredLastSyncedPayloadHash: () => {},
    startSyncStatus: () => {},
    setSyncStatusSuccess: () => {},
    setSyncStatusError: () => {}
  }, { forceApply, ...options });
  app.startOfflineReconnectScheduler = () => {};

  const { runWorkspaceRealtimeCatchUp } = await import(
    "../src/app-core/methods/ui/workspace/workspace-realtime-recovery.ts"
  );
  const catchUpPromise = runWorkspaceRealtimeCatchUp(app as never, { reason: "manual" });
  await flushMicrotasks();
  assert.equal(pullCalls, 1);

  applyRealtimeMessage(
    app as never,
    "workspace:ws_dcb4d6f021637411:lot:1773766061603",
    "sale.upserted",
    {
      lotId: 1773766061603,
      sale: { id: 901, type: "pack", quantity: 1, packsCount: 1, price: 30, date: "2026-10-17" }
    }
  );
  assert.equal((app.sales as Array<{ id: number }>)[0]?.id, 901);

  pullResponse.resolve({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      snapshot: {
        lots: [{ id: 1773766061603, name: "Stale cloud lot" }],
        salesByLot: { "1773766061603": [{ id: 900, type: "pack", quantity: 1, packsCount: 1, price: 20, date: "2026-10-16" }] },
        wheelConfigs: [],
        activeWheelConfigId: null,
        version: 1
      }
    })
  } as Response);
  await catchUpPromise;

  assert.equal((app.sales as Array<{ id: number }>)[0]?.id, 901);
  assert.equal(app.lots[0]?.name, "Lot A");
  assert.equal(cacheAuthoritativeSalesMock.mock.calls.length, 1);
  assert.equal(app.workspaceRealtimeStatus, "stale");
});

test("a confirmed default full apply remains recovered after loadLot advances hydration revision", async () => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, String(value)); },
    removeItem: (key: string) => { storage.delete(key); }
  });
  const app = createApp({ loadLot: vi.fn(() => { app.lotHydrationRevision = (app.lotHydrationRevision ?? 0) + 1; }) });
  app.lastSyncedPayloadHash = createCurrentWorkspaceSignature(app);
  app.lotHydrationRevision = 1;
  fetchAuthoritativeSalesMock.mockResolvedValueOnce(null);
  fetchAuthoritativeLivePricingMock.mockResolvedValueOnce(null);
  app.pullCloudSync = (forceApply = false, options = {}) => runCloudSyncPull(app, {
    resolveApiBaseUrl: () => "https://api.example",
    isOnline: () => true,
    requestCloudSyncPull: async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ snapshot: {
        lots: [{ id: 1773766061603, name: "Confirmed cloud lot" }],
        salesByLot: {}, wheelConfigs: [], activeWheelConfigId: null, version: 2
      } })
    } as Response),
    createSyncPayload: (target, _version, scope) => createSyncPayload({
      lots: target.lots, currentLotId: target.currentLotId, wheelConfigs: target.wheelConfigs,
      activeWheelConfigId: target.activeWheelConfigId, systemPricingDefaults: target.systemPricingDefaults,
      workspaceId: scope?.workspaceId ?? undefined
    }),
    getStoredClientVersion: () => 0,
    setStoredClientVersion: () => {},
    setStoredLastSyncedPayloadHash: () => {},
    startSyncStatus: () => {}, setSyncStatusSuccess: () => {}, setSyncStatusError: () => {}
  }, { forceApply, ...options });

  const { runWorkspaceRealtimeCatchUp } = await import(
    "../src/app-core/methods/ui/workspace/workspace-realtime-recovery.ts"
  );
  await runWorkspaceRealtimeCatchUp(app as never, { reason: "manual" });

  assert.equal(app.lots[0]?.name, "Confirmed cloud lot");
  assert.equal(app.loadLot.mock.calls.length, 1);
  assert.equal(app.workspaceRealtimeStatus, "recovered");
});

test("workspace catch-up fences a metadata edit made while the full snapshot is in flight", async () => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, String(value)); },
    removeItem: (key: string) => { storage.delete(key); }
  });
  const app = createApp({ loadLot: vi.fn() });
  app.lastSyncedPayloadHash = createCurrentWorkspaceSignature(app);
  fetchAuthoritativeSalesMock.mockResolvedValueOnce(null);
  fetchAuthoritativeLivePricingMock.mockResolvedValueOnce(null);
  const pullResponse = createDeferred<Response>();
  app.pullCloudSync = (forceApply = false, options = {}) => runCloudSyncPull(app, {
    resolveApiBaseUrl: () => "https://api.example",
    isOnline: () => true,
    requestCloudSyncPull: () => pullResponse.promise,
    createSyncPayload: (target, _version, scope) => createSyncPayload({
      lots: target.lots,
      currentLotId: target.currentLotId,
      wheelConfigs: target.wheelConfigs,
      activeWheelConfigId: target.activeWheelConfigId,
      systemPricingDefaults: target.systemPricingDefaults,
      workspaceId: scope?.workspaceId ?? undefined
    }),
    getStoredClientVersion: () => 0,
    setStoredClientVersion: () => {},
    setStoredLastSyncedPayloadHash: () => {},
    startSyncStatus: () => {},
    setSyncStatusSuccess: () => {},
    setSyncStatusError: () => {}
  }, { forceApply, ...options });
  const { runWorkspaceRealtimeCatchUp } = await import(
    "../src/app-core/methods/ui/workspace/workspace-realtime-recovery.ts"
  );

  const catchUpPromise = runWorkspaceRealtimeCatchUp(app as never, { reason: "manual" });
  await flushMicrotasks();
  app.lots[0]!.name = "Locally renamed while syncing";
  pullResponse.resolve({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ snapshot: {
      lots: [{ id: 1773766061603, name: "Older cloud lot" }],
      salesByLot: {}, wheelConfigs: [], activeWheelConfigId: null, version: 5
    } })
  } as Response);
  await catchUpPromise;

  assert.equal(app.lots[0]?.name, "Locally renamed while syncing");
  assert.equal(app.workspaceRealtimeStatus, "stale");
});

test("workspace catch-up skips broad pull when live pricing is already dirty", async () => {
  const app = createApp();
  app.lastSyncedPayloadHash = createCurrentWorkspaceSignature(app);
  app.livePackPrice = 31;
  const { markLivePricingPollingBaseline } = await import(
    "../src/app-core/methods/ui/sync/lot-entity-polling.ts"
  );
  markLivePricingPollingBaseline(app, {
    liveSpotPrice: 0, liveBoxPriceSell: 0, livePackPrice: 0, currentLivePricingVersion: null
  });
  fetchAuthoritativeSalesMock.mockResolvedValueOnce(null);
  fetchAuthoritativeLivePricingMock.mockResolvedValueOnce(null);
  const { runWorkspaceRealtimeCatchUp } = await import(
    "../src/app-core/methods/ui/workspace/workspace-realtime-recovery.ts"
  );

  await runWorkspaceRealtimeCatchUp(app as never, { reason: "manual" });

  assert.equal(app.pullCloudSync.mock.calls.length, 0);
  assert.equal(app.livePackPrice, 31);
  assert.equal(app.workspaceRealtimeStatus, "stale");
});

test("a changed lot visit queues one bounded catch-up after the old request settles", async () => {
  const app = createApp();
  app.lotHydrationRevision = 1;
  const oldSales = createDeferred<any[]>();
  const oldPricing = createDeferred<any>();
  fetchAuthoritativeSalesMock.mockReturnValueOnce(oldSales.promise).mockResolvedValueOnce([]);
  fetchAuthoritativeLivePricingMock.mockReturnValueOnce(oldPricing.promise).mockResolvedValueOnce(null);
  const { runWorkspaceRealtimeCatchUp } = await import(
    "../src/app-core/methods/ui/workspace/workspace-realtime-recovery.ts"
  );

  const oldCatchUp = runWorkspaceRealtimeCatchUp(app as never, { reason: "subscribed" });
  app.currentLotId = 2;
  app.lotHydrationRevision = 2;
  void runWorkspaceRealtimeCatchUp(app as never, { reason: "subscribed" });
  oldSales.resolve([]);
  oldPricing.resolve(null);
  await oldCatchUp;
  await flushMicrotasks();

  assert.equal(fetchAuthoritativeSalesMock.mock.calls.length, 2);
  assert.equal(fetchAuthoritativeSalesMock.mock.calls[1]?.[1], 2);
});

test("a realtime event during catch-up queues one bounded follow-up", async () => {
  const app = createApp();
  app.lastSyncedPayloadHash = createCurrentWorkspaceSignature(app);
  const oldPull = createDeferred<any>();
  app.pullCloudSync.mockReturnValueOnce(oldPull.promise).mockResolvedValueOnce({
    kind: "confirmed", persistence: "cloud", cache: "not-applicable", cloud: "confirmed"
  });
  fetchAuthoritativeSalesMock.mockResolvedValue([]);
  fetchAuthoritativeLivePricingMock.mockResolvedValue(null);
  const { runWorkspaceRealtimeCatchUp } = await import(
    "../src/app-core/methods/ui/workspace/workspace-realtime-recovery.ts"
  );

  const oldCatchUp = runWorkspaceRealtimeCatchUp(app as never, { reason: "subscribed" });
  await flushMicrotasks();
  markWorkspaceRealtimeDataChanged(app);
  void runWorkspaceRealtimeCatchUp(app as never, { reason: "uncertain-event" });
  oldPull.resolve({ kind: "confirmed", persistence: "cloud", cache: "not-applicable", cloud: "confirmed" });
  await oldCatchUp;
  await flushMicrotasks();

  assert.equal(app.pullCloudSync.mock.calls.length, 2);
  assert.equal(app.workspaceRealtimeStatus, "recovered");
});

test("workspace catch-up rejects sales and pricing responses after scope and lot A-to-B-to-A", async () => {
  const app = createApp();
  app.googleAuthEpoch = 0;
  app.lotHydrationRevision = 4;
  const salesResponse = createDeferred<any[]>();
  const pricingResponse = createDeferred<any>();
  fetchAuthoritativeSalesMock.mockReturnValueOnce(salesResponse.promise);
  fetchAuthoritativeLivePricingMock.mockReturnValueOnce(pricingResponse.promise);
  const originalSales = [{ id: 5, type: "pack", quantity: 1, packsCount: 1, price: 9, date: "2026-10-17" }];
  app.sales = originalSales;
  app.livePackPrice = 7;

  const { runWorkspaceRealtimeCatchUp } = await import(
    "../src/app-core/methods/ui/workspace/workspace-realtime-recovery.ts"
  );
  const catchUpPromise = runWorkspaceRealtimeCatchUp(app as never, { reason: "manual" });
  const salesOptions = fetchAuthoritativeSalesMock.mock.calls[0]?.[2];
  const pricingOptions = fetchAuthoritativeLivePricingMock.mock.calls[0]?.[2];
  assert.equal(salesOptions.cache, false);
  assert.equal(salesOptions.scope.workspaceId, "ws_dcb4d6f021637411");
  assert.equal(pricingOptions.scope.workspaceId, "ws_dcb4d6f021637411");

  setActiveWorkspaceScope(app, "workspace", "team-b");
  setActiveWorkspaceScope(app, "workspace", "ws_dcb4d6f021637411");
  app.currentLotId = 2;
  app.lotHydrationRevision += 1;
  app.currentLotId = 1773766061603;
  app.lotHydrationRevision += 1;
  assert.equal(salesOptions.isRequestCurrent(), false);
  assert.equal(pricingOptions.isRequestCurrent(), false);

  salesResponse.resolve([{ id: 90, type: "pack", quantity: 1, packsCount: 1, price: 50, date: "2026-10-16" }]);
  pricingResponse.resolve({ livePackPrice: 99, liveBoxPriceSell: 99, liveSpotPrice: 99, version: 8 });
  await catchUpPromise;

  assert.deepEqual(app.sales, originalSales);
  assert.equal(app.livePackPrice, 7);
  assert.equal(cacheAuthoritativeSalesMock.mock.calls.length, 0);
  assert.equal(app.pullCloudSync.mock.calls.length, 0);
});

test("workspace realtime runs catch-up after subscription succeeds", async () => {
  const app = createApp();
  app.lastSyncedPayloadHash = createCurrentWorkspaceSignature(app);
  fetchAuthoritativeSalesMock.mockResolvedValueOnce([]);
  fetchAuthoritativeLivePricingMock.mockResolvedValueOnce(null);

  refreshWorkspaceRealtime(app as never);
  const socket = FakeWebSocket.instances[0]!;
  socket.triggerOpen();
  await flushMicrotasks();

  socket.triggerMessage({
    type: "subscribed",
    rooms: [
      "workspace:ws_dcb4d6f021637411:lot:1773766061603",
      "workspace:ws_dcb4d6f021637411:presence",
      "workspace:ws_dcb4d6f021637411:wheel"
    ]
  });
  await flushMicrotasks();

  assert.equal(fetchAuthoritativeSalesMock.mock.calls.length, 1);
  assert.equal(app.workspaceRealtimeStatus, "recovered");
});

test("workspace realtime applies incoming sale and live pricing events for the active room", async () => {
  const app = createApp({
    sales: [{
      id: 1,
      type: "pack",
      quantity: 1,
      packsCount: 1,
      price: 10,
      buyerShipping: 0,
      date: "2026-03-19"
    }]
  });

  refreshWorkspaceRealtime(app as never);
  const socket = FakeWebSocket.instances[0]!;
  socket.triggerOpen();
  await flushMicrotasks();

  socket.triggerMessage({
    type: "event",
    room: "workspace:ws_dcb4d6f021637411:lot:1773766061603",
    eventType: "sale.upserted",
    data: {
      lotId: 1773766061603,
      sale: {
        id: 2,
        type: "pack",
        quantity: 2,
        packsCount: 2,
        price: 25,
        buyerShipping: 0,
        date: "2026-03-19"
      }
    }
  });

  assert.equal((app.sales as Array<{ id: number }>)[1]?.id, 2);
  assert.equal(cacheAuthoritativeSalesMock.mock.calls.length, 1);

  socket.triggerMessage({
    type: "event",
    room: "workspace:ws_dcb4d6f021637411:lot:1773766061603",
    eventType: "livePricing.updated",
    data: {
      lotId: 1773766061603,
      livePricing: {
        liveSpotPrice: 11,
        liveBoxPriceSell: 22,
        livePackPrice: 33,
        version: 4
      }
    }
  });

  assert.equal(reconcileIncomingLivePricingSnapshotMock.mock.calls.length, 1);
  assert.deepEqual(reconcileIncomingLivePricingSnapshotMock.mock.calls[0]?.[1], {
    liveSpotPrice: 11,
    liveBoxPriceSell: 22,
    livePackPrice: 33,
    version: 4
  });

  socket.triggerMessage({
    type: "event",
    room: "workspace:ws_dcb4d6f021637411:presence",
    eventType: "workspace.presence",
    data: {
      workspaceId: "ws_dcb4d6f021637411",
      members: [
        { userId: "owner-1", isOnline: true, lastSeenAt: "2026-03-20T18:00:00.000Z" },
        { userId: "member-2", isOnline: false, lastSeenAt: "2026-03-20T17:58:00.000Z" }
      ]
    }
  });

  assert.deepEqual(app.workspacePresenceByUserId, {
    "owner-1": { userId: "owner-1", isOnline: true, lastSeenAt: "2026-03-20T18:00:00.000Z" },
    "member-2": { userId: "member-2", isOnline: false, lastSeenAt: "2026-03-20T17:58:00.000Z" }
  });
});

test("workspace realtime refreshes buyer profiles from a scoped profile invalidation", async () => {
  const app = createApp();

  refreshWorkspaceRealtime(app as never);
  const socket = FakeWebSocket.instances[0]!;
  socket.triggerOpen();
  await flushMicrotasks();

  socket.triggerMessage({
    type: "event",
    room: "workspace:ws_dcb4d6f021637411:presence",
    eventType: "buyer.profile.changed",
    data: {
      profileId: "buyer-profile-1",
      version: 3,
      deleted: false
    }
  });

  await flushMicrotasks();

  assert.equal(app.hydrateBuyerProfiles.mock.calls.length, 1);
});

test("workspace realtime applies wheel updates including resets when revision is newer", async () => {
  const app = createApp({
    lots: [{
      id: 1,
      name: "Singles Lot",
      lotType: "singles",
      singlesPurchases: [{ id: 10, name: "Pack A" }]
    }],
    wheelConfigs: [{
      id: 91,
      name: "Old Wheel",
      spinPrice: 10,
      targetMargin: 40,
      createdAt: "",
      tiers: []
    }],
    activeWheelConfigId: 91,
    wheelTotalSpins: 10,
    wheelSpinCounts: [10],
    wheelLastResult: "Old",
    wheelSessionUpdatedAt: 100,
    wheelSessionNetRevenue: 80,
    wheelSessionCostAdjustment: 4,
    wheelFairnessHistory: [{
      spinNumber: 1,
      label: "Old Fair",
      color: "#111111",
      hash: "old-hash",
      seed: "old-seed",
      clientSeed: "old-client",
      verificationUrl: "https://api.example.test/wheel/fairness/verify?serverSeed=old-seed&clientSeed=old-client&slotCount=1",
      algorithm: "whatfees-wheel-v1",
      timestamp: 11
    }],
    wheelChaseTallyHistory: [{
      tierId: "old-tier",
      label: "Old Tier",
      color: "#222222",
      count: 2
    }],
    wheelCurrentAngle: 0.5,
    wheelLastResultColor: "#abcdef"
  });

  refreshWorkspaceRealtime(app as never);
  const socket = FakeWebSocket.instances[0]!;
  socket.triggerOpen();
  await flushMicrotasks();

  socket.triggerMessage({
    type: "event",
    room: "workspace:ws_dcb4d6f021637411:wheel",
    eventType: "wheel.session.updated",
    data: {
      wheelSessionNetRevenue: 61.1,
      wheelSessionCostAdjustment: 12,
      wheelFairnessHistory: [{
        spinNumber: 1,
        label: "Verified Fair",
        color: "#f00",
        hash: "hash-1",
        seed: "seed-1",
        clientSeed: "client-1",
        verificationUrl: "https://api.example.test/wheel/fairness/verify?serverSeed=seed-1&clientSeed=client-1&slotCount=1",
        algorithm: "whatfees-wheel-v1",
        timestamp: 1
      }],
      wheelChaseTallyHistory: [{
        tierId: "tier-1",
        label: "Old Prize",
        color: "#0f0",
        count: 3
      }],
      wheelGridLayoutSeed: "workspace-grid-seed",
      wheelPreviewGridLayoutSeed: "workspace-preview-grid-seed",
      wheelGridReveals: [{
        cellIndex: "4",
        slotIndex: "2",
        label: "Floor",
        color: "#123456",
        tier: "tier-1",
        spinNumber: "1",
        timestamp: "99"
      }],
      wheelPreviewGridReveals: [{
        cellIndex: "5",
        slotIndex: "3",
        label: "Preview",
        color: "#abcdef",
        tier: "tier-1",
        spinNumber: "1",
        timestamp: "100"
      }],
      wheelConfigs: [{
        id: 91,
        name: "New Wheel",
        spinPrice: 15,
        targetMargin: 35,
        createdAt: "",
        tiers: [{
          id: "tier-1",
          name: "Tier One",
          color: "#ff0000",
          slots: 4,
          count: 1,
          cost: 0,
          boundLotId: 1,
          boundSinglesId: 10,
          deductionType: "packs",
          packsCount: 4,
          isChase: true
        }]
      }],
      activeWheelConfigId: 91,
      wheelTotalSpins: 0,
      wheelSpinCounts: [0],
      wheelLastResult: "",
      wheelSessionUpdatedAt: 200,
      wheelSkippedDeductions: [{
        slotName: "Old Prize",
        slotColor: "#f00",
        slotCost: 5,
        slotTier: "tier-1",
        slotPacksCount: 1,
        slotDeductionType: "packs",
        slotIndex: 0,
        selectedLotId: 1,
        spinNumber: 2
      }],
      wheelCurrentAngle: 1.75,
      wheelLastResultColor: "#00ff00",
      wheelPendingChase: {
        version: 1,
        configId: 91,
        spinNumber: 2,
        tierId: "tier-1",
        slotIndex: 0,
        originalConfig: {
          id: 91, name: "New Wheel", spinPrice: 10, targetMargin: 40,
          tiers: [{ id: "tier-1", label: "Tier One", color: "#ff0000", slots: 4, costPerTier: 0,
            boundLotId: 1, boundSinglesId: 10, deductionType: "singles", packsCount: 1, isChase: true }]
        },
        originalSourceJson: "{\"id\":91,\"name\":\"New Wheel\",\"spinPrice\":10,\"targetMargin\":40,\"tiers\":[{\"id\":\"tier-1\",\"label\":\"Tier One\",\"color\":\"#ff0000\",\"slots\":4,\"costPerTier\":0,\"boundLotId\":1,\"boundSinglesId\":10,\"deductionType\":\"singles\",\"packsCount\":1,\"isChase\":true}]}",
        originalTier: { id: "tier-1", label: "Tier One", color: "#ff0000", slots: 4, costPerTier: 0,
          boundLotId: 1, boundSinglesId: 10, deductionType: "singles", packsCount: 1, isChase: true },
        originalPrize: { slotLabel: "Tier One", slotColor: "#ff0000", lotId: 1, singlesEntryId: 10, lotType: "singles", itemLabel: "Card" },
        saleDraft: null
      }
    }
  });

  assert.equal(app.wheelTotalSpins, 0);
  assert.deepEqual(app.wheelSpinCounts, [0]);
  assert.equal(app.wheelLastResult, "");
  assert.equal(app.wheelSessionNetRevenue, 61.1);
  assert.equal(app.wheelSessionCostAdjustment, 12);
  assert.deepEqual(app.wheelFairnessHistory, [{
    spinNumber: 1,
    label: "Verified Fair",
    color: "#f00",
    hash: "hash-1",
    seed: "seed-1",
    clientSeed: "client-1",
    verificationUrl: "https://api.example.test/wheel/fairness/verify?serverSeed=seed-1&clientSeed=client-1&slotCount=1",
    algorithm: "whatfees-wheel-v1",
    timestamp: 1
  }]);
  assert.deepEqual(app.wheelChaseTallyHistory, [{
    tierId: "tier-1",
    label: "Old Prize",
    color: "#0f0",
    count: 3
  }]);
  assert.equal(app.wheelGridLayoutSeed, "workspace-grid-seed");
  assert.equal(app.wheelPreviewGridLayoutSeed, "workspace-preview-grid-seed");
  assert.deepEqual(app.wheelGridReveals, [{
    cellIndex: 4,
    slotIndex: 2,
    label: "Floor",
    color: "#123456",
    tier: "tier-1",
    spinNumber: 1,
    timestamp: 99
  }]);
  assert.deepEqual(app.wheelPreviewGridReveals, [{
    cellIndex: 5,
    slotIndex: 3,
    label: "Preview",
    color: "#abcdef",
    tier: "tier-1",
    spinNumber: 1,
    timestamp: 100
  }]);
  assert.equal(app.wheelCurrentAngle, 1.75);
  assert.equal(app.wheelLastResultColor, "#00ff00");
  const sanitizedTier = (app.wheelConfigs as Array<{ tiers?: Array<{ deductionType?: string; packsCount?: number; isChase?: boolean; boundSinglesId?: number | null }> }>)[0]?.tiers?.[0];
  assert.equal((app.wheelConfigs as Array<{ name: string }>)[0]?.name, "New Wheel");
  assert.equal(sanitizedTier?.deductionType, "singles");
  assert.equal(sanitizedTier?.packsCount, 1);
  assert.equal(sanitizedTier?.isChase, true);
  assert.equal(app.activeWheelConfigId, 91);
  assert.equal(app.wheelSessionUpdatedAt, 200);
  assert.equal((app.wheelPendingInventoryIssues as Array<{ spinNumber?: number }>)[0]?.spinNumber, 2);
  assert.equal((app.wheelPendingChase as { saleDraft: unknown; spinNumber: number }).spinNumber, 2);
  assert.equal((app.wheelPendingChase as { saleDraft: unknown }).saleDraft, null);
  assert.equal((app.wheelPendingChase as { originalPrize: { lotType?: string } }).originalPrize.lotType, "singles");
});

test("workspace realtime normalizes wheel config updates through the shared sync contract", async () => {
  const app = createApp({
    lots: [{ id: 1, name: "Bulk Lot", lotType: "bulk" }],
    wheelConfigs: [],
    activeWheelConfigId: null,
    wheelSessionUpdatedAt: 100
  });

  refreshWorkspaceRealtime(app as never);
  const socket = FakeWebSocket.instances[0]!;
  socket.triggerOpen();
  await flushMicrotasks();

  socket.triggerMessage({
    type: "event",
    room: "workspace:ws_dcb4d6f021637411:wheel",
    eventType: "wheel.session.updated",
    data: {
      wheelConfigs: [{
        id: "91",
        name: " Grid Night ",
        gameType: "grid",
        outcomeCount: "80",
        gridCellCount: "80",
        spinPrice: "12.5",
        targetMargin: "45",
        debugOnly: "drop",
        tiers: [{
          id: "tier-1",
          label: " Chase ",
          chancePercent: "25",
          slots: "20",
          costPerTier: "6",
          deductionType: "packs",
          packsCount: "2",
          extraTierField: "drop"
        }]
      }],
      activeWheelConfigId: "91",
      wheelSessionUpdatedAt: 200
    }
  });

  assert.equal(app.activeWheelConfigId, 91);
  assert.equal((app.wheelConfigs as Array<{ name?: string }>)[0]?.name, "Grid Night");
  assert.equal((app.wheelConfigs as Array<{ gameType?: string }>)[0]?.gameType, "grid");
  assert.equal((app.wheelConfigs as Array<{ outcomeCount?: number }>)[0]?.outcomeCount, 80);
  assert.equal("debugOnly" in ((app.wheelConfigs as Array<Record<string, unknown>>)[0] ?? {}), false);
  const tier = (app.wheelConfigs as Array<{ tiers?: Array<Record<string, unknown>> }>)[0]?.tiers?.[0];
  assert.equal(tier?.label, "Chase");
  assert.equal(tier?.chancePercent, 100);
  assert.equal(tier?.slots, 100);
  assert.equal("extraTierField" in (tier ?? {}), false);
});

test("workspace realtime reconnects after an unexpected close and stops cleanly", async () => {
  const app = createApp();
  app.lastSyncedPayloadHash = createCurrentWorkspaceSignature(app);

  refreshWorkspaceRealtime(app as never);
  const firstSocket = FakeWebSocket.instances[0]!;
  firstSocket.triggerOpen();
  await flushMicrotasks();
  firstSocket.triggerMessage({
    type: "subscribed",
    rooms: ["workspace:ws_dcb4d6f021637411:lot:1773766061603"]
  });
  await flushMicrotasks();
  assert.equal(app.workspaceRealtimeStatus, "recovered");
  firstSocket.triggerClose();
  assert.equal(app.workspaceRealtimeStatus, "reconnecting");

  await vi.advanceTimersByTimeAsync(999);
  assert.equal(FakeWebSocket.instances.length, 1);

  await vi.advanceTimersByTimeAsync(1);

  assert.equal(FakeWebSocket.instances.length, 2);
  const secondSocket = FakeWebSocket.instances[1]!;
  assert.equal(app.workspaceRealtimeStatus, "reconnecting");
  secondSocket.triggerOpen();
  await flushMicrotasks();
  secondSocket.triggerMessage({
    type: "subscribed",
    rooms: ["workspace:ws_dcb4d6f021637411:lot:1773766061603"]
  });
  await flushMicrotasks();
  assert.equal(app.workspaceRealtimeStatus, "recovered");

  stopWorkspaceRealtime(app as never);
  assert.equal(app.workspaceRealtimeStatus, "idle");

  assert.equal(secondSocket.closeCalls.length, 1);
  assert.deepEqual(secondSocket.closeCalls[0], {
    code: 1000,
    reason: "realtime-refresh"
  });
});

test("workspace realtime handles lost workspace access when subscribe token is forbidden", async () => {
  const app = createApp();
  fetchWorkspaceRealtimeSubscribeTokenMock.mockRejectedValueOnce(Object.assign(new Error("forbidden"), {
    status: 403
  }));

  refreshWorkspaceRealtime(app as never);
  const socket = FakeWebSocket.instances[0]!;
  socket.triggerOpen();
  await flushMicrotasks();

  assert.equal((app.handleWorkspaceAccessLost as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal((app.handleWorkspaceAccessLost as ReturnType<typeof vi.fn>).mock.calls[0]?.[0], "ws_dcb4d6f021637411");
  assert.equal(app.workspaceRealtimeStatus, "disconnected");
  assert.deepEqual(socket.closeCalls[0], {
    code: 4001,
    reason: "realtime-subscribe-failed"
  });
});

test("workspace realtime uses browser-safe close codes for gateway error messages", async () => {
  const app = createApp();

  refreshWorkspaceRealtime(app as never);
  const socket = FakeWebSocket.instances[0]!;
  socket.triggerOpen();
  await flushMicrotasks();

  socket.triggerMessage({
    type: "error",
    message: "server exploded"
  });

  assert.equal(app.workspaceRealtimeStatus, "disconnected");
  assert.deepEqual(socket.closeCalls[0], {
    code: 4002,
    reason: "realtime-server-error"
  });
});

test("workspace realtime connects on config tab and pulls cloud sync for clean config invalidations", async () => {
  const app = createApp({
    currentTab: "config"
  });
  app.lastSyncedPayloadHash = getSyncPayloadSignature(createSyncPayload({
    lots: app.lots,
    currentLotId: app.currentLotId,
    wheelConfigs: app.wheelConfigs,
    activeWheelConfigId: app.activeWheelConfigId,
    workspaceId: app.activeWorkspaceId
  }));

  refreshWorkspaceRealtime(app as never);
  const socket = FakeWebSocket.instances[0]!;
  socket.triggerOpen();
  await flushMicrotasks();

  socket.triggerMessage({
    type: "event",
    room: "workspace:ws_dcb4d6f021637411:lot:1773766061603",
    eventType: "lot.config.updated",
    data: {
      lotId: "1773766061603",
      version: 2,
      updatedAt: "2026-03-19T12:00:00.000Z"
    }
  });
  await flushMicrotasks();

  assert.equal((app.pullCloudSync as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal(app.workspaceRealtimeStatus, "recovered");
});

test("workspace realtime ignores config invalidations when local config is dirty", async () => {
  const app = createApp({
    currentTab: "config",
    lastSyncedPayloadHash: "stale-signature"
  });

  refreshWorkspaceRealtime(app as never);
  const socket = FakeWebSocket.instances[0]!;
  socket.triggerOpen();
  await flushMicrotasks();

  socket.triggerMessage({
    type: "event",
    room: "workspace:ws_dcb4d6f021637411:lot:1773766061603",
    eventType: "lot.config.updated",
    data: {
      lotId: "1773766061603",
      version: 2,
      updatedAt: "2026-03-19T12:00:00.000Z"
    }
  });
  await flushMicrotasks();

  assert.equal((app.pullCloudSync as ReturnType<typeof vi.fn>).mock.calls.length, 0);
  assert.equal(app.workspaceRealtimeStatus, "stale");
});
