import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test, vi } from "vitest";
import { BracketBattlePanel } from "../src/components/windows/game/bracket/BracketBattlePanel.ts";
import {
  createBracketBattleDraft,
  createBracketBattleSessionFromDraft
} from "../src/components/windows/game/bracket/bracketBattlePanelModel.ts";

afterEach(() => {
  vi.useRealTimers();
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
  const vm = {
    bracketSession: session,
    activeBracketMatch: session.matches[0],
    bracketRolling: false,
    bracketLastRolls: [],
    bracketRollPreview: [],
    persistBracketSession() {
      persistCalls += 1;
    },
    clearBracketRollAnimation: BracketBattlePanel.methods!.clearBracketRollAnimation
  };

  BracketBattlePanel.methods!.rollActiveBracketMatch.call(vm as never);

  assert.equal(vm.bracketRolling, true);
  assert.equal(session.rolls.length, 0);
  assert.equal(vm.bracketRollPreview.length, 2);

  await vi.advanceTimersByTimeAsync(850);
  assert.equal(session.rolls.length, 0);

  await vi.advanceTimersByTimeAsync(250);
  assert.equal(vm.bracketRolling, false);
  assert.ok(session.rolls.length >= 2);
  assert.ok(vm.bracketLastRolls.length >= 2);
  assert.equal(vm.bracketRollPreview.length, 0);
  assert.equal(persistCalls, 1);
});

test("BracketBattlePanel template renders the upgraded duel showcase", () => {
  const template = readFileSync("src/components/windows/game/bracket/BracketBattlePanel.html", "utf8");

  assert.match(template, /bracket-battle-showcase/);
  assert.match(template, /bracket-battle-duel/);
  assert.match(template, /bracket-battle-duel-roll/);
});
