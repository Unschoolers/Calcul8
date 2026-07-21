import assert from "node:assert/strict";
import { test } from "vitest";
import type { WheelFairnessEntry } from "../src/types/app.ts";
import {
  readWheelSessionTrack,
  recordWheelSessionFairness,
  recordWheelSessionSpin
} from "../src/components/windows/game/services/wheelSessionState.ts";
import { createGameWindowState, getWheelController } from "../src/components/windows/game/coordinator/gameControllerState.ts";

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

test("game session track records a valid spin", () => {
  const state = createGameWindowState() as Record<string, any>;
  const controller = getWheelController(state);
  controller.previewSpinCounts = [0, 0];
  recordWheelSessionSpin(state, controller, "preview", 1, 2);
  const recorded = readWheelSessionTrack(state, controller, "preview");

  assert.deepEqual(recorded.spinCounts, [0, 1]);
  assert.equal(recorded.totalSpins, 1);
});

test("game session track records bounded fairness history", () => {
  const state = createGameWindowState() as Record<string, any>;
  const controller = getWheelController(state);
  for (let spinNumber = 1; spinNumber <= 21; spinNumber += 1) {
    recordWheelSessionFairness(state, controller, "live", { ...fairnessEntry, spinNumber });
  }
  const recorded = readWheelSessionTrack(state, controller, "live");

  assert.equal(recorded.fairnessHistory.length, 20);
  assert.equal(recorded.fairnessHistory[0]?.spinNumber, 2);
});

test("game session track rejects an invalid spin", () => {
  const state = createGameWindowState() as Record<string, any>;
  const controller = getWheelController(state);
  controller.previewSpinCounts = [0, 0];
  recordWheelSessionSpin(state, controller, "preview", 4, 2);
  assert.deepEqual(controller.previewSpinCounts, [0, 0]);
});
