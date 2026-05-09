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
    bracket: null,
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

test("game public session contracts preserve bracket snapshots with bounded public fields", () => {
  const snapshot = normalizeGamePublicSessionSnapshot({
    snapshotVersion: 2,
    gameName: "Saturday Bracket",
    gameType: "bracket",
    sessionStatus: "live",
    isSpinning: true,
    sessionResultCount: "2",
    lastResultLabel: "Alex beat Bri",
    bracket: {
      status: "active",
      participantCount: "8",
      activeMatchId: "match-2",
      championParticipantId: "participant-1",
      activeMatch: {
        id: "match-2",
        round: "1",
        position: "2",
        status: "active",
        participantAId: "participant-3",
        participantALabel: "Cam",
        participantBId: "participant-4",
        participantBLabel: "Dev",
        winnerParticipantId: "",
        prizeLabel: "Round prize",
        participantAResult: "6",
        participantBResult: "4"
      },
      matches: [{
        id: "match-1",
        round: "1",
        position: "1",
        status: "complete",
        participantAId: "participant-1",
        participantALabel: "Alex",
        participantBId: "participant-2",
        participantBLabel: "Bri",
        winnerParticipantId: "participant-1",
        prizeLabel: "First prize",
        participantAResult: "5",
        participantBResult: "2"
      }],
      recentRolls: [{
        id: "roll-1",
        matchId: "match-1",
        participantId: "participant-1",
        participantLabel: "Alex",
        value: "5",
        rollNumber: "1",
        tiebreakerIndex: "0"
      }],
      awards: [{
        id: "award-1",
        matchId: "match-1",
        participantId: "participant-1",
        participantLabel: "Alex",
        prizeLabel: "First prize",
        settlementStatus: "settled"
      }]
    },
    updatedAt: 2000
  });

  assert.equal(snapshot?.gameType, "bracket");
  assert.equal(snapshot?.bracket?.status, "active");
  assert.equal(snapshot?.bracket?.participantCount, 8);
  assert.equal(snapshot?.bracket?.activeMatch?.participantAResult, 6);
  assert.equal(snapshot?.bracket?.activeMatch?.participantBResult, 4);
  assert.deepEqual(snapshot?.bracket?.matches.map((match) => ({
    id: match.id,
    status: match.status,
    winnerParticipantId: match.winnerParticipantId
  })), [{
    id: "match-1",
    status: "complete",
    winnerParticipantId: "participant-1"
  }]);
  assert.deepEqual(snapshot?.bracket?.recentRolls.map((roll) => ({
    participantLabel: roll.participantLabel,
    value: roll.value
  })), [{
    participantLabel: "Alex",
    value: 5
  }]);
});
