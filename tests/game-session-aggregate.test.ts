import assert from "node:assert/strict";
import { test } from "vitest";
import type { WheelFairnessEntry } from "../src/types/app.ts";
import {
  createGameSessionAggregate,
  reduceGameSession,
  selectGameSessionTrack
} from "../src/app-core/shared/game-session-aggregate.ts";
import {
  dispatchGameSessionCommand,
  executeGameSessionEffects
} from "../src/components/windows/game/services/gameSessionAggregateAdapter.ts";

const fairnessEntry = {
  spinNumber: 1,
  resultIndex: 0,
  resultLabel: "Prize",
  serverSeedHash: "hash",
  serverSeed: "seed",
  clientSeed: "client",
  layoutHash: "layout",
  algorithm: "whatfees-wheel-v1",
  verificationUrl: "https://example.com/proof",
  createdAt: 1
} as WheelFairnessEntry;

test("game session aggregate records preview and live spins through one reducer", () => {
  const initial = createGameSessionAggregate(2);
  const preview = reduceGameSession(initial, {
    type: "spin-recorded",
    execution: "preview",
    slotIndex: 1,
    slotCount: 2
  });
  const live = reduceGameSession(preview.state, {
    type: "spin-recorded",
    execution: "live",
    slotIndex: 0,
    slotCount: 2
  });

  assert.deepEqual(live.state.preview.spinCounts, [0, 1]);
  assert.equal(live.state.preview.totalSpins, 1);
  assert.deepEqual(live.state.live.spinCounts, [1, 0]);
  assert.equal(live.state.live.totalSpins, 1);
  assert.deepEqual(preview.effects, [{ type: "persist" }]);
  assert.deepEqual(live.effects, [{ type: "persist" }]);
});

test("game session aggregate applies fairness and resets to either execution track", () => {
  const recorded = reduceGameSession(createGameSessionAggregate(1), {
    type: "fairness-recorded",
    execution: "live",
    entry: fairnessEntry
  });
  const reset = reduceGameSession(recorded.state, {
    type: "session-reset",
    execution: "live",
    slotCount: 3
  });

  assert.equal(recorded.state.live.fairnessHistory.length, 1);
  assert.equal(recorded.state.preview.fairnessHistory.length, 0);
  assert.deepEqual(reset.state.live.spinCounts, [0, 0, 0]);
  assert.equal(reset.state.live.totalSpins, 0);
  assert.deepEqual(reset.state.live.fairnessHistory, []);
  assert.deepEqual(reset.effects, [{ type: "persist" }, { type: "publish" }]);
});

test("game session aggregate rejects an invalid spin without effects", () => {
  const initial = createGameSessionAggregate(2);
  const result = reduceGameSession(initial, {
    type: "spin-recorded",
    execution: "live",
    slotIndex: 4,
    slotCount: 2
  });

  assert.equal(result.state, initial);
  assert.deepEqual(result.effects, []);
});

test("game session aggregate selects the active execution track", () => {
  const aggregate = reduceGameSession(createGameSessionAggregate(1), {
    type: "spin-recorded",
    execution: "preview",
    slotIndex: 0,
    slotCount: 1
  }).state;

  assert.equal(selectGameSessionTrack(aggregate, "preview").totalSpins, 1);
  assert.equal(selectGameSessionTrack(aggregate, "live").totalSpins, 0);
});

test("game session adapter projects reducer state back to the legacy Vue host", () => {
  const host = { wheelSpinCounts: [0, 0], wheelTotalSpins: 0 };
  const controller = {
    previewSpinCounts: [0, 0],
    previewTotalSpins: 0,
    previewFairnessHistory: [],
    fairnessHistory: []
  };

  const effects = dispatchGameSessionCommand(host, controller, {
    type: "spin-recorded",
    execution: "live",
    slotIndex: 1,
    slotCount: 2
  });

  assert.deepEqual(host.wheelSpinCounts, [0, 1]);
  assert.equal(host.wheelTotalSpins, 1);
  assert.deepEqual(controller.previewSpinCounts, [0, 0]);
  assert.deepEqual(effects, [{ type: "persist" }]);
});

test("game session effects are executed through injected ports", async () => {
  const calls: string[] = [];

  await executeGameSessionEffects(
    [{ type: "persist" }, { type: "publish" }, { type: "persist" }],
    {
      persist: () => { calls.push("persist"); },
      publish: async () => { calls.push("publish"); }
    }
  );

  assert.deepEqual(calls, ["persist", "publish"]);
});
