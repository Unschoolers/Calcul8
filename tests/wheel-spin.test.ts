import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { getWheelController } from "../src/components/windows/wheel/wheelControllerState.ts";
import { buildWheelReadableVerificationUrl } from "../src/components/windows/wheel/wheelSpinState.ts";
import {
    WheelWindow
} from "../src/components/windows/wheel/WheelWindow.ts";

test("buildWheelReadableVerificationUrl targets the public proof view", () => {
  const url = buildWheelReadableVerificationUrl(
    "https://api.example.test/wheel/fairness/verify?serverSeed=server-seed&clientSeed=client-seed&slotCount=12",
    {
      slotLabel: "1 Pack",
      wheelName: "Demo Wheel",
      spinNumber: 7,
      slots: [
        { name: "1 Pack", color: "#f00", cost: 1, tier: "tier-1", packsCount: 1, deductionType: "packs", isChase: false },
        { name: "Chase", color: "#0f0", cost: 1, tier: "tier-2", packsCount: 1, deductionType: "packs", isChase: true }
      ]
    }
  );

  assert.match(url, /wheel\/fairness\/verify/);
  assert.match(url, /format=html/);
  assert.match(url, /slotLabel=1\+Pack|slotLabel=1%20Pack/);
  assert.match(url, /wheelName=Demo\+Wheel|wheelName=Demo%20Wheel/);
  assert.match(url, /spinNumber=7/);
  assert.doesNotMatch(url, /layout=/);
});

test("recordSpinResult increments spin counts", () => {
  const vm: Record<string, unknown> = {
    activeWheelSlots: [
      { name: "Prize A", color: "#f00", cost: 5, tier: "t1", packsCount: 1, deductionType: "packs", isChase: false },
      { name: "Prize B", color: "#0f0", cost: 10, tier: "t2", packsCount: 1, deductionType: "packs", isChase: false }
    ],
    wheelSpinCounts: [0, 0],
    wheelTotalSpins: 0,
    wheelSessionNetRevenue: 0,
    activeWheelConfig: { id: 1, spinPrice: 10, tiers: [{ id: "t1", boundLotId: 42 }, { id: "t2", boundLotId: 43 }] },
    addWheelSaleToLot: vi.fn(),
    lots: [{
      id: 42,
      name: "Lot A",
      lotType: "bulk",
      boxesPurchased: 1,
      packsPerBox: 10,
      sellingShippingPerOrder: 0,
      platformFeePercent: 8,
      additionalFeePercent: 2.9,
      additionalFeeAppliesTo: "sale_plus_shipping",
      fixedFeePerOrder: 0.3
    }],
    loadSalesForLotId: vi.fn(() => []),
    wheelSkippedDeductions: [],
    activeWheelConfigId: 1,
    saveWheelSession: vi.fn()
  };

  WheelWindow.methods!.recordSpinResult.call(vm as never, 0);
  assert.equal(vm.wheelTotalSpins, 1);
  assert.deepEqual(vm.wheelSpinCounts, [1, 0]);
  assert.ok(Math.abs((vm.wheelSessionNetRevenue as number) - 8.61) < 0.001);
});

test("landOnSlot sets result text and color", () => {
  const triggerWheelCelebration = vi.fn();
  const vm: Record<string, unknown> = {
    activeWheelSlots: [
      { name: "Prize A", color: "#f00", cost: 5, tier: "t1", packsCount: 1, deductionType: "packs", isChase: false, celebrationEmoji: "🎉" }
    ],
    wheelLastResult: "",
    wheelLastResultColor: "",
    wheelChaseDialog: false,
    triggerWheelCelebration,
    saveWheelSession: vi.fn()
  };

  WheelWindow.methods!.landOnSlot.call(vm as never, 0);
  assert.equal(vm.wheelLastResult, "🎉 Prize A");
  assert.equal(vm.wheelLastResultColor, "#f00");
  assert.deepEqual(triggerWheelCelebration.mock.calls, [[{
    label: "Prize A",
    color: "#f00",
    image: undefined,
    emoji: "🎉",
    preview: false
  }]]);
});

test("landOnSlot triggers the result reveal for regular tiers without an emoji", () => {
  const triggerWheelCelebration = vi.fn();
  const vm: Record<string, unknown> = {
    activeWheelSlots: [
      { name: "Prize B", color: "#0f0", cost: 5, tier: "t2", packsCount: 1, deductionType: "packs", isChase: false }
    ],
    wheelLastResult: "",
    wheelLastResultColor: "",
    wheelChaseDialog: false,
    triggerWheelCelebration,
    saveWheelSession: vi.fn()
  };

  WheelWindow.methods!.landOnSlot.call(vm as never, 0);

  assert.deepEqual(triggerWheelCelebration.mock.calls, [[{
    label: "Prize B",
    color: "#0f0",
    image: undefined,
    emoji: undefined,
    preview: false
  }]]);
});

test("landOnSlot preview mode opens preview chase flow and persists the preview state", () => {
  const saveWheelSession = vi.fn();
  const triggerWheelCelebration = vi.fn();
  const vm: Record<string, unknown> = {
    activeWheelSlots: [
      { name: "Chase Card", color: "#ff0", cost: 50, tier: "tc", packsCount: 1, deductionType: "singles", isChase: true }
    ],
    activeWheelConfig: {
      id: 1,
      spinPrice: 10,
      tiers: [{ id: "tc", boundLotId: 42, boundSinglesId: 777 }]
    },
    lots: [{
      id: 42,
      name: "Singles",
      lotType: "singles",
      singlesPurchases: [{ id: 777, item: "Chase Card", cost: 50, quantity: 1, marketValue: 60, image: "https://img.test/chase.png" }]
    }],
    wheelLastResult: "",
    wheelLastResultColor: "",
    wheelChaseDialog: true,
    wheelChasePreviewMode: false,
    wheelChasePendingTierId: "stale",
    wheelChaseReplacementSinglesId: 123,
    triggerWheelCelebration,
    saveWheelSession
  };

  WheelWindow.methods!.landOnSlot.call(vm as never, 0, { recordSession: false });
  assert.equal(vm.wheelLastResult, "🎉 Chase Card");
  assert.equal(vm.wheelLastResultColor, "#ff0");
  assert.equal(vm.wheelChaseDialog, true);
  assert.equal(vm.wheelChasePendingTierId, "tc");
  assert.equal(vm.wheelChaseReplacementSinglesId, null);
  assert.equal(vm.wheelChasePreviewMode, true);
  assert.equal(saveWheelSession.mock.calls.length, 1);
  assert.deepEqual(triggerWheelCelebration.mock.calls, [[{
    label: "Chase Card",
    color: "#ff0",
    emoji: undefined,
    image: "https://img.test/chase.png",
    preview: true
  }]]);
});

test("preview spin persists updated preview session state through completion", async () => {
  const saveSnapshots: Array<{ previewTotal: number; previewHistory: number; lastResult: string; hash: string }> = [];
  const slots = [
    { name: "Preview Prize", color: "#f00", cost: 5, tier: "t1", packsCount: 1, deductionType: "packs", isChase: false }
  ];
  const vm: Record<string, unknown> = {
    wheelSpinning: false,
    wheelDisplaySlots: slots,
    activeWheelSlots: slots,
    wheelDisplayConfig: { id: 1, spinPrice: 10, tiers: [{ id: "t1", boundLotId: 42 }] },
    activeWheelConfigId: 1,
    activeScopeType: "personal",
    activeWorkspaceId: null,
    wheelPreviewSpinCounts: [0],
    wheelPreviewTotalSpins: 0,
    wheelPreviewFairnessHistory: [],
    wheelSpinCounts: [0],
    wheelTotalSpins: 0,
    wheelCurrentAngle: 0,
    wheelSpinHash: "",
    wheelSpinSeed: "",
    wheelSpinClientSeed: "",
    wheelSpinVerificationUrl: "",
    wheelSpinAlgorithm: "",
    wheelShowSeed: false,
    wheelInventoryWarning: "",
    wheelLastResult: "",
    wheelLastResultColor: "",
    wheelHighlightedSlotIndex: -1,
    drawWheel: vi.fn(),
    recordSpinResult: WheelWindow.methods!.recordSpinResult,
    recordPreviewSpinResult: WheelWindow.methods!.recordPreviewSpinResult,
    appendWheelFairnessHistory: WheelWindow.methods!.appendWheelFairnessHistory,
    landOnSlot: WheelWindow.methods!.landOnSlot,
    saveWheelSession: vi.fn(function (this: Record<string, unknown>) {
      saveSnapshots.push({
        previewTotal: Number(this.wheelPreviewTotalSpins || 0),
        previewHistory: Array.isArray(this.wheelPreviewFairnessHistory) ? this.wheelPreviewFairnessHistory.length : 0,
        lastResult: String(this.wheelLastResult || ""),
        hash: String(this.wheelSpinHash || "")
      });
    })
  };

  vi.stubGlobal("performance", { now: () => 0 });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(9_999);
      return 1;
    });

  try {
    await WheelWindow.methods!.spinWheelInternal.call(vm as never, false);
  } finally {
    vi.unstubAllGlobals();
  }

  assert.equal(vm.wheelPreviewTotalSpins, 1);
  assert.deepEqual(vm.wheelPreviewSpinCounts, [1]);
  assert.equal((vm.wheelPreviewFairnessHistory as Array<unknown>).length, 1);
  assert.match(String(vm.wheelLastResult || ""), /^🎉 /);
  assert.ok(String(vm.wheelSpinHash || "").length > 0);
  assert.ok(String(vm.wheelSpinSeed || "").length > 0);
  assert.ok(saveSnapshots.some((entry) => entry.previewTotal === 1));
  assert.ok(saveSnapshots.some((entry) => entry.previewHistory === 1));
  assert.ok(saveSnapshots.some((entry) => /^🎉 /.test(entry.lastResult)));
});

test("spinWheelInternal avoids reactive angle updates between mobile animation frames", async () => {
  const slots = [
    { name: "Preview Prize", color: "#f00", cost: 5, tier: "t1", packsCount: 1, deductionType: "packs", isChase: false }
  ];
  const rafCallbacks: FrameRequestCallback[] = [];
  const centerIcon = { style: { transform: "" } };
  const vm: Record<string, unknown> = {
    wheelSpinning: false,
    wheelDisplaySlots: slots,
    activeWheelSlots: slots,
    wheelDisplayConfig: { id: 1, spinPrice: 10, tiers: [{ id: "t1", boundLotId: 42 }] },
    activeWheelConfigId: 1,
    activeScopeType: "personal",
    activeWorkspaceId: null,
    wheelPreviewSpinCounts: [0],
    wheelPreviewTotalSpins: 0,
    wheelPreviewFairnessHistory: [],
    wheelSpinCounts: [0],
    wheelTotalSpins: 0,
    wheelCurrentAngle: 0,
    wheelSpinHash: "",
    wheelSpinSeed: "",
    wheelSpinClientSeed: "",
    wheelSpinVerificationUrl: "",
    wheelSpinAlgorithm: "",
    wheelShowSeed: false,
    wheelInventoryWarning: "",
    wheelLastResult: "",
    wheelLastResultColor: "",
    wheelHighlightedSlotIndex: -1,
    wheelViewportWidth: 390,
    $refs: {
      wheelOuter: {
        querySelector: vi.fn((selector: string) => selector === ".wheel-center-cap__icon" ? centerIcon : null)
      }
    },
    drawWheel: vi.fn(),
    recordSpinResult: WheelWindow.methods!.recordSpinResult,
    recordPreviewSpinResult: WheelWindow.methods!.recordPreviewSpinResult,
    appendWheelFairnessHistory: WheelWindow.methods!.appendWheelFairnessHistory,
    landOnSlot: vi.fn(),
    saveWheelSession: vi.fn()
  };

  vi.stubGlobal("performance", { now: () => 0 });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });

  try {
    await WheelWindow.methods!.spinWheelInternal.call(vm as never, false);
    assert.equal(rafCallbacks.length, 1);

    rafCallbacks.shift()?.(16);
    assert.equal(vm.wheelCurrentAngle, 0);
    assert.equal((vm.drawWheel as ReturnType<typeof vi.fn>).mock.calls.length, 1);

    rafCallbacks.shift()?.(24);
    assert.equal(vm.wheelCurrentAngle, 0);
    assert.equal((vm.drawWheel as ReturnType<typeof vi.fn>).mock.calls.length, 1);

    rafCallbacks.shift()?.(50);
    assert.equal(vm.wheelCurrentAngle, 0);
    assert.equal((vm.drawWheel as ReturnType<typeof vi.fn>).mock.calls.length, 2);
    assert.match(centerIcon.style.transform, /^rotate\(/);
  } finally {
    vi.unstubAllGlobals();
  }
});

test("testSpinWheel delegates to non-recording spin path", async () => {
  const spinWheelInternal = vi.fn().mockResolvedValue(undefined);
  const vm: Record<string, unknown> = {
    spinWheelInternal
  };

  await WheelWindow.methods!.testSpinWheel.call(vm as never);
  assert.deepEqual(spinWheelInternal.mock.calls, [[false]]);
});

test("runWheelPrimarySpin uses test spin in config mode", () => {
  const testSpinWheel = vi.fn();
  const spinWheel = vi.fn();
  const vm: Record<string, unknown> = {
    wheelMode: "config",
    testSpinWheel,
    spinWheel
  };

  WheelWindow.methods!.runWheelPrimarySpin.call(vm as never);

  assert.equal(testSpinWheel.mock.calls.length, 1);
  assert.equal(spinWheel.mock.calls.length, 0);
});

test("runWheelPrimarySpin uses live spin in live mode", () => {
  const testSpinWheel = vi.fn();
  const spinWheel = vi.fn();
  const vm: Record<string, unknown> = {
    wheelMode: "live",
    testSpinWheel,
    spinWheel
  };

  WheelWindow.methods!.runWheelPrimarySpin.call(vm as never);

  assert.equal(testSpinWheel.mock.calls.length, 0);
  assert.equal(spinWheel.mock.calls.length, 1);
});

test("wheelPrimarySpinDisabled blocks config spin while config sync is pending", () => {
  const vm: Record<string, unknown> = {
    wheelMode: "config",
    wheelSpinning: false,
    wheelConfigSyncPending: true,
    wheelAutospinEnabled: false,
    wheelDisplaySlots: [
      { name: "Prize A", color: "#f00", cost: 5, tier: "t1", packsCount: 1, deductionType: "packs", isChase: false }
    ],
    wheelEndingSession: false,
    wheelChaseDialog: false,
    wheelSpinBlockedReason: "",
    isWorkspaceScopeActive: false,
    isCurrentWorkspaceOwner: true
  };

  assert.equal(WheelWindow.computed!.wheelPrimarySpinDisabled.call(vm as never), true);
});

test("toggleWheelAutospin enables config autospin and starts visual preview animation immediately", () => {
  vi.useFakeTimers();

  const runWheelAutoPreviewAnimation = vi.fn().mockResolvedValue(undefined);
  const vm: Record<string, unknown> = {
    wheelMode: "config",
    wheelAutospinEnabled: false,
    wheelSpinning: false,
    wheelGridRevealAnimating: false,
    wheelIsMysteryGrid: false,
    wheelChaseDialog: false,
    wheelEndingSession: false,
    wheelDisplaySlots: [
      { name: "Prize A", color: "#f00", cost: 5, tier: "t1", packsCount: 1, deductionType: "packs", isChase: false }
    ],
    runWheelAutoPreviewAnimation,
    startWheelAutospin: WheelWindow.methods!.startWheelAutospin,
    stopWheelAutospin: WheelWindow.methods!.stopWheelAutospin,
    scheduleNextWheelAutospin: WheelWindow.methods!.scheduleNextWheelAutospin
  };

  WheelWindow.methods!.toggleWheelAutospin.call(vm as never);
  vi.runAllTimers();

  assert.equal(vm.wheelAutospinEnabled, true);
  assert.equal(runWheelAutoPreviewAnimation.mock.calls.length, 1);
  vi.useRealTimers();
});

test("landOnSlot preview mode schedules the next autospin when enabled", () => {
  vi.stubGlobal("requestAnimationFrame", (() => 1) as typeof requestAnimationFrame);
  vi.stubGlobal("cancelAnimationFrame", (() => undefined) as typeof cancelAnimationFrame);

  const scheduleNextWheelAutospin = vi.fn();
  const vm: Record<string, unknown> = {
    activeWheelSlots: [
      { name: "Prize A", color: "#f00", cost: 5, tier: "t1", packsCount: 1, deductionType: "packs", isChase: false }
    ],
    wheelAutospinEnabled: true,
    wheelLastResult: "",
    wheelLastResultColor: "",
    wheelChaseDialog: false,
    scheduleNextWheelAutospin,
    saveWheelSession: vi.fn()
  };

  try {
    WheelWindow.methods!.landOnSlot.call(vm as never, 0, { recordSession: false });
  } finally {
    vi.unstubAllGlobals();
  }

  assert.equal(scheduleNextWheelAutospin.mock.calls.length, 1);
});

test("landOnSlot preview chase hit stops autospin before opening the chase flow", () => {
  vi.stubGlobal("requestAnimationFrame", (() => 1) as typeof requestAnimationFrame);
  vi.stubGlobal("cancelAnimationFrame", (() => undefined) as typeof cancelAnimationFrame);

  const stopWheelAutospin = vi.fn(function (this: Record<string, unknown>) {
    this.wheelAutospinEnabled = false;
  });
  const vm: Record<string, unknown> = {
    activeWheelSlots: [
      { name: "Chase Card", color: "#ff0", cost: 50, tier: "tc", packsCount: 1, deductionType: "singles", isChase: true }
    ],
    activeWheelConfig: {
      id: 1,
      spinPrice: 10,
      tiers: [{ id: "tc", boundLotId: 42, boundSinglesId: 777 }]
    },
    lots: [{
      id: 42,
      name: "Singles",
      lotType: "singles",
      singlesPurchases: [{ id: 777, item: "Chase Card", cost: 50, quantity: 1, marketValue: 60, image: "https://img.test/chase.png" }]
    }],
    wheelAutospinEnabled: true,
    wheelLastResult: "",
    wheelLastResultColor: "",
    wheelChaseDialog: false,
    wheelChasePreviewMode: false,
    stopWheelAutospin,
    saveWheelSession: vi.fn()
  };

  try {
    WheelWindow.methods!.landOnSlot.call(vm as never, 0, { recordSession: false });
  } finally {
    vi.unstubAllGlobals();
  }

  assert.equal(stopWheelAutospin.mock.calls.length, 1);
  assert.equal(vm.wheelAutospinEnabled, false);
  assert.equal(vm.wheelChaseDialog, true);
});

test("drawWheel reuses a cached static wheel render when slots and size do not change", () => {
  const makeContext2d = () => {
    const gradientStub = { addColorStop: vi.fn() };
    return {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      closePath: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      fillText: vi.fn(),
      strokeText: vi.fn(),
      lineTo: vi.fn(),
      drawImage: vi.fn(),
      createRadialGradient: vi.fn(() => gradientStub),
      measureText: vi.fn(() => ({ width: 8 })),
      imageSmoothingEnabled: true,
      lineJoin: "miter" as string,
      lineWidth: 1,
      strokeStyle: "" as string,
      fillStyle: "" as string,
      font: "" as string,
      textAlign: "" as string,
      textBaseline: "" as string
    };
  };

  const mainCtx = makeContext2d();
  const cacheCtx = makeContext2d();
  const cacheCanvas = {
    width: 0,
    height: 0,
    style: {},
    getContext: vi.fn(() => cacheCtx)
  };
  const createElement = vi.fn(() => cacheCanvas);
  const wheelCanvas = {
    width: 0,
    height: 0,
    style: {},
    ownerDocument: { createElement },
    getContext: vi.fn(() => mainCtx)
  };
  const slots = [
    { name: "Prize A", color: "#f00", cost: 5, tier: "t1", packsCount: 1, deductionType: "packs", isChase: false },
    { name: "Prize B", color: "#0f0", cost: 6, tier: "t2", packsCount: 1, deductionType: "packs", isChase: false }
  ];
  const vm: Record<string, unknown> = {
    $refs: {
      wheelCanvas
    },
    wheelDisplaySlots: slots,
    activeWheelSlots: slots,
    wheelCanvasSize: 320,
    wheelHighlightedSlotIndex: -1,
    _wheelStaticRenderCache: undefined
  };

  WheelWindow.methods!.drawWheel.call(vm as never, 0);
  WheelWindow.methods!.drawWheel.call(vm as never, Math.PI / 4);

  assert.equal(createElement.mock.calls.length, 1);
  assert.equal(mainCtx.drawImage.mock.calls.length, 2);
  assert.ok(vm._wheelStaticRenderCache);
});

test("recordPreviewSpinResult updates preview tracker only", () => {
  const vm: Record<string, unknown> = {
    activeWheelSlots: [
      { name: "Preview Prize", color: "#f00", cost: 5, tier: "t1", packsCount: 1, deductionType: "packs", isChase: false }
    ],
    wheelPreviewSpinCounts: [0],
    wheelPreviewTotalSpins: 0,
    wheelSpinCounts: [0],
    wheelTotalSpins: 0
  };

  WheelWindow.methods!.recordPreviewSpinResult.call(vm as never, 0);
  const controller = getWheelController(vm);
  assert.deepEqual(controller.previewSpinCounts, [1]);
  assert.equal(controller.previewTotalSpins, 1);
  assert.deepEqual(vm.wheelSpinCounts, [0]);
  assert.equal(vm.wheelTotalSpins, 0);
});

test("recordPreviewSpinResult updates controller when wheelDisplaySlots is a computed", () => {
  const slot = { name: "A", color: "#f00", cost: 5, tier: "t1", packsCount: 1, deductionType: "packs", isChase: false };
  const vm: Record<string, unknown> = {
    wheelMode: "config",
    wheelDisplaySlots: [slot],
    activeWheelSlots: [slot],
    wheelSpinCounts: [0],
    wheelTotalSpins: 0
  };
  const controller = getWheelController(vm);
  controller.previewSlots = [slot] as never;
  controller.previewSpinCounts = [0];
  controller.previewTotalSpins = 0;

  WheelWindow.methods!.recordPreviewSpinResult.call(vm as never, 0);
  assert.deepEqual(controller.previewSpinCounts, [1]);
  assert.equal(controller.previewTotalSpins, 1);
});

test("appendWheelFairnessHistory caps the log to the last 20 entries", () => {
  const vm: Record<string, unknown> = {
    wheelFairnessHistory: []
  };

  for (let i = 1; i <= 22; i++) {
    WheelWindow.methods!.appendWheelFairnessHistory.call(vm as never, {
      spinNumber: i,
      label: `Prize ${i}`,
      color: "#f00",
      hash: `hash-${i}`,
      seed: `seed-${i}`,
      timestamp: i
    });
  }

  assert.equal((vm.wheelFairnessHistory as unknown[]).length, 20);
  assert.equal((vm.wheelFairnessHistory as Array<{ spinNumber: number }>)[0]!.spinNumber, 3);
  assert.equal((vm.wheelFairnessHistory as Array<{ spinNumber: number }>)[19]!.spinNumber, 22);
});

test("appendWheelFairnessHistory keeps preview history separate", () => {
  const vm: Record<string, unknown> = {
    wheelFairnessHistory: [],
    wheelPreviewFairnessHistory: []
  };

  WheelWindow.methods!.appendWheelFairnessHistory.call(vm as never, {
    spinNumber: 1,
    label: "Live Prize",
    color: "#f00",
    hash: "live-hash",
    seed: "live-seed",
    timestamp: 1
  });
  WheelWindow.methods!.appendWheelFairnessHistory.call(vm as never, {
    spinNumber: 1,
    label: "Preview Prize",
    color: "#0f0",
    hash: "preview-hash",
    seed: "preview-seed",
    timestamp: 2
  }, { preview: true });

  assert.equal((vm.wheelFairnessHistory as Array<{ label: string }>)[0]!.label, "Live Prize");
  assert.equal((vm.wheelPreviewFairnessHistory as Array<{ label: string }>)[0]!.label, "Preview Prize");
});

test("wheelLatestFairnessEntry exposes proof details for the current verified spin", () => {
  const entry = WheelWindow.computed!.wheelLatestFairnessEntry.call({
    preferredLanguage: "en",
    wheelDisplayFairnessHistory: [{
      spinNumber: 4,
      label: "1 Pack",
      color: "#f00",
      hash: "server-hash",
      seed: "server-seed",
      clientSeed: "client-seed",
      verificationUrl: "https://api.example.test/wheel/fairness/verify?serverSeed=server-seed&clientSeed=client-seed&slotCount=1",
      algorithm: "whatfees-wheel-v1",
      timestamp: 4
    }],
    wheelSpinHash: "server-hash",
    wheelSpinSeed: "server-seed",
    wheelSpinClientSeed: "client-seed",
    wheelSpinVerificationUrl: "https://api.example.test/wheel/fairness/verify?serverSeed=server-seed&clientSeed=client-seed&slotCount=1",
    wheelSpinAlgorithm: "whatfees-wheel-v1",
    wheelLastResult: "🎉 1 Pack",
    wheelLastResultColor: "#f00",
    wheelDisplayTotalSpins: 4
  } as never);

  assert.equal(entry?.clientSeed, "client-seed");
  assert.equal(entry?.algorithm, "whatfees-wheel-v1");
  assert.match(String(entry?.verificationUrl || ""), /wheel\/fairness\/verify/);
});

test("wheelFairnessTitle differentiates server and local verification modes", () => {
  assert.equal(WheelWindow.computed!.wheelFairnessTitle.call({
    preferredLanguage: "en",
    wheelSpinning: false,
    wheelSpinVerificationUrl: "https://api.example.test/wheel/fairness/verify?serverSeed=s&clientSeed=c&slotCount=1"
  } as never), "Server verified");

  assert.equal(WheelWindow.computed!.wheelFairnessTitle.call({
    preferredLanguage: "en",
    wheelSpinning: false,
    wheelSpinVerificationUrl: ""
  } as never), "Local verified");
});

test("canTierBeChase requires a concrete singles item", () => {
  const singlesTier = {
    deductionType: "singles",
    boundLotId: 42,
    boundSinglesId: 7
  };
  const manualSinglesTier = {
    deductionType: "singles",
    boundLotId: 42,
    boundSinglesId: null
  };
  const bulkTier = {
    deductionType: "packs",
    boundLotId: 42,
    boundSinglesId: null
  };

  assert.equal(WheelWindow.methods!.canTierBeChase.call({} as never, singlesTier as never), true);
  assert.equal(WheelWindow.methods!.canTierBeChase.call({} as never, manualSinglesTier as never), false);
  assert.equal(WheelWindow.methods!.canTierBeChase.call({} as never, bulkTier as never), false);
});

test("config mode session cost updates after preview spin", () => {
  const slot = { name: "A", color: "#f00", cost: 5, tier: "t1", packsCount: 1, deductionType: "packs", isChase: false };
  const vm: Record<string, unknown> = {
    wheelMode: "config",
    wheelSpinCounts: [0],
    wheelTotalSpins: 0
  };
  const controller = getWheelController(vm);
  controller.previewSlots = [slot] as never;
  controller.activeSlots = [slot] as never;
  controller.previewSpinCounts = [0];
  controller.previewTotalSpins = 0;

  // Simulate what the real computeds produce
  const getDisplaySlots = () => WheelWindow.computed!.wheelDisplaySlots.call(vm as never);
  const getDisplayCounts = () => WheelWindow.computed!.wheelDisplaySpinCounts.call(vm as never);
  const getCost = () => {
    vm.wheelDisplaySlots = getDisplaySlots();
    vm.wheelDisplaySpinCounts = getDisplayCounts();
    return WheelWindow.computed!.wheelSessionCost.call(vm as never);
  };

  // Before spin: cost should be 0
  assert.equal(getCost(), 0);

  // Record a preview spin
  WheelWindow.methods!.recordPreviewSpinResult.call(vm as never, 0);

  // After spin: cost should reflect the new spin
  assert.equal(getCost(), 5);
  assert.deepEqual(controller.previewSpinCounts, [1]);
  assert.equal(controller.previewTotalSpins, 1);
});

test("live mode session cost updates after recording a spin result", () => {
  const slot = { name: "A", color: "#f00", cost: 5, tier: "t1", packsCount: 1, deductionType: "none", isChase: false };
  const vm: Record<string, unknown> = {
    wheelMode: "live",
    wheelSpinCounts: [0],
    wheelTotalSpins: 0,
    saveWheelSession: () => {}
  };
  const controller = getWheelController(vm);
  controller.activeSlots = [slot] as never;
  controller.previewSlots = [slot] as never;

  const getDisplaySlots = () => WheelWindow.computed!.wheelDisplaySlots.call(vm as never);
  const getDisplayCounts = () => WheelWindow.computed!.wheelDisplaySpinCounts.call(vm as never);
  const getCost = () => {
    vm.wheelDisplaySlots = getDisplaySlots();
    vm.wheelDisplaySpinCounts = getDisplayCounts();
    return WheelWindow.computed!.wheelSessionCost.call(vm as never);
  };

  // Before spin: cost should be 0
  assert.equal(getCost(), 0);

  // Record a live spin
  WheelWindow.methods!.recordSpinResult.call(vm as never, 0);

  // After spin: cost should reflect the new spin
  assert.equal(getCost(), 5);
  assert.deepEqual(vm.wheelSpinCounts, [1]);
  assert.equal(vm.wheelTotalSpins, 1);
});
