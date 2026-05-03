import assert from "node:assert/strict";
import { test } from "vitest";
import {
  CURRENT_WHEEL_PUBLIC_SESSION_SNAPSHOT_VERSION,
  normalizeWheelPublicSessionSnapshot
} from "../shared/wheel-public-session-contracts.mjs";

test("shared public session contracts upgrade old wheel-only snapshots", () => {
  assert.deepEqual(normalizeWheelPublicSessionSnapshot({
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
    updatedAt: 456
  }), {
    snapshotVersion: CURRENT_WHEEL_PUBLIC_SESSION_SNAPSHOT_VERSION,
    wheelName: "Legacy Wheel",
    gameType: "wheel",
    sessionStatus: "live",
    isSpinning: false,
    totalSpins: 4,
    lastResultLabel: "Prize",
    lastResultColor: "#f00",
    wheelCurrentAngle: 2.5,
    wheelSlots: [{
      name: "Prize",
      color: "#f00",
      tier: "tier-1",
      isChase: false
    }],
    gridCells: [],
    gridHighlightCellIndex: -1,
    gridResetAnimating: false,
    spinAnimation: null,
    recentFairnessHistory: [],
    chaseHistory: [],
    chaseBoard: [],
    featuredChaseLabel: null,
    featuredChaseHeat: null,
    fairnessVerificationUrl: null,
    updatedAt: 456
  });
});

test("shared public session contracts preserve current grid reset snapshots", () => {
  const snapshot = normalizeWheelPublicSessionSnapshot({
    wheelName: "Grid",
    gameType: "grid",
    sessionStatus: "live",
    gridCells: [
      { index: "0", revealed: true, label: "Chase", color: "#0f0", tier: "tier-1", slotIndex: "7" },
      { index: "1", revealed: false, label: "hidden", color: "#f00", tier: "tier-2", slotIndex: "8" }
    ],
    gridHighlightCellIndex: "0",
    gridResetAnimating: true,
    updatedAt: "1234"
  });

  assert.equal(snapshot?.gameType, "grid");
  assert.equal(snapshot?.gridResetAnimating, true);
  assert.equal(snapshot?.gridHighlightCellIndex, 0);
  assert.deepEqual(snapshot?.gridCells, [
    { index: 0, revealed: true, label: "Chase", color: "#0f0", tier: "tier-1", slotIndex: 7 },
    { index: 1, revealed: false, label: "", color: "", tier: "", slotIndex: 8 }
  ]);
});

test("shared public session contracts normalize spin animation and malformed fields", () => {
  const snapshot = normalizeWheelPublicSessionSnapshot({
    gameType: "banana",
    gridCells: [{ index: -1 }, { index: "2", revealed: true }],
    spinAnimation: {
      spinId: "spin-1",
      startedAt: "2000",
      durationMs: "45000",
      startAngle: "0.25",
      endAngle: "18.5",
      targetIndex: "3"
    },
    featuredChaseHeat: "burning",
    updatedAt: "bad"
  }, 999);

  assert.equal(snapshot?.gameType, "grid");
  assert.equal(snapshot?.featuredChaseHeat, null);
  assert.equal(snapshot?.updatedAt, 999);
  assert.deepEqual(snapshot?.gridCells, [
    { index: 2, revealed: true, label: "", color: "#d4af37", tier: "", slotIndex: -1 }
  ]);
  assert.deepEqual(snapshot?.spinAnimation, {
    spinId: "spin-1",
    startedAt: 2000,
    durationMs: 30_000,
    startAngle: 0.25,
    endAngle: 18.5,
    targetIndex: 3
  });
});

test("shared public session contracts reject non-object snapshots", () => {
  assert.equal(normalizeWheelPublicSessionSnapshot(null), null);
  assert.equal(normalizeWheelPublicSessionSnapshot([]), null);
});
