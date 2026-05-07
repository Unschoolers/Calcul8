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
});

test("app shell renders the generic game window with the existing wheel ref", () => {
  const template = readFileSync("src/App.html", "utf8");

  assert.match(template, /<game-window ref="wheelWindow"/);
  assert.doesNotMatch(template, /<wheel-window ref="wheelWindow"/);
});


