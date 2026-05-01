import assert from "node:assert/strict";
import { test } from "vitest";
import { wheelStageComputeds } from "../src/components/windows/wheel/stage/wheelStageComputeds.ts";

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
    wheelStageComputeds.wheelSpectatorActionLabel.call(endedVm),
    "Spectator recap"
  );
  assert.match(
    wheelStageComputeds.wheelSpectatorDialogHint.call(endedVm),
    /brand new spectator link/i
  );
  assert.equal(
    wheelStageComputeds.wheelSpectatorStartButtonLabel.call(endedVm),
    "Start new spectator mode"
  );
  assert.equal(
    wheelStageComputeds.wheelSpectatorActionLabel.call(liveVm),
    "3 Spectators"
  );
});
