import assert from "node:assert/strict";
import { test } from "vitest";
import {
  resolveSpectatorRealtimeMessage,
  SPECTATOR_PUBLIC_SESSION_EVENT_TYPES
} from "../src/spectator/realtime/spectatorRealtimeClient.ts";
import type { GameSpectatorSnapshot } from "../src/types/app.ts";

function makeSnapshot(updatedAt: number): GameSpectatorSnapshot {
  return {
    snapshotVersion: 2,
    gameName: `Snapshot ${updatedAt}`,
    gameType: "wheel",
    sessionStatus: "live",
    isSpinning: false,
    sessionResultCount: 1,
    lastResultLabel: "Prize",
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
    updatedAt
  };
}

test("spectator realtime client treats subscribed messages as reconnect refreshes", () => {
  assert.deepEqual(resolveSpectatorRealtimeMessage({
    rawPayload: { type: "subscribed" },
    currentPublicSessionId: "abc123",
    normalizeSnapshot: () => null
  }), {
    action: "refresh"
  });
});

test("spectator realtime client accepts generic and legacy public session event names", () => {
  assert.equal(SPECTATOR_PUBLIC_SESSION_EVENT_TYPES.has("game.public-session.updated"), true);
  assert.equal(SPECTATOR_PUBLIC_SESSION_EVENT_TYPES.has("wheel.public-session.updated"), true);

  for (const eventType of SPECTATOR_PUBLIC_SESSION_EVENT_TYPES) {
    const result = resolveSpectatorRealtimeMessage({
      rawPayload: {
        type: "event",
        eventType,
        data: {
          publicSessionId: " AbC123 ",
          snapshot: { updatedAt: 200 }
        }
      },
      currentPublicSessionId: "abc123",
      normalizeSnapshot: () => makeSnapshot(200)
    });

    assert.equal(result.action, "apply");
    assert.equal(result.action === "apply" ? result.snapshot.updatedAt : 0, 200);
  }
});

test("spectator realtime client refreshes on malformed public snapshot payloads", () => {
  assert.deepEqual(resolveSpectatorRealtimeMessage({
    rawPayload: {
      type: "event",
      eventType: "game.public-session.updated",
      data: {
        publicSessionId: "abc123",
        snapshot: null
      }
    },
    currentPublicSessionId: "abc123",
    normalizeSnapshot: () => null
  }), {
    action: "refresh"
  });
});

test("spectator realtime client ignores other sessions and unknown events", () => {
  assert.deepEqual(resolveSpectatorRealtimeMessage({
    rawPayload: {
      type: "event",
      eventType: "game.public-session.updated",
      data: {
        publicSessionId: "other",
        snapshot: { updatedAt: 200 }
      }
    },
    currentPublicSessionId: "abc123",
    normalizeSnapshot: () => makeSnapshot(200)
  }), {
    action: "ignore"
  });

  assert.deepEqual(resolveSpectatorRealtimeMessage({
    rawPayload: {
      type: "event",
      eventType: "workspace.updated",
      data: {
        publicSessionId: "abc123",
        snapshot: { updatedAt: 200 }
      }
    },
    currentPublicSessionId: "abc123",
    normalizeSnapshot: () => makeSnapshot(200)
  }), {
    action: "ignore"
  });
});
