import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";

test("spectator page has a bracket-specific render branch and compact tree hooks", () => {
  const entry = readFileSync("src/spectator-main.ts", "utf8");
  const appSource = readFileSync("src/spectator/SpectatorApp.vue", "utf8");
  const renderSource = readFileSync("src/spectator/BracketSpectatorView.vue", "utf8");
  const formattingSource = readFileSync("src/spectator/spectatorFormatting.ts", "utf8");
  const realtimeSource = readFileSync("src/spectator/realtime/spectatorRealtimeClient.ts", "utf8");
  const css = readFileSync("src/styles/spectator.css", "utf8");

  assert.match(entry, /mountSpectatorApp/);
  assert.match(appSource, /BracketSpectatorView/);
  assert.match(realtimeSource, /game\.public-session\.updated/);
  assert.match(realtimeSource, /wheel\.public-session\.updated/);
  assert.match(renderSource, /spectator-bracket-duel/);
  assert.match(renderSource, /spectator-bracket-dice-tile/);
  assert.match(renderSource, /spectator-bracket-tree/);
  assert.match(formattingSource, /value == null/);
  assert.doesNotMatch(renderSource, /createGameStageOverlayScene/);
  assert.match(css, /\.spectator-bracket-duel/);
  assert.match(css, /\.spectator-bracket-dice-tile/);
  assert.match(css, /\.spectator-bracket-tree/);
});
