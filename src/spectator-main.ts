import { resolveApiBaseUrl } from "./app-core/methods/ui/common/shared.ts";
import { shouldApplySpectatorReadyState } from "./app-core/methods/ui/spectator/game-spectator-client-state.ts";
import { normalizeGameSpectatorSnapshot } from "./app-core/methods/ui/spectator/game-spectator-contract.ts";
import {
  fetchGameSpectatorRealtimeSubscribeToken,
  fetchGameSpectatorSnapshot,
  normalizeGamePublicSessionId
} from "./app-core/methods/ui/spectator/game-spectator.ts";
import { easeOutQuart } from "./app-core/shared/game-spin.ts";
import { resolveRealtimeSocketUrl } from "./app-core/methods/ui/workspace/workspace-realtime-state.ts";
import {
  ensureWheelCanvasSize,
  getWheelCanvasDpr,
  renderWheelSurface
} from "./components/windows/game/stage/wheelCanvasRender.ts";
import {
  getSpectatorBoardCells,
  getSpectatorOutcomeSlots
} from "./spectator/render/spectatorRenderShared.ts";
import {
  renderSpectatorState,
  SPECTATOR_WHEEL_CANVAS_ID,
  type SpectatorPageState
} from "./spectator/render/spectatorRender.ts";
import { resolveSpectatorRealtimeMessage } from "./spectator/realtime/spectatorRealtimeClient.ts";
import "./styles/spectator.css";
import type { GameSpectatorSnapshot } from "./types/app.ts";

const REALTIME_RECONNECT_BACKOFF_MS = [1_000, 3_000, 10_000, 30_000] as const;

const appElement = document.getElementById("spectator-app");
let activeSocket: WebSocket | null = null;
let reconnectTimeoutId: number | null = null;
let reconnectAttempt = 0;
let currentPublicSessionId = "";
let lastReadyState: Extract<SpectatorPageState, { status: "ready" }> | null = null;
let spectatorWheelAnimationFrameId: number | null = null;
const intentionallyClosedSockets = new WeakSet<WebSocket>();

function getPublicSessionId(): string {
  const params = new URLSearchParams(window.location.search);
  return normalizeGamePublicSessionId(params.get("session") || "");
}

function setState(state: SpectatorPageState): void {
  if (state.status === "ready" && !shouldApplySpectatorReadyState(lastReadyState, state)) {
    return;
  }
  if (!appElement) return;
  stopSpectatorWheelAnimation();
  appElement.innerHTML = renderSpectatorState(state);
  if (state.status === "ready") {
    document.title = `${state.snapshot.gameName} • Spectator`;
    lastReadyState = state;
    startSpectatorWheelAnimation(state.snapshot);
  } else if (state.status !== "loading") {
    lastReadyState = null;
  }
}

function resolveHighlightedSpectatorSlotIndex(snapshot: GameSpectatorSnapshot): number {
  const outcomeSlots = getSpectatorOutcomeSlots(snapshot);
  if (!outcomeSlots.length) return -1;
  const targetLabel = String(snapshot.lastResultLabel || "").trim().toLowerCase();
  const targetColor = String(snapshot.lastResultColor || "").trim().toLowerCase();
  return outcomeSlots.findIndex((slot) => (
    String(slot.name || "").trim().toLowerCase() === targetLabel
    && String(slot.color || "").trim().toLowerCase() === targetColor
  ));
}

function stopSpectatorWheelAnimation(): void {
  if (spectatorWheelAnimationFrameId != null) {
    cancelAnimationFrame(spectatorWheelAnimationFrameId);
    spectatorWheelAnimationFrameId = null;
  }
}

function drawSpectatorWheel(
  snapshot: GameSpectatorSnapshot,
  options: { angle?: number; highlightedSlotIndex?: number; highlightTime?: number } = {}
): void {
  const canvas = document.getElementById(SPECTATOR_WHEEL_CANVAS_ID) as HTMLCanvasElement | null;
  const outcomeSlots = getSpectatorOutcomeSlots(snapshot);
  if (!canvas || !outcomeSlots.length) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const frame = canvas.parentElement as HTMLElement | null;
  const measuredSize = Math.max(220, Math.min(320, Math.floor(frame?.clientWidth || 0)));
  const angle = Number.isFinite(options.angle)
    ? options.angle!
    : (Number.isFinite(snapshot.gameCurrentAngle) ? snapshot.gameCurrentAngle : -Math.PI / 2);
  const centerIcon = canvas.parentElement?.querySelector(".wheel-center-cap__icon") as HTMLElement | null;
  if (centerIcon) {
    centerIcon.style.transform = `rotate(${angle}rad)`;
  }
  const dpr = getWheelCanvasDpr();
  ensureWheelCanvasSize(canvas, measuredSize, dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, measuredSize, measuredSize);
  ctx.imageSmoothingEnabled = true;
  renderWheelSurface(
    ctx,
    outcomeSlots.map((slot) => ({
      name: slot.name,
      color: slot.color,
      cost: 0,
      tier: slot.tier,
      packsCount: 1,
      deductionType: "none",
      isChase: slot.isChase
    })),
    measuredSize,
    angle,
    Number.isFinite(options.highlightedSlotIndex)
      ? options.highlightedSlotIndex!
      : resolveHighlightedSpectatorSlotIndex(snapshot),
    Number.isFinite(options.highlightTime) ? options.highlightTime! : (snapshot.sessionResultCount > 0 ? 0.8 : 0)
  );
}

function startSpectatorWheelAnimation(snapshot: GameSpectatorSnapshot): void {
  if (snapshot.gameType === "grid" || getSpectatorBoardCells(snapshot).length > 0) return;
  const animation = snapshot.resultAnimation;
  const slots = getSpectatorOutcomeSlots(snapshot);
  if (
    !animation
    || !snapshot.isSpinning
    || !slots.length
    || !Number.isFinite(animation.startAngle)
    || !Number.isFinite(animation.endAngle)
    || !Number.isFinite(animation.startedAt)
    || !Number.isFinite(animation.durationMs)
    || animation.durationMs <= 0
  ) {
    drawSpectatorWheel(snapshot);
    return;
  }

  const drawFrame = () => {
    const elapsedMs = Math.max(0, Date.now() - animation.startedAt);
    const progress = Math.min(elapsedMs / animation.durationMs, 1);
    const angle = animation.startAngle + (animation.endAngle - animation.startAngle) * easeOutQuart(progress);
    drawSpectatorWheel(snapshot, {
      angle,
      highlightedSlotIndex: progress >= 1 ? animation.targetIndex : -1,
      highlightTime: progress >= 1 ? 0.8 : 0
    });

    if (progress < 1) {
      spectatorWheelAnimationFrameId = requestAnimationFrame(drawFrame);
      return;
    }

    spectatorWheelAnimationFrameId = null;
  };

  drawFrame();
}

async function loadState(): Promise<SpectatorPageState> {
  const publicSessionId = getPublicSessionId();
  const baseUrl = resolveApiBaseUrl();
  if (!publicSessionId || !baseUrl) {
    return { status: "not_found" };
  }

  try {
    const result = await fetchGameSpectatorSnapshot(baseUrl, publicSessionId);
    const canonicalPublicSessionId = normalizeGamePublicSessionId(result.publicSessionId || publicSessionId);
    return {
      status: "ready",
      publicSessionId: canonicalPublicSessionId,
      snapshot: result.snapshot
    };
  } catch (error) {
    return error instanceof Error && error.message === "not_found"
      ? { status: "not_found" }
      : { status: "error" };
  }
}

function clearReconnectTimeout(): void {
  if (reconnectTimeoutId != null) {
    window.clearTimeout(reconnectTimeoutId);
    reconnectTimeoutId = null;
  }
}

function closeActiveSocket(): void {
  clearReconnectTimeout();
  const socket = activeSocket;
  activeSocket = null;
  if (!socket) return;
  if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
    intentionallyClosedSockets.add(socket);
    socket.close(1000, "spectator-refresh");
  }
}

async function refreshSnapshot(options: { preserveCurrentView?: boolean } = {}): Promise<SpectatorPageState> {
  if (!options.preserveCurrentView) {
    setState({ status: "loading" });
  }
  const state = await loadState();
  setState(state);
  return state;
}

function applyRealtimeSnapshot(publicSessionId: string, snapshot: GameSpectatorSnapshot): void {
  currentPublicSessionId = normalizeGamePublicSessionId(publicSessionId);
  setState({
    status: "ready",
    publicSessionId: currentPublicSessionId,
    snapshot
  });
  if (snapshot.sessionStatus === "ended") {
    closeActiveSocket();
  }
}

function shouldReconnectRealtime(): boolean {
  return Boolean(lastReadyState && lastReadyState.snapshot.sessionStatus !== "ended" && currentPublicSessionId);
}

function scheduleRealtimeReconnect(): void {
  if (reconnectTimeoutId != null || !shouldReconnectRealtime()) return;
  const attemptIndex = Math.min(reconnectAttempt, REALTIME_RECONNECT_BACKOFF_MS.length - 1);
  const delayMs = REALTIME_RECONNECT_BACKOFF_MS[attemptIndex];
  reconnectAttempt += 1;
  reconnectTimeoutId = Number(window.setTimeout(() => {
    reconnectTimeoutId = null;
    void connectRealtime();
  }, delayMs));
}

async function connectRealtime(): Promise<void> {
  const baseUrl = resolveApiBaseUrl();
  if (!baseUrl || !currentPublicSessionId || !shouldReconnectRealtime()) return;

  try {
    const subscribeToken = await fetchGameSpectatorRealtimeSubscribeToken(baseUrl, currentPublicSessionId);
    if (!subscribeToken.rooms.length) return;

    closeActiveSocket();
    const socket = new WebSocket(resolveRealtimeSocketUrl());
    activeSocket = socket;

    socket.addEventListener("open", () => {
      if (activeSocket !== socket) return;
      socket.send(JSON.stringify({
        type: "subscribe",
        rooms: subscribeToken.rooms,
        ...(subscribeToken.token ? { token: subscribeToken.token } : {})
      }));
    });

    socket.addEventListener("message", (event) => {
      let payload: unknown;
      try {
        payload = JSON.parse(String(event.data || ""));
      } catch {
        return;
      }

      const realtimeMessage = resolveSpectatorRealtimeMessage({
        rawPayload: payload,
        currentPublicSessionId,
        normalizeSnapshot: normalizeGameSpectatorSnapshot
      });
      if (
        typeof payload === "object"
        && payload !== null
        && !Array.isArray(payload)
        && (payload as { type?: unknown }).type === "subscribed"
      ) {
        reconnectAttempt = 0;
      }
      if (realtimeMessage.action === "refresh") {
        void refreshSnapshot({ preserveCurrentView: true });
        return;
      }
      if (realtimeMessage.action !== "apply") {
        return;
      }
      applyRealtimeSnapshot(currentPublicSessionId, realtimeMessage.snapshot);
    });

    socket.addEventListener("close", () => {
      if (intentionallyClosedSockets.has(socket)) {
        intentionallyClosedSockets.delete(socket);
        return;
      }
      if (activeSocket === socket) {
        activeSocket = null;
      }
      scheduleRealtimeReconnect();
    });

    socket.addEventListener("error", () => {
      scheduleRealtimeReconnect();
    });
  } catch (error) {
    if (error instanceof Error && error.message === "not_found") {
      setState({ status: "not_found" });
      closeActiveSocket();
      return;
    }
    scheduleRealtimeReconnect();
  }
}

async function boot(): Promise<void> {
  currentPublicSessionId = getPublicSessionId();
  const state = await refreshSnapshot();
  if (state.status === "ready") {
    currentPublicSessionId = normalizeGamePublicSessionId(state.publicSessionId || currentPublicSessionId);
  }
  if (state.status === "ready" && state.snapshot.sessionStatus !== "ended") {
    void connectRealtime();
  }
}

window.addEventListener("beforeunload", () => {
  stopSpectatorWheelAnimation();
  closeActiveSocket();
});

void boot();

