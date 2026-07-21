import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "vitest";
import { GameWindow } from "../src/components/windows/game/GameWindow.ts";

test("GameWindow owns the tier-prize game shell behavior", () => {
  assert.equal(GameWindow.name, "GameWindow");
  assert.equal(typeof GameWindow.data, "function");
  assert.equal(typeof GameWindow.methods?.runWheelPrimarySpin, "function");
  assert.equal(typeof GameWindow.computed?.wheelStageTitle, "function");
  assert.ok(GameWindow.components?.MysteryGridSurface);
  assert.ok(GameWindow.components?.WheelActionRail);
  assert.notEqual(typeof GameWindow.methods?.createNewGameConfig, "undefined");
  assert.equal(typeof (GameWindow.methods as Record<string, unknown> | undefined)?.selectBracketBattleGame, "undefined");
});

test("app shell renders the generic game window with the existing wheel ref", () => {
  const template = readFileSync("src/App.html", "utf8");

  assert.match(template, /<game-window ref="wheelWindow"/);
  assert.doesNotMatch(template, /<wheel-window ref="wheelWindow"/);
});

test("legacy WheelWindow module facades are removed", () => {
  assert.equal(existsSync("src/components/windows/game/WheelWindow.ts"), false);
  assert.equal(existsSync("src/components/windows/game/WheelWindow.vue"), false);
  assert.equal(existsSync("src/components/windows/wheel/WheelWindow.ts"), false);
  assert.equal(existsSync("src/components/windows/wheel/WheelWindow.vue"), false);
});

test("the unused wheelHelpers barrel is removed", () => {
  assert.equal(existsSync("src/components/windows/game/services/wheelHelpers.ts"), false);
});

test("game modules do not expose unused legacy and pricing APIs", () => {
  const controllerState = readFileSync("src/components/windows/game/coordinator/gameControllerState.ts", "utf8");
  const pricing = readFileSync("src/components/windows/game/services/wheelPricing.ts", "utf8");
  const grid = readFileSync("src/components/windows/game/commands/mysteryGridMethods.ts", "utf8");
  assert.doesNotMatch(controllerState, /WheelWindowThis|getWheelWindowLocalKeys|createWheelWindowState/);
  assert.doesNotMatch(pricing, /calculateAverageWheelBuyerShippingPerSpin|calculateAverageWheelSellingTaxPercent|calculateWheelBuyerShippingTotal/);
  assert.doesNotMatch(grid, /resolveMysteryGridCellSlotIndex/);
});

test("game window children use the game context without the wheelCtx compatibility bridge", () => {
  const definition = readFileSync("src/components/windows/game/coordinator/GameWindow.definition.ts", "utf8");
  const contextConsumers = [
    "src/components/windows/game/dialogs/WheelCreateGameDialog.ts",
    "src/components/windows/game/dialogs/GameSpectatorDialog.ts",
    "src/components/windows/game/stage/WheelStageTopbar.ts",
    "src/components/windows/game/stage/WheelStageSummary.ts",
    "src/components/windows/game/stage/MysteryGridSurface.ts",
    "src/components/windows/game/bracket/BracketBattleBuilder.ts",
    "src/components/windows/game/inspector/WheelInspector.ts",
    "src/components/windows/game/inspector/WheelTierCard.ts"
  ];

  assert.match(definition, /gameCtx: this/);
  assert.doesNotMatch(definition, /wheelCtx:/);
  for (const file of contextConsumers) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /["']wheelCtx["']/);
    assert.doesNotMatch(source, /injectedWheelCtx/);
  }
});

test("game spectator host state keeps wheel-named fields inside the storage compatibility adapter only", () => {
  const checkedFiles = [
    "src/components/windows/game/GameWindow.ts",
    "src/components/windows/game/coordinator/GameWindow.definition.ts",
    "src/components/windows/game/coordinator/gameControllerState.ts",
    "src/components/windows/game/commands/gameSpectatorMethods.ts",
    "src/components/windows/game/commands/mysteryGridMethods.ts",
    "src/components/windows/game/commands/wheelSessionMethods.ts",
    "src/components/windows/game/commands/wheelSpinMethods.ts",
    "src/components/windows/game/services/gameSpectator.ts",
    "src/components/windows/game/services/wheelSessionState.ts",
    "src/components/windows/game/stage/gameStageComputeds.ts",
    "src/components/windows/game/stage/WheelStageTopbar.html",
    "src/components/windows/game/dialogs/GameSpectatorDialog.html",
    "src/components/windows/game/dialogs/GameSpectatorDialog.ts",
    "src/components/windows/game/dialogs/GameSpectatorDialog.vue",
    "src/components/windows/game/bracket/BracketBattlePanel.ts",
    "src/components/windows/game/bracket/bracketBattleHostFlow.ts"
  ];

  for (const file of checkedFiles) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /wheelSpectator|WheelSpectator|wheel-spectator/);
  }
});

test("app shell lets the portfolio lot filter menu escape tab clipping", () => {
  const template = readFileSync("src/App.html", "utf8");

  assert.match(template, /tabs-window--allow-sticky[^}]+currentTab === 'portfolio'/);
});

test("create game dialog exposes Bracket Battle as a game type", () => {
  const template = readFileSync("src/components/windows/game/dialogs/WheelCreateGameDialog.html", "utf8");

  assert.match(template, /bracketBattleGameLabel/);
  assert.match(template, /createNewGameConfig\('bracket'\)/);
  assert.doesNotMatch(template, /selectBracketBattleGame/);
});

test("game window does not render a separate top-level game switcher", () => {
  const template = readFileSync("src/components/windows/game/coordinator/GameWindow.html", "utf8");

  assert.match(template, /<bracket-battle-panel/);
  assert.doesNotMatch(template, /game-surface-switch/);
  assert.doesNotMatch(template, /gameSurfaceTierPrizeLabel/);
});

test("Bracket Battle config renders in the normal builder section", () => {
  const template = readFileSync("src/components/windows/game/inspector/WheelInspector.html", "utf8");

  assert.match(template, /editingWheelConfig\.gameType === 'bracket'/);
  assert.match(template, /bracket-battle-builder/);
});

test("Bracket Battle renders inside the normal game chrome", () => {
  const template = readFileSync("src/components/windows/game/coordinator/GameWindow.html", "utf8");
  const bracketIndex = template.indexOf("<bracket-battle-panel");
  const topbarIndex = template.indexOf("<wheel-stage-topbar");

  assert.ok(topbarIndex >= 0);
  assert.ok(bracketIndex > topbarIndex);
});

test("Bracket Battle stage mounts the overlay shell inside the existing stage chrome", () => {
  const template = readFileSync("src/components/windows/game/coordinator/GameWindow.html", "utf8");

  assert.match(template, /<game-stage-overlay-shell/);
  assert.match(template, /:enabled="gameStageOverlayEnabled"/);
  assert.match(template, /:command="gameStageOverlayActiveCommand"/);
  assert.match(template, /@mounted-change="handleGameStageOverlayMountedChange"/);
  assert.equal(typeof GameWindow.methods?.syncBracketBattleState, "function");
});

test("GameWindow publishes bracket session-state updates through the spectator host flow in any mode", async () => {
  const publishes: Array<"starting" | "live" | "ended" | undefined> = [];
  const vm = {
    bracketBattleSession: null,
    bracketBattleLastRolls: [],
    bracketBattleRolling: false,
    bracketBattleShowcaseMatchId: null,
    wheelMode: "config",
    publishGameSpectatorSessionSnapshot(status?: "starting" | "live" | "ended") {
      publishes.push(status);
      return Promise.resolve();
    }
  };

  await GameWindow.methods!.syncBracketBattleState.call(vm as never, {
    session: { id: "session-1" } as never,
    lastRolls: [{ id: "roll-1", value: 6 }] as never,
    rolling: true,
    showcaseMatchId: "match-1",
    publishLive: true
  });

  assert.deepEqual(publishes, [undefined]);
  assert.deepEqual(vm.bracketBattleLastRolls, [{ id: "roll-1", value: 6 }]);
  assert.equal(vm.bracketBattleRolling, true);
  assert.equal(vm.bracketBattleShowcaseMatchId, "match-1");
});

test("GameWindow overlay state follows bracket host availability and clears stale dice commands", () => {
  const vm = {
    currentTab: "wheel",
    wheelIsBracketBattle: true,
    gameStageOverlayEnabled: false,
    gameStageOverlayMounted: false,
    gameStageOverlayActiveCommand: null as unknown,
    setGameStageOverlayCommand(command: unknown) {
      this.gameStageOverlayActiveCommand = command;
    }
  };

  GameWindow.methods!.syncGameStageOverlayState.call(vm as never);
  assert.equal(vm.gameStageOverlayEnabled, true);

  vm.gameStageOverlayMounted = true;
  vm.gameStageOverlayActiveCommand = { type: "stageEnter", effect: "dice" };
  vm.currentTab = "portfolio";
  GameWindow.methods!.syncGameStageOverlayState.call(vm as never);

  assert.equal(vm.gameStageOverlayEnabled, false);
  assert.equal(vm.gameStageOverlayMounted, false);
  assert.equal(vm.gameStageOverlayActiveCommand, null);
});

test("selecting an existing Wheel or Mystery Grid config exits Bracket Battle", () => {
  const watcher = String(GameWindow.watch?.activeWheelConfigId ?? "");

  assert.doesNotMatch(watcher, /gameSurfaceMode/);
});


