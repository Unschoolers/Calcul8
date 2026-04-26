import assert from "node:assert/strict";
import { test } from "vitest";
import { shouldApplySpectatorReadyState } from "../src/app-core/methods/ui/wheel-spectator-client-state.ts";
import {
  CURRENT_WHEEL_PUBLIC_SESSION_SNAPSHOT_VERSION,
  normalizeWheelSpectatorSnapshot
} from "../src/app-core/methods/ui/wheel-spectator-contract.ts";

test("shouldApplySpectatorReadyState rejects stale ready snapshots", () => {
  const currentState = {
    status: "ready" as const,
    publicSessionId: "abc123",
    snapshot: {
      updatedAt: 200,
      wheelName: "Live Wheel"
    }
  };
  const olderState = {
    status: "ready" as const,
    publicSessionId: "abc123",
    snapshot: {
      updatedAt: 150,
      wheelName: "Live Wheel"
    }
  };
  const newerState = {
    status: "ready" as const,
    publicSessionId: "abc123",
    snapshot: {
      updatedAt: 250,
      wheelName: "Live Wheel"
    }
  };

  assert.equal(shouldApplySpectatorReadyState(currentState as never, olderState as never), false);
  assert.equal(shouldApplySpectatorReadyState(currentState as never, newerState as never), true);
});

test("normalizeWheelSpectatorSnapshot upgrades old wheel-only snapshots", () => {
  const snapshot = normalizeWheelSpectatorSnapshot({
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
  assert.equal(snapshot.snapshotVersion, CURRENT_WHEEL_PUBLIC_SESSION_SNAPSHOT_VERSION);
  assert.equal(snapshot.wheelName, "Legacy Wheel");
  assert.equal(snapshot.gameType, "wheel");
  assert.equal(snapshot.sessionStatus, "live");
  assert.equal(snapshot.totalSpins, 3);
  assert.equal(snapshot.wheelSlots.length, 1);
  assert.deepEqual(snapshot.gridCells, []);
  assert.equal(snapshot.gridHighlightCellIndex, -1);
  assert.equal(snapshot.gridResetAnimating, false);
  assert.equal(snapshot.recentFairnessHistory[0]?.spinNumber, 3);
  assert.equal(snapshot.updatedAt, 456);
});

test("normalizeWheelSpectatorSnapshot preserves current grid reset snapshots", () => {
  const snapshot = normalizeWheelSpectatorSnapshot({
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
  assert.equal(snapshot.gridCells.length, 2);
  assert.deepEqual(snapshot.gridCells[0], {
    index: 4,
    revealed: true,
    label: "Hit",
    color: "#fa0",
    tier: "tier-hit",
    slotIndex: 10
  });
  assert.deepEqual(snapshot.gridCells[1], {
    index: 5,
    revealed: false,
    label: "",
    color: "",
    tier: "",
    slotIndex: 11
  });
  assert.equal(snapshot.gridHighlightCellIndex, 4);
  assert.equal(snapshot.gridResetAnimating, true);
  assert.equal(snapshot.featuredChaseHeat, "very_high");
});

test("normalizeWheelSpectatorSnapshot drops malformed nested entries and rejects non-objects", () => {
  assert.equal(normalizeWheelSpectatorSnapshot(null), null);
  assert.equal(normalizeWheelSpectatorSnapshot([]), null);

  const snapshot = normalizeWheelSpectatorSnapshot({
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
  assert.equal(snapshot.wheelName, "Wheel Session");
  assert.equal(snapshot.sessionStatus, "starting");
  assert.equal(snapshot.totalSpins, 0);
  assert.equal(snapshot.lastResultColor, "#d4af37");
  assert.equal(snapshot.wheelCurrentAngle, 0);
  assert.equal(snapshot.wheelSlots.length, 1);
  assert.equal(snapshot.gridCells.length, 1);
  assert.equal(snapshot.spinAnimation, null);
  assert.equal(snapshot.featuredChaseHeat, null);
});
