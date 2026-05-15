import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import { createSyncPayload, getSyncPayloadSignature } from "../src/app-core/methods/ui/sync/sync-payload.ts";

const {
  canUseAuthoritativeSalesLiveApiMock,
  fetchWorkspaceRealtimeSubscribeTokenMock,
  fetchWorkspacePresenceRealtimeSubscribeTokenMock,
  cacheAuthoritativeSalesMock,
  normalizeSaleMock,
  normalizeLivePricingMock,
  reconcileIncomingLivePricingSnapshotMock
} = vi.hoisted(() => ({
  canUseAuthoritativeSalesLiveApiMock: vi.fn(),
  fetchWorkspaceRealtimeSubscribeTokenMock: vi.fn(),
  fetchWorkspacePresenceRealtimeSubscribeTokenMock: vi.fn(),
  cacheAuthoritativeSalesMock: vi.fn(),
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
  normalizeSale: normalizeSaleMock
}));

vi.mock("../src/app-core/methods/lot-live-pricing-api.ts", () => ({
  normalizeLivePricing: normalizeLivePricingMock
}));

vi.mock("../src/app-core/methods/ui/sync/lot-entity-polling.ts", () => ({
  reconcileIncomingLivePricingSnapshot: reconcileIncomingLivePricingSnapshotMock
}));

import {
  refreshWorkspaceRealtime,
  stopWorkspaceRealtime
} from "../src/app-core/methods/ui/workspace/workspace-realtime.ts";

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

function createApp(overrides: Record<string, unknown> = {}) {
  return {
    activeScopeType: "workspace",
    activeWorkspaceId: "ws_dcb4d6f021637411",
    currentLotId: 1773766061603,
    currentTab: "live",
    isOffline: false,
    lots: [{ id: 1773766061603, name: "Lot A" }],
    sales: [],
    liveSpotPrice: 0,
    liveBoxPriceSell: 0,
    livePackPrice: 0,
    currentLivePricingVersion: null,
    lastSyncedPayloadHash: null,
    workspaceRealtimeStatus: "idle",
    workspacePresenceByUserId: {},
    wheelConfigs: [],
    activeWheelConfigId: null as number | null,
    wheelTotalSpins: 0,
    wheelSpinCounts: [] as number[],
    wheelLastResult: "",
    wheelSessionUpdatedAt: 0,
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
    pullCloudSync: vi.fn(async () => undefined),
    handleWorkspaceAccessLost: vi.fn(async () => undefined),
    getSalesStorageKey: (lotId: number) => `sales:${lotId}`,
    loadSalesForLotId: vi.fn(() => []),
    ...overrides
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
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
  const app = createApp();

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

  assert.equal(app.workspaceRealtimeStatus, "connected");
});

test("refreshWorkspaceRealtime keeps workspace presence alive without a selected lot", async () => {
  const app = createApp({
    currentLotId: null,
    currentTab: "config"
  });

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

  assert.equal(app.workspaceRealtimeStatus, "connected");
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
      wheelLastResultColor: "#00ff00"
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
  assert.equal((app.wheelSkippedDeductions as Array<{ spinNumber?: number }>)[0]?.spinNumber, 2);
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

  refreshWorkspaceRealtime(app as never);
  const firstSocket = FakeWebSocket.instances[0]!;
  firstSocket.triggerOpen();
  await flushMicrotasks();
  firstSocket.triggerMessage({
    type: "subscribed",
    rooms: ["workspace:ws_dcb4d6f021637411:lot:1773766061603"]
  });
  assert.equal(app.workspaceRealtimeStatus, "connected");
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
  assert.equal(app.workspaceRealtimeStatus, "connected");

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
    code: 1011,
    reason: "realtime-subscribe-failed"
  });
});

test("workspace realtime connects on config tab and pulls cloud sync for clean config invalidations", async () => {
  const app = createApp({
    currentTab: "config"
  });
  app.lastSyncedPayloadHash = getSyncPayloadSignature(createSyncPayload({
    lots: app.lots,
    currentLotId: app.currentLotId,
    sales: app.sales,
    loadSalesForLotId: app.loadSalesForLotId,
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
});
