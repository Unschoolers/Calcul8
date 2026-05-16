import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import type { GameSpectatorSnapshot } from "../src/types/app.ts";

const {
  ensureWheelCanvasSizeMock,
  fetchGameSpectatorRealtimeSubscribeTokenMock,
  fetchGameSpectatorSnapshotMock,
  getSpectatorBoardCellsMock,
  getSpectatorOutcomeSlotsMock,
  renderSpectatorStateMock,
  renderWheelSurfaceMock,
  resolveApiBaseUrlMock,
  resolveSpectatorRealtimeMessageMock,
  shouldApplySpectatorReadyStateMock
} = vi.hoisted(() => ({
  ensureWheelCanvasSizeMock: vi.fn(),
  fetchGameSpectatorRealtimeSubscribeTokenMock: vi.fn(),
  fetchGameSpectatorSnapshotMock: vi.fn(),
  getSpectatorBoardCellsMock: vi.fn(),
  getSpectatorOutcomeSlotsMock: vi.fn(),
  renderSpectatorStateMock: vi.fn(),
  renderWheelSurfaceMock: vi.fn(),
  resolveApiBaseUrlMock: vi.fn(),
  resolveSpectatorRealtimeMessageMock: vi.fn(),
  shouldApplySpectatorReadyStateMock: vi.fn()
}));

vi.mock("../src/app-core/methods/ui/common/shared.ts", () => ({
  resolveApiBaseUrl: resolveApiBaseUrlMock
}));

vi.mock("../src/app-core/methods/ui/spectator/game-spectator-client-state.ts", () => ({
  shouldApplySpectatorReadyState: shouldApplySpectatorReadyStateMock
}));

vi.mock("../src/app-core/methods/ui/spectator/game-spectator-contract.ts", () => ({
  normalizeGameSpectatorSnapshot: vi.fn((snapshot: unknown) => snapshot)
}));

vi.mock("../src/app-core/methods/ui/spectator/game-spectator.ts", () => ({
  fetchGameSpectatorRealtimeSubscribeToken: fetchGameSpectatorRealtimeSubscribeTokenMock,
  fetchGameSpectatorSnapshot: fetchGameSpectatorSnapshotMock,
  normalizeGamePublicSessionId: vi.fn((value: unknown) => String(value ?? "").trim().toLowerCase())
}));

vi.mock("../src/app-core/shared/game-spin.ts", () => ({
  easeOutQuart: vi.fn((value: number) => value)
}));

vi.mock("../src/app-core/methods/ui/workspace/workspace-realtime-state.ts", () => ({
  resolveRealtimeSocketUrl: vi.fn(() => "wss://realtime.example.test")
}));

vi.mock("../src/components/windows/game/stage/wheelCanvasRender.ts", () => ({
  ensureWheelCanvasSize: ensureWheelCanvasSizeMock,
  getWheelCanvasDpr: vi.fn(() => 2),
  renderWheelSurface: renderWheelSurfaceMock
}));

vi.mock("../src/spectator/render/spectatorRenderShared.ts", () => ({
  getSpectatorBoardCells: getSpectatorBoardCellsMock,
  getSpectatorOutcomeSlots: getSpectatorOutcomeSlotsMock
}));

vi.mock("../src/spectator/render/spectatorRender.ts", () => ({
  SPECTATOR_WHEEL_CANVAS_ID: "spectator-wheel-canvas",
  renderSpectatorState: renderSpectatorStateMock
}));

vi.mock("../src/spectator/realtime/spectatorRealtimeClient.ts", () => ({
  resolveSpectatorRealtimeMessage: resolveSpectatorRealtimeMessageMock
}));

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readonly listeners = new Map<string, Array<(event: { data?: unknown }) => void>>();
  readonly sent: string[] = [];
  readonly url: string;
  closeCalls: Array<{ code?: number; reason?: string }> = [];
  readyState = FakeWebSocket.OPEN;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(name: string, listener: (event: { data?: unknown }) => void): void {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(code?: number, reason?: string): void {
    this.closeCalls.push({ code, reason });
    this.readyState = 3;
  }

  emit(name: string, event: { data?: unknown } = {}): void {
    for (const listener of this.listeners.get(name) ?? []) {
      listener(event);
    }
  }
}

function makeSnapshot(overrides: Partial<GameSpectatorSnapshot> = {}): GameSpectatorSnapshot {
  return {
    snapshotVersion: 2,
    gameName: "Spectator Night",
    gameType: "wheel",
    sessionStatus: "live",
    isSpinning: false,
    sessionResultCount: 1,
    lastResultLabel: "Prize",
    lastResultColor: "#d4af37",
    gameCurrentAngle: 0,
    outcomeSlots: [
      { name: "Prize", color: "#d4af37", tier: "hit", isChase: false }
    ],
    boardCells: [],
    boardHighlightCellIndex: -1,
    boardResetAnimating: false,
    resultAnimation: null,
    recentFairnessHistory: [],
    chaseHistory: [],
    chaseBoard: [],
    featuredChaseLabel: null,
    featuredChaseHeat: null,
    fairnessVerificationUrl: null,
    bracket: null,
    updatedAt: 100,
    ...overrides
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function stubBrowser(search: string): { appElement: { innerHTML: string }; beforeUnload: Array<() => void> } {
  const appElement = { innerHTML: "" };
  const centerIcon = { style: { transform: "" } };
  const canvasContext = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    imageSmoothingEnabled: false
  };
  const canvas = {
    parentElement: {
      clientWidth: 280,
      querySelector: vi.fn(() => centerIcon)
    },
    getContext: vi.fn(() => canvasContext)
  };
  const beforeUnload: Array<() => void> = [];

  vi.stubGlobal("document", {
    title: "",
    getElementById: vi.fn((id: string) => {
      if (id === "spectator-app") return appElement;
      if (id === "spectator-wheel-canvas") return canvas;
      return null;
    })
  });
  vi.stubGlobal("window", {
    location: {
      search
    },
    setTimeout: vi.fn(() => 10),
    clearTimeout: vi.fn(),
    addEventListener: vi.fn((name: string, listener: () => void) => {
      if (name === "beforeunload") {
        beforeUnload.push(listener);
      }
    })
  });
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 20));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("WebSocket", FakeWebSocket);
  return { appElement, beforeUnload };
}

async function importSpectatorMain(): Promise<void> {
  vi.resetModules();
  await import("../src/spectator-main.ts");
  await flushMicrotasks();
}

beforeEach(() => {
  vi.clearAllMocks();
  FakeWebSocket.instances = [];
  resolveApiBaseUrlMock.mockReturnValue("https://api.example.test");
  fetchGameSpectatorSnapshotMock.mockResolvedValue({
    publicSessionId: "abc123",
    snapshot: makeSnapshot()
  });
  fetchGameSpectatorRealtimeSubscribeTokenMock.mockResolvedValue({
    rooms: ["game:abc123"],
    token: "subscribe-token"
  });
  shouldApplySpectatorReadyStateMock.mockReturnValue(true);
  getSpectatorBoardCellsMock.mockReturnValue([]);
  getSpectatorOutcomeSlotsMock.mockReturnValue([
    { name: "Prize", color: "#d4af37", tier: "hit", isChase: false }
  ]);
  renderSpectatorStateMock.mockImplementation((state: { status: string }) => `<main data-status="${state.status}"></main>`);
  resolveSpectatorRealtimeMessageMock.mockReturnValue({ action: "ignore" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("spectator-main renders not found when the URL has no public session", async () => {
  const { appElement } = stubBrowser("");

  await importSpectatorMain();

  assert.equal(fetchGameSpectatorSnapshotMock.mock.calls.length, 0);
  assert.equal(renderSpectatorStateMock.mock.calls.at(-1)?.[0]?.status, "not_found");
  assert.match(appElement.innerHTML, /data-status="not_found"/);
  assert.equal(FakeWebSocket.instances.length, 0);
});

test("spectator-main loads a ready snapshot, subscribes to realtime, and closes ended sessions", async () => {
  const { beforeUnload } = stubBrowser("?session= AbC123 ");
  const endedSnapshot = makeSnapshot({
    gameName: "Ended Game",
    sessionStatus: "ended",
    updatedAt: 200
  });

  await importSpectatorMain();
  await flushMicrotasks();

  assert.equal(fetchGameSpectatorSnapshotMock.mock.calls[0]?.[0], "https://api.example.test");
  assert.equal(fetchGameSpectatorSnapshotMock.mock.calls[0]?.[1], "abc123");
  assert.equal(document.title, "Spectator Night • Spectator");
  assert.equal(renderWheelSurfaceMock.mock.calls.length, 1);
  assert.equal(FakeWebSocket.instances.length, 1);
  assert.equal(beforeUnload.length, 1);

  const socket = FakeWebSocket.instances[0]!;
  socket.emit("open");
  assert.deepEqual(JSON.parse(socket.sent[0] ?? "{}"), {
    type: "subscribe",
    rooms: ["game:abc123"],
    token: "subscribe-token"
  });

  socket.emit("message", { data: "not-json" });
  assert.equal(resolveSpectatorRealtimeMessageMock.mock.calls.length, 0);

  resolveSpectatorRealtimeMessageMock.mockReturnValueOnce({
    action: "apply",
    snapshot: endedSnapshot
  });
  socket.emit("message", {
    data: JSON.stringify({
      type: "event",
      eventType: "game.public-session.updated",
      data: {
        publicSessionId: "abc123",
        snapshot: endedSnapshot
      }
    })
  });

  assert.equal(renderSpectatorStateMock.mock.calls.at(-1)?.[0]?.snapshot.gameName, "Ended Game");
  assert.deepEqual(socket.closeCalls.at(-1), {
    code: 1000,
    reason: "spectator-refresh"
  });
});

test("spectator-main refreshes the current view on realtime refresh messages and reconnects on socket errors", async () => {
  stubBrowser("?session=abc123");

  await importSpectatorMain();
  await flushMicrotasks();

  const socket = FakeWebSocket.instances[0]!;
  resolveSpectatorRealtimeMessageMock.mockReturnValueOnce({ action: "refresh" });
  fetchGameSpectatorSnapshotMock.mockResolvedValueOnce({
    publicSessionId: "abc123",
    snapshot: makeSnapshot({
      gameName: "Refreshed Game",
      updatedAt: 300
    })
  });

  socket.emit("message", {
    data: JSON.stringify({ type: "subscribed" })
  });
  await flushMicrotasks();

  assert.equal(fetchGameSpectatorSnapshotMock.mock.calls.length, 2);
  assert.equal(renderSpectatorStateMock.mock.calls.at(-1)?.[0]?.snapshot.gameName, "Refreshed Game");

  socket.emit("error");
  assert.equal((window.setTimeout as ReturnType<typeof vi.fn>).mock.calls.length, 1);
});

test("spectator-main renders error states and handles missing realtime sessions", async () => {
  stubBrowser("?session=abc123");
  fetchGameSpectatorSnapshotMock.mockRejectedValueOnce(new Error("upstream failed"));

  await importSpectatorMain();

  assert.equal(renderSpectatorStateMock.mock.calls.at(-1)?.[0]?.status, "error");

  vi.unstubAllGlobals();
  stubBrowser("?session=abc123");
  fetchGameSpectatorSnapshotMock.mockResolvedValueOnce({
    publicSessionId: "abc123",
    snapshot: makeSnapshot()
  });
  fetchGameSpectatorRealtimeSubscribeTokenMock.mockRejectedValueOnce(new Error("not_found"));

  await importSpectatorMain();
  await flushMicrotasks();

  assert.equal(renderSpectatorStateMock.mock.calls.at(-1)?.[0]?.status, "not_found");
});
