import {
  fetchWorkspacePresenceRealtimeSubscribeToken,
  fetchWorkspaceRealtimeSubscribeToken
} from "../sales-live-api.ts";
import { applyRealtimeMessage } from "./workspace-realtime-events.ts";
import {
  clearReconnectTimeout,
  closeRealtimeSocket,
  createWorkspaceRealtimeSession,
  getRealtimeReconnectDelayMs,
  getRealtimeSocketState,
  resetRealtimeReconnectAttempts,
  setWorkspaceRealtimeStatus,
  shouldKeepRealtimeSocket,
  shouldReconnectSocket,
  type RealtimeApp,
  type RealtimeEnvelope,
  type RealtimeSocketState
} from "./workspace-realtime-state.ts";

function scheduleRealtimeReconnect(app: RealtimeApp): void {
  const state = getRealtimeSocketState(app as object);
  if (state.reconnectTimeoutId != null) return;

  const delayMs = getRealtimeReconnectDelayMs(state);
  state.reconnectAttempt += 1;
  setWorkspaceRealtimeStatus(app, "reconnecting");
  state.reconnectTimeoutId = Number(globalThis.setTimeout(() => {
    state.reconnectTimeoutId = null;
    refreshWorkspaceRealtime(app);
  }, delayMs));
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
  const realtimeSession = createWorkspaceRealtimeSession(app);
  if (!realtimeSession.desiredSubscription || !realtimeSession.socketUrl) {
    closeRealtimeSocket(app);
    resetRealtimeReconnectAttempts(getRealtimeSocketState(app as object));
    app.workspacePresenceByUserId = {};
    setWorkspaceRealtimeStatus(app, "idle");
    return;
  }

  const desiredSubscription = realtimeSession.desiredSubscription;
  const nextUrl = realtimeSession.socketUrl;
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
