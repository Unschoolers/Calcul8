import assert from "node:assert/strict";
import { test } from "vitest";
import { shouldApplySpectatorReadyState } from "../src/app-core/methods/ui/spectator/game-spectator-client-state.ts";
import {
  CURRENT_GAME_PUBLIC_SESSION_SNAPSHOT_VERSION,
  normalizeGameSpectatorSnapshot
} from "../src/app-core/methods/ui/spectator/game-spectator-contract.ts";

test("shouldApplySpectatorReadyState rejects stale ready snapshots", () => {
  const currentState = {
    status: "ready" as const,
    publicSessionId: "abc123",
    snapshot: {
      updatedAt: 200,
      gameName: "Live Wheel"
    }
  };
  const olderState = {
    status: "ready" as const,
    publicSessionId: "abc123",
    snapshot: {
      updatedAt: 150,
      gameName: "Live Wheel"
    }
  };
  const newerState = {
    status: "ready" as const,
    publicSessionId: "abc123",
    snapshot: {
      updatedAt: 250,
      gameName: "Live Wheel"
    }
  };

  assert.equal(shouldApplySpectatorReadyState(currentState as never, olderState as never), false);
  assert.equal(shouldApplySpectatorReadyState(currentState as never, newerState as never), true);
});

test("normalizeGameSpectatorSnapshot upgrades old wheel-only snapshots", () => {
  const snapshot = normalizeGameSpectatorSnapshot({
    wheelName: " Legacy Wheel ",
    sessionStatus: "live",
    isSpinning: false,
    totalSpins: "3",
    lastResultLabel: "Prize",
    lastResultColor: "#f00",
    wheelCurrentAngle: "1.25",
    wheelSlots: [{
      name: "Tier A",
      color: "#00f",
      tier: "tier-a",
      isChase: true
    }],
    recentFairnessHistory: [{
      spinNumber: "3",
      label: "Prize",
      color: "#f00",
      verificationUrl: "https://example.test/proof",
      timestamp: "123"
    }],
    updatedAt: "456"
  });

  assert.ok(snapshot);
  assert.equal(snapshot.snapshotVersion, CURRENT_GAME_PUBLIC_SESSION_SNAPSHOT_VERSION);
  assert.equal(snapshot.gameName, "Legacy Wheel");
  assert.equal(snapshot.gameType, "wheel");
  assert.equal(snapshot.sessionStatus, "live");
  assert.equal(snapshot.sessionResultCount, 3);
  assert.equal(snapshot.outcomeSlots.length, 1);
  assert.deepEqual(snapshot.boardCells, []);
  assert.equal(snapshot.boardHighlightCellIndex, -1);
  assert.equal(snapshot.boardResetAnimating, false);
  assert.equal(snapshot.recentFairnessHistory[0]?.spinNumber, 3);
  assert.equal(snapshot.updatedAt, 456);
});

test("normalizeGameSpectatorSnapshot preserves current grid reset snapshots", () => {
  const snapshot = normalizeGameSpectatorSnapshot({
    snapshotVersion: 1,
    wheelName: "Grid",
    gameType: "grid",
    sessionStatus: "live",
    isSpinning: true,
    totalSpins: 2,
    lastResultLabel: "Hit",
    lastResultColor: "#fa0",
    wheelCurrentAngle: 0,
    wheelSlots: [],
    gridCells: [{
      index: "4",
      revealed: true,
      label: "Hit",
      color: "#fa0",
      tier: "tier-hit",
      slotIndex: "10"
    }, {
      index: "5",
      revealed: false,
      label: "hidden",
      color: "#000",
      tier: "hidden",
      slotIndex: "11"
    }],
    gridHighlightCellIndex: "4",
    gridResetAnimating: true,
    featuredChaseHeat: "very_high",
    updatedAt: 999
  });

  assert.ok(snapshot);
  assert.equal(snapshot.gameType, "grid");
  assert.equal(snapshot.boardCells.length, 2);
  assert.deepEqual(snapshot.boardCells[0], {
    index: 4,
    revealed: true,
    label: "Hit",
    color: "#fa0",
    tier: "tier-hit",
    slotIndex: 10
  });
  assert.deepEqual(snapshot.boardCells[1], {
    index: 5,
    revealed: false,
    label: "",
    color: "",
    tier: "",
    slotIndex: 11
  });
  assert.equal(snapshot.boardHighlightCellIndex, 4);
  assert.equal(snapshot.boardResetAnimating, true);
  assert.equal(snapshot.featuredChaseHeat, "very_high");
});

test("normalizeGameSpectatorSnapshot drops malformed nested entries and rejects non-objects", () => {
  assert.equal(normalizeGameSpectatorSnapshot(null), null);
  assert.equal(normalizeGameSpectatorSnapshot([]), null);

  const snapshot = normalizeGameSpectatorSnapshot({
    wheelName: "",
    sessionStatus: "banana",
    totalSpins: -10,
    lastResultColor: "",
    wheelCurrentAngle: "bad",
    wheelSlots: [{ name: "", tier: "" }, { name: "Good", tier: "tier-good" }],
    gridCells: [{ index: -1 }, { index: "2", revealed: true }],
    spinAnimation: {
      spinId: "",
      startedAt: 0,
      durationMs: 0,
      startAngle: "bad",
      endAngle: "bad",
      targetIndex: -1
    },
    featuredChaseHeat: "fake",
    updatedAt: 0
  });

  assert.ok(snapshot);
  assert.equal(snapshot.gameName, "Game Session");
  assert.equal(snapshot.sessionStatus, "starting");
  assert.equal(snapshot.sessionResultCount, 0);
  assert.equal(snapshot.lastResultColor, "#d4af37");
  assert.equal(snapshot.gameCurrentAngle, 0);
  assert.equal(snapshot.outcomeSlots.length, 1);
  assert.equal(snapshot.boardCells.length, 1);
  assert.equal(snapshot.resultAnimation, null);
  assert.equal(snapshot.featuredChaseHeat, null);
});
