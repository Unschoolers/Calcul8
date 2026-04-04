import type { Sale, WorkspaceRealtimeStatus } from "../../../types/app.ts";
import type { AppContext } from "../../context-app.ts";
import { removeById, upsertById } from "../../shared/collection-updaters.ts";
import { normalizeWheelConfigs } from "../../shared/normalize-wheel-config.ts";
import { assignWheelPendingInventoryIssues } from "../../shared/wheel-session-compat.ts";
import {
    cacheAuthoritativeSales,
    canUseAuthoritativeSalesLiveApi,
    fetchWorkspacePresenceRealtimeSubscribeToken,
    fetchWorkspaceRealtimeSubscribeToken,
    normalizeLivePricing,
    normalizeSale
} from "../sales-live-api.ts";
import { reconcileIncomingLivePricingSnapshot } from "./lot-entity-polling.ts";
import { createSyncPayload, getSyncPayloadSignature } from "./sync-payload.ts";

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
  | "workspaceRealtimeStatus"
  | "workspacePresenceByUserId"
  | "wheelConfigs"
  | "activeWheelConfigId"
  | "wheelTotalSpins"
  | "wheelSpinCounts"
  | "wheelLastResult"
  | "wheelSessionUpdatedAt"
  | "wheelPendingInventoryIssues"
  | "wheelSkippedDeductions"
> & {
  wheelSessionNetRevenue?: number | null;
  wheelSessionCostAdjustment?: number;
  wheelFairnessHistory?: Array<{
    spinNumber: number;
    label: string;
    color: string;
    hash: string;
    seed: string;
    timestamp: number;
  }>;
  wheelChaseTallyHistory?: Array<{ tierId: string; label: string; color: string; count: number }>;
  wheelCurrentAngle?: number;
  wheelLastResultColor?: string;
};

type RealtimeSocketState = {
  socket: WebSocket | null;
  rooms: string[];
  reconnectTimeoutId: number | null;
  url: string | null;
  isIntentionalClose: boolean;
  subscribeAttemptId: number;
  reconnectAttempt: number;
};

type RealtimeEnvelope =
  | { type: "connected"; clientId?: string }
  | { type: "subscribed"; rooms?: string[] }
  | { type: "error"; message?: string }
  | { type: "event"; room?: string; eventType?: string; data?: unknown };

type WorkspaceRealtimeDesiredSubscription = {
  lotRoom: string;
  presenceRoom: string;
  wheelRoom: string;
  rooms: string[];
};

type RealtimeEventPayload = {
  lotId: number;
  raw: Record<string, unknown>;
};

const REALTIME_RECONNECT_BACKOFF_MS = [1_000, 5_000, 30_000, 120_000, 900_000] as const;
const REALTIME_RECONNECT_JITTER_RATIO = 0.2;
const FALLBACK_REALTIME_SOCKET_URL = "wss://whatfees-realtime.redsand-4d20b4cc.canadaeast.azurecontainerapps.io/socket";
const PROD_REALTIME_SOCKET_URL = "wss://ws.whatfees.ca/socket";
const WORKSPACE_REALTIME_TABS = new Set(["config", "live", "sales", "portfolio", "wheel"]);
const realtimeSocketStateByApp = new WeakMap<object, RealtimeSocketState>();

function getRealtimeSocketState(app: object): RealtimeSocketState {
  let state = realtimeSocketStateByApp.get(app);
  if (!state) {
    state = {
      socket: null,
      rooms: [],
      reconnectTimeoutId: null,
      url: null,
      isIntentionalClose: false,
      subscribeAttemptId: 0,
      reconnectAttempt: 0
    };
    realtimeSocketStateByApp.set(app, state);
  }
  return state;
}

function setWorkspaceRealtimeStatus(app: RealtimeApp, status: WorkspaceRealtimeStatus): void {
  app.workspaceRealtimeStatus = status;
}

function shouldUseWorkspaceRealtime(app: RealtimeApp): boolean {
  if (app.isOffline || app.activeScopeType !== "workspace" || !app.activeWorkspaceId) {
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

function buildWorkspacePresenceRoom(workspaceId: string): string {
  return `workspace:${workspaceId}:presence`;
}

function buildWorkspaceWheelRoom(workspaceId: string): string {
  return `workspace:${workspaceId}:wheel`;
}

function getDesiredRealtimeSubscription(app: RealtimeApp): WorkspaceRealtimeDesiredSubscription | null {
  if (!shouldUseWorkspaceRealtime(app)) return null;
  const presenceRoom = buildWorkspacePresenceRoom(app.activeWorkspaceId as string);
  if (!app.currentLotId) {
    return {
      lotRoom: "",
      presenceRoom,
      wheelRoom: "",
      rooms: [presenceRoom]
    };
  }
  const lotRoom = buildWorkspaceLotRoom(app.activeWorkspaceId as string, app.currentLotId as number);
  const wheelRoom = buildWorkspaceWheelRoom(app.activeWorkspaceId as string);
  return {
    lotRoom,
    presenceRoom,
    wheelRoom,
    rooms: [lotRoom, presenceRoom, wheelRoom]
  };
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

function resetRealtimeReconnectAttempts(state: RealtimeSocketState): void {
  state.reconnectAttempt = 0;
}

function getRealtimeReconnectDelayMs(state: RealtimeSocketState): number {
  const attemptIndex = Math.min(state.reconnectAttempt, REALTIME_RECONNECT_BACKOFF_MS.length - 1);
  const baseDelayMs = REALTIME_RECONNECT_BACKOFF_MS[attemptIndex];
  const jitterFactor = 1 + ((Math.random() * 2) - 1) * REALTIME_RECONNECT_JITTER_RATIO;
  return Math.max(250, Math.round(baseDelayMs * jitterFactor));
}

function upsertRealtimeSale(app: RealtimeApp, lotId: number, nextSale: Sale): void {
  if (app.currentLotId !== lotId) return;

  app.sales = upsertById(app.sales, nextSale);
  cacheAuthoritativeSales(app as never, lotId, app.sales);
}

function deleteRealtimeSale(app: RealtimeApp, lotId: number, saleId: number): void {
  if (app.currentLotId !== lotId) return;

  const nextSales = removeById(app.sales, saleId);
  if (nextSales.length === app.sales.length) return;

  app.sales = nextSales;
  cacheAuthoritativeSales(app as never, lotId, nextSales);
}

function applyWorkspacePresenceSnapshot(
  app: RealtimeApp,
  data: unknown
): void {
  const raw = typeof data === "object" && data !== null && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  const workspaceId = String(raw.workspaceId ?? "").trim();
  if (!workspaceId || workspaceId !== String(app.activeWorkspaceId ?? "").trim()) {
    return;
  }

  const members = Array.isArray(raw.members) ? raw.members : [];
  const nextPresenceByUserId: Record<string, { userId: string; isOnline: boolean; lastSeenAt?: string }> = {};
  for (const member of members) {
    if (typeof member !== "object" || member === null || Array.isArray(member)) continue;
    const candidate = member as Record<string, unknown>;
    const userId = String(candidate.userId ?? "").trim();
    if (!userId) continue;
    nextPresenceByUserId[userId] = {
      userId,
      isOnline: candidate.isOnline === true,
      lastSeenAt: String(candidate.lastSeenAt ?? "").trim() || undefined
    };
  }

  app.workspacePresenceByUserId = nextPresenceByUserId;
}

function isWorkspaceSnapshotSyncClean(app: RealtimeApp): boolean {
  const expectedSignature = String(app.lastSyncedPayloadHash ?? "").trim();
  if (!expectedSignature) return false;

  const currentSignature = getSyncPayloadSignature(createSyncPayload({
    lots: app.lots,
    currentLotId: app.currentLotId,
    sales: app.sales,
    loadSalesForLotId: app.loadSalesForLotId,
    wheelConfigs: app.wheelConfigs,
    activeWheelConfigId: app.activeWheelConfigId,
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

function handleWheelSessionUpdatedEvent(app: RealtimeApp, data: unknown): void {
  if (app.activeScopeType !== "workspace") return;

  const raw = typeof data === "object" && data !== null && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};

  const incomingUpdatedAt = Math.max(0, Math.floor(Number(raw.wheelSessionUpdatedAt) || 0));
  if (incomingUpdatedAt > 0 && incomingUpdatedAt < app.wheelSessionUpdatedAt) return;

  if (Array.isArray(raw.wheelConfigs)) {
    app.wheelConfigs = normalizeWheelConfigs(raw.wheelConfigs, app.lots) as typeof app.wheelConfigs;
  }

  const incomingTotalSpins = Math.max(0, Math.floor(Number(raw.wheelTotalSpins) || 0));
  const incomingConfigId = raw.activeWheelConfigId == null
    ? null
    : (Number(raw.activeWheelConfigId) || null);
  if (incomingConfigId == null) {
    app.activeWheelConfigId = null;
  } else if (app.wheelConfigs.some((config) => config.id === incomingConfigId)) {
    app.activeWheelConfigId = incomingConfigId;
  } else if (incomingConfigId !== app.activeWheelConfigId) {
    return;
  }

  app.wheelSessionUpdatedAt = incomingUpdatedAt > 0 ? incomingUpdatedAt : Date.now();
  app.wheelTotalSpins = incomingTotalSpins;
  if (Number.isFinite(Number(raw.wheelSessionNetRevenue))) {
    app.wheelSessionNetRevenue = Number(raw.wheelSessionNetRevenue) || 0;
  }
  if (Number.isFinite(Number(raw.wheelSessionCostAdjustment))) {
    app.wheelSessionCostAdjustment = Number(raw.wheelSessionCostAdjustment) || 0;
  }
  if (Array.isArray(raw.wheelFairnessHistory)) {
    app.wheelFairnessHistory = raw.wheelFairnessHistory
      .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
      .map((entry) => ({
        spinNumber: Math.max(0, Math.floor(Number((entry as Record<string, unknown>).spinNumber) || 0)),
        label: String((entry as Record<string, unknown>).label ?? ""),
        color: String((entry as Record<string, unknown>).color ?? ""),
        hash: String((entry as Record<string, unknown>).hash ?? ""),
        seed: String((entry as Record<string, unknown>).seed ?? ""),
        timestamp: Math.max(0, Math.floor(Number((entry as Record<string, unknown>).timestamp) || 0))
      }));
  }
  if (Array.isArray(raw.wheelChaseTallyHistory)) {
    app.wheelChaseTallyHistory = raw.wheelChaseTallyHistory
      .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
      .map((entry) => ({
        tierId: String((entry as Record<string, unknown>).tierId ?? ""),
        label: String((entry as Record<string, unknown>).label ?? ""),
        color: String((entry as Record<string, unknown>).color ?? ""),
        count: Math.max(0, Math.floor(Number((entry as Record<string, unknown>).count) || 0))
      }))
      .filter((entry) => entry.tierId.length > 0);
  }
  if (Array.isArray(raw.wheelSpinCounts)) {
    app.wheelSpinCounts = raw.wheelSpinCounts.map((n) => Math.max(0, Math.floor(Number(n) || 0)));
  }
  if (typeof raw.wheelLastResult === "string") {
    app.wheelLastResult = raw.wheelLastResult;
  }
  if (Number.isFinite(Number(raw.wheelCurrentAngle))) {
    app.wheelCurrentAngle = Number(raw.wheelCurrentAngle) || 0;
  }
  if (typeof raw.wheelLastResultColor === "string" && raw.wheelLastResultColor.trim()) {
    app.wheelLastResultColor = raw.wheelLastResultColor;
  }
  assignWheelPendingInventoryIssues(
    app as unknown as Record<string, unknown>,
    Array.isArray(raw.wheelPendingInventoryIssues)
      ? raw.wheelPendingInventoryIssues
      : raw.wheelSkippedDeductions
  );
}

function applyRealtimeMessage(app: RealtimeApp, room: string, eventType: string, data: unknown): void {
  const desiredSubscription = getDesiredRealtimeSubscription(app);
  if (!desiredSubscription || !desiredSubscription.rooms.includes(room)) return;

  if (eventType === "workspace.presence") {
    applyWorkspacePresenceSnapshot(app, data);
    return;
  }

  if (eventType === "wheel.session.updated") {
    handleWheelSessionUpdatedEvent(app, data);
    return;
  }

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

  const delayMs = getRealtimeReconnectDelayMs(state);
  state.reconnectAttempt += 1;
  setWorkspaceRealtimeStatus(app, "reconnecting");
  state.reconnectTimeoutId = globalThis.setTimeout(() => {
    state.reconnectTimeoutId = null;
    refreshWorkspaceRealtime(app);
  }, delayMs);
}

function closeRealtimeSocket(app: RealtimeApp): void {
  const state = getRealtimeSocketState(app as object);
  clearReconnectTimeout(state);
  state.isIntentionalClose = true;
  const activeSocket = state.socket;
  state.socket = null;
  state.rooms = [];
  state.url = null;

  if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
    activeSocket.close(1000, "realtime-refresh");
  } else if (activeSocket && activeSocket.readyState === WebSocket.CONNECTING) {
    activeSocket.close();
  }
}

function shouldKeepRealtimeSocket(
  state: RealtimeSocketState,
  desiredRooms: string[],
  nextUrl: string
): boolean {
  return Boolean(
    state.socket
    && state.socket.readyState === WebSocket.OPEN
    && state.rooms.length === desiredRooms.length
    && state.rooms.every((room, index) => room === desiredRooms[index])
    && state.url === nextUrl
  );
}

function shouldReconnectSocket(
  app: RealtimeApp,
  state: RealtimeSocketState,
  desiredRooms: string[]
): boolean {
  const desiredSubscription = getDesiredRealtimeSubscription(app);
  return !state.isIntentionalClose
    && !!desiredSubscription
    && desiredSubscription.rooms.length === desiredRooms.length
    && desiredSubscription.rooms.every((room, index) => room === desiredRooms[index]);
}

function tryScheduleRealtimeReconnect(
  app: RealtimeApp,
  state: RealtimeSocketState,
  desiredRooms: string[]
): void {
  if (shouldReconnectSocket(app, state, desiredRooms)) {
    scheduleRealtimeReconnect(app);
  }
}

async function subscribeRealtimeSocket(
  app: RealtimeApp,
  state: RealtimeSocketState,
  socket: WebSocket,
  subscribeAttemptId: number
): Promise<void> {
  if (state.socket !== socket || state.rooms.length === 0) return;

  try {
    const subscribeToken = app.currentLotId
      ? await fetchWorkspaceRealtimeSubscribeToken(app as never, app.currentLotId)
      : await fetchWorkspacePresenceRealtimeSubscribeToken(app as never);
    if (
      state.socket !== socket
      || state.subscribeAttemptId !== subscribeAttemptId
      || socket.readyState !== WebSocket.OPEN
      || state.rooms.length === 0
    ) {
      return;
    }

    const nextRooms = Array.isArray(subscribeToken?.rooms) && subscribeToken?.rooms.length > 0
      ? subscribeToken.rooms
      : state.rooms;
    socket.send(JSON.stringify({
      type: "subscribe",
      rooms: nextRooms,
      ...(subscribeToken?.token ? { token: subscribeToken.token } : {})
    }));
  } catch {
    setWorkspaceRealtimeStatus(app, "disconnected");
    if (state.socket === socket && socket.readyState === WebSocket.OPEN) {
      socket.close(1011, "realtime-subscribe-failed");
    }
  }
}

function attachRealtimeSocketListeners(
  app: RealtimeApp,
  state: RealtimeSocketState,
  socket: WebSocket,
  desiredRooms: string[],
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

    if (payload.type === "subscribed") {
      resetRealtimeReconnectAttempts(state);
      setWorkspaceRealtimeStatus(app, "connected");
      return;
    }

    if (payload.type === "error") {
      setWorkspaceRealtimeStatus(app, "disconnected");
      if (state.socket === socket && socket.readyState === WebSocket.OPEN) {
        socket.close(1011, "realtime-server-error");
      }
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
    tryScheduleRealtimeReconnect(app, state, desiredRooms);
  });

  socket.addEventListener("error", () => {
    tryScheduleRealtimeReconnect(app, state, desiredRooms);
  });
}

export function refreshWorkspaceRealtime(app: RealtimeApp): void {
  const desiredSubscription = getDesiredRealtimeSubscription(app);
  if (!desiredSubscription) {
    closeRealtimeSocket(app);
    resetRealtimeReconnectAttempts(getRealtimeSocketState(app as object));
    app.workspacePresenceByUserId = {};
    setWorkspaceRealtimeStatus(app, "idle");
    return;
  }

  const nextUrl = resolveRealtimeSocketUrl();
  const state = getRealtimeSocketState(app as object);
  clearReconnectTimeout(state);

  if (shouldKeepRealtimeSocket(state, desiredSubscription.rooms, nextUrl)) {
    return;
  }

  closeRealtimeSocket(app);
  state.isIntentionalClose = false;
  state.rooms = [...desiredSubscription.rooms];
  state.url = nextUrl;
  state.subscribeAttemptId += 1;
  const subscribeAttemptId = state.subscribeAttemptId;
  setWorkspaceRealtimeStatus(app, state.reconnectAttempt > 0 ? "reconnecting" : "connecting");

  const socket = new WebSocket(nextUrl);
  state.socket = socket;
  attachRealtimeSocketListeners(app, state, socket, desiredSubscription.rooms, subscribeAttemptId);
}

export function stopWorkspaceRealtime(app: RealtimeApp): void {
  closeRealtimeSocket(app);
  resetRealtimeReconnectAttempts(getRealtimeSocketState(app as object));
  app.workspacePresenceByUserId = {};
  setWorkspaceRealtimeStatus(app, "idle");
}

