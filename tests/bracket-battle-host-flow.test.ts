import assert from "node:assert/strict";
import { test, vi } from "vitest";
import {
  applyBracketBattleHostState,
  buildBracketBattleSessionStatePayload,
  getBracketBattleSessionStorageKey,
  loadBracketBattleSessionState,
  persistBracketBattleSessionState,
  runBracketBattleSessionReset,
  resolveBracketBattleActiveMatch,
  resolveBracketBattleQueuedMatch,
  resolveBracketBattleShowcaseMatchId
} from "../src/components/windows/game/bracket/bracketBattleHostFlow.ts";
import {
  createBracketBattleDraft,
  createBracketBattleSessionFromDraft
} from "../src/components/windows/game/bracket/bracketBattlePanelModel.ts";
import { resolveBracketBattleMatchRoll } from "../src/components/windows/game/bracket/bracketBattleDomain.ts";

function createSession() {
  const draft = createBracketBattleDraft(4);
  draft.name = "Host Flow Bracket";
  draft.participants = ["Alex", "Bri", "Cam", "Dev"];
  draft.prizes[0]!.label = "Match 1 prize";
  draft.prizes[1]!.label = "Match 2 prize";
  draft.prizes[2]!.label = "Final prize";
  return createBracketBattleSessionFromDraft(draft, {
    now: () => 1_000,
    randomInt: (_min, max) => max
  });
}

test("bracket host flow resolves scoped preview and live storage keys outside the panel", () => {
  assert.equal(
    getBracketBattleSessionStorageKey({
      activeScopeType: "personal",
      activeWorkspaceId: null,
      activeWheelConfigId: 7,
      wheelMode: "config"
    }),
    "whatfees_bracket_battle_session_7_preview"
  );
  assert.equal(
    getBracketBattleSessionStorageKey({
      activeScopeType: "workspace",
      activeWorkspaceId: "team 42",
      activeWheelConfigId: 7,
      wheelMode: "live"
    }),
    "whatfees_bracket_battle_session__ws__team%2042_7_live"
  );
});

test("bracket host flow loads, normalizes, and focuses the latest settled match", () => {
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
  const storage = {
    getItem: vi.fn(() => JSON.stringify({
      ...session,
      rollMin: 1,
      rollMax: 100,
      rolls: result.rolls.map((roll, index) => ({
        ...roll,
        value: index === 0 ? 42 : 0
      }))
    })),
    setItem: vi.fn(),
    removeItem: vi.fn()
  };

  const loaded = loadBracketBattleSessionState(storage, {
    activeScopeType: "personal",
    activeWorkspaceId: null,
    activeWheelConfigId: 7,
    wheelMode: "live"
  });

  assert.equal(loaded.session?.rollMin, 1);
  assert.equal(loaded.session?.rollMax, 6);
  assert.deepEqual(loaded.session?.rolls.map((roll) => roll.value), [6, 1]);
  assert.deepEqual(loaded.lastRolls, []);
  assert.equal(loaded.showcaseMatchId, session.matches[0]!.id);
  assert.equal(loaded.shouldClearDice, false);
});

test("bracket host flow clears unusable stored sessions and persists through storage failures", () => {
  const missingStorage = {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn()
  };
  const missing = loadBracketBattleSessionState(missingStorage, {
    activeScopeType: "personal",
    activeWorkspaceId: null,
    activeWheelConfigId: null,
    wheelMode: "config"
  });

  assert.equal(missing.session, null);
  assert.equal(missing.showcaseMatchId, null);
  assert.equal(missing.shouldClearDice, true);

  const throwingStorage = {
    getItem: vi.fn(() => "{bad json"),
    setItem: vi.fn(() => {
      throw new Error("full");
    }),
    removeItem: vi.fn(() => {
      throw new Error("locked");
    })
  };

  const invalid = loadBracketBattleSessionState(throwingStorage, {
    activeScopeType: "personal",
    activeWorkspaceId: null,
    activeWheelConfigId: null,
    wheelMode: "config"
  });
  assert.equal(invalid.session, null);
  assert.equal(invalid.shouldClearDice, true);

  persistBracketBattleSessionState(throwingStorage, missing.storageKey, createSession());
  persistBracketBattleSessionState(throwingStorage, missing.storageKey, null);
});

test("bracket host flow resolves queued and showcased matches without mounting the panel", () => {
  const session = createSession();
  const matchOne = session.matches[0]!;
  const matchTwo = session.matches[1]!;
  matchOne.status = "complete";
  matchOne.winnerParticipantId = matchOne.participantAId;
  matchTwo.status = "active";

  assert.equal(resolveBracketBattleQueuedMatch(session)?.id, matchTwo.id);
  assert.equal(resolveBracketBattleActiveMatch(session, matchOne.id)?.id, matchOne.id);
  assert.equal(resolveBracketBattleActiveMatch(session, matchTwo.id)?.id, matchTwo.id);

  session.status = "complete";
  assert.equal(resolveBracketBattleQueuedMatch(session), null);
  assert.equal(resolveBracketBattleActiveMatch(session, matchTwo.id), null);
});

test("bracket host flow builds and applies host session state with publish intent", async () => {
  const session = createSession();
  const payload = buildBracketBattleSessionStatePayload({
    session,
    lastRolls: session.rolls,
    rolling: true,
    showcaseMatchId: resolveBracketBattleShowcaseMatchId(session),
    publishLive: true
  });
  const publish = vi.fn(async () => undefined);
  const host = {
    bracketBattleSession: null,
    bracketBattleLastRolls: [],
    bracketBattleRolling: false,
    bracketBattleShowcaseMatchId: null,
    publishGameSpectatorSessionSnapshot: publish
  };

  await applyBracketBattleHostState(host, payload);

  assert.equal(host.bracketBattleSession, session);
  assert.equal(host.bracketBattleRolling, true);
  assert.equal(host.bracketBattleShowcaseMatchId, session.matches[0]!.id);
  assert.equal(publish.mock.calls.length, 1);
});

test("bracket host reset clears dice state and publishes only for live execution", async () => {
  const persist = vi.fn();
  const publish = vi.fn();
  const live = await runBracketBattleSessionReset({
    session: createSession(),
    lastRolls: [{ id: "roll-1" }] as any,
    rolling: true,
    showcaseMatchId: "match-1",
    publishLive: false
  }, "live", { persist, publish });

  assert.equal(live.session, null);
  assert.deepEqual(live.lastRolls, []);
  assert.equal(live.rolling, false);
  assert.equal(live.showcaseMatchId, null);
  assert.equal(persist.mock.calls.length, 1);
  assert.equal(publish.mock.calls.length, 1);

  await runBracketBattleSessionReset(live, "preview", { persist, publish });
  assert.equal(persist.mock.calls.length, 2);
  assert.equal(publish.mock.calls.length, 1);
});
