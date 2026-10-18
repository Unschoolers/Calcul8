import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import { createGameWindowState, ensureWheelControllerState, getWheelController } from "../src/components/windows/game/coordinator/gameControllerState.ts";
import { wheelSessionMethods } from "../src/components/windows/game/commands/wheelSessionMethods.ts";
import { wheelSpinMethods } from "../src/components/windows/game/commands/wheelSpinMethods.ts";
import { wheelConfigComputeds } from "../src/components/windows/game/inspector/wheelConfigComputeds.ts";
import { GameWindow } from "../src/components/windows/game/GameWindow.ts";
import { createWheelFairnessProofLink } from "../src/app-core/methods/wheel-fairness-api.ts";

const fairnessMock = vi.hoisted(() => ({ resolve: vi.fn() }));

vi.mock("../src/components/windows/game/services/wheelSpinFairness.ts", () => ({
  resolveWheelFairnessSpin: fairnessMock.resolve
}));

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
  fairnessMock.resolve.mockReset();
  fairnessMock.resolve.mockResolvedValue({ resultIndex: 0, hash: "hash", seed: "seed" });
});

beforeEach(() => {
  fairnessMock.resolve.mockResolvedValue({ resultIndex: 0, hash: "hash", seed: "seed" });
});

function completeGameSession<T extends Record<string, unknown>>(context: T): T {
  ensureWheelControllerState(context);
  return context;
}

function stubFinishedAnimation(): void {
  vi.spyOn(performance, "now").mockReturnValue(0);
  vi.stubGlobal("requestAnimationFrame", ((callback: FrameRequestCallback) => {
    callback(10_000);
    return 1;
  }) as typeof requestAnimationFrame);
}

function createSpinVm(mode: "config" | "live") {
  const state = createGameWindowState() as Record<string, unknown>;
  ensureWheelControllerState(state);
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
  assert.equal(Number(controller.wheelPreviewTotalSpins), 1);
  assert.equal(Number(vm.wheelTotalSpins), 0);
  assert.equal(controller.wheelPreviewFairnessHistory.length, 1);
  assert.equal(controller.wheelFairnessHistory.length, 0);
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
  assert.equal(Number(controller.wheelPreviewTotalSpins), 0);
  assert.equal(controller.wheelFairnessHistory.length, 1);
  assert.equal(controller.wheelPreviewFairnessHistory.length, 0);
  assert.deepEqual(vm.appendWheelFairnessHistory.mock.calls[0]?.[1], { preview: false });
  assert.deepEqual(vm.landOnSlot.mock.calls[0]?.[1], { recordSession: true });
});

test("a live spin owns the guard before fairness resolves and records at most one actual sale", async () => {
  const deferred = createDeferred<{ resultIndex: number; hash: string; seed: string }>();
  fairnessMock.resolve.mockReturnValue(deferred.promise);
  const vm = createSpinVm("live");
  vm.activeWheelConfig = {
    id: 1, name: "Live wheel", spinPrice: 10, tiers: [{
      id: "tier-1", label: "1 Pack", color: "#e74c3c", costPerTier: 6.125,
      packsCount: 1, deductionType: "packs", boundLotId: 1
    }]
  };
  vm.wheelDisplayConfig = vm.activeWheelConfig;
  vm.lots = [{ id: 1, name: "Lot", boxesPurchased: 1, packsPerBox: 10, sales: [] }];
  vm.addWheelSaleToLot = vi.fn().mockResolvedValue(true);

  const first = wheelSpinMethods.spinWheelInternal.call(vm, true);
  assert.equal(vm.wheelSpinning, true);
  const second = wheelSpinMethods.spinWheelInternal.call(vm, true);
  assert.equal(fairnessMock.resolve.mock.calls.length, 1);
  deferred.resolve({ resultIndex: 0, hash: "hash", seed: "seed" });
  await Promise.all([first, second]);

  assert.equal((vm.addWheelSaleToLot as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal(vm.wheelTotalSpins, 1);
});

test("fairness rejection releases only the spin lock it acquired", async () => {
  const deferred = createDeferred<{ resultIndex: number; hash: string; seed: string }>();
  fairnessMock.resolve.mockReturnValue(deferred.promise);
  const vm = createSpinVm("live");
  const spinning = wheelSpinMethods.spinWheelInternal.call(vm, true);
  assert.equal(vm.wheelSpinning, true);
  deferred.reject(new Error("fairness unavailable"));
  await assert.rejects(spinning, /fairness unavailable/);
  assert.equal(vm.wheelSpinning, false);
});

test("mode A-B-A transitions invalidate fairness work even when the final mode matches", async () => {
  const deferred = createDeferred<{ resultIndex: number; hash: string; seed: string }>();
  fairnessMock.resolve.mockReturnValue(deferred.promise);
  const vm = createSpinVm("live");
  vm.activeWheelConfig = { id: 1, name: "Real", spinPrice: 10, tiers: [] };
  vm.wheelDisplayConfig = vm.activeWheelConfig;
  vm.editingWheelConfig = { id: 1, name: "Draft", spinPrice: 20, tiers: [] };
  vm.addWheelSaleToLot = vi.fn();

  const spinning = wheelSpinMethods.spinWheelInternal.call(vm, true);
  GameWindow.methods!.handleWheelModeChange.call(vm as never, "config");
  GameWindow.methods!.handleWheelModeChange.call(vm as never, "live");
  GameWindow.methods!.confirmWheelModeChange.call(vm as never);
  assert.equal(vm.wheelMode, "live");
  deferred.resolve({ resultIndex: 0, hash: "hash", seed: "seed" });
  await spinning;

  assert.equal((vm.addWheelSaleToLot as ReturnType<typeof vi.fn>).mock.calls.length, 0);
  assert.equal(vm.wheelTotalSpins, 0);
});

test("a rejected old spin cannot release a newer operation's lock", async () => {
  const firstFairness = createDeferred<{ resultIndex: number; hash: string; seed: string }>();
  const secondFairness = createDeferred<{ resultIndex: number; hash: string; seed: string }>();
  fairnessMock.resolve.mockReturnValueOnce(firstFairness.promise).mockReturnValueOnce(secondFairness.promise);
  const vm = createSpinVm("live");
  const first = wheelSpinMethods.spinWheelInternal.call(vm, true);
  vm.wheelSpinning = false;
  const second = wheelSpinMethods.spinWheelInternal.call(vm, true);

  firstFairness.reject(new Error("old request failed"));
  await assert.rejects(first, /old request failed/);
  assert.equal(vm.wheelSpinning, true);

  secondFairness.resolve({ resultIndex: 0, hash: "hash", seed: "seed" });
  await second;
});

test("a stale deferred animation frame cannot complete into the changed mode", async () => {
  const vm = createSpinVm("live");
  let pendingFrame: FrameRequestCallback | undefined;
  vi.spyOn(performance, "now").mockReturnValue(0);
  vi.stubGlobal("requestAnimationFrame", ((callback: FrameRequestCallback) => {
    pendingFrame = callback;
    return 44;
  }) as typeof requestAnimationFrame);

  await wheelSpinMethods.spinWheelInternal.call(vm, true);
  assert.equal(vm.wheelSpinning, true);
  assert.ok(pendingFrame);
  GameWindow.methods!.handleWheelModeChange.call(vm as never, "config");
  pendingFrame!(10_000);
  await vi.waitFor(() => assert.equal(vm.wheelSpinning, false));

  assert.equal(vm.appendWheelFairnessHistory.mock.calls.length, 0);
  assert.equal(vm.landOnSlot.mock.calls.length, 0);
});

test("spin lock stays owned through a deferred proof and stale proof completion writes nothing", async () => {
  const proofDeferred = createDeferred<{ verificationUrl: string; jsonUrl: string }>();
  vi.mocked(createWheelFairnessProofLink).mockReturnValue(proofDeferred.promise);
  fairnessMock.resolve.mockResolvedValue({ resultIndex: 0, hash: "hash", seed: "seed", clientSeed: "client" });
  stubFinishedAnimation();
  const vm = createSpinVm("live");
  const firstSpin = wheelSpinMethods.spinWheelInternal.call(vm, true);
  await firstSpin;
  assert.equal(vi.mocked(createWheelFairnessProofLink).mock.calls.length, 1);
  assert.equal(vm.wheelSpinning, true);

  await wheelSpinMethods.spinWheelInternal.call(vm, true);
  assert.equal(fairnessMock.resolve.mock.calls.length, 1, "a second spin must wait until proof completion releases the operation");

  const savesBeforeInvalidation = (vm.saveWheelSession as ReturnType<typeof vi.fn>).mock.calls.length;
  GameWindow.methods!.handleWheelModeChange.call(vm as never, "config");
  proofDeferred.resolve({ verificationUrl: "https://example.test/proof", jsonUrl: "https://example.test/proof.json" });
  await vi.waitFor(() => assert.equal(vm.wheelSpinning, false));

  assert.equal(vm.appendWheelFairnessHistory.mock.calls.length, 0);
  assert.equal(vm.landOnSlot.mock.calls.length, 0);
  assert.equal((vm.saveWheelSession as ReturnType<typeof vi.fn>).mock.calls.length, savesBeforeInvalidation);
  assert.equal(getWheelController(vm).wheelFairnessHistory.length, 0);
});

test("a live-to-config change during fairness cannot settle a draft as a live sale", async () => {
  const deferred = createDeferred<{ resultIndex: number; hash: string; seed: string }>();
  fairnessMock.resolve.mockReturnValue(deferred.promise);
  const vm = createSpinVm("live");
  const realConfig = { id: 1, name: "Real", spinPrice: 10, tiers: [{
    id: "tier-1", label: "Real prize", color: "#f00", costPerTier: 5,
    packsCount: 1, deductionType: "packs", boundLotId: 1
  }] };
  const draftConfig = { ...realConfig, spinPrice: 20, tiers: [{ ...realConfig.tiers[0], label: "Draft prize", costPerTier: 10 }] };
  const liveSlots = [{ name: "Real prize", color: "#f00", cost: 5, tier: "tier-1", packsCount: 1, deductionType: "packs", isChase: false }];
  const draftSlots = [{ name: "Draft prize", color: "#0f0", cost: 10, tier: "tier-1", packsCount: 1, deductionType: "packs", isChase: false }];
  vm.activeWheelConfig = realConfig;
  vm.editingWheelConfig = draftConfig;
  Object.defineProperty(vm, "wheelDisplayConfig", { configurable: true, get: () => vm.wheelMode === "config" ? draftConfig : realConfig });
  Object.defineProperty(vm, "wheelDisplaySlots", { configurable: true, get: () => vm.wheelMode === "config" ? draftSlots : liveSlots });
  vm.lots = [{ id: 1, name: "Lot", boxesPurchased: 1, packsPerBox: 10, sales: [] }];
  vm.addWheelSaleToLot = vi.fn().mockResolvedValue(true);

  const spinning = wheelSpinMethods.spinWheelInternal.call(vm, true);
  vm.wheelMode = "config";
  deferred.resolve({ resultIndex: 0, hash: "hash", seed: "seed" });
  await spinning;

  assert.equal((vm.addWheelSaleToLot as ReturnType<typeof vi.fn>).mock.calls.length, 0);
  assert.equal(vm.wheelTotalSpins, 0);
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
  assert.equal(controller.wheelPreviewFairnessHistory.length, 0);
  assert.equal(controller.wheelFairnessHistory.length, 0);
  assert.equal(Number(controller.wheelPreviewTotalSpins), 0);
  assert.equal(Number(vm.wheelTotalSpins), 0);
  assert.equal(vm.wheelSpinning, false);
  assert.equal((vm.scheduleNextWheelAutospin as ReturnType<typeof vi.fn>).mock.calls.length, 1);
});

test("recordSpinResult initializes pending inventory issues when older wheel state is missing the array", async () => {
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

  await wheelSpinMethods.recordSpinResult.call(completeGameSession(state) as never, 0);

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
});

test("recordSpinResult queues required lot selection for multi-lot bulk tiers without creating a sale", async () => {
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

  await wheelSpinMethods.recordSpinResult.call(completeGameSession(state) as never, 0);

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

test("confirmBatchSale records a required multi-lot hit against the selected lot", async () => {
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

  await wheelSessionMethods.confirmBatchSale.call(completeGameSession(state) as never, 0);

  assert.equal((state.addWheelSaleToLot as ReturnType<typeof vi.fn>).mock.calls[0]?.[0], 20);
  assert.equal(((state.addWheelSaleToLot as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as { buyerShipping?: number }).buyerShipping, 2);
  assert.deepEqual(state.wheelPendingInventoryIssues, []);
});




test("batch settlement retains a failed sale and ignores repeated clicks while saving", async () => {
  const state = createGameWindowState() as Record<string, unknown>;
  const entry = { slotName: "Prize", slotTier: "t1", slotCost: 2, slotPacksCount: 1,
    slotDeductionType: "packs", selectedLotId: 20, spinNumber: 1 };
  state.activeWheelConfig = { id: 1, spinPrice: 10, tiers: [] };
  state.lots = [{ id: 20 }];
  state.wheelPendingInventoryIssues = [entry];
  state.saveWheelSession = vi.fn();
  const deferred = createDeferred<boolean>();
  const save = vi.fn(() => deferred.promise);
  state.addWheelSaleToLot = save;
  completeGameSession(state);
  const first = wheelSessionMethods.confirmBatchSale.call(state as never, 0);
  await wheelSessionMethods.confirmBatchSale.call(state as never, 0);
  assert.equal(save.mock.calls.length, 1);
  assert.deepEqual(state.wheelPendingInventoryIssues, [entry]);
  deferred.resolve(false);
  await first;
  assert.deepEqual(state.wheelPendingInventoryIssues, [entry]);
  assert.equal(Number(getWheelController(state).wheelSessionNetRevenue), 0);
  save.mockResolvedValue(true);
  await wheelSessionMethods.confirmBatchSale.call(state as never, 0);
  assert.deepEqual(state.wheelPendingInventoryIssues, []);
  assert.ok(Number(getWheelController(state).wheelSessionNetRevenue) > 0);
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
