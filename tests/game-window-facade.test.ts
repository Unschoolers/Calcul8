import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  assert.equal(typeof GameWindow.methods?.selectBracketBattleGame, "undefined");
});

test("app shell renders the generic game window with the existing wheel ref", () => {
  const template = readFileSync("src/App.html", "utf8");

  assert.match(template, /<game-window ref="wheelWindow"/);
  assert.doesNotMatch(template, /<wheel-window ref="wheelWindow"/);
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
});

test("selecting an existing Wheel or Mystery Grid config exits Bracket Battle", () => {
  const watcher = String(GameWindow.watch?.activeWheelConfigId ?? "");

  assert.doesNotMatch(watcher, /gameSurfaceMode/);
});


