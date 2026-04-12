import assert from "node:assert/strict";
import { test, vi } from "vitest";
import {
  getScopedWheelConfigDraftStorageKey,
  getScopedWheelConfigSessionStorageKey
} from "../src/app-core/storageKeys.ts";
import { createNestedWindowContextBridge } from "../src/components/windows/contextBridge.ts";
import { getWheelController, getWheelWindowLocalKeys } from "../src/components/windows/wheel/wheelControllerState.ts";
import {
  buildSlotsFromConfig,
  createWheelSale,
  WheelWindow
} from "../src/components/windows/wheel/WheelWindow.ts";
import type { WheelConfig } from "../src/types/app.ts";


test("loadWheelFromSession remaps saved spin counts by tier after rebuild", () => {
  const sessionKey = getScopedWheelConfigSessionStorageKey({ scopeType: "personal", workspaceId: null }, 99);
  const store: Record<string, string> = {};
  const mockStorage = {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; })
  };
  const origLocalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", { value: mockStorage, writable: true, configurable: true });
  mockStorage.setItem(sessionKey, JSON.stringify({
    wheelSpinCounts: [3],
    wheelSlotTiers: ["t1"],
    wheelTotalSpins: 3,
    wheelSessionUpdatedAt: 123,
    wheelSessionCostAdjustment: 0,
    wheelChaseTallyHistory: [],
    wheelSkippedDeductions: [],
    wheelCurrentAngle: 1.5,
    wheelLastResult: "Saved",
    wheelLastResultColor: "#fff"
  }));

  const vm: Record<string, unknown> = {
    activeWheelConfigId: 99,
    activeWheelSlots: [
      { name: "A", color: "#f00", cost: 5, tier: "t1", packsCount: 1, deductionType: "packs", isChase: false },
      { name: "B", color: "#0f0", cost: 5, tier: "t1", packsCount: 1, deductionType: "packs", isChase: false }
    ],
    activeScopeType: "personal",
    activeWorkspaceId: null,
    wheelSpinCounts: [],
    wheelTotalSpins: 0
  };

  const restored = WheelWindow.methods!.loadWheelFromSession.call(vm as never);
  assert.equal(restored, true);
  assert.deepEqual(vm.wheelSpinCounts, [2, 1]);
  assert.equal(vm.wheelTotalSpins, 3);
  assert.equal(vm.wheelLastResult, "Saved");

  Object.defineProperty(globalThis, "localStorage", { value: origLocalStorage, writable: true, configurable: true });
});

test("loadWheelConfig clears invalid chase flags for non-singles tiers", () => {
  const config: WheelConfig = {
    id: 5,
    name: "Wheel",
    spinPrice: 10,
    targetMargin: 40,
    createdAt: "",
    tiers: [
      { id: "bulk", label: "Bulk Chase", color: "#f00", slots: 1, costPerTier: 5, packsCount: 1, deductionType: "packs", boundLotId: 1, isChase: true, sets: [] }
    ]
  };

  const vm: Record<string, unknown> = {
    wheelConfigs: [config],
    activeWheelConfigId: 5,
    loadWheelFromSession: vi.fn(() => false),
    drawWheel: vi.fn()
  };

  WheelWindow.methods!.loadWheelConfig.call(vm as never);
  assert.equal((vm.wheelConfigs as WheelConfig[])[0]!.tiers[0]!.isChase, false);
  assert.equal((vm.editingWheelConfig as WheelConfig).tiers[0]!.isChase, false);
});

test("getWheelController does not attach reactive aliases onto bridge-style proxy contexts", () => {
  const source = {
    wheelController: {
      activeSlots: [],
      previewSlots: [],
      inventoryWarning: "",
      lastResultColor: "rgb(var(--v-theme-primary))",
      previewSpinCounts: [],
      previewTotalSpins: 0,
      spinSeed: "",
      spinHash: "seed-hash",
      spinClientSeed: "",
      spinVerificationUrl: "",
      spinAlgorithm: "",
      showSeed: false,
      fairnessHistoryOpen: false,
      sessionNetRevenue: null,
      sessionCostAdjustment: 0,
      previewFairnessHistory: [],
      fairnessHistory: [],
      previewChaseTallyHistory: [],
      chaseTallyHistory: [],
      highlightedSlotIndex: -1
    }
  } as Record<string, unknown>;
  const bridge = createNestedWindowContextBridge(source);

  const controllerA = getWheelController(bridge);
  const controllerB = getWheelController(bridge);

  assert.equal(controllerA, controllerB);
  assert.equal(controllerA.spinHash, "seed-hash");
  assert.equal(Object.getOwnPropertyDescriptor(source, "wheelSpinHash"), undefined);
});

test("loadWheelConfig restores autosaved draft without mutating the live config", () => {
  const config: WheelConfig = {
    id: 5,
    name: "Wheel",
    spinPrice: 10,
    targetMargin: 40,
    createdAt: "",
    tiers: [
      { id: "bulk", label: "Bulk Prize", color: "#f00", slots: 1, costPerTier: 5, packsCount: 1, deductionType: "packs", boundLotId: 1, sets: [] }
    ]
  };
  const draft = JSON.parse(JSON.stringify(config)) as WheelConfig;
  draft.spinPrice = 15;
  const key = getScopedWheelConfigDraftStorageKey({ scopeType: "personal", workspaceId: null }, 5);
  const store: Record<string, string> = { [key]: JSON.stringify(draft) };
  const mockStorage = {
    getItem: vi.fn((storageKey: string) => store[storageKey] ?? null),
    setItem: vi.fn((storageKey: string, value: string) => { store[storageKey] = value; })
  };
  const origLocalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", { value: mockStorage, writable: true, configurable: true });

  const vm: Record<string, unknown> = {
    wheelConfigs: [config],
    activeWheelConfigId: 5,
    activeScopeType: "personal",
    activeWorkspaceId: null,
    loadWheelFromSession: vi.fn(() => false),
    drawWheel: vi.fn()
  };

  WheelWindow.methods!.loadWheelConfig.call(vm as never);
  assert.equal((vm.editingWheelConfig as WheelConfig).spinPrice, 15);
  assert.equal(((vm.wheelConfigs as WheelConfig[])[0]!.spinPrice), 10);

  Object.defineProperty(globalThis, "localStorage", { value: origLocalStorage, writable: true, configurable: true });
});

test("loadWheelConfig normalizes legacy singles tiers away from pack deduction", () => {
  const config: WheelConfig = {
    id: 5,
    name: "Wheel",
    spinPrice: 10,
    targetMargin: 40,
    createdAt: "",
    tiers: [
      {
        id: "single",
        label: "Rei Ayanami",
        color: "#f0f",
        slots: 1,
        costPerTier: 5,
        packsCount: 1,
        deductionType: "packs",
        boundLotId: 42,
        boundSinglesId: null,
        sets: []
      }
    ]
  };
  const origLocalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: vi.fn(() => null)
    },
    writable: true,
    configurable: true
  });

  const vm: Record<string, unknown> = {
    wheelConfigs: [config],
    activeWheelConfigId: 5,
    activeScopeType: "personal",
    activeWorkspaceId: null,
    lots: [{
      id: 42,
      name: "Singles Lot",
      lotType: "singles",
      singlesPurchases: [{ id: 7, item: "Rei Ayanami", quantity: 1, cost: 0, marketValue: 46 }]
    }],
    loadWheelFromSession: vi.fn(() => false),
    drawWheel: vi.fn()
  };

  WheelWindow.methods!.loadWheelConfig.call(vm as never);

  assert.equal((vm.wheelConfigs as WheelConfig[])[0]!.tiers[0]!.deductionType, "singles");
  assert.equal((vm.editingWheelConfig as WheelConfig).tiers[0]!.deductionType, "singles");
  assert.equal((vm.appliedWheelConfigSnapshot as WheelConfig).tiers[0]!.deductionType, "singles");
  assert.equal((vm.activeWheelSlots as Array<{ deductionType: string }>)[0]!.deductionType, "singles");

  Object.defineProperty(globalThis, "localStorage", { value: origLocalStorage, writable: true, configurable: true });
});

test("loadWheelConfig clears rendered wheel state when no active config exists", () => {
  const vm: Record<string, unknown> = {
    wheelConfigs: [],
    activeWheelConfigId: null,
    activeWheelSlots: [{ name: "Old Prize", color: "#f00", cost: 5, tier: "t1", packsCount: 1, deductionType: "packs", isChase: false }],
    wheelPreviewSlots: [{ name: "Old Prize", color: "#f00", cost: 5, tier: "t1", packsCount: 1, deductionType: "packs", isChase: false }],
    wheelSpinCounts: [4],
    wheelTotalSpins: 4,
    wheelLastResult: "Old Prize",
    wheelInventoryWarning: "warning",
    wheelSessionCostAdjustment: 12,
    wheelSkippedDeductions: [{
      slotName: "Old Prize",
      slotColor: "#f00",
      slotCost: 5,
      slotTier: "t1",
      slotPacksCount: 1,
      slotDeductionType: "packs",
      slotIndex: 0,
      selectedLotId: 1,
      spinNumber: 1
    }],
    wheelEndingSession: true,
    wheelChaseDialog: true,
    wheelChaseReplacementSinglesId: 77,
    wheelChasePendingTierId: "t1",
    wheelChaseTallyHistory: [{ tierId: "t1", label: "Old Prize", color: "#f00", count: 4 }],
    wheelPreviewSpinCounts: [4],
    wheelPreviewTotalSpins: 4,
    wheelPreviewChaseTallyHistory: [{ tierId: "t1", label: "Old Prize", color: "#f00", count: 4 }],
    appliedWheelConfigSnapshot: {
      id: 5,
      name: "Old Wheel",
      spinPrice: 10,
      targetMargin: 40,
      createdAt: "",
      tiers: []
    },
    drawWheel: vi.fn()
  };

  WheelWindow.methods!.loadWheelConfig.call(vm as never);
  const controller = getWheelController(vm);

  assert.equal(vm.editingWheelConfig, null);
  assert.equal(vm.appliedWheelConfigSnapshot, null);
  assert.deepEqual(vm.activeWheelSlots, []);
  assert.deepEqual(vm.wheelPreviewSlots, []);
  assert.deepEqual(vm.wheelSpinCounts, []);
  assert.equal(vm.wheelTotalSpins, 0);
  assert.equal(vm.wheelLastResult, "");
  assert.equal(vm.wheelInventoryWarning, "");
  assert.equal(vm.wheelSessionCostAdjustment, 0);
  assert.deepEqual(vm.wheelSkippedDeductions, []);
  assert.equal(vm.wheelEndingSession, false);
  assert.equal(vm.wheelChaseDialog, false);
  assert.equal(vm.wheelChaseReplacementSinglesId, null);
  assert.equal(vm.wheelChasePendingTierId, "");
  assert.deepEqual(vm.wheelChaseTallyHistory, []);
  assert.deepEqual(vm.wheelPreviewSpinCounts, []);
  assert.equal(vm.wheelPreviewTotalSpins, 0);
  assert.deepEqual(vm.wheelPreviewChaseTallyHistory, []);
  assert.deepEqual(controller.fairnessHistory, []);
  assert.deepEqual(controller.previewFairnessHistory, []);
  assert.equal(controller.spinHash, "");
  assert.equal(controller.spinSeed, "");
  assert.equal(controller.spinClientSeed, "");
  assert.equal(controller.spinVerificationUrl, "");
  assert.equal(controller.spinAlgorithm, "");
  assert.equal(controller.showSeed, false);
  assert.equal(controller.fairnessHistoryOpen, false);
  assert.equal(controller.highlightedSlotIndex, -1);
  assert.equal(controller.sessionNetRevenue, null);
  assert.equal(controller.lastResultColor, "rgb(var(--v-theme-primary))");
});

test("ensureWheelEditorState rebuilds local editing and slot state from the active config", () => {
  const activeConfig: WheelConfig = {
    id: 5,
    name: "Crazy Wheel!",
    spinPrice: 10,
    targetMargin: 15,
    createdAt: "",
    tiers: [
      { id: "t1", label: "1 Pack", color: "#f00", slots: 2, costPerTier: 5, packsCount: 1, deductionType: "packs", boundLotId: 1, sets: [] }
    ]
  };
  const vm: Record<string, unknown> = {
    activeWheelConfig: activeConfig,
    activeWheelConfigId: 5,
    editingWheelConfig: null,
    activeWheelSlots: [],
    wheelPreviewSlots: [],
    wheelSpinCounts: [],
    wheelTotalSpins: 0,
    wheelCurrentAngle: 0,
    drawWheel: vi.fn()
  };

  WheelWindow.methods!.ensureWheelEditorState.call(vm as never);

  assert.equal((vm.editingWheelConfig as WheelConfig | null)?.id, 5);
  assert.equal((vm.activeWheelSlots as Array<unknown>).length, 2);
  assert.equal((vm.wheelPreviewSlots as Array<unknown>).length, 2);
  assert.deepEqual(vm.wheelSpinCounts, [0, 0]);
  assert.deepEqual(vm.wheelPreviewSpinCounts, [0, 0]);
});

test("saveWheelDraft persists the config without changing the applied wheel or pushing immediately", () => {
  const config: WheelConfig = {
    id: 5,
    name: "Wheel",
    spinPrice: 10,
    targetMargin: 40,
    createdAt: "",
    tiers: [
      { id: "bulk", label: "Bulk Prize", color: "#f00", slots: 1, costPerTier: 5, packsCount: 1, deductionType: "packs", boundLotId: 1, sets: [] }
    ]
  };
  const editing = JSON.parse(JSON.stringify(config)) as WheelConfig;
  editing.spinPrice = 15;
  const removeItem = vi.fn();
  const origLocalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", {
    value: { removeItem },
    writable: true,
    configurable: true
  });

  const pushCloudSync = vi.fn().mockResolvedValue(undefined);
  const vm: Record<string, unknown> = {
    wheelConfigs: [config],
    editingWheelConfig: editing,
    appliedWheelConfigSnapshot: JSON.parse(JSON.stringify(config)),
    activeScopeType: "personal",
    activeWorkspaceId: null,
    isGoogleSignedIn: true,
    isOffline: false,
    currentLotId: null,
    pushCloudSync
  };

  WheelWindow.methods!.saveWheelDraft.call(vm as never);

  assert.equal((vm.wheelConfigs as WheelConfig[])[0]!.spinPrice, 15);
  assert.equal((vm.appliedWheelConfigSnapshot as WheelConfig).spinPrice, 10);
  assert.equal(pushCloudSync.mock.calls.length, 0);
  assert.equal(removeItem.mock.calls.length, 1);

  Object.defineProperty(globalThis, "localStorage", { value: origLocalStorage, writable: true, configurable: true });
});

test("applyWheelConfig clears pending changes and cancels queued draft sync", async () => {
  vi.useFakeTimers();

  const config: WheelConfig = {
    id: 5,
    name: "Wheel",
    spinPrice: 10,
    targetMargin: 40,
    createdAt: "",
    tiers: [
      { id: "bulk", label: "Bulk Prize", color: "#f00", slots: 1, costPerTier: 5, packsCount: 1, deductionType: "packs", boundLotId: 1, sets: [] }
    ]
  };
  const editing = JSON.parse(JSON.stringify(config)) as WheelConfig;
  editing.spinPrice = 15;
  const removeItem = vi.fn();
  const origLocalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", {
    value: { removeItem },
    writable: true,
    configurable: true
  });

  const pushCloudSync = vi.fn().mockResolvedValue(undefined);
  const vm: Record<string, unknown> = {
    wheelConfigs: [config],
    editingWheelConfig: editing,
    appliedWheelConfigSnapshot: JSON.parse(JSON.stringify(config)),
    activeWheelConfigId: 5,
    activeWheelSlots: buildSlotsFromConfig(config),
    wheelPreviewSlots: [],
    wheelSpinCounts: [0],
    wheelTotalSpins: 0,
    wheelLastResult: "",
    wheelSkippedDeductions: [],
    wheelCurrentAngle: 0,
    wheelSessionCostAdjustment: 0,
    wheelChaseTallyHistory: [],
    wheelPreviewSpinCounts: [],
    wheelPreviewTotalSpins: 0,
    wheelPreviewChaseTallyHistory: [],
    wheelEndingSession: false,
    wheelChaseDialog: false,
    wheelChaseReplacementSinglesId: null,
    wheelChasePendingTierId: "",
    activeScopeType: "personal",
    activeWorkspaceId: null,
    isGoogleSignedIn: true,
    isOffline: false,
    currentLotId: null,
    pushCloudSync,
    saveWheelSession: vi.fn(),
    drawWheel: vi.fn(),
    saveWheelDraft: vi.fn(function (this: Record<string, unknown>) {
      WheelWindow.methods!.saveWheelDraft.call(this as never);
    })
  };

  vm._wheelDraftSaveTimeoutId = globalThis.setTimeout(() => {
    (vm.saveWheelDraft as () => void)();
  }, 1200);

  WheelWindow.methods!.applyWheelConfig.call(vm as never);
  await vi.advanceTimersByTimeAsync(2000);

  assert.equal(pushCloudSync.mock.calls.length, 1);
  assert.equal(WheelWindow.computed!.hasPendingWheelChanges.call(vm as never), false);
  assert.equal((vm.editingWheelConfig as WheelConfig).spinPrice, 15);
  assert.equal((vm.appliedWheelConfigSnapshot as WheelConfig).spinPrice, 15);
  assert.equal(removeItem.mock.calls.length, 1);

  Object.defineProperty(globalThis, "localStorage", { value: origLocalStorage, writable: true, configurable: true });
  vi.useRealTimers();
});

test("preview chase replacement keeps prior chase tally as a separate tracker line", () => {
  const vm: Record<string, unknown> = {
    wheelConfigs: [{
      id: 1,
      name: "Wheel",
      spinPrice: 10,
      targetMargin: 40,
      createdAt: "",
      tiers: [
        { id: "tc", label: "Old Chase", color: "#09f", slots: 1, costPerTier: 25, packsCount: 1, deductionType: "singles", boundLotId: 42, boundSinglesId: 1, isChase: true, sets: [] }
      ]
    }],
    activeWheelConfigId: 1,
    editingWheelConfig: {
      id: 1,
      name: "Wheel",
      spinPrice: 10,
      targetMargin: 40,
      createdAt: "",
      tiers: [
        { id: "tc", label: "Old Chase", color: "#09f", slots: 1, costPerTier: 25, packsCount: 1, deductionType: "singles", boundLotId: 42, boundSinglesId: 1, isChase: true, sets: [] }
      ]
    },
    wheelPreviewSlots: [
      { name: "Old Chase", color: "#09f", cost: 25, tier: "tc", packsCount: 1, deductionType: "singles", isChase: true }
    ],
    wheelPreviewSpinCounts: [2],
    wheelPreviewChaseTallyHistory: [],
    wheelChasePreviewMode: true,
    wheelChaseReplacementSinglesId: 2,
    wheelChasePendingTierId: "tc",
    lots: [{
      id: 42,
      name: "Singles",
      lotType: "singles",
      singlesPurchases: [
        { id: 1, item: "Old Chase", cost: 25, quantity: 1, marketValue: 30 },
        { id: 2, item: "New Chase", cost: 40, quantity: 1, marketValue: 45 }
      ]
    }],
    drawWheel: vi.fn()
  };

  WheelWindow.methods!.confirmChaseReplacement.call(vm as never);
  const history = vm.wheelPreviewChaseTallyHistory as Array<{ tierId: string; label: string; color: string; count: number }>;
  assert.deepEqual(history, [{ tierId: "tc", label: "Old Chase", color: "#09f", count: 2 }]);

  const tally = WheelWindow.computed!.wheelTallyByTier.call({
    wheelMode: "config",
    wheelDisplayConfig: vm.editingWheelConfig,
    wheelDisplaySlots: vm.wheelPreviewSlots,
    wheelDisplaySpinCounts: vm.wheelPreviewSpinCounts,
    wheelPreviewChaseTallyHistory: vm.wheelPreviewChaseTallyHistory
  } as never);
  assert.equal(tally.length, 1);
  assert.deepEqual(tally.map((entry: { label: string; count: number }) => ({ label: entry.label, count: entry.count })), [
    { label: "Old Chase", count: 2 }
  ]);
});

test("landOnSlot opens chase dialog for chase tiers", () => {
  const triggerWheelCelebration = vi.fn();
  const vm: Record<string, unknown> = {
    activeWheelSlots: [
      { name: "Chase Card", color: "#ff0", cost: 50, tier: "tc", packsCount: 1, deductionType: "singles", isChase: true }
    ],
    wheelSpinCounts: [0],
    wheelTotalSpins: 0,
    wheelLastResult: "",
    wheelLastResultColor: "",
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
    wheelChaseDialog: false,
    wheelChasePendingTierId: "",
    wheelChaseReplacementSinglesId: null,
    triggerWheelCelebration,
    saveWheelSession: vi.fn()
  };

  WheelWindow.methods!.landOnSlot.call(vm as never, 0);
  assert.equal(vm.wheelChaseDialog, true);
  assert.equal(vm.wheelChasePendingTierId, "tc");
  assert.equal(triggerWheelCelebration.mock.calls.length, 1);
});

test("recordSpinResult auto-records sale for non-chase tiers with bound lot", () => {
  const addSaleFn = vi.fn();
  const vm: Record<string, unknown> = {
    activeWheelSlots: [
      { name: "Regular", color: "#f00", cost: 5, tier: "t1", packsCount: 2, deductionType: "packs", isChase: false }
    ],
    wheelSpinCounts: [0],
    wheelTotalSpins: 0,
    activeWheelConfig: { id: 1, spinPrice: 10, tiers: [{ id: "t1", boundLotId: 42 }] },
    addWheelSaleToLot: addSaleFn,
    lots: [{
      id: 42,
      name: "Bulk Lot",
      boxesPurchased: 1,
      packsPerBox: 8
    }],
    wheelSkippedDeductions: [],
    activeWheelConfigId: 1,
    loadSalesForLotId: vi.fn(() => []),
    saveWheelSession: vi.fn()
  };

  WheelWindow.methods!.recordSpinResult.call(vm as never, 0);
  assert.equal(addSaleFn.mock.calls.length, 1);
  assert.equal(addSaleFn.mock.calls[0]![0], 42);
  const sale = addSaleFn.mock.calls[0]![1];
  assert.equal(sale.type, "wheel");
  assert.equal(sale.quantity, 2);
  assert.equal(sale.packsCount, 2);
});

test("recordSpinResult does not record sale when tier items count is zero", () => {
  const addSaleFn = vi.fn();
  const vm: Record<string, unknown> = {
    activeWheelSlots: [
      { name: "Hellish Blizzard", color: "#09f", cost: 25, tier: "t1", packsCount: 0, deductionType: "singles", isChase: false }
    ],
    wheelSpinCounts: [0],
    wheelTotalSpins: 0,
    activeWheelConfig: { id: 1, spinPrice: 10, tiers: [{ id: "t1", boundLotId: 42, boundSinglesId: 777, packsCount: 0 }] },
    addWheelSaleToLot: addSaleFn,
    lots: [{
      id: 42,
      name: "Singles",
      lotType: "singles",
      singlesPurchases: [{ id: 777, item: "Hellish Blizzard", cost: 25, quantity: 1, marketValue: 30 }]
    }],
    wheelSkippedDeductions: [],
    activeWheelConfigId: 1,
    loadSalesForLotId: vi.fn(() => []),
    saveWheelSession: vi.fn()
  };

  WheelWindow.methods!.recordSpinResult.call(vm as never, 0);
  assert.equal(addSaleFn.mock.calls.length, 0);
  assert.equal((vm.wheelSkippedDeductions as unknown[]).length, 0);
});

test("recordSpinResult auto-skips singles with quantity 0", () => {
  const addSaleFn = vi.fn();
  const vm: Record<string, unknown> = {
    activeWheelSlots: [
      { name: "Out of Stock", color: "#f00", cost: 5, tier: "t1", packsCount: 1, deductionType: "singles", isChase: false }
    ],
    wheelSpinCounts: [0],
    wheelTotalSpins: 0,
    activeWheelConfig: { id: 1, spinPrice: 10, tiers: [{ id: "t1", boundLotId: 42, boundSinglesId: 777 }] },
    addWheelSaleToLot: addSaleFn,
    lots: [{
      id: 42, name: "Singles", lotType: "singles",
      singlesPurchases: [{ id: 777, item: "Empty Card", cost: 5, quantity: 0, marketValue: 10 }]
    }],
    wheelSkippedDeductions: [],
    activeWheelConfigId: 1,
    saveWheelSession: vi.fn()
  };

  WheelWindow.methods!.recordSpinResult.call(vm as never, 0);
  // Should NOT record sale
  assert.equal(addSaleFn.mock.calls.length, 0);
  // Should add to skipped deductions
  assert.equal((vm.wheelSkippedDeductions as unknown[]).length, 1);
});

test("recordSpinResult skips sold-out singles when linked entry has no remaining stock", () => {
  const addSaleFn = vi.fn();
  const vm: Record<string, unknown> = {
    activeWheelSlots: [
      { name: "Hellish Blizzard", color: "#09f", cost: 25, tier: "t1", packsCount: 1, deductionType: "singles", isChase: false }
    ],
    wheelSpinCounts: [0],
    wheelTotalSpins: 0,
    activeWheelConfig: { id: 1, spinPrice: 10, tiers: [{ id: "t1", boundLotId: 42, boundSinglesId: 777 }] },
    addWheelSaleToLot: addSaleFn,
    lots: [{
      id: 42,
      name: "Singles",
      lotType: "singles",
      singlesPurchases: [{ id: 777, item: "Hellish Blizzard", cost: 25, quantity: 1, marketValue: 30 }]
    }],
    wheelSkippedDeductions: [],
    activeWheelConfigId: 1,
    loadSalesForLotId: vi.fn(() => [{
      id: 999,
      type: "wheel",
      quantity: 1,
      packsCount: 1,
      price: 10,
      buyerShipping: 0,
      date: "2026-03-25",
      singlesPurchaseEntryId: 777
    }]),
    saveWheelSession: vi.fn()
  };

  WheelWindow.methods!.recordSpinResult.call(vm as never, 0);
  assert.equal(addSaleFn.mock.calls.length, 0);
  assert.equal((vm.wheelSkippedDeductions as unknown[]).length, 1);
});

test("recordSpinResult skips pack sale when bound lot lacks remaining packs", () => {
  const addSaleFn = vi.fn();
  const vm: Record<string, unknown> = {
    activeWheelSlots: [
      { name: "Pack Prize", color: "#f55", cost: 8, tier: "t1", packsCount: 3, deductionType: "packs", isChase: false }
    ],
    wheelSpinCounts: [0],
    wheelTotalSpins: 0,
    activeWheelConfig: { id: 1, spinPrice: 10, tiers: [{ id: "t1", boundLotId: 42 }] },
    addWheelSaleToLot: addSaleFn,
    lots: [{
      id: 42,
      name: "Bulk Lot",
      boxesPurchased: 1,
      packsPerBox: 2
    }],
    wheelSkippedDeductions: [],
    activeWheelConfigId: 1,
    loadSalesForLotId: vi.fn(() => []),
    saveWheelSession: vi.fn()
  };

  WheelWindow.methods!.recordSpinResult.call(vm as never, 0);
  assert.equal(addSaleFn.mock.calls.length, 0);
  assert.equal((vm.wheelSkippedDeductions as unknown[]).length, 1);
  assert.match(String(vm.wheelInventoryWarning), /only 2 remain/i);
});

test("getSinglesItemsForTier filters sold-out singles entries", () => {
  const tier = { boundLotId: 42 } as never;
  const vm: Record<string, unknown> = {
    lots: [{
      id: 42,
      name: "Singles",
      lotType: "singles",
      singlesPurchases: [
        { id: 1, item: "Available Card", quantity: 2, cost: 5, marketValue: 6 },
        { id: 2, item: "Sold Out Card", quantity: 1, cost: 5, marketValue: 6 }
      ]
    }],
    loadSalesForLotId: vi.fn(() => [{
      id: 200,
      type: "wheel",
      quantity: 1,
      packsCount: 1,
      price: 10,
      buyerShipping: 0,
      date: "2026-03-25",
      singlesPurchaseEntryId: 2
    }])
  };

  const items = WheelWindow.methods!.getSinglesItemsForTier.call(vm as never, tier);
  assert.equal(items.some((item: { value: number | null }) => item.value === 2), false);
  assert.equal(items.some((item: { value: number | null }) => item.value === 1), true);
});

test("tierSourceItems excludes bulk lots with no remaining packs even if not marked complete", () => {
  const vm: Record<string, unknown> = {
    lots: [
      { id: 10, name: "Empty Bulk", lotType: "bulk", boxesPurchased: 1, packsPerBox: 2, isComplete: false },
      { id: 11, name: "Live Bulk", lotType: "bulk", boxesPurchased: 1, packsPerBox: 4, isComplete: false }
    ],
    loadSalesForLotId: vi.fn((lotId: number) => lotId === 10
      ? [{
        id: 1,
        type: "wheel",
        quantity: 2,
        packsCount: 2,
        price: 10,
        buyerShipping: 0,
        date: "2026-03-25"
      }]
      : []),
    sales: [],
    currentLotId: null
  };

  const items = WheelWindow.computed!.tierSourceItems.call(vm as never);
  assert.equal(items.some((item: { value: number | null }) => item.value === 10), false);
  assert.equal(items.some((item: { value: number | null }) => item.value === 11), true);
});

test("tierSourceItems excludes sold-out singles lots even if not marked complete", () => {
  const vm: Record<string, unknown> = {
    lots: [
      {
        id: 20,
        name: "Sold Out Singles",
        lotType: "singles",
        isComplete: false,
        singlesPurchases: [{ id: 201, item: "A", quantity: 1, cost: 5, marketValue: 6 }]
      },
      {
        id: 21,
        name: "Live Singles",
        lotType: "singles",
        isComplete: false,
        singlesPurchases: [{ id: 211, item: "B", quantity: 2, cost: 5, marketValue: 6 }]
      }
    ],
    loadSalesForLotId: vi.fn((lotId: number) => lotId === 20
      ? [{
        id: 2,
        type: "wheel",
        quantity: 1,
        packsCount: 1,
        price: 10,
        buyerShipping: 0,
        date: "2026-03-25",
        singlesPurchaseEntryId: 201
      }]
      : []),
    sales: [],
    currentLotId: null
  };

  const items = WheelWindow.computed!.tierSourceItems.call(vm as never);
  assert.equal(items.some((item: { value: number | null }) => item.value === 20), false);
  assert.equal(items.some((item: { value: number | null }) => item.value === 21), true);
});

test("tierSourceItems does not include a manual null option", () => {
  const vm: Record<string, unknown> = {
    lots: [
      { id: 10, name: "Bulk Lot", lotType: "bulk", boxesPurchased: 1, packsPerBox: 4 }
    ],
    loadSalesForLotId: vi.fn(() => []),
    sales: [],
    currentLotId: null
  };

  const items = WheelWindow.computed!.tierSourceItems.call(vm as never);
  assert.equal(items.some((item: { value: number | null }) => item.value == null), false);
  assert.equal(items[0]!.value, 10);
});

test("addTier leaves source blank when current lot has no remaining inventory", () => {
  const vm: Record<string, unknown> = {
    editingWheelConfig: {
      id: 1,
      name: "Wheel",
      spinPrice: 10,
      targetMargin: 40,
      createdAt: "",
      tiers: []
    },
    currentLotId: 42,
    currentLotCostPerPack: 7,
    lots: [
      { id: 42, name: "Dead Bulk", lotType: "bulk", boxesPurchased: 1, packsPerBox: 2 }
    ],
    loadSalesForLotId: vi.fn(() => [{
      id: 1,
      type: "wheel",
      quantity: 2,
      packsCount: 2,
      price: 10,
      buyerShipping: 0,
      date: "2026-03-26"
    }])
  };

  WheelWindow.methods!.addTier.call(vm as never);
  const tier = (vm.editingWheelConfig as WheelConfig).tiers[0]!;
  assert.equal(tier.boundLotId, null);
});

test("singles tiers lock count to one and untracked sale resets cost to zero", () => {
  const vm: Record<string, unknown> = {
    lots: [{
      id: 42,
      name: "Singles",
      lotType: "singles",
      singlesPurchases: [{ id: 7, item: "Hellish Blizzard", cost: 25, quantity: 1, marketValue: 30 }]
    }]
  };
  const tier: WheelConfig["tiers"][number] = {
    id: "t1",
    label: "Tier",
    color: "#09f",
    slots: 1,
    costPerTier: 99,
    packsCount: 3,
    deductionType: "packs",
    boundLotId: null,
    boundSinglesId: null,
    sets: []
  };

  WheelWindow.methods!.onTierLotChange.call(vm as never, tier as never, 42);
  assert.equal(tier.deductionType, "singles");
  assert.equal(tier.packsCount, 1);
  assert.equal(tier.costPerTier, 0);

  WheelWindow.methods!.onTierSinglesChange.call(vm as never, tier as never, 7);
  assert.equal(tier.packsCount, 1);
  assert.equal(tier.costPerTier, 25);

  WheelWindow.methods!.onTierSinglesChange.call(vm as never, tier as never, null);
  assert.equal(tier.packsCount, 1);
  assert.equal(tier.costPerTier, 0);
});

test("confirmChaseReplacement preserves session cost via adjustment", () => {
  // Setup: chase tier "tc" costs $50, has 2 spins already counted
  // Replacement item costs $10 → adjustment should be 2 × (50 - 10) = 80
  const config: WheelConfig = {
    id: 1, name: "Test", spinPrice: 10, targetMargin: 40, createdAt: "",
    tiers: [
      { id: "t1", label: "Normal", color: "#f00", slots: 3, costPerTier: 5, packsCount: 1, deductionType: "packs", sets: [] },
      { id: "tc", label: "Old Chase", color: "#ff0", slots: 1, costPerTier: 50, packsCount: 1, deductionType: "singles", sets: [], isChase: true, boundLotId: 100 }
    ]
  };

  const slots = buildSlotsFromConfig(config);
  // Find the chase slot index
  const chaseIdx = slots.findIndex((s) => s.tier === "tc");
  const counts = new Array(slots.length).fill(0);
  counts[chaseIdx] = 2; // 2 wins on chase at $50 each

  const addSaleFn = vi.fn();

  const vm: Record<string, unknown> = {
    wheelChaseReplacementSinglesId: 777,
    wheelChasePendingTierId: "tc",
    wheelChaseDialog: true,
    wheelConfigs: [JSON.parse(JSON.stringify(config))],
    activeWheelConfigId: 1,
    lots: [{
      id: 100, name: "Singles Lot", lotType: "singles",
      singlesPurchases: [
        { id: 777, item: "New Chase Card", cardNumber: "SET-001", cost: 10, quantity: 1, marketValue: 15 }
      ]
    }],
    activeWheelSlots: slots,
    wheelSpinCounts: counts,
    wheelSessionCostAdjustment: 0,
    wheelChaseTallyHistory: [],
    editingWheelConfig: JSON.parse(JSON.stringify(config)),
    wheelLastResult: "",
    wheelLastResultColor: "",
    wheelCurrentAngle: 0,
    $nextTick: vi.fn(),
    addWheelSaleToLot: addSaleFn,
    saveWheelSession: vi.fn()
  };

  // Mock drawWheel and recordChaseSale
  (vm as Record<string, unknown>).drawWheel = vi.fn();
  vm.recordChaseSale = WheelWindow.methods!.recordChaseSale.bind(vm as never);

  WheelWindow.methods!.confirmChaseReplacement.call(vm as never);

  // Adjustment should compensate: 2 spins × ($50 old - $10 new) = 80
  assert.equal(vm.wheelSessionCostAdjustment, 80);

  // Dialog should be closed
  assert.equal(vm.wheelChaseDialog, false);

  // Tier label should be updated
  const updatedConfig = (vm.wheelConfigs as WheelConfig[])[0]!;
  const updatedTier = updatedConfig.tiers.find((t) => t.id === "tc")!;
  assert.equal(updatedTier.label, "New Chase Card");
  assert.equal(updatedTier.costPerTier, 10);
  assert.equal(updatedTier.boundSinglesId, 777);

  // Session cost should be preserved:
  // Before replacement: 2 × 50 = 100
  // After with adjustment: newSlots have cost 10, counts restored,
  // so base = 2 × 10 = 20, adjustment = 80 → total = 100
  const newSlots = vm.activeWheelSlots as Array<{ cost: number; tier: string }>;
  const newCounts = vm.wheelSpinCounts as number[];
  const baseCost = newCounts.reduce((sum: number, c: number, i: number) => sum + c * (newSlots[i]?.cost || 0), 0);
  assert.equal(baseCost + (vm.wheelSessionCostAdjustment as number), 100);

  // Sale should have been auto-recorded
  assert.equal(addSaleFn.mock.calls.length, 1);
  assert.equal(addSaleFn.mock.calls[0]![0], 100); // lotId
  const sale = addSaleFn.mock.calls[0]![1];
  assert.equal(sale.type, "wheel");
  assert.equal(sale.quantity, 1);
  assert.equal(sale.memo, "Wheel spin: Old Chase");
});

test("confirmChaseReplacement accumulates adjustment across multiple replacements", () => {
  // First chase was $50 → replaced with $30 (1 spin) → adj = 20
  // Then $30 → replaced with $10 (2 spins now) → adj += 2 × (30 - 10) = 40 → total 60
  const config: WheelConfig = {
    id: 1, name: "Test", spinPrice: 10, targetMargin: 40, createdAt: "",
    tiers: [
      { id: "tc", label: "Chase", color: "#ff0", slots: 1, costPerTier: 30, packsCount: 1, deductionType: "singles", sets: [], isChase: true, boundLotId: 100 }
    ]
  };

  const slots = buildSlotsFromConfig(config);
  const counts = [2]; // 2 total spins on this tier

  const vm: Record<string, unknown> = {
    wheelChaseReplacementSinglesId: 888,
    wheelChasePendingTierId: "tc",
    wheelChaseDialog: true,
    wheelConfigs: [JSON.parse(JSON.stringify(config))],
    activeWheelConfigId: 1,
    lots: [{
      id: 100, name: "Singles", lotType: "singles",
      singlesPurchases: [
        { id: 888, item: "Card C", cost: 10, quantity: 1, marketValue: 12 }
      ]
    }],
    activeWheelSlots: slots,
    wheelSpinCounts: counts,
    wheelSessionCostAdjustment: 20, // from a prior replacement
    wheelChaseTallyHistory: [],
    editingWheelConfig: JSON.parse(JSON.stringify(config)),
    wheelLastResult: "",
    wheelLastResultColor: "",
    wheelCurrentAngle: 0,
    $nextTick: vi.fn(),
    drawWheel: vi.fn(),
    addWheelSaleToLot: vi.fn(),
    recordChaseSale: vi.fn(),
    saveWheelSession: vi.fn()
  };

  WheelWindow.methods!.confirmChaseReplacement.call(vm as never);

  // Previous adjustment: 20
  // New adjustment: 2 × (30 - 10) = 40
  // Total: 60
  assert.equal(vm.wheelSessionCostAdjustment, 60);
});

test("resetWheelSession clears cost adjustment", () => {
  const vm: Record<string, unknown> = {
    activeWheelSlots: [{ cost: 5 }],
    wheelTotalSpins: 5,
    wheelSpinCounts: [5],
    wheelLastResult: "test",
    wheelLastResultColor: "#f00",
    wheelPendingDeduction: {},
    wheelSessionLotSelections: { t1: 1 },
    wheelSkippedDeductions: [{}],
    wheelEndingSession: true,
    wheelSpinHash: "abc",
    wheelSpinSeed: "def",
    wheelShowSeed: true,
    wheelChaseDialog: true,
    wheelChaseReplacementSinglesId: 123,
    wheelChasePendingTierId: "tc",
    wheelFairnessHistoryOpen: true,
    wheelPreviewFairnessHistory: [{ spinNumber: 1, label: "Preview", color: "#0f0", hash: "ph", seed: "ps", timestamp: 1 }],
    wheelFairnessHistory: [{ spinNumber: 1, label: "Live", color: "#f00", hash: "h", seed: "s", timestamp: 1 }],
    wheelSessionNetRevenue: 44.2,
    wheelSessionCostAdjustment: 80,
    wheelChaseTallyHistory: [{ tierId: "tc", label: "Old", color: "#f00", count: 3 }],
    saveWheelSession: vi.fn()
  };

  WheelWindow.methods!.resetWheelSession.call(vm as never);

  assert.equal(vm.wheelTotalSpins, 0);
  assert.equal(vm.wheelSessionNetRevenue, 0);
  assert.equal(vm.wheelSessionCostAdjustment, 0);
  assert.equal(vm.wheelChaseDialog, false);
  assert.equal(vm.wheelChasePendingTierId, "");
  assert.deepEqual(vm.wheelFairnessHistory, []);
  assert.equal(vm.wheelFairnessHistoryOpen, false);
  assert.deepEqual(vm.wheelChaseTallyHistory, []);
});

test("createWheelSale builds a sale with lot shipping", () => {
  const config = { id: 1, spinPrice: 10, tiers: [] } as never;
  const lots = [{
    id: 42,
    name: "My Lot",
    sellingShippingPerOrder: 3.5,
    platformFeePercent: 8,
    additionalFeePercent: 2.9,
    additionalFeeAppliesTo: "sale_plus_shipping",
    fixedFeePerOrder: 0.3
  }] as never;
  const sale = createWheelSale({
    config, tier: "t1", cost: 5, packsCount: 2, deductionType: "packs",
    label: "Prize", lotId: 42, lots
  });
  assert.equal(sale.type, "wheel");
  assert.equal(sale.price, 10);
  assert.equal(sale.quantity, 2);
  assert.equal(sale.packsCount, 2);
  assert.equal(sale.buyerShipping, 3.5);
  assert.equal(sale.memo, "Wheel spin: Prize");
  assert.equal(sale.winningTierId, "t1");
  assert.equal(sale.costOfWinningTier, 5);
  assert.ok(Math.abs((sale.netRevenue ?? 0) - 8.5085) < 0.001);
});

test("createWheelSale uses spinNumber in memo when provided", () => {
  const config = { id: 1, spinPrice: 10, tiers: [] } as never;
  const lots = [{ id: 42, name: "My Lot", sellingShippingPerOrder: 0 }] as never;
  const sale = createWheelSale({
    config, tier: "t1", cost: 5, packsCount: 1, deductionType: "packs",
    label: "Prize", lotId: 42, lots, spinNumber: 7
  });
  assert.equal(sale.memo, "Wheel spin #7: Prize");
});

test("createWheelSale defaults buyerShipping to 0 when lot not found", () => {
  const config = { id: 1, spinPrice: 10, tiers: [] } as never;
  const sale = createWheelSale({
    config, tier: "t1", cost: 5, packsCount: 1, deductionType: "packs",
    label: "Prize", lotId: 99, lots: []
  });
  assert.equal(sale.buyerShipping, 0);
});

test("createWheelSale quantity is 1 for singles deduction type and sets singlesPurchaseEntryId", () => {
  const config = { id: 1, spinPrice: 10, tiers: [] } as never;
  const sale = createWheelSale({
    config, tier: "t1", cost: 25, packsCount: 3, deductionType: "singles",
    label: "Chase Card", lotId: 42, lots: [], singlesEntryId: 777
  });
  assert.equal(sale.quantity, 1);
  assert.equal(sale.singlesPurchaseEntryId, 777);
});

test("createWheelSale omits singlesPurchaseEntryId when not provided", () => {
  const config = { id: 1, spinPrice: 10, tiers: [] } as never;
  const sale = createWheelSale({
    config, tier: "t1", cost: 5, packsCount: 2, deductionType: "packs",
    label: "Prize", lotId: 42, lots: []
  });
  assert.equal(sale.singlesPurchaseEntryId, undefined);
});

// ── Chase sale recording ────────────────────────────────────────

test("recordChaseSale calls addWheelSaleToLot for the tier's bound lot", () => {
  const addSaleFn = vi.fn();
  const vm: Record<string, unknown> = {
    wheelConfigs: [{
      id: 1, name: "W", spinPrice: 10, targetMargin: 40, createdAt: "",
      tiers: [{ id: "tc", label: "Chase Card", color: "#ff0", slots: 1, costPerTier: 25, packsCount: 1, deductionType: "singles", sets: [], isChase: true, boundLotId: 100, boundSinglesId: 777 }]
    }],
    activeWheelConfigId: 1,
    lots: [{
      id: 100,
      name: "Singles Lot",
      lotType: "singles",
      singlesPurchases: [{ id: 777, item: "Chase Card", cost: 25, quantity: 2, marketValue: 30 }]
    }],
    loadSalesForLotId: vi.fn(() => []),
    addWheelSaleToLot: addSaleFn
  };

  WheelWindow.methods!.recordChaseSale.call(vm as never, "tc");

  assert.equal(addSaleFn.mock.calls.length, 1);
  assert.equal(addSaleFn.mock.calls[0]![0], 100);
  const sale = addSaleFn.mock.calls[0]![1];
  assert.equal(sale.type, "wheel");
  assert.equal(sale.quantity, 1);
  assert.equal(sale.price, 10);
  assert.equal(sale.memo, "Wheel spin: Chase Card");
  assert.equal(sale.costOfWinningTier, 25);
  assert.equal(sale.linkedWheelId, 1);
});

test("recordChaseSale does nothing when tier has no bound lot", () => {
  const addSaleFn = vi.fn();
  const vm: Record<string, unknown> = {
    wheelConfigs: [{
      id: 1, name: "W", spinPrice: 10, targetMargin: 40, createdAt: "",
      tiers: [{ id: "tc", label: "Chase", color: "#ff0", slots: 1, costPerTier: 25, packsCount: 1, deductionType: "singles", sets: [], isChase: true }]
    }],
    activeWheelConfigId: 1,
    addWheelSaleToLot: addSaleFn
  };

  WheelWindow.methods!.recordChaseSale.call(vm as never, "tc");

  assert.equal(addSaleFn.mock.calls.length, 0);
});

test("keepChase records sale and closes dialog", () => {
  const addSaleFn = vi.fn();
  const vm: Record<string, unknown> = {
    wheelChasePendingTierId: "tc",
    wheelChaseDialog: true,
    wheelConfigs: [{
      id: 1, name: "W", spinPrice: 10, targetMargin: 40, createdAt: "",
      tiers: [{ id: "tc", label: "Chase Card", color: "#ff0", slots: 1, costPerTier: 25, packsCount: 1, deductionType: "singles", sets: [], isChase: true, boundLotId: 100, boundSinglesId: 777 }]
    }],
    activeWheelConfigId: 1,
    lots: [{
      id: 100,
      name: "Singles Lot",
      lotType: "singles",
      singlesPurchases: [{ id: 777, item: "Chase Card", cost: 25, quantity: 2, marketValue: 30 }]
    }],
    loadSalesForLotId: vi.fn(() => []),
    addWheelSaleToLot: addSaleFn,
    recordChaseSale: WheelWindow.methods!.recordChaseSale,
    saveWheelSession: vi.fn(),
    activeScopeType: "personal",
    activeWorkspaceId: null
  };

  WheelWindow.methods!.keepChase.call(vm as never);

  assert.equal(vm.wheelChaseDialog, false);
  assert.equal(addSaleFn.mock.calls.length, 1);
  assert.equal(addSaleFn.mock.calls[0]![0], 100);
});

test("canKeepChase returns true when current chase item has quantity > 1", () => {
  const vm: Record<string, unknown> = {
    wheelChasePendingTierId: "tc",
    wheelConfigs: [{
      id: 1, name: "W", spinPrice: 10, targetMargin: 40, createdAt: "",
      tiers: [{ id: "tc", label: "Card", color: "#ff0", slots: 1, costPerTier: 25, packsCount: 1, deductionType: "singles", sets: [], isChase: true, boundLotId: 100, boundSinglesId: 777 }]
    }],
    activeWheelConfigId: 1,
    lots: [{
      id: 100, name: "Singles Lot", lotType: "singles",
      singlesPurchases: [{ id: 777, item: "Card", cost: 25, quantity: 3, marketValue: 30 }]
    }]
  };

  assert.equal(WheelWindow.methods!.canKeepChase.call(vm as never), true);
});

test("canKeepChase returns false when current chase item has quantity <= 1", () => {
  const vm: Record<string, unknown> = {
    wheelChasePendingTierId: "tc",
    wheelConfigs: [{
      id: 1, name: "W", spinPrice: 10, targetMargin: 40, createdAt: "",
      tiers: [{ id: "tc", label: "Card", color: "#ff0", slots: 1, costPerTier: 25, packsCount: 1, deductionType: "singles", sets: [], isChase: true, boundLotId: 100, boundSinglesId: 777 }]
    }],
    activeWheelConfigId: 1,
    lots: [{
      id: 100, name: "Singles Lot", lotType: "singles",
      singlesPurchases: [{ id: 777, item: "Card", cost: 25, quantity: 1, marketValue: 30 }]
    }]
  };

  assert.equal(WheelWindow.methods!.canKeepChase.call(vm as never), false);
});

test("canKeepChase returns false when no boundSinglesId", () => {
  const vm: Record<string, unknown> = {
    wheelChasePendingTierId: "tc",
    wheelConfigs: [{
      id: 1, name: "W", spinPrice: 10, targetMargin: 40, createdAt: "",
      tiers: [{ id: "tc", label: "Card", color: "#ff0", slots: 1, costPerTier: 25, packsCount: 1, deductionType: "singles", sets: [], isChase: true, boundLotId: 100 }]
    }],
    activeWheelConfigId: 1,
    lots: [{
      id: 100, name: "Singles Lot", lotType: "singles",
      singlesPurchases: [{ id: 777, item: "Card", cost: 25, quantity: 5, marketValue: 30 }]
    }]
  };

  assert.equal(WheelWindow.methods!.canKeepChase.call(vm as never), false);
});

// ── canApplyWheelConfig ─────────────────────────────────────────

test("canApplyWheelConfig returns true when all tiers have boundLotId", () => {
  const vm: Record<string, unknown> = {
    editingWheelConfig: {
      id: 1, name: "W", spinPrice: 10, targetMargin: 40, createdAt: "",
      tiers: [
        { id: "t1", label: "A", color: "#f00", slots: 2, costPerTier: 5, packsCount: 1, deductionType: "packs", sets: [], boundLotId: 10 },
        { id: "t2", label: "B", color: "#0f0", slots: 1, costPerTier: 10, packsCount: 1, deductionType: "singles", sets: [], boundLotId: 20 }
      ]
    }
  };
  assert.equal(WheelWindow.computed!.canApplyWheelConfig.call(vm as never), true);
});

test("canApplyWheelConfig returns false when a tier is missing boundLotId", () => {
  const vm: Record<string, unknown> = {
    editingWheelConfig: {
      id: 1, name: "W", spinPrice: 10, targetMargin: 40, createdAt: "",
      tiers: [
        { id: "t1", label: "A", color: "#f00", slots: 2, costPerTier: 5, packsCount: 1, deductionType: "packs", sets: [], boundLotId: 10 },
        { id: "t2", label: "B", color: "#0f0", slots: 1, costPerTier: 10, packsCount: 1, deductionType: "singles", sets: [] }
      ]
    }
  };
  assert.equal(WheelWindow.computed!.canApplyWheelConfig.call(vm as never), false);
});

test("canApplyWheelConfig returns false with no tiers", () => {
  const vm: Record<string, unknown> = {
    editingWheelConfig: {
      id: 1, name: "W", spinPrice: 10, targetMargin: 40, createdAt: "",
      tiers: []
    }
  };
  assert.equal(WheelWindow.computed!.canApplyWheelConfig.call(vm as never), false);
});

test("handleWheelModeChange asks for confirmation before switching to live and keeps inspector on config", () => {
  const vm: Record<string, unknown> = {
    wheelMode: "config",
    wheelInspectorTab: "config",
    wheelLiveConfirmDialog: false,
    wheelRequestedMode: null
  };

  WheelWindow.methods!.handleWheelModeChange.call(vm as never, "live");

  assert.equal(vm.wheelMode, "config");
  assert.equal(vm.wheelInspectorTab, "config");
  assert.equal(vm.wheelLiveConfirmDialog, true);
  assert.equal(vm.wheelRequestedMode, "live");
});

test("confirmWheelModeChange applies the requested live mode and moves the inspector to session", () => {
  const vm: Record<string, unknown> = {
    wheelMode: "config",
    wheelInspectorTab: "config",
    wheelLiveConfirmDialog: true,
    wheelRequestedMode: "live"
  };

  WheelWindow.methods!.confirmWheelModeChange.call(vm as never);

  assert.equal(vm.wheelMode, "live");
  assert.equal(vm.wheelInspectorTab, "session");
  assert.equal(vm.wheelLiveConfirmDialog, false);
  assert.equal(vm.wheelRequestedMode, null);
});

test("confirmWheelModeChange stops config autospin before switching to live", () => {
  const stopWheelAutospin = vi.fn();
  const vm: Record<string, unknown> = {
    wheelMode: "config",
    wheelAutospinEnabled: true,
    wheelInspectorTab: "config",
    wheelLiveConfirmDialog: true,
    wheelRequestedMode: "live",
    stopWheelAutospin
  };

  WheelWindow.methods!.confirmWheelModeChange.call(vm as never);

  assert.equal(stopWheelAutospin.mock.calls.length, 1);
  assert.equal(vm.wheelMode, "live");
});

test("wheelInspectorTabItems reuse a shared tab model for config mode", () => {
  const items = WheelWindow.computed!.wheelInspectorTabItems.call({
    wheelMode: "config",
    preferredLanguage: "en"
  } as never);

  assert.deepEqual(items.map((item: { id: string }) => item.id), ["config", "session", "history"]);
});

test("wheelInspectorTabItems hide builder outside config mode", () => {
  const items = WheelWindow.computed!.wheelInspectorTabItems.call({
    wheelMode: "live",
    preferredLanguage: "en"
  } as never);

  assert.deepEqual(items.map((item: { id: string }) => item.id), ["session", "history"]);
});

test("wheelCompactFabActions expose config-mode history, session, builder ordering", () => {
  const actions = WheelWindow.computed!.wheelCompactFabActions.call({
    wheelMode: "config",
    preferredLanguage: "en",
    hasLotSelected: true,
    wheelEndingSession: false
  } as never);

  assert.deepEqual(actions.map((action: { id: string }) => action.id), ["history", "session", "builder"]);
});

test("wheelCompactFabActions expose live-mode history, session, end ordering", () => {
  const actions = WheelWindow.computed!.wheelCompactFabActions.call({
    wheelMode: "live",
    preferredLanguage: "en",
    hasLotSelected: true,
    wheelEndingSession: false
  } as never);

  assert.deepEqual(actions.map((action: { id: string }) => action.id), ["history", "session", "end"]);
  assert.equal(actions[2]?.color, "error");
});

test("wheel window local keys include top-level mode and inspector state", () => {
  const localKeys = getWheelWindowLocalKeys();

  assert.ok(localKeys.includes("wheelController"));
  assert.ok(localKeys.includes("wheelMode"));
  assert.ok(localKeys.includes("wheelInspectorTab"));
  assert.ok(localKeys.includes("wheelMobileInspectorOpen"));
  assert.ok(localKeys.includes("wheelPresentationMode"));
});

test("wheelStageSummaryCards provide config-mode summary cards from the shared model", () => {
  const cards = WheelWindow.computed!.wheelStageSummaryCards.call({
    wheelMode: "config",
    preferredLanguage: "en",
    expectedMarginDisplay: "12.5%",
    expectedMarginHint: "Above target by 2.5%",
    expectedMarginColor: "rgb(var(--v-theme-success))",
    wheelDisplayConfig: { targetMargin: 10 },
    wheelDisplaySlots: [{}, {}, {}],
    hasPendingWheelChanges: false
  } as never);

  assert.deepEqual(cards.map((card: { id: string }) => card.id), [
    "expected-margin",
    "target-margin",
    "builder-status"
  ]);
});

test("handleWheelModeChange returns the inspector to config when switching back", () => {
  const vm: Record<string, unknown> = {
    wheelMode: "live",
    wheelInspectorTab: "session",
    wheelLiveConfirmDialog: false,
    wheelRequestedMode: null
  };

  WheelWindow.methods!.handleWheelModeChange.call(vm as never, "config");

  assert.equal(vm.wheelMode, "config");
  assert.equal(vm.wheelInspectorTab, "config");
  assert.equal(vm.wheelLiveConfirmDialog, false);
  assert.equal(vm.wheelRequestedMode, null);
});

test("focusWheelInspector updates the tab and scrolls the inspector into view when available", async () => {
  const scrollIntoView = vi.fn();
  const vm: Record<string, unknown> = {
    wheelInspectorTab: "config",
    $refs: {
      wheelInspectorPanel: {
        scrollIntoView
      }
    }
  };

  WheelWindow.methods!.focusWheelInspector.call(vm as never, "history");
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(vm.wheelInspectorTab, "history");
  assert.equal(scrollIntoView.mock.calls.length, 1);
  assert.deepEqual(scrollIntoView.mock.calls[0]?.[0], { behavior: "smooth", block: "start" });
});

test("focusWheelInspector is safe when the inspector ref is missing", async () => {
  const vm: Record<string, unknown> = {
    wheelInspectorTab: "config",
    $refs: {}
  };

  WheelWindow.methods!.focusWheelInspector.call(vm as never, "session");
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(vm.wheelInspectorTab, "session");
});

test("focusWheelInspector supports component refs that expose scrollIntoView via $el", async () => {
  const scrollIntoView = vi.fn();
  const vm: Record<string, unknown> = {
    wheelInspectorTab: "config",
    $refs: {
      wheelInspectorPanel: {
        $el: {
          scrollIntoView
        }
      }
    }
  };

  WheelWindow.methods!.focusWheelInspector.call(vm as never, "history");
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(vm.wheelInspectorTab, "history");
  assert.equal(scrollIntoView.mock.calls.length, 1);
  assert.deepEqual(scrollIntoView.mock.calls[0]?.[0], { behavior: "smooth", block: "start" });
});

test("normalizeWheelCompactInspectorState closes the mobile sheet when layout is no longer compact", () => {
  const vm: Record<string, unknown> = {
    wheelViewportWidth: 1400,
    wheelPresentationMode: false,
    wheelMobileInspectorOpen: true
  };

  WheelWindow.methods!.normalizeWheelCompactInspectorState.call(vm as never);

  assert.equal(vm.wheelMobileInspectorOpen, false);
});

test("normalizeWheelCompactInspectorState keeps the mobile sheet closed in presentation mode", () => {
  const vm: Record<string, unknown> = {
    wheelViewportWidth: 900,
    wheelPresentationMode: true,
    wheelMobileInspectorOpen: true
  };

  WheelWindow.methods!.normalizeWheelCompactInspectorState.call(vm as never);

  assert.equal(vm.wheelMobileInspectorOpen, false);
});

// ── Session persistence ─────────────────────────────────────────

test("saveWheelSession stores session to localStorage", () => {
  const store: Record<string, string> = {};
  const mockStorage = { setItem: vi.fn((k: string, v: string) => { store[k] = v; }) };
  const origLocalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", { value: mockStorage, writable: true, configurable: true });

  const vm: Record<string, unknown> = {
    activeWheelConfigId: 42,
    activeScopeType: "personal",
    activeWorkspaceId: null,
    wheelSpinCounts: [1, 2],
    wheelPreviewSlots: [{ tier: "t1" }, { tier: "t2" }],
    wheelPreviewSpinCounts: [2, 3],
    wheelPreviewTotalSpins: 5,
    wheelPreviewFairnessHistory: [{ spinNumber: 5, label: "Preview Prize", color: "#0f0", hash: "preview-hash", seed: "preview-seed", timestamp: 5 }],
    wheelPreviewChaseTallyHistory: [{ tierId: "t1", label: "Preview Prize", color: "#0f0", count: 2 }],
    wheelTotalSpins: 3,
    wheelSessionUpdatedAt: 0,
    wheelSessionNetRevenue: 22.75,
    wheelSessionCostAdjustment: 10,
    wheelFairnessHistory: [{ spinNumber: 3, label: "Prize", color: "#f00", hash: "hash-3", seed: "seed-3", timestamp: 3 }],
    wheelChaseTallyHistory: [],
    wheelSkippedDeductions: [],
    wheelSessionLotSelections: {},
    wheelCurrentAngle: 1.5,
    wheelLastResult: "🎉 Prize",
    wheelLastResultColor: "#f00",
    wheelSpinHash: "hash-live",
    wheelSpinSeed: "seed-live",
    wheelSpinClientSeed: "client-live",
    wheelSpinVerificationUrl: "https://api.example.test/wheel/fairness/verify?serverSeed=seed-live&clientSeed=client-live&slotCount=2",
    wheelSpinAlgorithm: "whatfees-wheel-v1"
  };

  WheelWindow.methods!.saveWheelSession.call(vm as never);

  assert.equal(mockStorage.setItem.mock.calls.length, 2);
  assert.equal(mockStorage.setItem.mock.calls[0]![0], "whatfees_wheel_session__cfg__42");
  const parsed = JSON.parse(store["whatfees_wheel_session__cfg__42"]!);
  assert.deepEqual(parsed.wheelSpinCounts, [1, 2]);
  assert.equal(parsed.wheelTotalSpins, 3);
  assert.deepEqual(parsed.wheelPreviewSpinCounts, [2, 3]);
  assert.equal(parsed.wheelPreviewTotalSpins, 5);
  assert.equal(parsed.wheelPreviewFairnessHistory.length, 1);
  assert.equal(parsed.wheelPreviewChaseTallyHistory.length, 1);
  assert.equal(parsed.wheelSessionNetRevenue, 22.75);
  assert.equal(parsed.wheelFairnessHistory.length, 1);
  assert.equal(parsed.wheelSpinHash, "hash-live");
  assert.equal(parsed.wheelSpinSeed, "seed-live");
  assert.equal(parsed.wheelSpinClientSeed, "client-live");
  assert.match(String(parsed.wheelSpinVerificationUrl || ""), /wheel\/fairness\/verify/);
  assert.equal(parsed.wheelSpinAlgorithm, "whatfees-wheel-v1");
  assert.equal(mockStorage.setItem.mock.calls[1]![0], "whatfees_wheel_session");

  Object.defineProperty(globalThis, "localStorage", { value: origLocalStorage, writable: true, configurable: true });
});

test("loadWheelFromSession restores session from localStorage", () => {
  const session = {
    wheelSpinCounts: [3, 4],
    wheelPreviewSpinCounts: [4, 1],
    wheelPreviewSlotTiers: ["t1", "t2"],
    wheelPreviewTotalSpins: 5,
    wheelPreviewFairnessHistory: [{ spinNumber: 5, label: "Preview Prize", color: "#0f0", hash: "preview-hash", seed: "preview-seed", timestamp: 5 }],
    wheelPreviewChaseTallyHistory: [{ tierId: "t1", label: "Preview Prize", color: "#0f0", count: 4 }],
    wheelTotalSpins: 7,
    wheelSessionNetRevenue: 61.1,
    wheelSessionCostAdjustment: 5,
    wheelFairnessHistory: [{ spinNumber: 7, label: "Prize", color: "#0f0", hash: "hash-7", seed: "seed-7", timestamp: 7 }],
    wheelChaseTallyHistory: [],
    wheelSkippedDeductions: [],
    wheelSessionLotSelections: {},
    wheelCurrentAngle: 2.0,
    wheelLastResult: "🎉 A",
    wheelLastResultColor: "#0f0",
    wheelSpinHash: "hash-7",
    wheelSpinSeed: "seed-7",
    wheelSpinClientSeed: "client-7",
    wheelSpinVerificationUrl: "https://api.example.test/wheel/fairness/verify?serverSeed=seed-7&clientSeed=client-7&slotCount=2",
    wheelSpinAlgorithm: "whatfees-wheel-v1"
  };
  const mockStorage = { getItem: vi.fn(() => JSON.stringify(session)) };
  const origLocalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", { value: mockStorage, writable: true, configurable: true });

  const vm: Record<string, unknown> = {
    activeWheelConfigId: 42,
    activeScopeType: "personal",
    activeWorkspaceId: null,
    activeWheelSlots: [{}, {}], // 2 slots matches session spinCounts length
    wheelPreviewSlots: [{}, {}],
    wheelSpinCounts: [0, 0],
    wheelPreviewSpinCounts: [0, 0],
    wheelPreviewTotalSpins: 0,
    wheelTotalSpins: 0,
    wheelSessionNetRevenue: 0,
    wheelSessionCostAdjustment: 0,
    wheelFairnessHistory: [],
    wheelPreviewFairnessHistory: [],
    wheelChaseTallyHistory: [],
    wheelPreviewChaseTallyHistory: [],
    wheelSkippedDeductions: [],
    wheelSessionLotSelections: {},
    wheelCurrentAngle: 0,
    wheelLastResult: "",
    wheelLastResultColor: "",
    wheelSpinHash: "",
    wheelSpinSeed: "",
    wheelSpinClientSeed: "",
    wheelSpinVerificationUrl: "",
    wheelSpinAlgorithm: ""
  };

  const result = WheelWindow.methods!.loadWheelFromSession.call(vm as never);

  assert.equal(result, true);
  assert.deepEqual(vm.wheelSpinCounts, [3, 4]);
  assert.deepEqual(vm.wheelPreviewSpinCounts, [4, 1]);
  assert.equal(vm.wheelPreviewTotalSpins, 5);
  assert.equal((vm.wheelPreviewFairnessHistory as Array<{ spinNumber: number }>)[0]!.spinNumber, 5);
  assert.equal((vm.wheelPreviewChaseTallyHistory as Array<{ tierId: string }>)[0]!.tierId, "t1");
  assert.equal(vm.wheelTotalSpins, 7);
  assert.equal(vm.wheelSessionNetRevenue, 61.1);
  assert.equal(vm.wheelSpinHash, "hash-7");
  assert.equal(vm.wheelSpinSeed, "seed-7");
  assert.equal(vm.wheelSpinClientSeed, "client-7");
  assert.match(String(vm.wheelSpinVerificationUrl || ""), /wheel\/fairness\/verify/);
  assert.equal(vm.wheelSpinAlgorithm, "whatfees-wheel-v1");
  assert.equal((vm.wheelFairnessHistory as Array<{ spinNumber: number }>)[0]!.spinNumber, 7);

  Object.defineProperty(globalThis, "localStorage", { value: origLocalStorage, writable: true, configurable: true });
});

test("loadWheelFromSession falls back to the scoped root session snapshot when the per-config key is missing", () => {
  const session = {
    activeWheelConfigId: 42,
    wheelSpinCounts: [2, 1],
    wheelTotalSpins: 3,
    wheelSessionNetRevenue: 25.83,
    wheelSessionCostAdjustment: 4,
    wheelFairnessHistory: [],
    wheelChaseTallyHistory: [],
    wheelSkippedDeductions: [],
    wheelCurrentAngle: 1.25,
    wheelLastResult: "🎉 Prize",
    wheelLastResultColor: "#0f0"
  };
  const mockStorage = {
    getItem: vi.fn((key: string) => key === "whatfees_wheel_session" ? JSON.stringify(session) : null)
  };
  const origLocalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", { value: mockStorage, writable: true, configurable: true });

  const vm: Record<string, unknown> = {
    activeWheelConfigId: 42,
    activeScopeType: "personal",
    activeWorkspaceId: null,
    activeWheelSlots: [{}, {}],
    wheelSpinCounts: [0, 0],
    wheelTotalSpins: 0,
    wheelSessionNetRevenue: 0,
    wheelSessionCostAdjustment: 0,
    wheelFairnessHistory: [],
    wheelChaseTallyHistory: [],
    wheelSkippedDeductions: [],
    wheelCurrentAngle: 0,
    wheelLastResult: "",
    wheelLastResultColor: ""
  };

  const result = WheelWindow.methods!.loadWheelFromSession.call(vm as never);

  assert.equal(result, true);
  assert.deepEqual(vm.wheelSpinCounts, [2, 1]);
  assert.equal(vm.wheelSessionNetRevenue, 25.83);
  assert.equal(vm.wheelCurrentAngle, 1.25);

  Object.defineProperty(globalThis, "localStorage", { value: origLocalStorage, writable: true, configurable: true });
});

test("loadWheelFromSession returns false when slot count mismatches", () => {
  const session = {
    wheelSpinCounts: [1, 2, 3], // 3 counts
    wheelTotalSpins: 6,
    wheelSessionCostAdjustment: 0,
    wheelChaseTallyHistory: [],
    wheelSkippedDeductions: [],
    wheelSessionLotSelections: {},
    wheelCurrentAngle: 0,
    wheelLastResult: "",
    wheelLastResultColor: ""
  };
  const mockStorage = { getItem: vi.fn(() => JSON.stringify(session)) };
  const origLocalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", { value: mockStorage, writable: true, configurable: true });

  const vm: Record<string, unknown> = {
    activeWheelConfigId: 42,
    activeScopeType: "personal",
    activeWorkspaceId: null,
    activeWheelSlots: [{}, {}], // 2 slots, session has 3
    wheelSpinCounts: [0, 0],
    wheelTotalSpins: 0
  };

  const result = WheelWindow.methods!.loadWheelFromSession.call(vm as never);

  assert.equal(result, false);
  // Spin counts should NOT have been overwritten
  assert.deepEqual(vm.wheelSpinCounts, [0, 0]);

  Object.defineProperty(globalThis, "localStorage", { value: origLocalStorage, writable: true, configurable: true });
});
