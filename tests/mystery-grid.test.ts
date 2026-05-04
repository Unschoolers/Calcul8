import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { normalizeWheelConfig } from "../src/app-core/shared/normalize-wheel-config.ts";
import { createWheelWindowState, getWheelController } from "../src/components/windows/wheel/coordinator/wheelControllerState.ts";
import { createDefaultWheelConfig } from "../src/components/windows/wheel/services/wheelDefaults.ts";
import { buildSlotsFromConfig } from "../src/components/windows/wheel/services/wheelSlots.ts";
import {
  buildMysteryGridCells,
  getMysteryGridCellCount,
  mysteryGridMethods,
  pickRandomMysteryGridCellIndex
} from "../src/components/windows/wheel/commands/mysteryGridMethods.ts";
import { wheelConfigMethods } from "../src/components/windows/wheel/commands/wheelConfigMethods.ts";
import { MysteryGridSurface } from "../src/components/windows/wheel/stage/MysteryGridSurface.ts";
import { wheelSessionMethods } from "../src/components/windows/wheel/commands/wheelSessionMethods.ts";
import { wheelSpinMethods } from "../src/components/windows/wheel/commands/wheelSpinMethods.ts";
import type { WheelConfig } from "../src/types/app.ts";

let committedLayoutHash = "c3ca5e1eef7edf9b0625f714c6eb25287a9e8bcc63a16d0de00ce711ddbe67ad";
const wheelAudioMock = vi.hoisted(() => ({
  playMysteryGridRevealDing: vi.fn(),
  playMysteryGridShuffleTick: vi.fn(),
  playWheelTick: vi.fn()
}));

vi.mock("../src/app-core/methods/wheel-fairness-api.ts", () => ({
  createWheelFairnessCommit: vi.fn(async (_slotCount: number, layoutHash: string) => {
    committedLayoutHash = layoutHash;
    return {
      commitToken: "commit-token",
      serverSeedHash: "server-seed-hash",
      layoutHash,
      slotCount: 2,
      algorithm: "whatfees-wheel-v1",
      committedAt: 123,
      expiresAt: 456
    };
  }),
  revealWheelFairnessResult: vi.fn(async () => ({
    resultIndex: 1,
    serverSeedHash: "server-seed-hash",
    serverSeed: "server-seed-value",
    clientSeed: "client-seed-value",
    layoutHash: committedLayoutHash,
    slotCount: 2,
    verificationUrl: "https://example.com/verify",
    algorithm: "whatfees-wheel-v1"
  })),
  createWheelFairnessProofLink: vi.fn(async () => ({
    verificationUrl: "https://example.com/verify?proofId=proof-123",
    jsonUrl: "https://example.com/verify?proofId=proof-123&format=json"
  }))
}));

vi.mock("../src/components/windows/wheel/services/wheelAudio.ts", () => wheelAudioMock);

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function createGridConfig(overrides: Partial<WheelConfig> = {}): WheelConfig {
  return {
    id: 1,
    name: "Mystery Grid",
    spinPrice: 10,
    targetMargin: 40,
    gameType: "grid",
    createdAt: "",
    tiers: [
      {
        id: "tier-a",
        label: "Floor",
        color: "#2563eb",
        chancePercent: 90,
        slots: 90,
        costPerTier: 4,
        packsCount: 1,
        deductionType: "packs",
        sets: [],
        celebrationEmoji: "✨"
      },
      {
        id: "tier-b",
        label: "Chase",
        color: "#f59e0b",
        chancePercent: 10,
        slots: 10,
        costPerTier: 25,
        packsCount: 1,
        deductionType: "none",
        sets: [],
        isChase: true,
        celebrationEmoji: "🏆"
      }
    ],
    ...overrides
  };
}

function createGridVm(mode: "config" | "live") {
  const state = createWheelWindowState() as Record<string, unknown>;
  const controller = getWheelController(state);
  const config = createGridConfig();
  const slots = buildSlotsFromConfig(config);
  state.wheelMode = mode;
  state.wheelSpinning = false;
  state.wheelCurrentAngle = 0;
  state.wheelLastResult = "";
  state.wheelTotalSpins = 0;
  state.wheelSpinCounts = [0, 0];
  state.wheelPendingInventoryIssues = [];
  state.wheelConfigs = [config];
  state.activeWheelConfigId = config.id;
  state.wheelDisplayConfig = config;
  state.activeWheelConfig = config;
  state.editingWheelConfig = config;
  state.wheelDisplaySlots = slots;
  controller.activeSlots = slots;
  controller.previewSlots = slots;
  controller.previewSpinCounts = new Array(slots.length).fill(0);
  state.saveWheelSession = vi.fn();
  state.recordSpinResult = vi.fn((slotIndex: number) => wheelSpinMethods.recordSpinResult.call(state, slotIndex));
  state.recordPreviewSpinResult = vi.fn((slotIndex: number) => wheelSpinMethods.recordPreviewSpinResult.call(state, slotIndex));
  state.appendWheelFairnessHistory = vi.fn((entry, options) => wheelSessionMethods.appendWheelFairnessHistory.call(state, entry, options));
  state.landOnSlot = vi.fn((slotIndex: number, options) => wheelSpinMethods.landOnSlot.call(state as never, slotIndex, options));
  state.triggerWheelCelebration = vi.fn();
  state.drawWheel = vi.fn();
  return state as Record<string, unknown> & {
    recordSpinResult: ReturnType<typeof vi.fn>;
    recordPreviewSpinResult: ReturnType<typeof vi.fn>;
    appendWheelFairnessHistory: ReturnType<typeof vi.fn>;
    landOnSlot: ReturnType<typeof vi.fn>;
  };
}

test("wheel configs default to wheel game mode and normalize game type additively", () => {
  const defaultConfig = createDefaultWheelConfig();
  assert.equal(defaultConfig.gameType, "wheel");

  const gridConfig = normalizeWheelConfig({
    ...createGridConfig(),
    outcomeCount: 36,
    gameType: "grid"
  }, []);
  assert.equal(gridConfig?.gameType, "grid");
  assert.equal(gridConfig?.outcomeCount, 36);
  assert.equal(gridConfig?.gridCellCount, 36);

  const legacyConfig = normalizeWheelConfig({
    ...createGridConfig(),
    gameType: "not-a-real-game"
  }, []);
  assert.equal(legacyConfig?.gameType, "wheel");
});

test("mystery grid uses the configured outcome count instead of a fixed 100 cells", () => {
  const config = createGridConfig({ outcomeCount: 25, gridCellCount: 25 });
  const slots = buildSlotsFromConfig(config);

  assert.equal(getMysteryGridCellCount(config), 25);
  assert.equal(slots.length, 25);
  assert.equal(slots.filter((slot) => slot.tier === "tier-a").length, 23);
  assert.equal(slots.filter((slot) => slot.tier === "tier-b").length, 2);
});

test("mystery grid disperses tier placement with a stable shuffled layout", () => {
  const config = createGridConfig({
    outcomeCount: 36,
    gridCellCount: 36,
    tiers: [
      {
        id: "tier-a",
        label: "Tier A",
        color: "#2563eb",
        chancePercent: 33,
        slots: 33,
        costPerTier: 4,
        packsCount: 1,
        deductionType: "packs",
        sets: []
      },
      {
        id: "tier-b",
        label: "Tier B",
        color: "#9333ea",
        chancePercent: 33,
        slots: 33,
        costPerTier: 6,
        packsCount: 1,
        deductionType: "packs",
        sets: []
      },
      {
        id: "tier-c",
        label: "Tier C",
        color: "#f59e0b",
        chancePercent: 34,
        slots: 34,
        costPerTier: 12,
        packsCount: 1,
        deductionType: "none",
        sets: []
      }
    ]
  });

  const firstLayout = buildSlotsFromConfig(config).map((slot) => slot.tier);
  const secondLayout = buildSlotsFromConfig(config).map((slot) => slot.tier);
  const columns = Array.from({ length: 6 }, (_, columnIndex) => (
    firstLayout.filter((_tier, slotIndex) => slotIndex % 6 === columnIndex)
  ));

  assert.deepEqual(firstLayout, secondLayout);
  assert.equal(firstLayout.filter((tier) => tier === "tier-a").length, 12);
  assert.equal(firstLayout.filter((tier) => tier === "tier-b").length, 12);
  assert.equal(firstLayout.filter((tier) => tier === "tier-c").length, 12);
  assert.ok(columns.some((column) => new Set(column).size > 1));
});

test("mystery grid surface keeps the layout close to square", () => {
  const styleFor25 = MysteryGridSurface.computed!.mysteryGridSurfaceStyle.call({
    mysteryGridCells: Array.from({ length: 25 })
  } as never);
  const styleFor36 = MysteryGridSurface.computed!.mysteryGridSurfaceStyle.call({
    mysteryGridCells: Array.from({ length: 36 })
  } as never);
  const styleFor100 = MysteryGridSurface.computed!.mysteryGridSurfaceStyle.call({
    mysteryGridCells: Array.from({ length: 100 })
  } as never);

  assert.equal(styleFor25["--mystery-grid-columns"], "5");
  assert.equal(styleFor36["--mystery-grid-columns"], "6");
  assert.equal(styleFor100["--mystery-grid-columns"], "10");
});

test("new game creation fixes game type at creation time", () => {
  const vm: Record<string, unknown> = {
    wheelConfigs: [],
    activeWheelConfigId: null,
    currentLotId: 42,
    lots: [{ id: 42, name: "Bulk Lot", lotType: "bulk", boxesPurchased: 1, packsPerBox: 10 }],
    currentLotCostPerPack: 4,
    activeScopeType: "personal",
    activeWorkspaceId: null,
    googleAuthEpoch: 0,
    hasProAccess: true
  };

  wheelConfigMethods.createNewGameConfig.call(vm, "grid");

  const created = (vm.wheelConfigs as WheelConfig[])[0]!;
  assert.equal(created.gameType, "grid");
  assert.equal(created.name, "New Mystery Grid");
  assert.equal(created.tiers[0]?.boundLotId, 42);
  assert.equal(vm.activeWheelConfigId, created.id);
  assert.equal(vm.wheelCreateDialog, false);
});

test("mystery grid cells expose reveal state without changing the configured outcome odds", () => {
  const config = createGridConfig({
    tiers: [
      {
        id: "tier-a",
        label: "Floor",
        color: "#2563eb",
        chancePercent: 75,
        slots: 75,
        costPerTier: 4,
        packsCount: 1,
        deductionType: "packs",
        sets: []
      },
      {
        id: "tier-b",
        label: "Chase",
        color: "#f59e0b",
        chancePercent: 25,
        slots: 25,
        costPerTier: 25,
        packsCount: 1,
        deductionType: "none",
        sets: [],
        isChase: true
      }
    ]
  });
  assert.equal(getMysteryGridCellCount(config), 100);

  const cells = buildMysteryGridCells({
    wheelDisplayConfig: config,
    wheelMode: "live",
    wheelGridReveals: [
      {
        cellIndex: 2,
        slotIndex: 1,
        label: "Chase",
        color: "#f59e0b",
        tier: "tier-b",
        spinNumber: 1,
        timestamp: 123
      }
    ],
    wheelPreviewGridReveals: []
  });

  assert.equal(cells.length, 100);
  assert.equal(cells[2]?.revealed, true);
  assert.equal(cells[2]?.label, "Chase");
  assert.equal(cells[0]?.revealed, false);
});

test("random mystery grid reveal picks from unrevealed cells instead of revealing sequentially", () => {
  const cells = buildMysteryGridCells({
    wheelDisplayConfig: createGridConfig(),
    wheelMode: "live",
    wheelGridReveals: [
      {
        cellIndex: 0,
        slotIndex: 1,
        label: "Chase",
        color: "#f59e0b",
        tier: "tier-b",
        spinNumber: 1,
        timestamp: 123
      }
    ],
    wheelPreviewGridReveals: []
  });

  assert.equal(pickRandomMysteryGridCellIndex(cells, () => 0), 1);
  assert.equal(pickRandomMysteryGridCellIndex(cells, () => 0.5), 50);
  assert.equal(pickRandomMysteryGridCellIndex(cells, () => 0.999), 99);
});

test("config grid reveal records preview session state and keeps live wheel counts untouched", async () => {
  const vm = createGridVm("config");

  await mysteryGridMethods.revealMysteryGridCell.call(vm, 4, true);

  const controller = getWheelController(vm);
  assert.equal(vm.recordSpinResult.mock.calls.length, 0);
  assert.equal(vm.recordPreviewSpinResult.mock.calls.length, 1);
  assert.equal(Number(controller.previewTotalSpins), 1);
  assert.equal(Number(vm.wheelTotalSpins), 0);
  assert.equal(controller.previewFairnessHistory.length, 1);
  assert.equal(controller.fairnessHistory.length, 0);
  assert.deepEqual(vm.appendWheelFairnessHistory.mock.calls[0]?.[1], { preview: true });
  assert.equal((vm.wheelPreviewGridReveals as unknown[]).length, 1);
  assert.equal((vm.wheelGridReveals as unknown[]).length, 0);
});

test("revealing every mystery grid cell preserves the configured cell counts exactly", async () => {
  const vm = createGridVm("config");

  for (let cellIndex = 0; cellIndex < 100; cellIndex += 1) {
    await mysteryGridMethods.revealMysteryGridCell.call(vm, cellIndex, true);
  }

  const reveals = vm.wheelPreviewGridReveals as Array<{ label: string }>;
  assert.equal(reveals.filter((entry) => entry.label === "Floor").length, 90);
  assert.equal(reveals.filter((entry) => entry.label === "Chase").length, 10);
});

test("random mystery grid reveal animates a selector before revealing the chosen cell", async () => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0.999);
  const vm = createGridVm("config");
  vm.animateMysteryGridRandomSelection = vi.fn(async (_targetCellIndex: number) => {
    vm.wheelGridHighlightCellIndex = _targetCellIndex;
  });

  await mysteryGridMethods.revealMysteryGridRandomCell.call(vm, true);

  assert.deepEqual(vm.animateMysteryGridRandomSelection.mock.calls[0], [99]);
  assert.equal((vm.wheelPreviewGridReveals as Array<{ cellIndex: number }>)[0]?.cellIndex, 99);
  assert.equal(wheelAudioMock.playMysteryGridRevealDing.mock.calls.length, 1);
  vi.useRealTimers();
});

test("mystery grid selector plays shuffle ticks during the random highlight animation", async () => {
  vi.spyOn(Math, "random").mockReturnValue(0);
  vi.stubGlobal("window", {
    matchMedia: vi.fn(() => ({ matches: false }))
  });
  vi.spyOn(globalThis, "setTimeout").mockImplementation((handler: TimerHandler) => {
    if (typeof handler === "function") {
      handler();
    }
    return 1 as never;
  });
  const vm = createGridVm("config");

  await mysteryGridMethods.animateMysteryGridRandomSelection.call(vm, 9);

  assert.equal(wheelAudioMock.playMysteryGridShuffleTick.mock.calls.length, 18);
  assert.deepEqual(wheelAudioMock.playMysteryGridShuffleTick.mock.calls.at(-1), [1]);
});

test("mystery grid selector can animate through the surface without updating the window each step", async () => {
  vi.spyOn(Math, "random").mockReturnValue(0);
  vi.stubGlobal("window", {
    matchMedia: vi.fn(() => ({ matches: false }))
  });
  vi.spyOn(globalThis, "setTimeout").mockImplementation((handler: TimerHandler) => {
    if (typeof handler === "function") {
      handler();
    }
    return 1 as never;
  });
  const vm = createGridVm("config");
  const surfacePreview = {
    previewMysteryGridSelection: vi.fn(),
    clearMysteryGridSelectionPreview: vi.fn()
  };
  vm.$refs = { mysteryGridSurface: surfacePreview };

  await mysteryGridMethods.animateMysteryGridRandomSelection.call(vm, 9);

  assert.equal(surfacePreview.previewMysteryGridSelection.mock.calls.length, 18);
  assert.equal(surfacePreview.previewMysteryGridSelection.mock.calls.at(-1)?.[0], 9);
  assert.equal(surfacePreview.clearMysteryGridSelectionPreview.mock.calls.length, 1);
  assert.equal(vm.wheelGridHighlightCellIndex, 9);
});

test("mystery grid surface local selector state controls highlighted cells", () => {
  const vm = {
    localGridSelectorAnimating: false,
    localGridHighlightCellIndex: -1,
    wheelGridRevealAnimating: false,
    wheelGridHighlightCellIndex: -1
  };
  const cell = { index: 3, revealed: false };

  MysteryGridSurface.methods!.previewMysteryGridSelection.call(vm, 3);

  assert.equal(MysteryGridSurface.methods!.isMysteryGridCellHighlighted.call(vm as never, cell as never), true);

  MysteryGridSurface.methods!.clearMysteryGridSelectionPreview.call(vm);

  assert.equal(MysteryGridSurface.methods!.isMysteryGridCellHighlighted.call(vm as never, cell as never), false);
});

test("mystery grid effects controls can mute reveal sounds and reduce selector motion", async () => {
  vi.spyOn(Math, "random").mockReturnValue(0);
  vi.stubGlobal("window", {
    matchMedia: vi.fn(() => ({ matches: false }))
  });
  vi.spyOn(globalThis, "setTimeout").mockImplementation((handler: TimerHandler) => {
    if (typeof handler === "function") {
      handler();
    }
    return 1 as never;
  });
  const vm = createGridVm("config");
  vm.wheelSoundEnabled = false;
  vm.wheelReducedMotion = true;

  await mysteryGridMethods.animateMysteryGridRandomSelection.call(vm, 9);
  await mysteryGridMethods.revealMysteryGridCell.call(vm, 9, true);

  assert.equal(wheelAudioMock.playMysteryGridShuffleTick.mock.calls.length, 0);
  assert.equal(wheelAudioMock.playMysteryGridRevealDing.mock.calls.length, 0);
  assert.equal(vm.wheelGridHighlightCellIndex, 9);
});

test("live grid reveal reuses wheel result recording and fairness history", async () => {
  const vm = createGridVm("live");

  await mysteryGridMethods.revealMysteryGridCell.call(vm, 7, true);

  const controller = getWheelController(vm);
  const slots = vm.wheelDisplaySlots as Array<{ name: string; color: string; celebrationEmoji?: string }>;
  const revealedSlot = slots[7]!;
  assert.equal(vm.recordSpinResult.mock.calls.length, 1);
  assert.equal(vm.recordPreviewSpinResult.mock.calls.length, 0);
  assert.equal(Number(vm.wheelTotalSpins), 1);
  assert.equal(Number(controller.previewTotalSpins), 0);
  assert.equal(controller.fairnessHistory.length, 1);
  assert.equal(controller.previewFairnessHistory.length, 0);
  assert.equal((vm.wheelGridReveals as unknown[]).length, 1);
  assert.equal((vm.wheelPreviewGridReveals as unknown[]).length, 0);
  assert.equal(vm.landOnSlot.mock.calls[0]?.[0], 7);
  assert.deepEqual(vm.landOnSlot.mock.calls[0]?.[1], { recordSession: true });
  assert.deepEqual((vm.triggerWheelCelebration as ReturnType<typeof vi.fn>).mock.calls[0], [{
    label: revealedSlot.name,
    color: revealedSlot.color,
    image: undefined,
    emoji: revealedSlot.celebrationEmoji,
    preview: false
  }]);
});

test("resetting a live mystery grid session rerolls hidden hit placement", async () => {
  vi.spyOn(Math, "random")
    .mockReturnValueOnce(0.111)
    .mockReturnValueOnce(0.999);
  const vm = createGridVm("live");
  const controller = getWheelController(vm);
  const initialLayout = (controller.activeSlots as Array<{ tier: string }>).map((slot) => slot.tier);

  await mysteryGridMethods.revealMysteryGridCell.call(vm, 0, true);
  wheelSessionMethods.resetWheelSession.call(vm as never);

  const rerolledLayout = (controller.activeSlots as Array<{ tier: string }>).map((slot) => slot.tier);

  assert.equal((vm.wheelGridReveals as unknown[]).length, 0);
  assert.equal(rerolledLayout.length, initialLayout.length);
  assert.notDeepEqual(rerolledLayout, initialLayout);
});
