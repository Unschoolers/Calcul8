import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import { createSyncPayload, getSyncPayloadSignature } from "../src/app-core/methods/ui/sync-payload.ts";

const {
  canUseAuthoritativeSalesLiveApiMock,
  fetchWorkspaceRealtimeSubscribeTokenMock,
  cacheAuthoritativeSalesMock,
  normalizeSaleMock,
  normalizeLivePricingMock,
  reconcileIncomingLivePricingSnapshotMock
} = vi.hoisted(() => ({
  canUseAuthoritativeSalesLiveApiMock: vi.fn(),
  fetchWorkspaceRealtimeSubscribeTokenMock: vi.fn(),
  cacheAuthoritativeSalesMock: vi.fn(),
  normalizeSaleMock: vi.fn(),
  normalizeLivePricingMock: vi.fn(),
  reconcileIncomingLivePricingSnapshotMock: vi.fn()
}));

vi.mock("../src/app-core/methods/sales-live-api.ts", () => ({
  canUseAuthoritativeSalesLiveApi: canUseAuthoritativeSalesLiveApiMock,
  fetchWorkspaceRealtimeSubscribeToken: fetchWorkspaceRealtimeSubscribeTokenMock,
  cacheAuthoritativeSales: cacheAuthoritativeSalesMock,
  normalizeSale: normalizeSaleMock,
  normalizeLivePricing: normalizeLivePricingMock
}));

vi.mock("../src/app-core/methods/ui/lot-entity-polling.ts", () => ({
  reconcileIncomingLivePricingSnapshot: reconcileIncomingLivePricingSnapshotMock
}));

import {
  refreshWorkspaceRealtime,
  stopWorkspaceRealtime
} from "../src/app-core/methods/ui/workspace-realtime.ts";

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
    pullCloudSync: vi.fn(async () => undefined),
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
      "workspace:ws_dcb4d6f021637411:presence"
    ],
    token: "signed-token",
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
      "workspace:ws_dcb4d6f021637411:presence"
    ],
    token: "signed-token"
  });

  socket.triggerMessage({
    type: "subscribed",
    rooms: [
      "workspace:ws_dcb4d6f021637411:lot:1773766061603",
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

test("workspace realtime connects on config tab and pulls cloud sync for clean config invalidations", async () => {
  const app = createApp({
    currentTab: "config"
  });
  app.lastSyncedPayloadHash = getSyncPayloadSignature(createSyncPayload({
    lots: app.lots,
    currentLotId: app.currentLotId,
    sales: app.sales,
    loadSalesForLotId: app.loadSalesForLotId,
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
