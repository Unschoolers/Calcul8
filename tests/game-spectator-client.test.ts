import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import {
  createGameSpectatorSession,
  fetchGameSpectatorRealtimeSubscribeToken,
  fetchGameSpectatorSnapshot,
  normalizeGamePublicSessionId,
  publishGameSpectatorSession
} from "../src/app-core/methods/ui/spectator/game-spectator.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("game spectator client uses wheel-compatible public session routes with generic helper names", async () => {
  const fetchMock = vi.fn();
  globalThis.fetch = fetchMock as typeof fetch;
  const responseHeaders = { get: () => "" };
  fetchMock
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: responseHeaders,
      json: async () => ({ publicSessionId: "abc123xy" })
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: responseHeaders
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        publicSessionId: "abc123xy",
        snapshot: {
          gameName: "Bracket",
          gameType: "bracket",
          sessionStatus: "live",
          updatedAt: 100
        }
      })
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        room: "wheel-public:abc123xy",
        rooms: ["wheel-public:abc123xy"],
        token: "signed",
        expiresAt: 123
      })
    });
  vi.stubGlobal("window", {
    setTimeout,
    clearTimeout
  });
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => undefined
  });

  const app = {
    activeScopeType: "workspace",
    activeWorkspaceId: "team-42",
    googleAuthEpoch: 1,
    hasProAccess: true
  };
  const snapshot = {
    snapshotVersion: 2,
    gameName: "Bracket",
    gameType: "bracket",
    sessionStatus: "live",
    isSpinning: false,
    sessionResultCount: 0,
    lastResultLabel: "",
    lastResultColor: "#d4af37",
    gameCurrentAngle: 0,
    outcomeSlots: [],
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
    updatedAt: 100
  } as const;

  assert.equal(normalizeGamePublicSessionId(" AbC123xY "), "abc123xy");
  assert.deepEqual(await createGameSpectatorSession(app as never, snapshot as never), { publicSessionId: "abc123xy" });
  await publishGameSpectatorSession(app as never, "abc123xy", snapshot as never);
  assert.equal((await fetchGameSpectatorSnapshot("https://api.example.test/", "abc123xy")).snapshot.gameType, "bracket");
  assert.deepEqual(await fetchGameSpectatorRealtimeSubscribeToken("https://api.example.test/", "abc123xy"), {
    room: "wheel-public:abc123xy",
    rooms: ["wheel-public:abc123xy"],
    token: "signed",
    expiresAt: 123
  });

  assert.equal(fetchMock.mock.calls[0]?.[0], "http://localhost:7071/api/wheel/public-session");
  assert.equal(fetchMock.mock.calls[1]?.[0], "http://localhost:7071/api/wheel/public-session/publish");
  assert.equal(fetchMock.mock.calls[2]?.[0], "https://api.example.test/wheel/public-session/abc123xy");
  assert.equal(fetchMock.mock.calls[3]?.[0], "https://api.example.test/wheel/public-session/abc123xy/realtime-token");
});
