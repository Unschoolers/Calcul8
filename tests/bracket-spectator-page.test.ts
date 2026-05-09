import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";

test("spectator page has a bracket-specific render branch and compact tree hooks", () => {
  const source = readFileSync("src/spectator-main.ts", "utf8");
  const css = readFileSync("src/styles/spectator.css", "utf8");

  assert.match(source, /snapshot\.gameType === "bracket"/);
  assert.match(source, /renderBracketState/);
  assert.match(source, /spectator-bracket-duel/);
  assert.match(source, /spectator-bracket-dice-tile/);
  assert.match(source, /spectator-bracket-tree/);
  assert.match(source, /value == null/);
  assert.doesNotMatch(source, /createGameStageOverlayScene/);
  assert.match(css, /\.spectator-bracket-duel/);
  assert.match(css, /\.spectator-bracket-dice-tile/);
  assert.match(css, /\.spectator-bracket-tree/);
});
