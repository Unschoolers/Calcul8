import assert from "node:assert/strict";
import { test } from "vitest";
import {
  normalizeBracketBattleSessionDice,
  createBracketBattleSession,
  getBracketBattleMatchCount,
  resolveBracketBattleMatchRoll
} from "../src/components/windows/game/bracket/bracketBattleDomain.ts";

const noShuffle = (_minInclusive: number, maxInclusive: number): number => maxInclusive;

test("createBracketBattleSession builds a four-player bracket with one pre-assigned prize per match", () => {
  const session = createBracketBattleSession({
    participantCount: 4,
    participants: ["Alex", "Bri", "Cam", "Dev"],
    prizeLabels: ["Pack 1", "Pack 2", "Box Final"],
    randomInt: noShuffle
  });

  assert.equal(getBracketBattleMatchCount(4), 3);
  assert.equal(session.rollMin, 1);
  assert.equal(session.rollMax, 6);
  assert.equal(session.matches.length, 3);
  assert.equal(session.prizes.length, 3);
  assert.deepEqual(session.matches.map((match) => match.prizeId), ["prize-1", "prize-2", "prize-3"]);
  assert.deepEqual(
    session.matches.filter((match) => match.round === 1).map((match) => match.status),
    ["active", "active"]
  );
  assert.equal(session.matches.find((match) => match.round === 2)?.status, "pending");
  assert.deepEqual(
    session.participants.map((participant) => participant.seed).sort((a, b) => a - b),
    [1, 2, 3, 4]
  );
});

test("createBracketBattleSession rejects missing participants or match prizes", () => {
  assert.throws(
    () => createBracketBattleSession({
      participantCount: 4,
      participants: ["Alex", "Bri", "Cam"],
      prizeLabels: ["Pack 1", "Pack 2", "Box Final"]
    }),
    /requires exactly 4 participants/
  );

  assert.throws(
    () => createBracketBattleSession({
      participantCount: 4,
      participants: ["Alex", "Bri", "Cam", "Dev"],
      prizeLabels: ["Pack 1", "Pack 2"]
    }),
    /requires exactly 3 prizes/
  );
});

test("createBracketBattleSession preserves pre-assigned lot and singles prize metadata", () => {
  const session = createBracketBattleSession({
    participantCount: 4,
    participants: ["Alex", "Bri", "Cam", "Dev"],
    prizes: [
      { label: "Bulk Pack", sourceType: "lot", lotId: 101, quantity: 2, cost: 6.25, value: 12 },
      { label: "Singles Hit", sourceType: "singles", lotId: 202, singlesPurchaseEntryId: 9, quantity: 1, cost: 4, value: 18 },
      { label: "Final Bonus", sourceType: "manual", quantity: 1 }
    ],
    randomInt: noShuffle
  });

  assert.deepEqual(session.prizes.map((prize) => ({
    sourceType: prize.sourceType,
    label: prize.label,
    lotId: prize.lotId,
    singlesPurchaseEntryId: prize.singlesPurchaseEntryId,
    quantity: prize.quantity,
    cost: prize.cost,
    value: prize.value
  })), [
    {
      sourceType: "lot",
      label: "Bulk Pack",
      lotId: 101,
      singlesPurchaseEntryId: null,
      quantity: 2,
      cost: 6.25,
      value: 12
    },
    {
      sourceType: "singles",
      label: "Singles Hit",
      lotId: 202,
      singlesPurchaseEntryId: 9,
      quantity: 1,
      cost: 4,
      value: 18
    },
    {
      sourceType: "manual",
      label: "Final Bonus",
      lotId: null,
      singlesPurchaseEntryId: null,
      quantity: 1,
      cost: null,
      value: null
    }
  ]);
});

test("resolveBracketBattleMatchRoll awards the match prize and advances the winner", () => {
  const rolls = [6, 3];
  const session = createBracketBattleSession({
    participantCount: 4,
    participants: ["Alex", "Bri", "Cam", "Dev"],
    prizeLabels: ["Pack 1", "Pack 2", "Box Final"],
    randomInt: noShuffle
  });

  const result = resolveBracketBattleMatchRoll(session, "match-1", () => rolls.shift() ?? 1);

  assert.equal(result.winnerParticipantId, "participant-1");
  assert.deepEqual(result.rolls.map((roll) => roll.value), [6, 3]);
  assert.deepEqual(session.awards, [{
    id: "award-1",
    matchId: "match-1",
    participantId: "participant-1",
    prizeId: "prize-1",
    awardedAt: session.awards[0]?.awardedAt,
    settlementStatus: "pending"
  }]);
  assert.equal(session.matches[0]?.status, "complete");
  assert.equal(session.matches[2]?.participantAId, "participant-1");
  assert.equal(session.matches[2]?.status, "pending");
});

test("resolveBracketBattleMatchRoll records tiebreaker rolls until there is a winner", () => {
  const rolls = [4, 4, 2, 5];
  const session = createBracketBattleSession({
    participantCount: 4,
    participants: ["Alex", "Bri", "Cam", "Dev"],
    prizeLabels: ["Pack 1", "Pack 2", "Box Final"],
    randomInt: noShuffle
  });

  const result = resolveBracketBattleMatchRoll(session, "match-1", () => rolls.shift() ?? 1);

  assert.equal(result.winnerParticipantId, "participant-2");
  assert.deepEqual(result.rolls.map((roll) => roll.value), [4, 4, 2, 5]);
  assert.deepEqual(result.rolls.map((roll) => roll.tiebreakerIndex), [0, 0, 1, 1]);
});

test("resolveBracketBattleMatchRoll completes an eight-player bracket through the champion match", () => {
  const session = createBracketBattleSession({
    participantCount: 8,
    participants: ["A", "B", "C", "D", "E", "F", "G", "H"],
    prizeLabels: ["R1A", "R1B", "R1C", "R1D", "Semi A", "Semi B", "Final"],
    randomInt: noShuffle
  });
  const winningRolls = [6, 1, 6, 1, 6, 1, 6, 1, 6, 1, 6, 1, 6, 1];

  for (const matchId of ["match-1", "match-2", "match-3", "match-4", "match-5", "match-6", "match-7"]) {
    resolveBracketBattleMatchRoll(session, matchId, () => winningRolls.shift() ?? 1);
  }

  assert.equal(session.status, "complete");
  assert.equal(session.championParticipantId, "participant-1");
  assert.equal(session.awards.length, 7);
  assert.equal(session.matches.every((match) => match.status === "complete"), true);
});

test("normalizeBracketBattleSessionDice clamps legacy sessions to d6 values", () => {
  const session = createBracketBattleSession({
    participantCount: 4,
    participants: ["Alex", "Bri", "Cam", "Dev"],
    prizeLabels: ["Pack 1", "Pack 2", "Box Final"],
    randomInt: noShuffle
  });

  session.rollMin = 1;
  session.rollMax = 100;
  session.rolls = [
    {
      id: "roll-1",
      matchId: "match-1",
      participantId: "participant-1",
      value: 42,
      rollNumber: 1,
      tiebreakerIndex: 0
    },
    {
      id: "roll-2",
      matchId: "match-1",
      participantId: "participant-2",
      value: 0,
      rollNumber: 1,
      tiebreakerIndex: 0
    }
  ];

  normalizeBracketBattleSessionDice(session);

  assert.equal(session.rollMin, 1);
  assert.equal(session.rollMax, 6);
  assert.deepEqual(session.rolls.map((roll) => roll.value), [6, 1]);
});
