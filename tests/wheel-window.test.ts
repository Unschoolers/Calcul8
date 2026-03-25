import assert from "node:assert/strict";
import { test, vi } from "vitest";
import {
    buildSlotsFromConfig,
    createDefaultTier,
    createDefaultWheelConfig,
    createWheelSale,
    easeOutQuart,
    seedToIndex,
    WheelWindow
} from "../src/components/windows/WheelWindow.ts";
import type { WheelConfig } from "../src/types/app.ts";

// ── Pure functions ──────────────────────────────────────────────

test("buildSlotsFromConfig creates correct number of slots", () => {
  const config: WheelConfig = {
    id: 1, name: "Test", spinPrice: 10, targetMargin: 40, createdAt: "",
    tiers: [
      { id: "t1", label: "A", color: "#f00", slots: 3, costPerTier: 5, packsCount: 1, deductionType: "packs", sets: [] },
      { id: "t2", label: "B", color: "#0f0", slots: 2, costPerTier: 10, packsCount: 2, deductionType: "packs", sets: [] }
    ]
  };
  const slots = buildSlotsFromConfig(config);
  assert.equal(slots.length, 5);
  assert.equal(slots.filter((s) => s.tier === "t1").length, 3);
  assert.equal(slots.filter((s) => s.tier === "t2").length, 2);
});

test("buildSlotsFromConfig returns empty for zero-slot tiers", () => {
  const config: WheelConfig = {
    id: 1, name: "Test", spinPrice: 10, targetMargin: 40, createdAt: "",
    tiers: [{ id: "t1", label: "A", color: "#f00", slots: 0, costPerTier: 5, packsCount: 1, deductionType: "packs", sets: [] }]
  };
  assert.deepEqual(buildSlotsFromConfig(config), []);
});

test("buildSlotsFromConfig uses set labels when defined", () => {
  const config: WheelConfig = {
    id: 1, name: "Test", spinPrice: 10, targetMargin: 40, createdAt: "",
    tiers: [{ id: "t1", label: "Prize", color: "#f00", slots: 2, costPerTier: 5, packsCount: 1, deductionType: "packs", sets: ["Set A", "Set B"] }]
  };
  const slots = buildSlotsFromConfig(config);
  assert.equal(slots.length, 2);
  assert.ok(slots.some((s) => s.name === "Prize — Set A"));
  assert.ok(slots.some((s) => s.name === "Prize — Set B"));
});

test("buildSlotsFromConfig propagates isChase flag", () => {
  const config: WheelConfig = {
    id: 1, name: "Test", spinPrice: 10, targetMargin: 40, createdAt: "",
    tiers: [
      { id: "t1", label: "Normal", color: "#f00", slots: 2, costPerTier: 5, packsCount: 1, deductionType: "packs", sets: [] },
      { id: "t2", label: "Chase", color: "#0f0", slots: 1, costPerTier: 50, packsCount: 1, deductionType: "singles", sets: [], isChase: true }
    ]
  };
  const slots = buildSlotsFromConfig(config);
  assert.equal(slots.filter((s) => s.isChase).length, 1);
  assert.equal(slots.filter((s) => !s.isChase).length, 2);
});

test("buildSlotsFromConfig maximises spacing between same-tier slots", () => {
  const config: WheelConfig = {
    id: 1, name: "Test", spinPrice: 10, targetMargin: 40, createdAt: "",
    tiers: [
      { id: "t1", label: "A", color: "#f00", slots: 3, costPerTier: 5, packsCount: 1, deductionType: "packs", sets: [] },
      { id: "t2", label: "B", color: "#0f0", slots: 3, costPerTier: 10, packsCount: 2, deductionType: "packs", sets: [] }
    ]
  };
  const slots = buildSlotsFromConfig(config);
  // No two adjacent slots should be from the same tier (6 slots, 3+3, perfectly alternating)
  for (let i = 0; i < slots.length; i++) {
    const next = (i + 1) % slots.length;
    assert.notEqual(slots[i]!.tier, slots[next]!.tier, `slots ${i} and ${next} should differ`);
  }
});

test("easeOutQuart returns expected values", () => {
  assert.equal(easeOutQuart(0), 0);
  assert.equal(easeOutQuart(1), 1);
  assert.ok(easeOutQuart(0.5) > 0.5);
});

test("seedToIndex returns deterministic index within range", () => {
  assert.equal(seedToIndex("00000000", 10), 0);
  assert.equal(seedToIndex("0000000a", 10), 0); // 10 % 10 = 0
  assert.equal(seedToIndex("00000005", 8), 5); // 5 % 8 = 5
  const idx = seedToIndex("abcdef01", 12);
  assert.ok(idx >= 0 && idx < 12);
});

test("createDefaultTier assigns unique colors", () => {
  const t1 = createDefaultTier(0);
  const t2 = createDefaultTier(1, [t1.color]);
  assert.notEqual(t1.color, t2.color);
  assert.equal(t1.label, "Tier 1");
  assert.equal(t2.label, "Tier 2");
});

test("createDefaultWheelConfig returns valid config", () => {
  const config = createDefaultWheelConfig();
  assert.equal(config.name, "New Wheel");
  assert.equal(config.spinPrice, 10);
  assert.equal(config.tiers.length, 1);
  assert.equal(config.tiers[0]!.label, "1 Item");
});

// ── Component computed tests ─────────────────────────────────────

test("wheelSessionRevenue is spins × spinPrice", () => {
  const vm = {
    activeWheelConfig: { spinPrice: 5 },
    wheelTotalSpins: 10
  };
  const result = WheelWindow.computed!.wheelSessionRevenue.call(vm as never);
  assert.equal(result, 50);
});

test("wheelSessionCost sums slot costs by spin counts", () => {
  const vm = {
    activeWheelSlots: [
      { cost: 3 },
      { cost: 7 }
    ],
    wheelSpinCounts: [2, 1],
    wheelSessionCostAdjustment: 0
  };
  const result = WheelWindow.computed!.wheelSessionCost.call(vm as never);
  assert.equal(result, 13); // 2×3 + 1×7
});

test("wheelSessionCost includes cost adjustment from chase replacements", () => {
  const vm = {
    activeWheelSlots: [
      { cost: 10 }, // was 50, replaced → new slot cost is 10
      { cost: 5 }
    ],
    wheelSpinCounts: [1, 2],
    wheelSessionCostAdjustment: 40 // 1 spin × (50 old - 10 new)
  };
  const result = WheelWindow.computed!.wheelSessionCost.call(vm as never);
  // base: 1×10 + 2×5 = 20, plus adjustment 40 = 60
  assert.equal(result, 60);
});

test("wheelSessionProfit deducts Whatnot fees and cost", () => {
  const vm = {
    wheelSessionRevenue: 100,
    wheelTotalSpins: 10,
    wheelSessionCost: 30
  };
  const result = WheelWindow.computed!.wheelSessionProfit.call(vm as never);
  // commission: 100 × 0.08 = 8, processing: 100 × 0.029 = 2.9, fixed: 0.30 × 10 = 3
  // net: 100 - 8 - 2.9 - 3 = 86.1, profit: 86.1 - 30 = 56.1
  assert.ok(Math.abs(result - 56.1) < 0.001);
});

test("wheelSessionMarginDisplay shows dash when no revenue", () => {
  const vm = { wheelSessionRevenue: 0, wheelSessionProfit: 0 };
  assert.equal(WheelWindow.computed!.wheelSessionMarginDisplay.call(vm as never), "—");
});

test("wheelSessionMarginDisplay shows percentage", () => {
  const vm = { wheelSessionRevenue: 100, wheelSessionProfit: 25 };
  assert.equal(WheelWindow.computed!.wheelSessionMarginDisplay.call(vm as never), "25.0%");
});

// ── Component method tests ───────────────────────────────────────

test("recordSpinResult increments spin counts", () => {
  const vm: Record<string, unknown> = {
    activeWheelSlots: [
      { name: "Prize A", color: "#f00", cost: 5, tier: "t1", packsCount: 1, deductionType: "packs", isChase: false },
      { name: "Prize B", color: "#0f0", cost: 10, tier: "t2", packsCount: 1, deductionType: "packs", isChase: false }
    ],
    wheelSpinCounts: [0, 0],
    wheelTotalSpins: 0,
    activeWheelConfig: { id: 1, spinPrice: 10, tiers: [{ id: "t1", boundLotId: 42 }, { id: "t2", boundLotId: 43 }] },
    addWheelSaleToLot: vi.fn(),
    lots: [],
    wheelSkippedDeductions: [],
    activeWheelConfigId: 1,
    saveWheelSession: vi.fn()
  };

  WheelWindow.methods!.recordSpinResult.call(vm as never, 0);
  assert.equal(vm.wheelTotalSpins, 1);
  assert.deepEqual(vm.wheelSpinCounts, [1, 0]);
});

test("landOnSlot sets result text and color", () => {
  const vm: Record<string, unknown> = {
    activeWheelSlots: [
      { name: "Prize A", color: "#f00", cost: 5, tier: "t1", packsCount: 1, deductionType: "packs", isChase: false }
    ],
    wheelLastResult: "",
    wheelLastResultColor: "",
    wheelChaseDialog: false,
    saveWheelSession: vi.fn()
  };

  WheelWindow.methods!.landOnSlot.call(vm as never, 0);
  assert.equal(vm.wheelLastResult, "🎉 Prize A");
  assert.equal(vm.wheelLastResultColor, "#f00");
});

test("landOnSlot opens chase dialog for chase tiers", () => {
  const vm: Record<string, unknown> = {
    activeWheelSlots: [
      { name: "Chase Card", color: "#ff0", cost: 50, tier: "tc", packsCount: 1, deductionType: "singles", isChase: true }
    ],
    wheelSpinCounts: [0],
    wheelTotalSpins: 0,
    wheelLastResult: "",
    wheelLastResultColor: "",
    activeWheelConfig: null,
    wheelChaseDialog: false,
    wheelChasePendingTierId: "",
    wheelChaseReplacementSinglesId: null,
    saveWheelSession: vi.fn()
  };

  WheelWindow.methods!.landOnSlot.call(vm as never, 0);
  assert.equal(vm.wheelChaseDialog, true);
  assert.equal(vm.wheelChasePendingTierId, "tc");
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
    lots: [],
    wheelSkippedDeductions: [],
    activeWheelConfigId: 1,
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
    wheelSessionCostAdjustment: 80,
    wheelChaseTallyHistory: [{ tierId: "tc", label: "Old", color: "#f00", count: 3 }],
    saveWheelSession: vi.fn()
  };

  WheelWindow.methods!.resetWheelSession.call(vm as never);

  assert.equal(vm.wheelTotalSpins, 0);
  assert.equal(vm.wheelSessionCostAdjustment, 0);
  assert.equal(vm.wheelChaseDialog, false);
  assert.equal(vm.wheelChasePendingTierId, "");
  assert.deepEqual(vm.wheelChaseTallyHistory, []);
});

test("createWheelSale builds a sale with lot shipping", () => {
  const config = { id: 1, spinPrice: 10, tiers: [] } as never;
  const lots = [{ id: 42, name: "My Lot", sellingShippingPerOrder: 3.5 }] as never;
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
      tiers: [{ id: "tc", label: "Chase Card", color: "#ff0", slots: 1, costPerTier: 25, packsCount: 1, deductionType: "singles", sets: [], isChase: true, boundLotId: 100 }]
    }],
    activeWheelConfigId: 1,
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
      tiers: [{ id: "tc", label: "Chase Card", color: "#ff0", slots: 1, costPerTier: 25, packsCount: 1, deductionType: "singles", sets: [], isChase: true, boundLotId: 100 }]
    }],
    activeWheelConfigId: 1,
    addWheelSaleToLot: addSaleFn,
    recordChaseSale: WheelWindow.methods!.recordChaseSale
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

// ── Session persistence ─────────────────────────────────────────

test("saveWheelSession stores session to localStorage", () => {
  const store: Record<string, string> = {};
  const mockStorage = { setItem: vi.fn((k: string, v: string) => { store[k] = v; }) };
  const origLocalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", { value: mockStorage, writable: true, configurable: true });

  const vm: Record<string, unknown> = {
    activeWheelConfigId: 42,
    wheelSpinCounts: [1, 2],
    wheelTotalSpins: 3,
    wheelSessionCostAdjustment: 10,
    wheelChaseTallyHistory: [],
    wheelSkippedDeductions: [],
    wheelSessionLotSelections: {},
    wheelCurrentAngle: 1.5,
    wheelLastResult: "🎉 Prize",
    wheelLastResultColor: "#f00"
  };

  WheelWindow.methods!.saveWheelSession.call(vm as never);

  assert.equal(mockStorage.setItem.mock.calls.length, 1);
  assert.equal(mockStorage.setItem.mock.calls[0]![0], "wheelSession_42");
  const parsed = JSON.parse(store["wheelSession_42"]!);
  assert.deepEqual(parsed.wheelSpinCounts, [1, 2]);
  assert.equal(parsed.wheelTotalSpins, 3);

  Object.defineProperty(globalThis, "localStorage", { value: origLocalStorage, writable: true, configurable: true });
});

test("loadWheelFromSession restores session from localStorage", () => {
  const session = {
    wheelSpinCounts: [3, 4],
    wheelTotalSpins: 7,
    wheelSessionCostAdjustment: 5,
    wheelChaseTallyHistory: [],
    wheelSkippedDeductions: [],
    wheelSessionLotSelections: {},
    wheelCurrentAngle: 2.0,
    wheelLastResult: "🎉 A",
    wheelLastResultColor: "#0f0"
  };
  const mockStorage = { getItem: vi.fn(() => JSON.stringify(session)) };
  const origLocalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", { value: mockStorage, writable: true, configurable: true });

  const vm: Record<string, unknown> = {
    activeWheelConfigId: 42,
    activeWheelSlots: [{}, {}], // 2 slots matches session spinCounts length
    wheelSpinCounts: [0, 0],
    wheelTotalSpins: 0,
    wheelSessionCostAdjustment: 0,
    wheelChaseTallyHistory: [],
    wheelSkippedDeductions: [],
    wheelSessionLotSelections: {},
    wheelCurrentAngle: 0,
    wheelLastResult: "",
    wheelLastResultColor: ""
  };

  const result = WheelWindow.methods!.loadWheelFromSession.call(vm as never);

  assert.equal(result, true);
  assert.deepEqual(vm.wheelSpinCounts, [3, 4]);
  assert.equal(vm.wheelTotalSpins, 7);

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
