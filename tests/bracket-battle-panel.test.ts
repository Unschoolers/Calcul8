import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test, vi } from "vitest";
import { nextTick } from "vue";
import { BracketBattlePanel } from "../src/components/windows/game/bracket/BracketBattlePanel.ts";
import {
  createBracketBattleDraft,
  createBracketBattleSessionFromDraft
} from "../src/components/windows/game/bracket/bracketBattlePanelModel.ts";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("BracketBattlePanel rollActiveBracketMatch animates before settling the match", async () => {
  vi.useFakeTimers();

  const draft = createBracketBattleDraft(4);
  draft.participants = ["Alex", "Bri", "Cam", "Dev"];
  draft.prizes[0]!.label = "Match 1 prize";
  draft.prizes[1]!.label = "Match 2 prize";
  draft.prizes[2]!.label = "Final prize";
  const session = createBracketBattleSessionFromDraft(draft, {
    now: () => 123,
    randomInt: (_min, max) => max
  });

  let persistCalls = 0;
  const overlayEvents: unknown[] = [];
  const surfaceRect = {
    left: 100,
    top: 40,
    width: 600,
    height: 300
  };
  const leftRollRect = {
    left: 128,
    top: 122,
    width: 160,
    height: 104
  };
  const rightRollRect = {
    left: 512,
    top: 122,
    width: 160,
    height: 104
  };
  const vm = {
    bracketSession: session,
    activeBracketMatch: session.matches[0],
    queuedBracketMatch: session.matches[0],
    bracketRolling: false,
    bracketLastRolls: [],
    bracketRollPreview: [],
    bracketShowcaseMatchId: session.matches[0]!.id,
    $el: {
      closest(selector: string) {
        return selector === ".game-stage-overlay-surface"
          ? {
              getBoundingClientRect() {
                return surfaceRect;
              }
            }
          : null;
      }
    },
    $refs: {
      leftRollSlotEl: {
        getBoundingClientRect() {
          return leftRollRect;
        }
      },
      rightRollSlotEl: {
        getBoundingClientRect() {
          return rightRollRect;
        }
      }
    },
    $emit(eventName: string, payload: unknown) {
      overlayEvents.push({ eventName, payload });
    },
    persistBracketSession() {
      persistCalls += 1;
    },
    clearBracketRollAnimation: BracketBattlePanel.methods!.clearBracketRollAnimation,
    getBracketBattleRollSlotAnchors: BracketBattlePanel.methods!.getBracketBattleRollSlotAnchors,
    isBracketFinalMatch: BracketBattlePanel.methods!.isBracketFinalMatch,
    bracketParticipantLabel: BracketBattlePanel.methods!.bracketParticipantLabel,
    t(key: string) {
      return key;
    }
  };

  BracketBattlePanel.methods!.rollActiveBracketMatch.call(vm as never);

  assert.equal(vm.bracketRolling, true);
  assert.equal(session.rolls.length, 0);
  assert.equal(vm.bracketRollPreview.length, 2);
  assert.deepEqual(overlayEvents[0], {
    eventName: "overlay-command",
    payload: {
      type: "rollMatchStart",
      effect: "dice",
      leftAnchor: {
        x: 0.18,
        y: 0.4467,
        size: 0.1733
      },
      leftLabel: "Alex",
      rightAnchor: {
        x: 0.82,
        y: 0.4467,
        size: 0.1733
      },
      rightLabel: "Bri"
    }
  });

  await vi.advanceTimersByTimeAsync(850);
  assert.equal(session.rolls.length, 0);

  await vi.advanceTimersByTimeAsync(250);
  assert.equal(vm.bracketRolling, false);
  assert.ok(session.rolls.length >= 2);
  assert.ok(vm.bracketLastRolls.length >= 2);
  assert.equal(vm.bracketRollPreview.length, 0);
  assert.equal(persistCalls, 1);
  const decidingRolls = vm.bracketLastRolls.slice(-2);
  assert.deepEqual(overlayEvents[1], {
    eventName: "overlay-command",
    payload: {
      type: "rollMatchResolve",
      effect: "dice",
      leftAnchor: {
        x: 0.18,
        y: 0.4467,
        size: 0.1733
      },
      leftValue: decidingRolls[0]!.value,
      rightAnchor: {
        x: 0.82,
        y: 0.4467,
        size: 0.1733
      },
      rightValue: decidingRolls[1]!.value,
      finalMatch: false,
      winnerSide: session.matches[0]!.winnerParticipantId === session.matches[0]!.participantAId ? "left" : "right",
      winnerLabel: session.matches[0]!.winnerParticipantId === session.matches[0]!.participantAId ? "Alex" : "Bri"
    }
  });
});

test("BracketBattlePanel template renders the upgraded duel showcase", () => {
  const template = readFileSync("src/components/windows/game/bracket/BracketBattlePanel.html", "utf8");

  assert.match(template, /bracket-battle-showcase/);
  assert.match(template, /bracket-battle-duel/);
  assert.match(template, /bracket-battle-duel-roll/);
});

test("BracketBattlePanel keeps the showcased match latched until the next roll begins", () => {
  const draft = createBracketBattleDraft(4);
  draft.participants = ["Alex", "Bri", "Cam", "Dev"];
  draft.prizes[0]!.label = "Match 1 prize";
  draft.prizes[1]!.label = "Match 2 prize";
  draft.prizes[2]!.label = "Final prize";
  const session = createBracketBattleSessionFromDraft(draft, {
    now: () => 123,
    randomInt: (_min, max) => max
  });

  const matchOne = session.matches[0]!;
  const matchTwo = session.matches[1]!;
  matchOne.status = "complete";
  matchOne.winnerParticipantId = matchOne.participantAId;
  matchTwo.status = "active";

  const vm = {
    bracketSession: session,
    bracketShowcaseMatchId: matchOne.id,
    queuedBracketMatch: matchTwo
  };

  const latchedMatch = BracketBattlePanel.computed!.activeBracketMatch.call(vm as never);
  assert.equal(latchedMatch?.id, matchOne.id);

  vm.bracketShowcaseMatchId = matchTwo.id;
  const nextShowcaseMatch = BracketBattlePanel.computed!.activeBracketMatch.call(vm as never);
  assert.equal(nextShowcaseMatch?.id, matchTwo.id);
});

test("BracketBattlePanel loadBracketSession normalizes legacy d100 sessions to d6", () => {
  const draft = createBracketBattleDraft(4);
  draft.participants = ["Alex", "Bri", "Cam", "Dev"];
  draft.prizes[0]!.label = "Match 1 prize";
  draft.prizes[1]!.label = "Match 2 prize";
  draft.prizes[2]!.label = "Final prize";
  const session = createBracketBattleSessionFromDraft(draft, {
    now: () => 123,
    randomInt: (_min, max) => max
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

  vi.stubGlobal("localStorage", {
    getItem() {
      return JSON.stringify(session);
    },
    setItem() {},
    removeItem() {}
  });

  const vm = {
    activeScopeType: "personal",
    activeWorkspaceId: null,
    activeWheelConfigId: 7,
    bracketSession: null,
    bracketLastRolls: [],
    clearBracketRollAnimation() {}
  };

  BracketBattlePanel.methods!.loadBracketSession.call(vm as never);

  assert.equal(vm.bracketSession?.rollMin, 1);
  assert.equal(vm.bracketSession?.rollMax, 6);
  assert.deepEqual(vm.bracketSession?.rolls.map((roll) => roll.value), [6, 1]);
});

test("BracketBattlePanel final resolve reanchors dice under Roll match and reset reuses that champion exit", async () => {
  vi.useFakeTimers();
  let randomCall = 0;
  vi.spyOn(Math, "random").mockImplementation(() => {
    const sequence = [0.92, 0.08, 0.76, 0.24];
    const value = sequence[randomCall % sequence.length] ?? 0.92;
    randomCall += 1;
    return value;
  });

  const draft = createBracketBattleDraft(4);
  draft.participants = ["Alex", "Bri", "Cam", "Dev"];
  draft.prizes[0]!.label = "Match 1 prize";
  draft.prizes[1]!.label = "Match 2 prize";
  draft.prizes[2]!.label = "Final prize";
  const session = createBracketBattleSessionFromDraft(draft, {
    now: () => 123,
    randomInt: (_min, max) => max
  });

  const semifinalA = session.matches[0]!;
  const semifinalB = session.matches[1]!;
  const finalMatch = session.matches[2]!;
  semifinalA.status = "complete";
  semifinalA.winnerParticipantId = semifinalA.participantAId;
  semifinalB.status = "complete";
  semifinalB.winnerParticipantId = semifinalB.participantBId;
  finalMatch.participantAId = semifinalA.participantAId;
  finalMatch.participantBId = semifinalB.participantBId;
  finalMatch.status = "active";

  const overlayEvents: Array<{ eventName: string; payload: unknown }> = [];
  const surfaceRect = {
    left: 100,
    top: 40,
    width: 600,
    height: 300
  };
  const leftRollRect = {
    left: 128,
    top: 122,
    width: 160,
    height: 104
  };
  const rightRollRect = {
    left: 512,
    top: 122,
    width: 160,
    height: 104
  };
  const championStageRect = {
    left: 510,
    top: 148,
    width: 180,
    height: 112
  };
  const vm = {
    bracketSession: session,
    activeBracketMatch: finalMatch,
    queuedBracketMatch: finalMatch,
    bracketRolling: false,
    bracketLastRolls: [],
    bracketRollPreview: [],
    bracketShowcaseMatchId: finalMatch.id,
    bracketResetDialog: false,
    $el: {
      closest(selector: string) {
        return selector === ".game-stage-overlay-surface"
          ? {
              getBoundingClientRect() {
                return surfaceRect;
              }
            }
          : null;
      }
    },
    $refs: {
      leftRollSlotEl: {
        getBoundingClientRect() {
          return leftRollRect;
        }
      },
      rightRollSlotEl: {
        getBoundingClientRect() {
          return rightRollRect;
        }
      },
      actionDiceStageEl: {
        getBoundingClientRect() {
          return championStageRect;
        }
      }
    },
    $emit(eventName: string, payload: unknown) {
      overlayEvents.push({ eventName, payload });
    },
    persistBracketSession() {},
    clearBracketRollAnimation: BracketBattlePanel.methods!.clearBracketRollAnimation,
    getBracketBattleRollSlotAnchors: BracketBattlePanel.methods!.getBracketBattleRollSlotAnchors,
    getBracketBattleActionDiceAnchors: BracketBattlePanel.methods!.getBracketBattleActionDiceAnchors,
    getBracketBattleChampionWinnerSide: BracketBattlePanel.methods!.getBracketBattleChampionWinnerSide,
    isBracketFinalMatch: BracketBattlePanel.methods!.isBracketFinalMatch,
    bracketParticipantLabel: BracketBattlePanel.methods!.bracketParticipantLabel,
    t(key: string) {
      return key;
    }
  };

  BracketBattlePanel.methods!.rollActiveBracketMatch.call(vm as never);
  await vi.advanceTimersByTimeAsync(1250);
  await nextTick();

  assert.equal(session.status, "complete");
  assert.equal(vm.bracketShowcaseMatchId, null);
  const decidingRolls = session.rolls.slice(-2);
  const championWinnerSide = finalMatch.winnerParticipantId === finalMatch.participantAId ? "left" : "right";
  const championWinnerLabel = session.participants.find(
    (participant) => participant.id === finalMatch.winnerParticipantId
  )?.buyerName ?? "";
  assert.deepEqual(overlayEvents[1], {
    eventName: "overlay-command",
    payload: {
      type: "rollMatchResolve",
      effect: "dice",
      leftAnchor: {
        x: 0.7643,
        y: 0.5467,
        size: 0.114
      },
      leftValue: decidingRolls[0]!.value,
      rightAnchor: {
        x: 0.9023,
        y: 0.5467,
        size: 0.114
      },
      rightValue: decidingRolls[1]!.value,
      finalMatch: true,
      winnerSide: championWinnerSide,
      winnerLabel: championWinnerLabel
    }
  });

  BracketBattlePanel.methods!.resetBracketBattle.call(vm as never);

  assert.deepEqual(overlayEvents[2], {
    eventName: "overlay-command",
    payload: {
      type: "stageExit",
      effect: "dice",
      leftAnchor: {
        x: 0.7643,
        y: 0.5467,
        size: 0.114
      },
      rightAnchor: {
        x: 0.9023,
        y: 0.5467,
        size: 0.114
      },
      winnerSide: championWinnerSide,
      style: "champion"
    }
  });
});
