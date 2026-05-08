import {
  buildWorkspaceLotRealtimeRoom,
  buildWorkspacePresenceRealtimeRoom,
  buildWorkspaceWheelRealtimeRoom
} from "../../../../../shared/workspace-realtime-rooms.mjs";
import type { WorkspaceRealtimeStatus } from "../../../../types/app.ts";
import type { AppContext } from "../../../context-app.ts";
import type { RootWheelSessionStateContext } from "../../../shared/wheel-root-session-state.ts";
import { resolveWorkspaceScopeContext, type WorkspaceScopeContext } from "../../../workspace-scope.ts";
import { canUseAuthoritativeSalesLiveApi } from "../../entity-api-shared.ts";

export type RealtimeApp = Pick<
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
> & RootWheelSessionStateContext;

export type RealtimeSocketState = {
  socket: WebSocket | null;
  rooms: string[];
  reconnectTimeoutId: number | null;
  url: string | null;
  isIntentionalClose: boolean;
  subscribeAttemptId: number;
  reconnectAttempt: number;
};

export type RealtimeEnvelope =
  | { type: "connected"; clientId?: string }
  | { type: "subscribed"; rooms?: string[] }
  | { type: "error"; message?: string }
  | { type: "event"; room?: string; eventType?: string; data?: unknown };

export type WorkspaceRealtimeDesiredSubscription = {
  lotRoom: string;
  presenceRoom: string;
  wheelRoom: string;
  rooms: string[];
};

export type WorkspaceRealtimeSession = {
  scope: WorkspaceScopeContext;
  desiredSubscription: WorkspaceRealtimeDesiredSubscription | null;
  socketUrl: string | null;
};

export type RealtimeEventPayload = {
  lotId: number;
  raw: Record<string, unknown>;
};

const REALTIME_RECONNECT_BACKOFF_MS = [1_000, 5_000, 30_000, 120_000, 900_000] as const;
const REALTIME_RECONNECT_JITTER_RATIO = 0.2;
const FALLBACK_REALTIME_SOCKET_URL = "wss://whatfees-realtime.redsand-4d20b4cc.canadaeast.azurecontainerapps.io/socket";
const PROD_REALTIME_SOCKET_URL = "wss://ws.whatfees.ca/socket";
const WORKSPACE_REALTIME_TABS = new Set(["config", "live", "sales", "portfolio", "wheel"]);
const realtimeSocketStateByApp = new WeakMap<object, RealtimeSocketState>();

export function getRealtimeSocketState(app: object): RealtimeSocketState {
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

export function setWorkspaceRealtimeStatus(app: RealtimeApp, status: WorkspaceRealtimeStatus): void {
  app.workspaceRealtimeStatus = status;
}

function shouldUseWorkspaceRealtime(app: RealtimeApp, scope: WorkspaceScopeContext): boolean {
  if (app.isOffline || !scope.isWorkspace || !scope.workspaceId) {
    return false;
  }

  if (!canUseAuthoritativeSalesLiveApi()) {
    return false;
  }

  return WORKSPACE_REALTIME_TABS.has(app.currentTab);
}

export function getDesiredRealtimeSubscription(
  app: RealtimeApp,
  scope: WorkspaceScopeContext = resolveWorkspaceScopeContext(app)
): WorkspaceRealtimeDesiredSubscription | null {
  if (!shouldUseWorkspaceRealtime(app, scope) || !scope.workspaceId) return null;
  const presenceRoom = buildWorkspacePresenceRealtimeRoom(scope.workspaceId);
  if (!app.currentLotId) {
    return {
      lotRoom: "",
      presenceRoom,
      wheelRoom: "",
      rooms: [presenceRoom]
    };
  }
  const lotRoom = buildWorkspaceLotRealtimeRoom(scope.workspaceId, app.currentLotId as number);
  const wheelRoom = buildWorkspaceWheelRealtimeRoom(scope.workspaceId);
  return {
    lotRoom,
    presenceRoom,
    wheelRoom,
    rooms: [lotRoom, presenceRoom, wheelRoom]
  };
}

export function resolveRealtimeSocketUrl(): string {
  const configured = String((import.meta.env.VITE_REALTIME_SOCKET_URL as string | undefined) || "").trim();
  if (configured) return configured;

  const host = window.location.hostname.trim().toLowerCase();
  if (host === "whatfees.ca" || host.endsWith(".whatfees.ca")) {
    return PROD_REALTIME_SOCKET_URL;
  }

  return FALLBACK_REALTIME_SOCKET_URL;
}

export function createWorkspaceRealtimeSession(app: RealtimeApp): WorkspaceRealtimeSession {
  const scope = resolveWorkspaceScopeContext(app);
  const desiredSubscription = getDesiredRealtimeSubscription(app, scope);
  return {
    scope,
    desiredSubscription,
    socketUrl: desiredSubscription ? resolveRealtimeSocketUrl() : null
  };
}

export function clearReconnectTimeout(state: RealtimeSocketState): void {
  if (state.reconnectTimeoutId != null) {
    globalThis.clearTimeout(state.reconnectTimeoutId);
    state.reconnectTimeoutId = null;
  }
}

export function resetRealtimeReconnectAttempts(state: RealtimeSocketState): void {
  state.reconnectAttempt = 0;
}

export function getRealtimeReconnectDelayMs(state: RealtimeSocketState): number {
  const attemptIndex = Math.min(state.reconnectAttempt, REALTIME_RECONNECT_BACKOFF_MS.length - 1);
  const baseDelayMs = REALTIME_RECONNECT_BACKOFF_MS[attemptIndex];
  const jitterFactor = 1 + ((Math.random() * 2) - 1) * REALTIME_RECONNECT_JITTER_RATIO;
  return Math.max(250, Math.round(baseDelayMs * jitterFactor));
}

export function closeRealtimeSocket(app: RealtimeApp): void {
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

export function shouldKeepRealtimeSocket(
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

export function shouldReconnectSocket(
  app: RealtimeApp,
  state: RealtimeSocketState,
  desiredRooms: string[]
): boolean {
  const desiredSubscription = createWorkspaceRealtimeSession(app).desiredSubscription;
  return !state.isIntentionalClose
    && !!desiredSubscription
    && desiredSubscription.rooms.length === desiredRooms.length
    && desiredSubscription.rooms.every((room, index) => room === desiredRooms[index]);
}
