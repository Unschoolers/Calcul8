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
  const vm: any = {
    bracketSession: session,
    activeBracketMatch: session.matches[0],
    queuedBracketMatch: session.matches[0],
    bracketRolling: false,
    bracketLastRolls: [],
    bracketRollPreview: [],
    bracketShowcaseMatchId: session.matches[0]!.id,
    wheelMode: "live",
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
      surfaceRect.height = 420;
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
  await nextTick();
  assert.deepEqual(overlayEvents[0], {
    eventName: "overlay-command",
    payload: {
      type: "rollMatchStart",
      effect: "dice",
      leftAnchor: {
        x: 0.18,
        y: 0.4467,
        size: 0.1467
      },
      leftLabel: "Alex",
      rightAnchor: {
        x: 0.82,
        y: 0.4467,
        size: 0.1467
      },
      rightLabel: "Bri"
    }
  });

  await vi.advanceTimersByTimeAsync(850);
  assert.equal(session.rolls.length, 0);

  await vi.advanceTimersByTimeAsync(250);
  await nextTick();
  assert.equal(vm.bracketRolling, false);
  assert.ok(session.rolls.length >= 2);
  assert.ok(vm.bracketLastRolls.length >= 2);
  assert.equal(vm.bracketRollPreview.length, 0);
  assert.equal(persistCalls, 1);
  const decidingRolls = vm.bracketLastRolls.slice(-2) as Array<{ value: number }>;
  assert.deepEqual(overlayEvents[1], {
    eventName: "overlay-command",
    payload: {
      type: "rollMatchResolve",
      effect: "dice",
      leftAnchor: {
        x: 0.18,
        y: 0.319,
        size: 0.1467
      },
      leftValue: decidingRolls[0]!.value,
      rightAnchor: {
        x: 0.82,
        y: 0.319,
        size: 0.1467
      },
      rightValue: decidingRolls[1]!.value,
      finalMatch: false,
      winnerSide: session.matches[0]!.winnerParticipantId === session.matches[0]!.participantAId ? "left" : "right",
      winnerLabel: session.matches[0]!.winnerParticipantId === session.matches[0]!.participantAId ? "Alex" : "Bri"
    }
  });
});

test("BracketBattlePanel waits for the repainted mobile duel before sampling dice anchors", async () => {
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

  const overlayEvents: unknown[] = [];
  const vm: any = {
    bracketSession: session,
    activeBracketMatch: session.matches[0],
    queuedBracketMatch: session.matches[0],
    bracketRolling: false,
    bracketLastRolls: [],
    bracketRollPreview: [],
    bracketShowcaseMatchId: session.matches[0]!.id,
    wheelMode: "live",
    $emit(eventName: string, payload: unknown) {
      overlayEvents.push({ eventName, payload });
    },
    persistBracketSession() {},
    clearBracketRollAnimation: BracketBattlePanel.methods!.clearBracketRollAnimation,
    getBracketBattleRollSlotAnchors() {
      return {
        leftAnchor: { x: 0.48, y: 0.24, size: 0.2 },
        rightAnchor: { x: 0.48, y: 0.56, size: 0.2 }
      };
    },
    isBracketFinalMatch: BracketBattlePanel.methods!.isBracketFinalMatch,
    bracketParticipantLabel: BracketBattlePanel.methods!.bracketParticipantLabel,
    t(key: string) {
      return key;
    }
  };

  BracketBattlePanel.methods!.rollActiveBracketMatch.call(vm as never);

  assert.equal(vm.bracketRolling, true);
  assert.equal(overlayEvents.length, 0);

  await nextTick();

  assert.deepEqual(overlayEvents[0], {
    eventName: "overlay-command",
    payload: {
      type: "rollMatchStart",
      effect: "dice",
      leftAnchor: { x: 0.48, y: 0.24, size: 0.2 },
      leftLabel: "Alex",
      rightAnchor: { x: 0.48, y: 0.56, size: 0.2 },
      rightLabel: "Bri"
    }
  });
});

test("BracketBattlePanel publishes bracket spectator snapshots at roll start and settle", async () => {
  vi.useFakeTimers();

  const draft = createBracketBattleDraft(4);
  draft.participants = ["Alex", "Bri", "Cam", "Dev"];
  const session = createBracketBattleSessionFromDraft(draft, {
    now: () => 123,
    randomInt: (_min, max) => max
  });
  const sessionStates: Array<{
    rolling: boolean;
    showcaseMatchId: string | null;
    rollCount: number;
    publishLive: boolean;
  }> = [];
  const vm = {
    bracketSession: session,
    activeBracketMatch: session.matches[0],
    queuedBracketMatch: session.matches[0],
    bracketRolling: false,
    bracketLastRolls: [],
    bracketRollPreview: [],
    bracketShowcaseMatchId: session.matches[0]!.id,
    wheelMode: "live",
    $el: null,
    $refs: {},
    $emit(eventName: string, payload: unknown) {
      if (eventName !== "session-state") return;
      const state = payload as {
        rolling: boolean;
        showcaseMatchId: string | null;
        lastRolls: unknown[];
        publishLive: boolean;
      };
      sessionStates.push({
        rolling: state.rolling,
        showcaseMatchId: state.showcaseMatchId,
        rollCount: Array.isArray(state.lastRolls) ? state.lastRolls.length : 0,
        publishLive: state.publishLive
      });
    },
    persistBracketSession() {},
    clearBracketRollAnimation: BracketBattlePanel.methods!.clearBracketRollAnimation,
    emitBracketBattleSessionState: BracketBattlePanel.methods!.emitBracketBattleSessionState,
    getBracketBattleRollSlotAnchors: BracketBattlePanel.methods!.getBracketBattleRollSlotAnchors,
    isBracketFinalMatch: BracketBattlePanel.methods!.isBracketFinalMatch,
    bracketParticipantLabel: BracketBattlePanel.methods!.bracketParticipantLabel,
    syncBracketBattleParentState: BracketBattlePanel.methods!.syncBracketBattleParentState,
    publishLiveBracketSpectatorSnapshot: BracketBattlePanel.methods!.publishLiveBracketSpectatorSnapshot,
    t(key: string) {
      return key;
    }
  };

  BracketBattlePanel.methods!.rollActiveBracketMatch.call(vm as never);

  assert.deepEqual(sessionStates.at(-1), {
    rolling: true,
    showcaseMatchId: session.matches[0]!.id,
    rollCount: 0,
    publishLive: true
  });

  await nextTick();
  await vi.advanceTimersByTimeAsync(1_100);

  const livePublishes = sessionStates.filter((entry) => entry.publishLive);
  assert.equal(livePublishes.length, 2);
  assert.equal(livePublishes[1]?.rolling, false);
  assert.equal(livePublishes[1]?.showcaseMatchId, session.matches[0]!.id);
  assert.ok((livePublishes[1]?.rollCount ?? 0) >= 2);
});

test("BracketBattlePanel syncBracketBattleParentState emits a host state update instead of mutating a nested parent proxy", () => {
  const draft = createBracketBattleDraft(4);
  draft.participants = ["Alex", "Bri", "Cam", "Dev"];
  const session = createBracketBattleSessionFromDraft(draft, {
    now: () => 123,
    randomInt: (_min, max) => max
  });
  const emitted: Array<{ eventName: string; payload: unknown }> = [];
  const vm = {
    bracketSession: session,
    bracketLastRolls: [],
    bracketRolling: true,
    bracketShowcaseMatchId: session.matches[0]!.id,
    wheelMode: "live",
    $emit(eventName: string, payload: unknown) {
      emitted.push({ eventName, payload });
    },
    emitBracketBattleSessionState: BracketBattlePanel.methods!.emitBracketBattleSessionState,
    syncBracketBattleParentState: BracketBattlePanel.methods!.syncBracketBattleParentState
  };

  BracketBattlePanel.methods!.syncBracketBattleParentState.call(vm as never);

  assert.deepEqual(emitted, [{
    eventName: "session-state",
    payload: {
      session,
      lastRolls: [],
      rolling: true,
      showcaseMatchId: session.matches[0]!.id,
      publishLive: false
    }
  }]);
});

test("BracketBattlePanel emits session-state updates for the host live publisher", async () => {
  vi.useFakeTimers();

  const draft = createBracketBattleDraft(4);
  draft.participants = ["Alex", "Bri", "Cam", "Dev"];
  const session = createBracketBattleSessionFromDraft(draft, {
    now: () => 123,
    randomInt: (_min, max) => max
  });
  const emitted: Array<{ eventName: string; payload: unknown }> = [];
  const vm = {
    bracketSession: session,
    activeBracketMatch: session.matches[0],
    queuedBracketMatch: session.matches[0],
    bracketRolling: false,
    bracketLastRolls: [],
    bracketRollPreview: [],
    bracketShowcaseMatchId: session.matches[0]!.id,
    wheelMode: "live",
    $el: null,
    $refs: {},
    $emit(eventName: string, payload: unknown) {
      emitted.push({ eventName, payload });
    },
    persistBracketSession() {},
    clearBracketRollAnimation: BracketBattlePanel.methods!.clearBracketRollAnimation,
    emitBracketBattleSessionState: BracketBattlePanel.methods!.emitBracketBattleSessionState,
    getBracketBattleRollSlotAnchors: BracketBattlePanel.methods!.getBracketBattleRollSlotAnchors,
    isBracketFinalMatch: BracketBattlePanel.methods!.isBracketFinalMatch,
    bracketParticipantLabel: BracketBattlePanel.methods!.bracketParticipantLabel,
    syncBracketBattleParentState: BracketBattlePanel.methods!.syncBracketBattleParentState,
    publishLiveBracketSpectatorSnapshot: BracketBattlePanel.methods!.publishLiveBracketSpectatorSnapshot,
    t(key: string) {
      return key;
    }
  };

  BracketBattlePanel.methods!.rollActiveBracketMatch.call(vm as never);

  const startState = emitted.find((entry) => entry.eventName === "session-state");
  assert.ok(startState, "expected a host session-state event at roll start");

  await nextTick();
  await vi.advanceTimersByTimeAsync(1_100);

  const stateEvents = emitted.filter((entry) => entry.eventName === "session-state");
  assert.ok(stateEvents.length >= 2, "expected a host session-state event after settle");
});

test("BracketBattlePanel template renders the upgraded duel showcase", () => {
  const template = readFileSync("src/components/windows/game/bracket/BracketBattlePanel.html", "utf8");
  const css = readFileSync("src/components/windows/game/styles/bracket-battle.css", "utf8");

  assert.match(template, /bracket-battle-showcase/);
  assert.match(template, /bracket-battle-duel/);
  assert.match(template, /bracket-battle-score-value/);
  assert.match(template, /bracket-battle-duel-dice-slot/);
  assert.match(template, /bracketBattleWinnerLabel/);
  assert.match(template, /bracket-battle-last-rolls-label/);
  assert.match(template, /<details v-if="bracketSession\.awards\.length" class="bracket-battle-awards">/);
  assert.match(template, /bracket-battle-awards-summary/);
  assert.match(template, /bracket-battle-tree/);
  assert.match(template, /bracket-battle-match-node/);
  assert.match(template, /bracket-battle-match-connector/);
  assert.match(css, /\.bracket-battle-tree/);
  assert.match(css, /\.bracket-battle-match-connector/);
  assert.doesNotMatch(css, /\.bracket-battle-match\s*\{[\s\S]*min-height:\s*148px/);
  assert.doesNotMatch(template, /bracketMatchRollSummary\(match\)/);
  assert.doesNotMatch(css, /\.bracket-battle-tree-list\s*\{[^}]*min-height:\s*clamp/);
});

test("BracketBattlePanel groups latest rolls by duel and highlights the winning throw", () => {
  const draft = createBracketBattleDraft(4);
  draft.participants = ["Alex", "Bri", "Cam", "Dev"];
  const session = createBracketBattleSessionFromDraft(draft, {
    now: () => 123,
    randomInt: (_min, max) => max
  });
  const match = session.matches[0]!;
  const vm = {
    bracketSession: session,
    bracketLastRolls: [
      { id: "r1", matchId: match.id, participantId: match.participantAId!, value: 4, rollNumber: 1, tiebreakerIndex: 0 },
      { id: "r2", matchId: match.id, participantId: match.participantBId!, value: 4, rollNumber: 1, tiebreakerIndex: 0 },
      { id: "r3", matchId: match.id, participantId: match.participantAId!, value: 1, rollNumber: 2, tiebreakerIndex: 1 },
      { id: "r4", matchId: match.id, participantId: match.participantBId!, value: 6, rollNumber: 2, tiebreakerIndex: 1 }
    ],
    bracketParticipantLabel: BracketBattlePanel.methods!.bracketParticipantLabel,
    bracketRollColorTone: BracketBattlePanel.methods!.bracketRollColorTone,
    t(key: string) {
      return key;
    }
  };

  const groups = BracketBattlePanel.methods!.bracketLatestRollDuelGroups.call(vm as never);

  assert.deepEqual(groups.map((group) => ({
    id: group.id,
    tied: group.tied,
    entries: group.entries.map((entry) => ({
      label: entry.label,
      value: entry.value,
      tone: entry.tone,
      winner: entry.winner
    }))
  })), [
    {
      id: `${match.id}-1`,
      tied: true,
      entries: [
        { label: "Alex", value: 4, tone: "dark", winner: false },
        { label: "Bri", value: 4, tone: "light", winner: false }
      ]
    },
    {
      id: `${match.id}-2`,
      tied: false,
      entries: [
        { label: "Alex", value: 1, tone: "dark", winner: false },
        { label: "Bri", value: 6, tone: "light", winner: true }
      ]
    }
  ]);
});

test("BracketBattlePanel exposes clear live match status, next action, and progress copy", () => {
  const draft = createBracketBattleDraft(4);
  draft.participants = ["Alex", "Bri", "Cam", "Dev"];
  draft.prizes[0]!.label = "Match 1 prize";
  const session = createBracketBattleSessionFromDraft(draft, {
    now: () => 123,
    randomInt: (_min, max) => max
  });
  const match = session.matches[0]!;
  const messages: string[] = [];
  const vm = {
    bracketSession: session,
    activeBracketMatch: match,
    queuedBracketMatch: match,
    bracketRolling: false,
    bracketParticipantLabel: BracketBattlePanel.methods!.bracketParticipantLabel,
    bracketPrizeLabel: BracketBattlePanel.methods!.bracketPrizeLabel,
    t(key: string, params?: Record<string, string | number | null | undefined>) {
      messages.push(`${key}:${JSON.stringify(params ?? {})}`);
      return `${key}:${params ? Object.values(params).join("|") : ""}`;
    }
  };

  assert.equal(
    BracketBattlePanel.methods!.bracketDuelStatusLabel.call(vm as never),
    "bracketBattleReadyLabel:"
  );
  assert.equal(
    BracketBattlePanel.methods!.bracketRollButtonLabel.call(vm as never),
    "bracketBattleRollAction:"
  );

  match.status = "complete";
  match.winnerParticipantId = match.participantBId;
  session.matches[1]!.status = "active";
  vm.queuedBracketMatch = session.matches[1]!;

  assert.equal(
    BracketBattlePanel.methods!.bracketDuelStatusLabel.call(vm as never),
    "bracketBattleMatchWonLabel:Bri|Match 1 prize"
  );
  assert.equal(
    BracketBattlePanel.methods!.bracketRollButtonLabel.call(vm as never),
    "bracketBattleNextMatchAction:"
  );
  assert.equal(
    BracketBattlePanel.methods!.bracketProgressSummary.call(vm as never),
    "bracketBattleProgressSummary:1|3|1|0"
  );
  assert.ok(messages.some((entry) => entry.startsWith("bracketBattleMatchWonLabel:")));
});

test("BracketBattlePanel advances to the next match before allowing the next roll", async () => {
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

  const published: boolean[] = [];
  let rollCalls = 0;
  let anchorRefreshes = 0;
  const vm = {
    bracketSession: session,
    activeBracketMatch: matchOne,
    queuedBracketMatch: matchTwo,
    bracketRolling: false,
    bracketShowcaseMatchId: matchOne.id,
    advanceBracketBattleToQueuedMatch: BracketBattlePanel.methods!.advanceBracketBattleToQueuedMatch,
    rollActiveBracketMatch() {
      rollCalls += 1;
    },
    syncBracketBattleParentState() {
      published.push(false);
    },
    publishLiveBracketSpectatorSnapshot() {
      this.syncBracketBattleParentState();
      published.push(true);
    },
    refreshBracketBattleDiceAnchors() {
      anchorRefreshes += 1;
    }
  };

  BracketBattlePanel.methods!.runBracketBattlePrimaryAction.call(vm as never);
  await nextTick();

  assert.equal(vm.bracketShowcaseMatchId, matchTwo.id);
  assert.equal(rollCalls, 0);
  assert.deepEqual(published, [false, true]);
  assert.equal(anchorRefreshes, 1);

  vm.activeBracketMatch = matchTwo;
  BracketBattlePanel.methods!.runBracketBattlePrimaryAction.call(vm as never);

  assert.equal(rollCalls, 1);
});

test("GameWindow template keeps bracket panel and spectator dialog available in fullscreen/live bracket", () => {
  const template = readFileSync("src/components/windows/game/coordinator/GameWindow.html", "utf8");

  assert.doesNotMatch(template, /<bracket-battle-panel\s+v-if="!wheelPresentationMode"/);
  assert.match(template, /<bracket-battle-panel[\s\S]*@overlay-command="setGameStageOverlayCommand"/);
  assert.match(template, /<bracket-battle-panel[\s\S]*@session-state="syncBracketBattleState"/);
  assert.doesNotMatch(template, /<game-spectator-dialog v-if="!wheelIsBracketBattle"/);
});

test("BracketBattlePanel keeps separate preview and live storage and publishes spectator snapshots in both modes", async () => {
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem(key: string) {
      return stored.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      stored.set(key, value);
    },
    removeItem(key: string) {
      stored.delete(key);
    }
  });

  const draft = createBracketBattleDraft(4);
  draft.participants = ["Alex", "Bri", "Cam", "Dev"];
  draft.prizes[0]!.label = "Match 1 prize";
  draft.prizes[1]!.label = "Match 2 prize";
  draft.prizes[2]!.label = "Final prize";

  const published: boolean[] = [];
  const baseVm = {
    bracketDraft: draft,
    bracketSession: null,
    bracketLastRolls: [],
    bracketShowcaseMatchId: null,
    bracketRollIntervalId: null,
    bracketRollResolveTimeoutId: null,
    activeScopeType: "personal",
    activeWorkspaceId: null,
    activeWheelConfigId: 7,
    canStartBracketBattle: true,
    getBracketBattleRollSlotAnchors() {
      return {};
    },
    $emit(eventName: string, payload: unknown) {
      if (eventName !== "session-state") return;
      const state = payload as { publishLive?: boolean };
      published.push(state.publishLive === true);
    },
    clearBracketRollAnimation: BracketBattlePanel.methods!.clearBracketRollAnimation,
    emitBracketBattleSessionState: BracketBattlePanel.methods!.emitBracketBattleSessionState,
    persistBracketSession: BracketBattlePanel.methods!.persistBracketSession,
    publishLiveBracketSpectatorSnapshot: BracketBattlePanel.methods!.publishLiveBracketSpectatorSnapshot,
    syncBracketBattleParentState: BracketBattlePanel.methods!.syncBracketBattleParentState
  };

  BracketBattlePanel.methods!.startBracketBattle.call({
    ...baseVm,
    wheelMode: "config"
  } as never);
  BracketBattlePanel.methods!.startBracketBattle.call({
    ...baseVm,
    wheelMode: "live"
  } as never);

  assert.equal(stored.size, 2);
  assert.ok([...stored.keys()].some((key) => key.endsWith("_7_preview")));
  assert.ok([...stored.keys()].some((key) => key.endsWith("_7_live")));
  assert.equal(published.filter((entry) => entry === true).length, 2);
});

test("BracketBattlePanel preview reset synchronizes cleared parent state without publication", async () => {
  const draft = createBracketBattleDraft(4);
  draft.participants = ["Alex", "Bri", "Cam", "Dev"];
  const session = createBracketBattleSessionFromDraft(draft);
  const states: Array<{ session: unknown; publishLive: boolean }> = [];
  const vm = {
    bracketSession: session,
    bracketLastRolls: session.rolls,
    bracketRolling: false,
    bracketShowcaseMatchId: session.matches[0]!.id,
    bracketResetDialog: true,
    bracketRollPreview: [],
    bracketRollIntervalId: null,
    bracketRollResolveTimeoutId: null,
    wheelMode: "config",
    clearBracketRollAnimation: BracketBattlePanel.methods!.clearBracketRollAnimation,
    emitBracketBattleSessionState: BracketBattlePanel.methods!.emitBracketBattleSessionState,
    syncBracketBattleParentState: BracketBattlePanel.methods!.syncBracketBattleParentState,
    publishLiveBracketSpectatorSnapshot: BracketBattlePanel.methods!.publishLiveBracketSpectatorSnapshot,
    persistBracketSession() {},
    getBracketBattleRollSlotAnchors() { return {}; },
    getBracketBattleActionDiceAnchors() { return {}; },
    getBracketBattleChampionWinnerSide() { return null; },
    $emit(eventName: string, payload: unknown) {
      if (eventName === "session-state") states.push(payload as { session: unknown; publishLive: boolean });
    }
  };

  BracketBattlePanel.methods!.resetBracketBattle.call(vm as never);
  await Promise.resolve();

  assert.equal(states.at(-1)?.session, null);
  assert.equal(states.some((state) => state.publishLive), false);
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

  const vm: any = {
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
  assert.deepEqual(vm.bracketSession?.rolls.map((roll: any) => roll.value), [6, 1]);
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
  await nextTick();
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

test("BracketBattlePanel refreshBracketBattleDiceAnchors emits an anchor update after layout changes", () => {
  const draft = createBracketBattleDraft(4);
  draft.participants = ["Alex", "Bri", "Cam", "Dev"];
  const session = createBracketBattleSessionFromDraft(draft, {
    now: () => 123,
    randomInt: (_min, max) => max
  });
  const overlayEvents: Array<{ eventName: string; payload: unknown }> = [];
  const surfaceRect = {
    left: 0,
    top: 0,
    width: 360,
    height: 640
  };
  const leftRollRect = {
    left: 32,
    top: 180,
    width: 120,
    height: 92
  };
  const rightRollRect = {
    left: 208,
    top: 180,
    width: 120,
    height: 92
  };
  const vm = {
    bracketSession: session,
    activeBracketMatch: session.matches[0],
    bracketRolling: false,
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
    getBracketBattleRollSlotAnchors: BracketBattlePanel.methods!.getBracketBattleRollSlotAnchors,
    getBracketBattleActionDiceAnchors: BracketBattlePanel.methods!.getBracketBattleActionDiceAnchors
  };

  BracketBattlePanel.methods!.refreshBracketBattleDiceAnchors.call(vm as never);

  assert.deepEqual(overlayEvents, [{
    eventName: "overlay-command",
    payload: {
      type: "anchorUpdate",
      effect: "dice",
      leftAnchor: {
        x: 0.2556,
        y: 0.3531,
        size: 0.2444
      },
      rightAnchor: {
        x: 0.7444,
        y: 0.3531,
        size: 0.2444
      }
    }
  }]);
});
