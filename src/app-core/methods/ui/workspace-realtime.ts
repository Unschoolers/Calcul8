import type { Sale } from "../../../types/app.ts";
import type { AppContext } from "../../context.ts";
import {
  cacheAuthoritativeSales,
  canUseAuthoritativeSalesLiveApi,
  fetchWorkspaceRealtimeSubscribeToken,
  normalizeLivePricing,
  normalizeSale
} from "../sales-live-api.ts";
import { createSyncPayload, getSyncPayloadSignature } from "./sync-payload.ts";
import { reconcileIncomingLivePricingSnapshot } from "./lot-entity-polling.ts";

type RealtimeApp = Pick<
  AppContext,
  | "activeScopeType"
  | "activeWorkspaceId"
  | "currentLotId"
  | "currentTab"
  | "isOffline"
  | "lots"
  | "lastSyncedPayloadHash"
  | "sales"
  | "liveSpotPrice"
  | "liveBoxPriceSell"
  | "livePackPrice"
  | "currentLivePricingVersion"
  | "loadSalesForLotId"
  | "pullCloudSync"
  | "getSalesStorageKey"
>;

type RealtimeSocketState = {
  socket: WebSocket | null;
  room: string | null;
  reconnectTimeoutId: number | null;
  url: string | null;
  isIntentionalClose: boolean;
  subscribeAttemptId: number;
};

type RealtimeEnvelope =
  | { type: "connected"; clientId?: string }
  | { type: "subscribed"; rooms?: string[] }
  | { type: "error"; message?: string }
  | { type: "event"; room?: string; eventType?: string; data?: unknown };

type RealtimeEventPayload = {
  lotId: number;
  raw: Record<string, unknown>;
};

const REALTIME_RECONNECT_DELAY_MS = 3_000;
const FALLBACK_REALTIME_SOCKET_URL = "wss://whatfees-realtime.redsand-4d20b4cc.canadaeast.azurecontainerapps.io/socket";
const PROD_REALTIME_SOCKET_URL = "wss://ws.whatfees.ca/socket";
const WORKSPACE_REALTIME_TABS = new Set(["config", "live", "sales", "portfolio"]);
const realtimeSocketStateByApp = new WeakMap<object, RealtimeSocketState>();

function getRealtimeSocketState(app: object): RealtimeSocketState {
  let state = realtimeSocketStateByApp.get(app);
  if (!state) {
    state = {
      socket: null,
      room: null,
      reconnectTimeoutId: null,
      url: null,
      isIntentionalClose: false,
      subscribeAttemptId: 0
    };
    realtimeSocketStateByApp.set(app, state);
  }
  return state;
}

function shouldUseWorkspaceRealtime(app: RealtimeApp): boolean {
  if (app.isOffline || !app.currentLotId || app.activeScopeType !== "workspace" || !app.activeWorkspaceId) {
    return false;
  }

  if (!canUseAuthoritativeSalesLiveApi()) {
    return false;
  }

  return WORKSPACE_REALTIME_TABS.has(app.currentTab);
}

function buildWorkspaceLotRoom(workspaceId: string, lotId: number): string {
  return `workspace:${workspaceId}:lot:${lotId}`;
}

function getDesiredRealtimeRoom(app: RealtimeApp): string | null {
  if (!shouldUseWorkspaceRealtime(app)) return null;
  return buildWorkspaceLotRoom(app.activeWorkspaceId as string, app.currentLotId as number);
}

function resolveRealtimeSocketUrl(): string {
  const configured = String((import.meta.env.VITE_REALTIME_SOCKET_URL as string | undefined) || "").trim();
  if (configured) return configured;

  const host = window.location.hostname.trim().toLowerCase();
  if (host === "whatfees.ca" || host.endsWith(".whatfees.ca")) {
    return PROD_REALTIME_SOCKET_URL;
  }

  return FALLBACK_REALTIME_SOCKET_URL;
}

function clearReconnectTimeout(state: RealtimeSocketState): void {
  if (state.reconnectTimeoutId != null) {
    globalThis.clearTimeout(state.reconnectTimeoutId);
    state.reconnectTimeoutId = null;
  }
}

function upsertRealtimeSale(app: RealtimeApp, lotId: number, nextSale: Sale): void {
  if (app.currentLotId !== lotId) return;

  const existingIndex = app.sales.findIndex((sale) => sale.id === nextSale.id);
  if (existingIndex >= 0) {
    const nextSales = [...app.sales];
    nextSales.splice(existingIndex, 1, nextSale);
    app.sales = nextSales;
  } else {
    app.sales = [...app.sales, nextSale];
  }

  cacheAuthoritativeSales(app as never, lotId, app.sales);
}

function deleteRealtimeSale(app: RealtimeApp, lotId: number, saleId: number): void {
  if (app.currentLotId !== lotId) return;

  const nextSales = app.sales.filter((sale) => sale.id !== saleId);
  if (nextSales.length === app.sales.length) return;

  app.sales = nextSales;
  cacheAuthoritativeSales(app as never, lotId, nextSales);
}

function isWorkspaceSnapshotSyncClean(app: RealtimeApp): boolean {
  const expectedSignature = String(app.lastSyncedPayloadHash ?? "").trim();
  if (!expectedSignature) return false;

  const currentSignature = getSyncPayloadSignature(createSyncPayload({
    lots: app.lots,
    currentLotId: app.currentLotId,
    sales: app.sales,
    loadSalesForLotId: app.loadSalesForLotId,
    workspaceId: app.activeWorkspaceId
  }));
  return currentSignature === expectedSignature;
}

function parseRealtimeEventPayload(app: RealtimeApp, data: unknown): RealtimeEventPayload | null {
  const raw = typeof data === "object" && data !== null && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  const lotId = Number(raw.lotId ?? app.currentLotId);
  if (!Number.isFinite(lotId) || lotId <= 0) return null;
  return {
    lotId: Math.floor(lotId),
    raw
  };
}

function handleSaleUpsertEvent(app: RealtimeApp, payload: RealtimeEventPayload): void {
  const sale = normalizeSale(payload.raw.sale);
  if (sale) {
    upsertRealtimeSale(app, payload.lotId, sale);
  }
}

function handleSaleDeletedEvent(app: RealtimeApp, payload: RealtimeEventPayload): void {
  const saleId = Number(payload.raw.saleId);
  if (Number.isFinite(saleId) && saleId > 0) {
    deleteRealtimeSale(app, payload.lotId, Math.floor(saleId));
  }
}

function handleLivePricingUpdatedEvent(app: RealtimeApp, payload: RealtimeEventPayload): void {
  const livePricing = normalizeLivePricing(payload.raw.livePricing);
  if (livePricing && app.currentLotId === payload.lotId) {
    reconcileIncomingLivePricingSnapshot(app, livePricing);
  }
}

function handleLotConfigUpdatedEvent(app: RealtimeApp, payload: RealtimeEventPayload): void {
  if (app.currentLotId !== payload.lotId) return;
  if (!isWorkspaceSnapshotSyncClean(app)) return;
  void app.pullCloudSync();
}

function applyRealtimeMessage(app: RealtimeApp, room: string, eventType: string, data: unknown): void {
  const desiredRoom = getDesiredRealtimeRoom(app);
  if (!desiredRoom || room !== desiredRoom) return;

  const payload = parseRealtimeEventPayload(app, data);
  if (!payload) return;

  if (eventType === "sale.upserted") {
    handleSaleUpsertEvent(app, payload);
    return;
  }

  if (eventType === "sale.deleted") {
    handleSaleDeletedEvent(app, payload);
    return;
  }

  if (eventType === "livePricing.updated") {
    handleLivePricingUpdatedEvent(app, payload);
    return;
  }

  if (eventType === "lot.config.updated") {
    handleLotConfigUpdatedEvent(app, payload);
  }
}

function scheduleRealtimeReconnect(app: RealtimeApp): void {
  const state = getRealtimeSocketState(app as object);
  if (state.reconnectTimeoutId != null) return;

  state.reconnectTimeoutId = globalThis.setTimeout(() => {
    state.reconnectTimeoutId = null;
    refreshWorkspaceRealtime(app);
  }, REALTIME_RECONNECT_DELAY_MS);
}

function closeRealtimeSocket(app: RealtimeApp): void {
  const state = getRealtimeSocketState(app as object);
  clearReconnectTimeout(state);
  state.isIntentionalClose = true;
  const activeSocket = state.socket;
  state.socket = null;
  state.room = null;
  state.url = null;

  if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
    activeSocket.close(1000, "realtime-refresh");
  } else if (activeSocket && activeSocket.readyState === WebSocket.CONNECTING) {
    activeSocket.close();
  }
}

function shouldKeepRealtimeSocket(
  state: RealtimeSocketState,
  desiredRoom: string,
  nextUrl: string
): boolean {
  return Boolean(
    state.socket
    && state.socket.readyState === WebSocket.OPEN
    && state.room === desiredRoom
    && state.url === nextUrl
  );
}

function shouldReconnectSocket(
  app: RealtimeApp,
  state: RealtimeSocketState,
  desiredRoom: string
): boolean {
  return !state.isIntentionalClose
    && getDesiredRealtimeRoom(app) === desiredRoom;
}

function tryScheduleRealtimeReconnect(
  app: RealtimeApp,
  state: RealtimeSocketState,
  desiredRoom: string
): void {
  if (shouldReconnectSocket(app, state, desiredRoom)) {
    scheduleRealtimeReconnect(app);
  }
}

async function subscribeRealtimeSocket(
  app: RealtimeApp,
  state: RealtimeSocketState,
  socket: WebSocket,
  subscribeAttemptId: number
): Promise<void> {
  if (state.socket !== socket || !state.room || !app.currentLotId) return;

  try {
    const subscribeToken = await fetchWorkspaceRealtimeSubscribeToken(app as never, app.currentLotId);
    if (
      state.socket !== socket
      || state.subscribeAttemptId !== subscribeAttemptId
      || socket.readyState !== WebSocket.OPEN
      || !state.room
    ) {
      return;
    }

    const nextRoom = subscribeToken?.room || state.room;
    socket.send(JSON.stringify({
      type: "subscribe",
      rooms: [nextRoom],
      ...(subscribeToken?.token ? { token: subscribeToken.token } : {})
    }));
  } catch {
    if (state.socket === socket && socket.readyState === WebSocket.OPEN) {
      socket.close(1011, "realtime-subscribe-failed");
    }
  }
}

function attachRealtimeSocketListeners(
  app: RealtimeApp,
  state: RealtimeSocketState,
  socket: WebSocket,
  desiredRoom: string,
  subscribeAttemptId: number
): void {
  socket.addEventListener("open", () => {
    void subscribeRealtimeSocket(app, state, socket, subscribeAttemptId);
  });

  socket.addEventListener("message", (event) => {
    let payload: RealtimeEnvelope;
    try {
      payload = JSON.parse(String(event.data || "")) as RealtimeEnvelope;
    } catch {
      return;
    }

    if (payload.type === "event") {
      applyRealtimeMessage(
        app,
        String(payload.room ?? ""),
        String(payload.eventType ?? ""),
        payload.data
      );
    }
  });

  socket.addEventListener("close", () => {
    if (state.socket === socket) {
      state.socket = null;
    }
    tryScheduleRealtimeReconnect(app, state, desiredRoom);
  });

  socket.addEventListener("error", () => {
    tryScheduleRealtimeReconnect(app, state, desiredRoom);
  });
}

export function refreshWorkspaceRealtime(app: RealtimeApp): void {
  const desiredRoom = getDesiredRealtimeRoom(app);
  if (!desiredRoom) {
    closeRealtimeSocket(app);
    return;
  }

  const nextUrl = resolveRealtimeSocketUrl();
  const state = getRealtimeSocketState(app as object);
  clearReconnectTimeout(state);

  if (shouldKeepRealtimeSocket(state, desiredRoom, nextUrl)) {
    return;
  }

  closeRealtimeSocket(app);
  state.isIntentionalClose = false;
  state.room = desiredRoom;
  state.url = nextUrl;
  state.subscribeAttemptId += 1;
  const subscribeAttemptId = state.subscribeAttemptId;

  const socket = new WebSocket(nextUrl);
  state.socket = socket;
  attachRealtimeSocketListeners(app, state, socket, desiredRoom, subscribeAttemptId);
}

export function stopWorkspaceRealtime(app: RealtimeApp): void {
  closeRealtimeSocket(app);
}
