import assert from "node:assert/strict";
import { test } from "vitest";
import {
  CURRENT_GAME_PUBLIC_SESSION_SNAPSHOT_VERSION,
  normalizeGamePublicSessionSnapshot
} from "../shared/game-public-session-contracts.mjs";

test("game public session contracts upgrade legacy wheel snapshots into v2 game fields", () => {
  const snapshot = normalizeGamePublicSessionSnapshot({
    wheelName: " Legacy Wheel ",
    sessionStatus: "live",
    totalSpins: "4",
    lastResultLabel: "Prize",
    lastResultColor: "#f00",
    wheelCurrentAngle: "2.5",
    wheelSlots: [{
      name: " Prize ",
      color: "#f00",
      tier: "tier-1",
      isChase: false
    }],
    spinAnimation: {
      spinId: "spin-1",
      startedAt: "2000",
      durationMs: "45000",
      startAngle: "0.25",
      endAngle: "18.5",
      targetIndex: "0"
    },
    updatedAt: 456
  });

  assert.deepEqual(snapshot, {
    snapshotVersion: CURRENT_GAME_PUBLIC_SESSION_SNAPSHOT_VERSION,
    gameName: "Legacy Wheel",
    gameType: "wheel",
    sessionStatus: "live",
    isSpinning: false,
    sessionResultCount: 4,
    lastResultLabel: "Prize",
    lastResultColor: "#f00",
    gameCurrentAngle: 2.5,
    outcomeSlots: [{
      name: "Prize",
      color: "#f00",
      tier: "tier-1",
      isChase: false
    }],
    boardCells: [],
    boardHighlightCellIndex: -1,
    boardResetAnimating: false,
    resultAnimation: {
      spinId: "spin-1",
      startedAt: 2000,
      durationMs: 30_000,
      startAngle: 0.25,
      endAngle: 18.5,
      targetIndex: 0
    },
    recentFairnessHistory: [],
    chaseHistory: [],
    chaseBoard: [],
    featuredChaseLabel: null,
    featuredChaseHeat: null,
    fairnessVerificationUrl: null,
    updatedAt: 456
  });
});

test("game public session contracts normalize v2 snapshots without wheel-prefixed fields", () => {
  const snapshot = normalizeGamePublicSessionSnapshot({
    snapshotVersion: 2,
    gameName: "Grid",
    gameType: "grid",
    sessionStatus: "live",
    sessionResultCount: "3",
    gameCurrentAngle: "1.25",
    outcomeSlots: [{ name: "Chase", color: "#0f0", tier: "tier-1", isChase: true }],
    boardCells: [
      { index: "0", revealed: true, label: "Chase", color: "#0f0", tier: "tier-1", slotIndex: "7" },
      { index: "1", revealed: false, label: "hidden", color: "#f00", tier: "tier-2", slotIndex: "8" }
    ],
    boardHighlightCellIndex: "0",
    boardResetAnimating: true,
    updatedAt: "1234"
  });

  assert.equal(snapshot?.gameName, "Grid");
  assert.equal(snapshot?.gameType, "grid");
  assert.equal(snapshot?.sessionResultCount, 3);
  assert.equal(snapshot?.gameCurrentAngle, 1.25);
  assert.equal(snapshot?.boardResetAnimating, true);
  assert.equal(snapshot?.boardHighlightCellIndex, 0);
  assert.deepEqual(snapshot?.boardCells, [
    { index: 0, revealed: true, label: "Chase", color: "#0f0", tier: "tier-1", slotIndex: 7 },
    { index: 1, revealed: false, label: "", color: "", tier: "", slotIndex: 8 }
  ]);
  assert.equal(Object.hasOwn(snapshot as object, "wheelName"), false);
  assert.equal(Object.hasOwn(snapshot as object, "totalSpins"), false);
  assert.equal(Object.hasOwn(snapshot as object, "wheelCurrentAngle"), false);
  assert.equal(Object.hasOwn(snapshot as object, "wheelSlots"), false);
  assert.equal(Object.hasOwn(snapshot as object, "gridCells"), false);
  assert.equal(Object.hasOwn(snapshot as object, "spinAnimation"), false);
});

test("game public session contracts infer grid games from legacy board cells", () => {
  const snapshot = normalizeGamePublicSessionSnapshot({
    gameType: "banana",
    gridCells: [{ index: -1 }, { index: "2", revealed: true }],
    featuredChaseHeat: "burning",
    updatedAt: "bad"
  }, 999);

  assert.equal(snapshot?.gameType, "grid");
  assert.equal(snapshot?.featuredChaseHeat, null);
  assert.equal(snapshot?.updatedAt, 999);
  assert.deepEqual(snapshot?.boardCells, [
    { index: 2, revealed: true, label: "", color: "#d4af37", tier: "", slotIndex: -1 }
  ]);
});
