import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { createGameWindowState, getWheelController } from "../src/components/windows/game/coordinator/gameControllerState.ts";
import { wheelSessionMethods } from "../src/components/windows/game/commands/wheelSessionMethods.ts";
import { wheelSpinMethods } from "../src/components/windows/game/commands/wheelSpinMethods.ts";
import { wheelConfigComputeds } from "../src/components/windows/game/inspector/wheelConfigComputeds.ts";

const wheelLayoutHash = "c3ca5e1eef7edf9b0625f714c6eb25287a9e8bcc63a16d0de00ce711ddbe67ad";

vi.mock("../src/app-core/methods/wheel-fairness-api.ts", () => ({
  createWheelFairnessCommit: vi.fn(async () => ({
    commitToken: "commit-token",
    serverSeedHash: "server-seed-hash",
    layoutHash: wheelLayoutHash,
    slotCount: 1,
    algorithm: "whatfees-wheel-v1",
    committedAt: 123,
    expiresAt: 456
  })),
  revealWheelFairnessResult: vi.fn(async () => ({
    resultIndex: 0,
    serverSeedHash: "server-seed-hash",
    serverSeed: "server-seed-value",
    clientSeed: "client-seed-value",
    layoutHash: wheelLayoutHash,
    slotCount: 1,
    verificationUrl: "https://example.com/verify",
    algorithm: "whatfees-wheel-v1"
  })),
  createWheelFairnessProofLink: vi.fn(async () => ({
    verificationUrl: "https://example.com/verify?proofId=proof-123",
    jsonUrl: "https://example.com/verify?proofId=proof-123&format=json"
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
  const state = createGameWindowState() as Record<string, unknown>;
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
  state.recordSpinResult = vi.fn((slotIndex: number) => wheelSpinMethods.recordSpinResult.call(state as never, slotIndex));
  state.recordPreviewSpinResult = vi.fn((slotIndex: number) => wheelSpinMethods.recordPreviewSpinResult.call(state as never, slotIndex));
  state.appendWheelFairnessHistory = vi.fn((entry, options) => wheelSessionMethods.appendWheelFairnessHistory.call(state as never, entry, options));
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

  await wheelSpinMethods.spinWheelInternal.call(vm as never, true);

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

test("spinWheelInternal publishes spectator animation during the spin and clears it after landing", async () => {
  stubFinishedAnimation();
  const vm = createSpinVm("live");
  const spectatorAnimationStates: unknown[] = [];
  vm.saveWheelSession = vi.fn(function (this: Record<string, unknown>) {
    spectatorAnimationStates.push(this._gameSpectatorSpinAnimation ?? null);
  });

  await wheelSpinMethods.spinWheelInternal.call(vm, true);

  const firstAnimation = spectatorAnimationStates[0] as {
    spinId?: string;
    startedAt?: number;
    durationMs?: number;
    startAngle?: number;
    endAngle?: number;
    targetIndex?: number;
  } | null;
  assert.ok(firstAnimation);
  assert.equal(firstAnimation.targetIndex, 0);
  assert.equal(firstAnimation.startAngle, 0);
  assert.equal(typeof firstAnimation.endAngle, "number");
  assert.equal(typeof firstAnimation.durationMs, "number");
  assert.equal(typeof firstAnimation.startedAt, "number");
  assert.equal(spectatorAnimationStates.at(-1), null);
  assert.equal(vm._gameSpectatorSpinAnimation, null);
});

test("runWheelAutoPreviewAnimation spins visually without recording preview proof or result", async () => {
  stubFinishedAnimation();
  const vm = createSpinVm("config");
  vm.scheduleNextWheelAutospin = vi.fn();
  vm.wheelAutospinEnabled = true;

  await wheelSpinMethods.runWheelAutoPreviewAnimation.call(vm);

  const controller = getWheelController(vm);
  assert.equal(vm.recordSpinResult.mock.calls.length, 0);
  assert.equal(vm.recordPreviewSpinResult.mock.calls.length, 0);
  assert.equal(vm.appendWheelFairnessHistory.mock.calls.length, 0);
  assert.equal(vm.landOnSlot.mock.calls.length, 0);
  assert.equal(controller.previewFairnessHistory.length, 0);
  assert.equal(controller.fairnessHistory.length, 0);
  assert.equal(Number(controller.previewTotalSpins), 0);
  assert.equal(Number(vm.wheelTotalSpins), 0);
  assert.equal(vm.wheelSpinning, false);
  assert.equal((vm.scheduleNextWheelAutospin as ReturnType<typeof vi.fn>).mock.calls.length, 1);
});

test("recordSpinResult initializes pending inventory issues when older wheel state is missing the array", () => {
  const state = createGameWindowState() as Record<string, unknown>;
  state.wheelMode = "live";
  state.wheelSpinCounts = [0];
  state.wheelTotalSpins = 0;
  state.wheelDisplaySlots = [{
    name: "1 Pack",
    color: "#e74c3c",
    cost: 6.125,
    tier: "tier-1",
    packsCount: 1,
    deductionType: "packs",
    isChase: false
  }];
  state.activeWheelConfig = {
    id: 1,
    name: "Wheel",
    tiers: [{
      id: "tier-1",
      label: "1 Pack",
      color: "#e74c3c",
      costPerTier: 6.125,
      packsCount: 1,
      deductionType: "packs",
      boundLotId: 1
    }]
  };
  state.lots = [{
    id: 1,
    name: "Empty Lot",
    boxesPurchased: 0,
    packsPerBox: 0,
    sales: []
  }];
  state.saveWheelSession = vi.fn();
  delete state.wheelPendingInventoryIssues;
  delete state.wheelSkippedDeductions;

  wheelSpinMethods.recordSpinResult.call(state as never, 0);

  assert.deepEqual(state.wheelPendingInventoryIssues, [{
    slotName: "1 Pack",
    slotColor: "#e74c3c",
    slotCost: 6.125,
    slotTier: "tier-1",
    slotPacksCount: 1,
    slotDeductionType: "packs",
    slotIndex: 0,
    selectedLotId: 1,
    spinNumber: 1,
    slotSinglesId: null
  }]);
  assert.deepEqual(state.wheelSkippedDeductions, state.wheelPendingInventoryIssues);
});

test("recordSpinResult queues required lot selection for multi-lot bulk tiers without creating a sale", () => {
  const state = createGameWindowState() as Record<string, unknown>;
  state.wheelMode = "live";
  state.wheelSpinCounts = [0];
  state.wheelTotalSpins = 0;
  state.wheelDisplaySlots = [{
    name: "3 Packs",
    color: "#e74c3c",
    cost: 12,
    tier: "tier-1",
    packsCount: 3,
    deductionType: "packs",
    isChase: false
  }];
  state.activeWheelConfig = {
    id: 1,
    name: "Wheel",
    spinPrice: 10,
    tiers: [{
      id: "tier-1",
      label: "3 Packs",
      color: "#e74c3c",
      costPerTier: 12,
      packsCount: 3,
      deductionType: "packs",
      boundLotId: 10,
      boundLotIds: [10, 20]
    }]
  };
  state.lots = [
    { id: 10, name: "Lot A", lotType: "bulk", boxesPurchased: 1, packsPerBox: 10 },
    { id: 20, name: "Lot B", lotType: "bulk", boxesPurchased: 1, packsPerBox: 10 }
  ];
  state.addWheelSaleToLot = vi.fn();
  state.saveWheelSession = vi.fn();

  wheelSpinMethods.recordSpinResult.call(state as never, 0);

  assert.equal((state.addWheelSaleToLot as ReturnType<typeof vi.fn>).mock.calls.length, 0);
  assert.deepEqual(state.wheelPendingInventoryIssues, [{
    slotName: "3 Packs",
    slotColor: "#e74c3c",
    slotCost: 12,
    slotTier: "tier-1",
    slotPacksCount: 3,
    slotDeductionType: "packs",
    slotIndex: 0,
    selectedLotId: null,
    spinNumber: 1,
    slotSinglesId: null,
    candidateLotIds: [10, 20],
    requiresLotSelection: true
  }]);
});

test("wheelSpinBlockedReason blocks live spins while a required lot selection is unresolved", () => {
  const reason = wheelConfigComputeds.wheelSpinBlockedReason.call({
    wheelMode: "live",
    preferredLanguage: "en",
    wheelInvalidLiveTiers: [],
    wheelPendingInventoryIssues: [{
      slotName: "3 Packs",
      selectedLotId: null,
      requiresLotSelection: true
    }]
  } as never);

  assert.match(reason, /Resolve the pending lot selection/);
});

test("wheelSpinBlockedReason keeps live spins blocked after a required lot is selected until recorded", () => {
  const reason = wheelConfigComputeds.wheelSpinBlockedReason.call({
    wheelMode: "live",
    preferredLanguage: "en",
    wheelInvalidLiveTiers: [],
    wheelPendingInventoryIssues: [{
      slotName: "3 Packs",
      selectedLotId: 20,
      requiresLotSelection: true
    }]
  } as never);

  assert.match(reason, /Resolve the pending lot selection/);
});

test("confirmBatchSale records a required multi-lot hit against the selected lot", () => {
  const state = createGameWindowState() as Record<string, unknown>;
  state.activeWheelConfig = {
    id: 1,
    name: "Wheel",
    spinPrice: 10,
    tiers: [{
      id: "tier-1",
      label: "3 Packs",
      color: "#e74c3c",
      costPerTier: 12,
      packsCount: 3,
      deductionType: "packs",
      boundLotId: 10,
      boundLotIds: [10, 20]
    }]
  };
  state.lots = [
    { id: 10, name: "Lot A", lotType: "bulk", sellingShippingPerOrder: 1 },
    { id: 20, name: "Lot B", lotType: "bulk", sellingShippingPerOrder: 2 }
  ];
  state.wheelPendingInventoryIssues = [{
    slotName: "3 Packs",
    slotColor: "#e74c3c",
    slotCost: 12,
    slotTier: "tier-1",
    slotPacksCount: 3,
    slotDeductionType: "packs",
    slotIndex: 0,
    selectedLotId: 20,
    spinNumber: 1,
    slotSinglesId: null,
    candidateLotIds: [10, 20],
    requiresLotSelection: true
  }];
  state.addWheelSaleToLot = vi.fn();
  state.saveWheelSession = vi.fn();

  wheelSessionMethods.confirmBatchSale.call(state as never, 0);

  assert.equal((state.addWheelSaleToLot as ReturnType<typeof vi.fn>).mock.calls[0]?.[0], 20);
  assert.equal(((state.addWheelSaleToLot as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as { buyerShipping?: number }).buyerShipping, 2);
  assert.deepEqual(state.wheelPendingInventoryIssues, []);
});



