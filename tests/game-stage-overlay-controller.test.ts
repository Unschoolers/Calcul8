import assert from "node:assert/strict";
import { test } from "vitest";
import {
  createGameWindowState,
  getGameWindowLocalKeys
} from "../src/components/windows/game/coordinator/gameControllerState.ts";
import { createGameStageOverlayController } from "../src/components/windows/game/overlay/gameStageOverlayController.ts";
import {
  createGameStageOverlayClearCommand,
  createGameStageOverlayIdleCommand,
  type GameStageOverlayCommand
} from "../src/components/windows/game/overlay/gameStageOverlayTypes.ts";

test("game window state exposes overlay shell defaults", () => {
  const state = createGameWindowState();

  assert.equal(state.gameStageOverlayEnabled, false);
  assert.equal(state.gameStageOverlayMounted, false);
  assert.equal(state.gameStageOverlayActiveCommand, null);
  assert.equal(state.gameStageOverlayLastResolvedAt, 0);
  assert.deepEqual(createGameStageOverlayIdleCommand(), {
    type: "enterIdle",
    effect: "dice"
  });
  assert.deepEqual(createGameStageOverlayClearCommand(), {
    type: "clear",
    effect: "dice"
  });
});

test("game window local keys include overlay shell state", () => {
  const keys = getGameWindowLocalKeys();

  assert.ok(keys.includes("gameStageOverlayEnabled"));
  assert.ok(keys.includes("gameStageOverlayMounted"));
  assert.ok(keys.includes("gameStageOverlayActiveCommand"));
  assert.ok(keys.includes("gameStageOverlayLastResolvedAt"));
});

test("overlay controller mounts cleared, dispatches commands, and suppresses calls outside mount", () => {
  const calls: string[] = [];
  const payloads: GameStageOverlayCommand[] = [];
  const controller = createGameStageOverlayController({
    scene: {
      enterIdle() {
        calls.push("idle");
      },
      clear() {
        calls.push("clear");
      },
      stageEnter(command) {
        calls.push("stage-enter");
        payloads.push(command as GameStageOverlayCommand);
      },
      stageExit(command) {
        calls.push("stage-exit");
        payloads.push(command as GameStageOverlayCommand);
      },
      startRoll(command) {
        calls.push("start");
        payloads.push(command);
      },
      resolveRoll(command) {
        calls.push("resolve");
        payloads.push(command);
      },
      dispose() {
        calls.push("dispose");
      }
    }
  });

  controller.dispatch({
    type: "rollMatchStart",
    effect: "dice",
    leftLabel: "A",
    rightLabel: "B"
  });
  controller.mount();
  controller.dispatch({
    type: "stageEnter",
    effect: "dice"
  });
  controller.dispatch({
    type: "rollMatchStart",
    effect: "dice",
    leftLabel: "A",
    rightLabel: "B"
  });
  controller.dispatch({
    type: "clear",
    effect: "dice"
  });
  controller.dispatch({
    type: "stageExit",
    effect: "dice"
  });
  controller.dispatch({
    type: "rollMatchResolve",
    effect: "dice",
    leftValue: 6,
    rightValue: 4,
    winnerSide: "left",
    winnerLabel: "A",
    finalMatch: true
  });
  controller.unmount();
  controller.dispatch({
    type: "enterIdle",
    effect: "dice"
  });

  assert.deepEqual(calls, [
    "clear",
    "stage-enter",
    "start",
    "clear",
    "stage-exit",
    "resolve",
    "dispose"
  ]);
  assert.deepEqual(payloads, [
    {
      type: "stageEnter",
      effect: "dice"
    },
    {
      type: "rollMatchStart",
      effect: "dice",
      leftLabel: "A",
      rightLabel: "B"
    },
    {
      type: "stageExit",
      effect: "dice"
    },
    {
      type: "rollMatchResolve",
      effect: "dice",
      leftValue: 6,
      rightValue: 4,
      winnerSide: "left",
      winnerLabel: "A",
      finalMatch: true
    }
  ]);
});
