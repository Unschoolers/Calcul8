import { resolveApiBaseUrl } from "./app-core/methods/ui/shared.ts";
import { shouldApplySpectatorReadyState } from "./app-core/methods/ui/wheel-spectator-client-state.ts";
import { normalizeWheelSpectatorSnapshot } from "./app-core/methods/ui/wheel-spectator-contract.ts";
import {
  fetchWheelSpectatorRealtimeSubscribeToken,
  fetchWheelSpectatorSnapshot
} from "./app-core/methods/ui/wheel-spectator.ts";
import { easeOutQuart } from "./app-core/shared/game-spin.ts";
import { resolveRealtimeSocketUrl } from "./app-core/methods/ui/workspace-realtime-state.ts";
import {
  ensureWheelCanvasSize,
  getWheelCanvasDpr,
  renderWheelSurface
} from "./components/windows/wheel/wheelCanvasRender.ts";
import { normalizeWheelPublicSessionId } from "./components/windows/wheel/wheelSpectator.ts";
import "./styles/spectator.css";
import type { WheelSpectatorHeatLevel, WheelSpectatorSnapshot } from "./types/app.ts";

type SpectatorPageState =
  | { status: "loading" }
  | { status: "ready"; publicSessionId: string; snapshot: WheelSpectatorSnapshot }
  | { status: "not_found" }
  | { status: "error" };

type RealtimeEnvelope =
  | { type?: "connected" | "subscribed" | "error" }
  | { type?: "event"; eventType?: string; data?: unknown };

const REALTIME_RECONNECT_BACKOFF_MS = [1_000, 3_000, 10_000, 30_000] as const;

const appElement = document.getElementById("spectator-app");
let activeSocket: WebSocket | null = null;
let reconnectTimeoutId: number | null = null;
let reconnectAttempt = 0;
let currentPublicSessionId = "";
let lastReadyState: Extract<SpectatorPageState, { status: "ready" }> | null = null;
let spectatorWheelAnimationFrameId: number | null = null;
const intentionallyClosedSockets = new WeakSet<WebSocket>();
const SPECTATOR_WHEEL_CANVAS_ID = "spectator-wheel-canvas";

function getPublicSessionId(): string {
  const params = new URLSearchParams(window.location.search);
  return normalizeWheelPublicSessionId(params.get("session") || "");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatRelativeTime(timestamp: number): string {
  const elapsedMs = Math.max(0, Date.now() - timestamp);
  if (elapsedMs < 60_000) return "just now";
  const minutes = Math.round(elapsedMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function formatHeatCopy(heat: WheelSpectatorHeatLevel | null, label: string | null): string {
  if (!heat || !label) return "The game is warming up.";
  if (heat === "very_high") return `${label} is overdue.`;
  if (heat === "high") return `${label} is heating up.`;
  if (heat === "medium") return `${label} is in range.`;
  if (heat === "low") return `${label} is warming slowly.`;
  return `${label} is still hanging around.`;
}

function formatHeatLabel(heat: WheelSpectatorHeatLevel | null): string {
  if (heat === "very_high") return "very high";
  if (heat === "high") return "high";
  if (heat === "medium") return "medium";
  if (heat === "low") return "low";
  if (heat === "very_low") return "very low";
  return "—";
}

function formatStatusLabel(snapshot: WheelSpectatorSnapshot, isGridGame: boolean): string {
  if (snapshot.sessionStatus === "ended") return "Recap";
  if (!snapshot.isSpinning) return "Waiting";
  return isGridGame ? "Revealing" : "Spinning";
}

function formatStatusTone(snapshot: WheelSpectatorSnapshot): "ended" | "spinning" | "waiting" {
  if (snapshot.sessionStatus === "ended") return "ended";
  return snapshot.isSpinning ? "spinning" : "waiting";
}

function getSpectatorWheelSlots(snapshot: WheelSpectatorSnapshot): WheelSpectatorSnapshot["wheelSlots"] {
  return Array.isArray(snapshot.wheelSlots) ? snapshot.wheelSlots : [];
}

function getSpectatorGridCells(snapshot: WheelSpectatorSnapshot): NonNullable<WheelSpectatorSnapshot["gridCells"]> {
  return Array.isArray(snapshot.gridCells) ? snapshot.gridCells : [];
}

function renderEmpty(title: string, body: string): string {
  return `
    <div class="spectator-shell">
      <section class="spectator-card spectator-empty">
        <div class="spectator-kicker">Game Spectator</div>
        <h1 class="spectator-empty__title">${escapeHtml(title)}</h1>
        <p class="spectator-empty__body">${escapeHtml(body)}</p>
      </section>
    </div>
  `;
}

function renderState(state: SpectatorPageState): string {
  if (state.status === "loading") {
    return renderEmpty("Loading the game", "Pulling the latest spectator snapshot...");
  }
  if (state.status === "not_found") {
    return renderEmpty("Session not found", "This spectator link is missing or has already been cleared.");
  }
  if (state.status === "error") {
    return renderEmpty("Could not load the game", "Refresh in a moment to try again.");
  }

  const { snapshot } = state;
  const wheelSlots = getSpectatorWheelSlots(snapshot);
  const gridCells = getSpectatorGridCells(snapshot);
  const isGridGame = snapshot.gameType === "grid" || gridCells.length > 0;
  const gridColumns = Math.ceil(Math.sqrt(Math.max(1, gridCells.length)));
  const revealedGridCount = gridCells.filter((cell) => cell.revealed).length;
  const gridProgressLabel = gridCells.length > 0 ? `${revealedGridCount}/${gridCells.length}` : "0/0";
  const heroSubcopy = snapshot.totalSpins > 0
    ? (isGridGame
      ? `${gridProgressLabel} cells opened. ${formatHeatCopy(snapshot.featuredChaseHeat, snapshot.featuredChaseLabel)}`
      : `Watching live: ${formatHeatCopy(snapshot.featuredChaseHeat, snapshot.featuredChaseLabel)}`)
    : `The ${isGridGame ? "grid" : "wheel"} is live. Stay here for the next verified result.`;
  const latestResultLabel = String(snapshot.lastResultLabel || "").trim() || "Waiting for the next result";
  const latestResultColor = String(snapshot.lastResultColor || "#d4af37");
  const latestResultSubcopy = snapshot.totalSpins > 0
    ? (isGridGame ? latestResultLabel : formatHeatCopy(snapshot.featuredChaseHeat, snapshot.featuredChaseLabel))
    : `The next verified ${isGridGame ? "reveal" : "result"} will land here as soon as the ${isGridGame ? "cell opens" : "wheel spins"}.`;
  const reelHtml = snapshot.recentFairnessHistory.length
    ? snapshot.recentFairnessHistory.map((entry) => `
        <article class="spectator-reel__item">
          <div class="spectator-reel__top">
            <div class="spectator-reel__spin">Result #${entry.spinNumber}</div>
            <div>${escapeHtml(formatRelativeTime(entry.timestamp))}</div>
          </div>
          <div class="spectator-reel__label">
            <span class="spectator-result__dot" style="background:${escapeHtml(entry.color)}"></span>
            ${escapeHtml(entry.label)}
          </div>
          ${entry.verificationUrl
            ? `<a class="spectator-reel__verify" href="${escapeHtml(entry.verificationUrl)}" target="_blank" rel="noopener noreferrer">Open proof</a>`
            : ""}
        </article>
      `).join("")
    : `<div class="spectator-empty"><p class="spectator-empty__body">Waiting for the first verified result.</p></div>`;

  const chaseHtml = snapshot.chaseBoard.length
    ? snapshot.chaseBoard.map((entry) => `
        <article class="spectator-chase spectator-chase--${escapeHtml(entry.status)}">
          <div class="spectator-chase__top">
            <div class="spectator-chase__title">
              <span class="spectator-result__dot" style="background:${escapeHtml(entry.color)}"></span>
              ${escapeHtml(entry.label)}
            </div>
            <div class="spectator-chase__status spectator-chase__status--${escapeHtml(entry.status)}">
              ${entry.status === "live" ? "Live" : "Claimed"}
            </div>
          </div>
          <div class="spectator-chase__meta">
            <span class="spectator-pill">Hits ${entry.hitCount}</span>
            <span class="spectator-pill">Chance ${Math.round(Number(entry.slots || 0))}%</span>
            ${entry.remainingHits != null ? `<span class="spectator-pill">${entry.remainingHits} hit${entry.remainingHits === 1 ? "" : "s"} left</span>` : ""}
            ${entry.isFeatured ? `<span class="spectator-pill spectator-pill--heat-${escapeHtml(String(snapshot.featuredChaseHeat || "low"))}">Featured prize</span>` : ""}
          </div>
        </article>
      `).join("")
    : `<div class="spectator-empty"><p class="spectator-empty__body">No prize board is active for this game.</p></div>`;

  return `
    <div class="spectator-shell">
      <section class="spectator-hero">
        <div class="spectator-kicker">${isGridGame ? "Live Grid Spectator" : "Live Wheel Spectator"}</div>
        <h1 class="spectator-title">${escapeHtml(snapshot.wheelName)}</h1>
        <p class="spectator-subtitle spectator-subtitle--hero">${escapeHtml(heroSubcopy)}</p>
      </section>

      <div class="spectator-grid">
        <section class="spectator-card spectator-now">
          <div class="spectator-now__glow spectator-now__glow--${escapeHtml(String(snapshot.featuredChaseHeat || "low"))}"></div>
          <div class="spectator-now__header">
            <div>
              <div class="spectator-card__eyebrow">Now</div>
              <div class="spectator-now__headline">Current moment</div>
            </div>
            <div class="spectator-status spectator-status--${escapeHtml(formatStatusTone(snapshot))}">
              ${escapeHtml(formatStatusLabel(snapshot, isGridGame))}
            </div>
          </div>

          <div class="spectator-now__summary">
            <div class="spectator-now__metric">
              <span class="spectator-now__metric-label">${isGridGame ? "Reveal" : "Spin"}</span>
              <strong class="spectator-now__metric-value">#${snapshot.totalSpins}</strong>
            </div>
            <div class="spectator-now__metric spectator-now__metric--heat-${escapeHtml(String(snapshot.featuredChaseHeat || "low"))}">
              <span class="spectator-now__metric-label">Heat</span>
              <strong class="spectator-now__metric-value">${escapeHtml(formatHeatLabel(snapshot.featuredChaseHeat))}</strong>
            </div>
            <div class="spectator-now__metric spectator-now__metric--accent">
              <span class="spectator-now__metric-label">Watching</span>
              <strong class="spectator-now__metric-value">${escapeHtml(snapshot.featuredChaseLabel || "Prize board")}</strong>
            </div>
          </div>

          <div class="spectator-now__stage">
            ${isGridGame && gridCells.length
              ? `
                <div class="spectator-grid-board ${snapshot.gridResetAnimating === true ? "spectator-grid-board--resetting" : ""}" style="--spectator-grid-columns:${gridColumns}">
                  ${gridCells.map((cell) => `
                    <div
                      class="spectator-grid-cell ${cell.revealed ? "spectator-grid-cell--revealed" : ""} ${snapshot.gridHighlightCellIndex === cell.index ? "spectator-grid-cell--latest" : ""} ${snapshot.gridHighlightCellIndex === cell.index && !cell.revealed ? "spectator-grid-cell--highlighted" : ""}"
                      style="${cell.revealed ? `--spectator-grid-cell-color:${escapeHtml(cell.color)}` : ""}"
                    >
                      ${cell.revealed
                        ? `<span class="spectator-grid-cell__dot"></span><span class="spectator-grid-cell__label">${escapeHtml(cell.label)}</span>`
                        : `<span class="spectator-grid-cell__number">${cell.index + 1}</span>`}
                    </div>
                  `).join("")}
                </div>
              `
              : ""}
            ${!isGridGame && wheelSlots.length
              ? `
                <div class="spectator-wheel-frame">
                  <div class="wheel-outer">
                    <div class="wheel-disc">
                      <canvas id="${SPECTATOR_WHEEL_CANVAS_ID}" class="wheel-canvas"></canvas>
                      <div class="wheel-center-cap" aria-hidden="true">
                        <div class="wheel-center-cap__icon" style="transform: rotate(${Number.isFinite(snapshot.wheelCurrentAngle) ? snapshot.wheelCurrentAngle : 0}rad)">
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
                            <path d="M12 2L13.09 8.26L20 12L13.09 15.74L12 22L10.91 15.74L4 12L10.91 8.26L12 2Z"></path>
                          </svg>
                        </div>
                      </div>
                    </div>
                    <div class="wheel-pointer" aria-hidden="true"></div>
                  </div>
                </div>
              `
              : ""}

            <div class="spectator-result" style="--spectator-result-color:${escapeHtml(latestResultColor)}">
              <div class="spectator-result__meta">
                <span class="spectator-result__eyebrow">Latest result</span>
                <strong>${snapshot.isSpinning ? "Live" : "Settled"}</strong>
              </div>
              <div class="spectator-result__subcopy">
                ${escapeHtml(latestResultSubcopy)}
              </div>
              ${snapshot.fairnessVerificationUrl
                ? `<a class="spectator-result__proof" href="${escapeHtml(snapshot.fairnessVerificationUrl)}" target="_blank" rel="noopener noreferrer">Verify this result</a>`
                : ""}
            </div>
          </div>
        </section>

        <section class="spectator-card">
          <div class="spectator-card__eyebrow">Recent</div>
          <div class="spectator-reel">${reelHtml}</div>
        </section>

        <section class="spectator-card">
          <div class="spectator-card__eyebrow">Prizes</div>
          <div class="spectator-chases">${chaseHtml}</div>
        </section>

      <section class="spectator-card spectator-trust">
        <div class="spectator-card__eyebrow">Trust</div>
          <p class="spectator-subtitle">The result is committed before it lands, then revealed after the ${isGridGame ? "cell opens" : "spin"} so anyone can verify it.</p>
          <ol class="spectator-trust__steps">
            <li>The proof is locked before the result finishes.</li>
            <li>The winning result is revealed after the ${isGridGame ? "cell opens" : "spin"}.</li>
            <li>Anyone can open the proof page and verify the outcome.</li>
          </ol>
          ${snapshot.fairnessVerificationUrl
            ? `<a class="spectator-reel__verify" href="${escapeHtml(snapshot.fairnessVerificationUrl)}" target="_blank" rel="noopener noreferrer">Open the latest proof</a>`
            : ""}
        </section>
      </div>
    </div>
  `;
}

function setState(state: SpectatorPageState): void {
  if (state.status === "ready" && !shouldApplySpectatorReadyState(lastReadyState, state)) {
    return;
  }
  if (!appElement) return;
  stopSpectatorWheelAnimation();
  appElement.innerHTML = renderState(state);
  if (state.status === "ready") {
    document.title = `${state.snapshot.wheelName} • Spectator`;
    lastReadyState = state;
    startSpectatorWheelAnimation(state.snapshot);
  } else if (state.status !== "loading") {
    lastReadyState = null;
  }
}

function resolveHighlightedSpectatorSlotIndex(snapshot: WheelSpectatorSnapshot): number {
  const wheelSlots = getSpectatorWheelSlots(snapshot);
  if (!wheelSlots.length) return -1;
  const targetLabel = String(snapshot.lastResultLabel || "").trim().toLowerCase();
  const targetColor = String(snapshot.lastResultColor || "").trim().toLowerCase();
  return wheelSlots.findIndex((slot) => (
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
  snapshot: WheelSpectatorSnapshot,
  options: { angle?: number; highlightedSlotIndex?: number; highlightTime?: number } = {}
): void {
  const canvas = document.getElementById(SPECTATOR_WHEEL_CANVAS_ID) as HTMLCanvasElement | null;
  const wheelSlots = getSpectatorWheelSlots(snapshot);
  if (!canvas || !wheelSlots.length) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const frame = canvas.parentElement as HTMLElement | null;
  const measuredSize = Math.max(220, Math.min(320, Math.floor(frame?.clientWidth || 0)));
  const angle = Number.isFinite(options.angle)
    ? options.angle!
    : (Number.isFinite(snapshot.wheelCurrentAngle) ? snapshot.wheelCurrentAngle : -Math.PI / 2);
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
    wheelSlots.map((slot) => ({
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
    Number.isFinite(options.highlightTime) ? options.highlightTime! : (snapshot.totalSpins > 0 ? 0.8 : 0)
  );
}

function startSpectatorWheelAnimation(snapshot: WheelSpectatorSnapshot): void {
  if (snapshot.gameType === "grid" || getSpectatorGridCells(snapshot).length > 0) return;
  const animation = snapshot.spinAnimation;
  const slots = getSpectatorWheelSlots(snapshot);
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
    const result = await fetchWheelSpectatorSnapshot(baseUrl, publicSessionId);
    const canonicalPublicSessionId = normalizeWheelPublicSessionId(result.publicSessionId || publicSessionId);
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

function applyRealtimeSnapshot(publicSessionId: string, snapshot: WheelSpectatorSnapshot): void {
  currentPublicSessionId = normalizeWheelPublicSessionId(publicSessionId);
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
    const subscribeToken = await fetchWheelSpectatorRealtimeSubscribeToken(baseUrl, currentPublicSessionId);
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
      let payload: RealtimeEnvelope;
      try {
        payload = JSON.parse(String(event.data || "")) as RealtimeEnvelope;
      } catch {
        return;
      }

      if (payload.type === "subscribed") {
        reconnectAttempt = 0;
        void refreshSnapshot({ preserveCurrentView: true });
        return;
      }

      if (payload.type !== "event" || payload.eventType !== "wheel.public-session.updated") {
        return;
      }

      const raw = typeof payload.data === "object" && payload.data !== null && !Array.isArray(payload.data)
        ? payload.data as { publicSessionId?: unknown; snapshot?: unknown }
        : {};
      if (normalizeWheelPublicSessionId(raw.publicSessionId) !== currentPublicSessionId) {
        return;
      }
      const snapshot = normalizeWheelSpectatorSnapshot(raw.snapshot);
      if (!snapshot) {
        void refreshSnapshot({ preserveCurrentView: true });
        return;
      }
      applyRealtimeSnapshot(currentPublicSessionId, snapshot);
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
    currentPublicSessionId = normalizeWheelPublicSessionId(state.publicSessionId || currentPublicSessionId);
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
