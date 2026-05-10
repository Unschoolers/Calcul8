import assert from "node:assert/strict";
import { test } from "vitest";
import { buildBracketBattleSpectatorSnapshot } from "../src/components/windows/game/bracket/bracketBattleSpectatorSnapshot.ts";
import {
  createBracketBattleDraft,
  createBracketBattleSessionFromDraft
} from "../src/components/windows/game/bracket/bracketBattlePanelModel.ts";
import { resolveBracketBattleMatchRoll } from "../src/components/windows/game/bracket/bracketBattleDomain.ts";

function createSession() {
  const draft = createBracketBattleDraft(4);
  draft.name = "Public Bracket";
  draft.participants = ["Alex", "Bri", "Cam", "Dev"];
  draft.prizes[0]!.label = "Match 1 prize";
  draft.prizes[1]!.label = "Match 2 prize";
  draft.prizes[2]!.label = "Final prize";
  return createBracketBattleSessionFromDraft(draft, {
    now: () => 1_000,
    randomInt: (_min, max) => max
  });
}

test("buildBracketBattleSpectatorSnapshot keeps a settled showcase match visible when not rolling", () => {
  const session = createSession();
  const result = resolveBracketBattleMatchRoll(
    session,
    session.matches[0]!.id,
    (() => {
      const values = [6, 4];
      return () => values.shift() ?? 4;
    })(),
    () => 2_000
  );

  const snapshot = buildBracketBattleSpectatorSnapshot(session, {
    rolling: false,
    showcaseMatchId: session.matches[0]!.id,
    lastRolls: result.rolls
  });

  assert.equal(snapshot.activeMatch?.id, session.matches[0]!.id);
  assert.equal(snapshot.activeMatch?.status, "complete");
  assert.equal(snapshot.activeMatch?.participantAResult, 6);
  assert.equal(snapshot.activeMatch?.participantBResult, 4);
  assert.deepEqual(snapshot.recentRolls.map((roll) => roll.value), [6, 4]);
  assert.equal(snapshot.awards[0]?.prizeLabel, "Match 1 prize");
});

test("buildBracketBattleSpectatorSnapshot switches back to the queued match while rolling", () => {
  const session = createSession();
  resolveBracketBattleMatchRoll(
    session,
    session.matches[0]!.id,
    (() => {
      const values = [6, 4];
      return () => values.shift() ?? 4;
    })(),
    () => 2_000
  );
  const queuedMatch = session.matches.find((match) => match.status === "active");

  const snapshot = buildBracketBattleSpectatorSnapshot(session, {
    rolling: true,
    showcaseMatchId: session.matches[0]!.id,
    lastRolls: []
  });

  assert.equal(snapshot.activeMatch?.id, queuedMatch?.id);
  assert.equal(snapshot.activeMatch?.status, "active");
});
