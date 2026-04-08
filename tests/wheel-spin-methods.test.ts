import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { createWheelWindowState, getWheelController } from "../src/components/windows/wheelControllerState.ts";
import { wheelSessionMethods } from "../src/components/windows/wheelSessionMethods.ts";
import { wheelSpinMethods } from "../src/components/windows/wheelSpinMethods.ts";

vi.mock("../src/app-core/methods/wheel-fairness-api.ts", () => ({
  createWheelFairnessCommit: vi.fn(async () => ({
    commitToken: "commit-token",
    serverSeedHash: "server-seed-hash"
  })),
  revealWheelFairnessResult: vi.fn(async () => ({
    resultIndex: 0,
    serverSeedHash: "server-seed-hash",
    serverSeed: "server-seed-value",
    clientSeed: "client-seed-value",
    verificationUrl: "https://example.com/verify",
    algorithm: "whatfees-wheel-v1"
  }))
}));

afterEach(() => {
  vi.restoreAllMocks();
});

function stubFinishedAnimation(): void {
  vi.spyOn(performance, "now").mockReturnValue(0);
  vi.stubGlobal("requestAnimationFrame", ((callback: FrameRequestCallback) => {
    callback(10_000);
    return 1;
  }) as typeof requestAnimationFrame);
}

function createSpinVm(mode: "config" | "live") {
  const state = createWheelWindowState() as Record<string, unknown>;
  state.wheelMode = mode;
  state.wheelSpinning = false;
  state.wheelCurrentAngle = 0;
  state.wheelLastResult = "";
  state.wheelTotalSpins = 0;
  state.wheelSpinCounts = [0];
  state.wheelPendingInventoryIssues = [];
  state.wheelDisplaySlots = [{
    name: "1 Pack",
    color: "#e74c3c",
    cost: 6.125,
    tier: "tier-1",
    packsCount: 1,
    deductionType: "packs",
    isChase: false
  }];
  state.drawWheel = vi.fn();
  state.saveWheelSession = vi.fn();
  state.recordSpinResult = vi.fn((slotIndex: number) => wheelSpinMethods.recordSpinResult.call(state, slotIndex));
  state.recordPreviewSpinResult = vi.fn((slotIndex: number) => wheelSpinMethods.recordPreviewSpinResult.call(state, slotIndex));
  state.appendWheelFairnessHistory = vi.fn((entry, options) => wheelSessionMethods.appendWheelFairnessHistory.call(state, entry, options));
  state.landOnSlot = vi.fn();
  return state as Record<string, unknown> & {
    recordSpinResult: ReturnType<typeof vi.fn>;
    recordPreviewSpinResult: ReturnType<typeof vi.fn>;
    appendWheelFairnessHistory: ReturnType<typeof vi.fn>;
    landOnSlot: ReturnType<typeof vi.fn>;
  };
}

test("config spins always record preview session data even if spinWheelInternal is called with recordSession=true", async () => {
  stubFinishedAnimation();
  const vm = createSpinVm("config");

  await wheelSpinMethods.spinWheelInternal.call(vm, true);

  const controller = getWheelController(vm);
  assert.equal(vm.recordSpinResult.mock.calls.length, 0);
  assert.equal(vm.recordPreviewSpinResult.mock.calls.length, 1);
  assert.equal(Number(controller.previewTotalSpins), 1);
  assert.equal(Number(vm.wheelTotalSpins), 0);
  assert.equal(controller.previewFairnessHistory.length, 1);
  assert.equal(controller.fairnessHistory.length, 0);
  assert.deepEqual(vm.appendWheelFairnessHistory.mock.calls[0]?.[1], { preview: true });
  assert.deepEqual(vm.landOnSlot.mock.calls[0]?.[1], { recordSession: false });
});

test("live spins keep recording live session data", async () => {
  stubFinishedAnimation();
  const vm = createSpinVm("live");

  await wheelSpinMethods.spinWheelInternal.call(vm, true);

  const controller = getWheelController(vm);
  assert.equal(vm.recordSpinResult.mock.calls.length, 1);
  assert.equal(vm.recordPreviewSpinResult.mock.calls.length, 0);
  assert.equal(Number(vm.wheelTotalSpins), 1);
  assert.equal(Number(controller.previewTotalSpins), 0);
  assert.equal(controller.fairnessHistory.length, 1);
  assert.equal(controller.previewFairnessHistory.length, 0);
  assert.deepEqual(vm.appendWheelFairnessHistory.mock.calls[0]?.[1], { preview: false });
  assert.deepEqual(vm.landOnSlot.mock.calls[0]?.[1], { recordSession: true });
});
