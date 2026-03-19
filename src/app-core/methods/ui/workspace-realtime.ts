import type { Sale } from "../../../types/app.ts";
import type { AppContext } from "../../context.ts";
import {
  cacheAuthoritativeSales,
  canUseAuthoritativeSalesLiveApi,
  normalizeLivePricing,
  normalizeSale
} from "../sales-live-api.ts";
import { reconcileIncomingLivePricingSnapshot } from "./lot-entity-polling.ts";

type RealtimeApp = Pick<
  AppContext,
  | "activeScopeType"
  | "activeWorkspaceId"
  | "currentLotId"
  | "currentTab"
  | "isOffline"
  | "sales"
  | "liveSpotPrice"
  | "liveBoxPriceSell"
  | "livePackPrice"
  | "currentLivePricingVersion"
  | "getSalesStorageKey"
>;

type RealtimeSocketState = {
  socket: WebSocket | null;
  room: string | null;
  reconnectTimeoutId: number | null;
  url: string | null;
  isIntentionalClose: boolean;
};

type RealtimeEnvelope =
  | { type: "connected"; clientId?: string }
  | { type: "subscribed"; rooms?: string[] }
  | { type: "error"; message?: string }
  | { type: "event"; room?: string; eventType?: string; data?: unknown };

const REALTIME_RECONNECT_DELAY_MS = 3_000;
const FALLBACK_REALTIME_SOCKET_URL = "wss://whatfees-realtime.redsand-4d20b4cc.canadaeast.azurecontainerapps.io/socket";
const PROD_REALTIME_SOCKET_URL = "wss://ws.whatfees.ca/socket";
const realtimeSocketStateByApp = new WeakMap<object, RealtimeSocketState>();

function getRealtimeSocketState(app: object): RealtimeSocketState {
  let state = realtimeSocketStateByApp.get(app);
  if (!state) {
    state = {
      socket: null,
      room: null,
      reconnectTimeoutId: null,
      url: null,
      isIntentionalClose: false
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

  return app.currentTab === "live" || app.currentTab === "sales" || app.currentTab === "portfolio";
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
    window.clearTimeout(state.reconnectTimeoutId);
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

function applyRealtimeMessage(app: RealtimeApp, room: string, eventType: string, data: unknown): void {
  const desiredRoom = getDesiredRealtimeRoom(app);
  if (!desiredRoom || room !== desiredRoom) return;

  const payload = typeof data === "object" && data !== null && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  const lotId = Number(payload.lotId ?? app.currentLotId);
  if (!Number.isFinite(lotId) || lotId <= 0) return;

  if (eventType === "sale.upserted") {
    const sale = normalizeSale(payload.sale);
    if (sale) {
      upsertRealtimeSale(app, Math.floor(lotId), sale);
    }
    return;
  }

  if (eventType === "sale.deleted") {
    const saleId = Number(payload.saleId);
    if (Number.isFinite(saleId) && saleId > 0) {
      deleteRealtimeSale(app, Math.floor(lotId), Math.floor(saleId));
    }
    return;
  }

  if (eventType === "livePricing.updated") {
    const livePricing = normalizeLivePricing(payload.livePricing);
    if (livePricing && app.currentLotId === Math.floor(lotId)) {
      reconcileIncomingLivePricingSnapshot(app, livePricing);
    }
  }
}

function scheduleRealtimeReconnect(app: RealtimeApp): void {
  const state = getRealtimeSocketState(app as object);
  if (state.reconnectTimeoutId != null) return;

  state.reconnectTimeoutId = window.setTimeout(() => {
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

export function refreshWorkspaceRealtime(app: RealtimeApp): void {
  const desiredRoom = getDesiredRealtimeRoom(app);
  if (!desiredRoom) {
    closeRealtimeSocket(app);
    return;
  }

  const nextUrl = resolveRealtimeSocketUrl();
  const state = getRealtimeSocketState(app as object);
  clearReconnectTimeout(state);

  if (
    state.socket &&
    state.socket.readyState === WebSocket.OPEN &&
    state.room === desiredRoom &&
    state.url === nextUrl
  ) {
    return;
  }

  closeRealtimeSocket(app);
  state.isIntentionalClose = false;
  state.room = desiredRoom;
  state.url = nextUrl;

  const socket = new WebSocket(nextUrl);
  state.socket = socket;

  socket.addEventListener("open", () => {
    if (state.socket !== socket || !state.room) return;
    socket.send(JSON.stringify({
      type: "subscribe",
      rooms: [state.room]
    }));
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

    if (!state.isIntentionalClose && getDesiredRealtimeRoom(app) === desiredRoom) {
      scheduleRealtimeReconnect(app);
    }
  });

  socket.addEventListener("error", () => {
    if (!state.isIntentionalClose && getDesiredRealtimeRoom(app) === desiredRoom) {
      scheduleRealtimeReconnect(app);
    }
  });
}

export function stopWorkspaceRealtime(app: RealtimeApp): void {
  closeRealtimeSocket(app);
}
