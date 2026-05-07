import assert from "node:assert/strict";
import { test } from "vitest";
import { gameStageComputeds } from "../src/components/windows/game/stage/gameStageComputeds.ts";

test("wheel spectator labels explain recap restart flow", () => {
  const endedVm = {
    preferredLanguage: "en",
    wheelSpectatorSessionStatus: "ended",
    wheelSpectatorConnectedCount: 0
  };
  const liveVm = {
    preferredLanguage: "en",
    wheelSpectatorSessionStatus: "live",
    wheelSpectatorConnectedCount: 3
  };

  assert.equal(
    gameStageComputeds.wheelSpectatorActionLabel.call(endedVm),
    "Spectator recap"
  );
  assert.match(
    gameStageComputeds.wheelSpectatorDialogHint.call(endedVm),
    /brand new spectator link/i
  );
  assert.equal(
    gameStageComputeds.wheelSpectatorStartButtonLabel.call(endedVm),
    "Start new spectator mode"
  );
  assert.equal(
    gameStageComputeds.wheelSpectatorActionLabel.call(liveVm),
    "3 Spectators"
  );
});



