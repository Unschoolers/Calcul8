import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import {
  buildGameSpectatorSessionUrl,
  buildGameSpectatorSnapshot,
  normalizeGamePublicSessionId
} from "../src/components/windows/game/services/gameSpectator.ts";
import { createGameWindowState } from "../src/components/windows/game/coordinator/gameControllerState.ts";
import {
  createBracketBattleSession,
  resolveBracketBattleMatchRoll
} from "../src/components/windows/game/bracket/bracketBattleDomain.ts";
import { buildSlotsFromConfig } from "../src/components/windows/game/services/wheelSlots.ts";
import type { WheelConfig } from "../src/types/app.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("game spectator session ids are normalized for generated links", () => {
  vi.stubGlobal("window", {
    location: {
      href: "https://app.whatfees.ca/spectator.html?session=AbC123"
    }
  });

  assert.equal(normalizeGamePublicSessionId(" AbC123 "), "abc123");
  assert.equal(
    buildGameSpectatorSessionUrl(" AbC123 "),
    "https://app.whatfees.ca/spectator.html?session=abc123"
  );
});

test("buildGameSpectatorSnapshot publishes a viewer-safe bracket snapshot", () => {
  const config: WheelConfig = {
    id: 70,
    name: "Saturday Bracket",
    spinPrice: 0,
    targetMargin: 0,
    gameType: "bracket",
    outcomeCount: 0,
    gridCellCount: 0,
    createdAt: "2026-05-09T00:00:00.000Z",
    tiers: [],
    bracketBattle: {
      participantCount: 4,
      participants: ["Alex", "Bri", "Cam", "Dev"],
      prizes: []
    }
  };
  const session = createBracketBattleSession({
    name: "Saturday Bracket",
    participantCount: 4,
    participants: ["Alex", "Bri", "Cam", "Dev"],
    prizes: [
      { label: "Match 1 prize" },
      { label: "Match 2 prize" },
      { label: "Final prize" }
    ],
    now: () => 1_000,
    randomInt: (_min, max) => max
  });
  const result = resolveBracketBattleMatchRoll(
    session,
    session.matches[0]!.id,
    (() => {
      const values = [6, 4];
      return () => values.shift() ?? 4;
    })(),
    () => 2_000
  );
  const vm = createGameWindowState() as Record<string, any>;
  vm.activeWheelConfig = config;
  vm.wheelDisplayConfig = config;
  vm.wheelMode = "live";
  vm.bracketBattleSession = session;
  vm.bracketBattleLastRolls = result.rolls;
  vm.bracketBattleRolling = false;
  vm.bracketBattleShowcaseMatchId = session.matches[0]!.id;

  const snapshot = buildGameSpectatorSnapshot(vm, "live");

  assert.equal(snapshot.gameType, "bracket");
  assert.equal(snapshot.gameName, "Saturday Bracket");
  assert.equal(snapshot.bracket?.activeMatch?.id, session.matches[0]!.id);
  assert.equal(snapshot.bracket?.activeMatch?.status, "complete");
  assert.equal(snapshot.bracket?.activeMatch?.participantAResult, 6);
  assert.equal(snapshot.bracket?.activeMatch?.participantBResult, 4);
  assert.equal(snapshot.outcomeSlots.length, 0);
  assert.equal(snapshot.chaseBoard.length, 0);
});

test("buildGameSpectatorSnapshot includes mystery grid cells without wheel-prefixed output fields", () => {
  const config: WheelConfig = {
    id: 6,
    name: "Grid Night",
    spinPrice: 10,
    targetMargin: 20,
    gameType: "grid",
    outcomeCount: 25,
    gridCellCount: 25,
    createdAt: "2026-04-18T00:00:00.000Z",
    tiers: [{
      id: "floor",
      label: "Floor",
      color: "#2563eb",
      chancePercent: 100,
      slots: 100,
      costPerTier: 4,
      packsCount: 1,
      deductionType: "packs",
      sets: []
    }]
  };
  const vm = createGameWindowState() as Record<string, any>;
  const activeSlots = buildSlotsFromConfig(config);
  vm.activeWheelConfig = config;
  vm.wheelMode = "live";
  vm.activeWheelSlots = activeSlots;
  vm.wheelSpinCounts = new Array(activeSlots.length).fill(0);
  vm.wheelTotalSpins = 1;
  vm.wheelGridReveals = [{
    cellIndex: 4,
    slotIndex: 4,
    label: "Floor",
    color: "#2563eb",
    tier: "floor",
    spinNumber: 1,
    timestamp: 1_000
  }];
  vm.wheelGridRevealAnimating = true;
  vm.wheelGridHighlightCellIndex = 7;

  const snapshot = buildGameSpectatorSnapshot(vm, "live");

  assert.equal(snapshot.gameType, "grid");
  assert.equal(snapshot.isSpinning, true);
  assert.equal(snapshot.boardCells?.length, 25);
  assert.equal(snapshot.boardCells?.[4]?.revealed, true);
  assert.equal(snapshot.boardHighlightCellIndex, 7);
  assert.equal("wheelSlots" in snapshot, false);
  assert.equal("gridCells" in snapshot, false);
});

test("buildGameSpectatorSnapshot prefers displayed grid config over stale active config", () => {
  const activeConfig: WheelConfig = {
    id: 7,
    name: "Grid",
    spinPrice: 10,
    targetMargin: 20,
    gameType: "wheel",
    outcomeCount: 36,
    createdAt: "2026-04-18T00:00:00.000Z",
    tiers: []
  };
  const displayedGridConfig: WheelConfig = {
    ...activeConfig,
    gameType: "grid",
    gridCellCount: 36,
    tiers: [{
      id: "hit",
      label: "Hit",
      color: "#f59e0b",
      chancePercent: 100,
      slots: 100,
      costPerTier: 20,
      packsCount: 1,
      deductionType: "none",
      sets: []
    }]
  };
  const vm = createGameWindowState() as Record<string, any>;
  const activeSlots = buildSlotsFromConfig(displayedGridConfig);
  vm.activeWheelConfig = activeConfig;
  vm.wheelDisplayConfig = displayedGridConfig;
  vm.wheelMode = "live";
  vm.activeWheelSlots = activeSlots;
  vm.wheelSpinCounts = new Array(activeSlots.length).fill(0);

  const snapshot = buildGameSpectatorSnapshot(vm, "live");

  assert.equal(snapshot.gameType, "grid");
  assert.equal(snapshot.boardCells?.length, 36);
});

test("buildGameSpectatorSnapshot keeps preview grid reveals in spectator mode", () => {
  const config: WheelConfig = {
    id: 8,
    name: "Preview Grid",
    spinPrice: 10,
    targetMargin: 20,
    gameType: "grid",
    outcomeCount: 25,
    gridCellCount: 25,
    createdAt: "2026-04-18T00:00:00.000Z",
    tiers: [{
      id: "floor",
      label: "Floor",
      color: "#2563eb",
      chancePercent: 100,
      slots: 100,
      costPerTier: 4,
      packsCount: 1,
      deductionType: "packs",
      sets: []
    }]
  };
  const vm = createGameWindowState() as Record<string, any>;
  const previewSlots = buildSlotsFromConfig(config);
  vm.editingWheelConfig = config;
  vm.activeWheelConfig = config;
  vm.wheelMode = "config";
  vm.wheelPreviewSlots = previewSlots;
  vm.wheelPreviewSpinCounts = new Array(previewSlots.length).fill(0);
  vm.wheelPreviewTotalSpins = 1;
  vm.wheelPreviewGridReveals = [{
    cellIndex: 3,
    slotIndex: 3,
    label: "Floor",
    color: "#2563eb",
    tier: "floor",
    spinNumber: 1,
    timestamp: 1_000
  }];

  const snapshot = buildGameSpectatorSnapshot(vm, "live");

  assert.equal(snapshot.gameType, "grid");
  assert.equal(snapshot.boardCells?.[3]?.revealed, true);
  assert.equal(snapshot.boardCells?.[3]?.label, "Floor");
});
