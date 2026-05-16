import assert from "node:assert/strict";
import { test } from "vitest";
import { gameStageComputeds } from "../src/components/windows/game/stage/gameStageComputeds.ts";

test("wheel spectator labels explain recap restart flow", () => {
  const endedVm = {
    preferredLanguage: "en",
    gameSpectatorSessionStatus: "ended",
    gameSpectatorConnectedCount: 0
  };
  const liveVm = {
    preferredLanguage: "en",
    gameSpectatorSessionStatus: "live",
    gameSpectatorConnectedCount: 3
  };

  assert.equal(
    gameStageComputeds.gameSpectatorActionLabel.call(endedVm),
    "Spectator recap"
  );
  assert.match(
    gameStageComputeds.gameSpectatorDialogHint.call(endedVm),
    /brand new spectator link/i
  );
  assert.equal(
    gameStageComputeds.gameSpectatorStartButtonLabel.call(endedVm),
    "Start new spectator mode"
  );
  assert.equal(
    gameStageComputeds.gameSpectatorActionLabel.call(liveVm),
    "3 Spectators"
  );
});



