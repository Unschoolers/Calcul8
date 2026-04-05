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
import {
  getScopedWheelConfigDraftStorageKey,
  getScopedWheelConfigSessionStorageKey
} from "../src/app-core/storageKeys.ts";
import { getWheelTierInventoryMeta } from "../src/components/windows/wheelSaleSupport.ts";
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

test("WheelWindow data defaults the inspector tab to config", () => {
  const data = WheelWindow.data.call({});
  assert.equal(data.wheelInspectorTab, "config");
});

// ── Component computed tests ─────────────────────────────────────

test("wheelSessionRevenue is spins × spinPrice", () => {
  const vm = {
    wheelMode: "live",
    activeWheelConfig: { spinPrice: 5 },
    wheelDisplayTotalSpins: 10,
    wheelTotalSpins: 10
  };
  const result = WheelWindow.computed!.wheelSessionRevenue.call(vm as never);
  assert.equal(result, 50);
});

test("wheelSessionRevenue uses preview spins in config mode", () => {
  const vm = {
    wheelMode: "config",
    activeWheelConfig: { spinPrice: 5 },
    wheelDisplayTotalSpins: 4,
    wheelPreviewTotalSpins: 4,
    wheelTotalSpins: 10
  };
  const result = WheelWindow.computed!.wheelSessionRevenue.call(vm as never);
  assert.equal(result, 20);
});

test("wheelSessionCost sums slot costs by spin counts", () => {
  const vm = {
    wheelMode: "live",
    activeWheelSlots: [
      { cost: 3 },
      { cost: 7 }
    ],
    wheelDisplaySpinCounts: [2, 1],
    wheelSpinCounts: [2, 1],
    wheelSessionCostAdjustment: 0
  };
  const result = WheelWindow.computed!.wheelSessionCost.call(vm as never);
  assert.equal(result, 13); // 2×3 + 1×7
});

test("wheelSessionCost includes cost adjustment from chase replacements", () => {
  const vm = {
    wheelMode: "live",
    activeWheelSlots: [
      { cost: 10 }, // was 50, replaced → new slot cost is 10
      { cost: 5 }
    ],
    wheelDisplaySpinCounts: [1, 2],
    wheelSpinCounts: [1, 2],
    wheelSessionCostAdjustment: 40 // 1 spin × (50 old - 10 new)
  };
  const result = WheelWindow.computed!.wheelSessionCost.call(vm as never);
  // base: 1×10 + 2×5 = 20, plus adjustment 40 = 60
  assert.equal(result, 60);
});

test("wheelSessionProfit deducts Whatnot fees and cost", () => {
  const vm = {
    wheelMode: "live",
    wheelSessionRevenue: 100,
    wheelDisplayTotalSpins: 10,
    wheelTotalSpins: 10,
    wheelSessionCost: 30
  };
  const result = WheelWindow.computed!.wheelSessionProfit.call(vm as never);
  // commission: 100 × 0.08 = 8, processing: 100 × 0.029 = 2.9, fixed: 0.30 × 10 = 3
  // net: 100 - 8 - 2.9 - 3 = 86.1, profit: 86.1 - 30 = 56.1
  assert.ok(Math.abs(result - 56.1) < 0.001);
});

test("wheelSessionProfit includes buyer shipping from bound lots in fee math", () => {
  const vm = {
    wheelMode: "live",
    activeWheelConfig: {
      id: 1,
      name: "Shipping Wheel",
      spinPrice: 10,
      targetMargin: 40,
      createdAt: "",
      tiers: [
        { id: "t1", label: "Tier 1", color: "#f00", slots: 1, costPerTier: 3, packsCount: 1, deductionType: "packs", boundLotId: 42, sets: [] }
      ]
    },
    activeWheelSlots: [
      { name: "Prize A", color: "#f00", cost: 3, tier: "t1", packsCount: 1, deductionType: "packs", isChase: false }
    ],
    wheelSpinCounts: [10],
    wheelSessionRevenue: 100,
    wheelDisplayTotalSpins: 10,
    wheelTotalSpins: 10,
    wheelSessionCost: 30,
    lots: [{
      id: 42,
      name: "Shipping Lot",
      lotType: "bulk",
      sellingShippingPerOrder: 5
    }],
    platformFeePercent: 8,
    additionalFeePercent: 2.9,
    additionalFeeAppliesTo: "sale_plus_shipping",
    fixedFeePerOrder: 0.3
  };

  const result = WheelWindow.computed!.wheelSessionProfit.call(vm as never);
  // commission: 8, processing on gross+shipping: (100 + 50) * 0.029 = 4.35, fixed: 3
  // net: 84.65, profit: 54.65
  assert.ok(Math.abs(result - 54.65) < 0.001);
});

test("wheelSessionProfit prefers stored session net revenue in live mode", () => {
  const vm = {
    wheelMode: "live",
    wheelSessionNetRevenue: 84.65,
    wheelSessionCost: 30
  };

  const result = WheelWindow.computed!.wheelSessionProfit.call(vm as never);
  assert.ok(Math.abs(result - 54.65) < 0.001);
});

test("wheelSessionMarginDisplay shows dash when no revenue", () => {
  const vm = { wheelSessionRevenue: 0, wheelSessionProfit: 0 };
  assert.equal(WheelWindow.computed!.wheelSessionMarginDisplay.call(vm as never), "—");
});

test("wheelSessionMarginDisplay shows percentage", () => {
  const vm = { wheelSessionRevenue: 100, wheelSessionProfit: 25 };
  assert.equal(WheelWindow.computed!.wheelSessionMarginDisplay.call(vm as never), "25.0%");
});

test("hasPendingWheelChanges detects draft edits against the live wheel", () => {
  const baseConfig: WheelConfig = {
    id: 1,
    name: "Wheel",
    spinPrice: 10,
    targetMargin: 40,
    createdAt: "",
    tiers: [{ id: "t1", label: "Prize", color: "#f00", slots: 1, costPerTier: 5, packsCount: 1, deductionType: "packs", sets: [], boundLotId: 10 }]
  };

  assert.equal(WheelWindow.computed!.hasPendingWheelChanges.call({
    activeWheelConfig: baseConfig,
    editingWheelConfig: JSON.parse(JSON.stringify(baseConfig))
  } as never), false);

  const edited = JSON.parse(JSON.stringify(baseConfig)) as WheelConfig;
  edited.spinPrice = 12;
  assert.equal(WheelWindow.computed!.hasPendingWheelChanges.call({
    activeWheelConfig: baseConfig,
    editingWheelConfig: edited
  } as never), true);
});

test("wheelSpinBlockedReason warns when a live tier no longer has enough packs", () => {
  const vm = {
    wheelMode: "live",
    activeWheelConfig: {
      id: 1,
      spinPrice: 10,
      targetMargin: 40,
      createdAt: "",
      tiers: [
        { id: "t1", label: "Sealed Prize", color: "#f00", slots: 2, costPerTier: 5, packsCount: 2, deductionType: "packs", boundLotId: 42, sets: [] }
      ]
    },
    lots: [{
      id: 42,
      name: "Almost Empty Lot",
      lotType: "bulk",
      boxesPurchased: 1,
      packsPerBox: 1
    }],
    loadSalesForLotId: vi.fn(() => [{ quantity: 1, packsCount: 1 }])
  };

  const invalid = WheelWindow.computed!.wheelInvalidLiveTiers.call(vm as never);
  assert.equal(invalid.length, 1);
  assert.match(invalid[0]!.reason, /only 0 remain/i);
  const reason = WheelWindow.computed!.wheelSpinBlockedReason.call({ ...vm, wheelInvalidLiveTiers: invalid } as never);
  assert.match(reason, /repair the wheel before going live/i);
});

test("wheelInvalidLiveTiers ignores untracked singles tiers", () => {
  const vm = {
    wheelMode: "live",
    activeWheelConfig: {
      id: 1,
      spinPrice: 10,
      targetMargin: 40,
      createdAt: "",
      tiers: [
        {
          id: "t1",
          label: "Rei Ayanami",
          color: "#f0f",
          slots: 1,
          costPerTier: 0,
          packsCount: 1,
          deductionType: "singles",
          boundLotId: 42,
          boundSinglesId: null,
          sets: []
        }
      ]
    },
    lots: [{
      id: 42,
      name: "Singles Lot",
      lotType: "singles",
      singlesPurchases: [{ id: 7, item: "Rei Ayanami", quantity: 1, cost: 0, marketValue: 46 }]
    }]
  };

  const invalid = WheelWindow.computed!.wheelInvalidLiveTiers.call(vm as never);
  assert.deepEqual(invalid, []);
});

test("wheelSessionSourceGroups summarizes remaining stock for wheel sources", () => {
  const vm = {
    wheelDisplayConfig: {
      id: 1,
      spinPrice: 10,
      targetMargin: 40,
      createdAt: "",
      tiers: [
        { id: "bulk", label: "1 pack", color: "#f00", slots: 2, costPerTier: 5, packsCount: 1, deductionType: "packs", boundLotId: 42, sets: [] },
        { id: "single", label: "Hellish Blizzard", color: "#09f", slots: 1, costPerTier: 25, packsCount: 1, deductionType: "singles", boundLotId: 77, boundSinglesId: 701, sets: [] }
      ]
    },
    lots: [
      { id: 42, name: "Bulk Lot", lotType: "bulk", boxesPurchased: 1, packsPerBox: 3 },
      { id: 77, name: "Singles Lot", lotType: "singles", singlesPurchases: [{ id: 701, item: "Hellish Blizzard", quantity: 2, cost: 25, marketValue: 30 }] }
    ],
    wheelTallyByTier: [
      { tierId: "bulk", label: "1 pack", color: "#f00", count: 3 },
      { tierId: "single", label: "Hellish Blizzard", color: "#09f", count: 1 }
    ],
    loadSalesForLotId: vi.fn((lotId: number) => lotId === 42
      ? [{
        id: 1,
        type: "wheel",
        quantity: 1,
        packsCount: 1,
        price: 10,
        buyerShipping: 0,
        date: "2026-03-25"
      }]
      : []),
    sales: []
  };

  const rows = WheelWindow.computed!.wheelSessionSourceGroups.call(vm as never);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.label, "Bulk Lot");
  assert.match(rows[0]!.remainingText, /2 items left/i);
  assert.equal(rows[0]!.tiers.length, 1);
  assert.equal(rows[0]!.tiers[0]!.count, 3);
  assert.equal(rows[1]!.label, "Singles Lot");
  assert.match(rows[1]!.remainingText, /2 items left/i);
  assert.equal(rows[1]!.tiers[0]!.label, "Hellish Blizzard");
});

test("wheelSessionSourceGroups keeps singles card number on the tier label while grouping by source", () => {
  const vm = {
    wheelDisplayConfig: {
      id: 1,
      spinPrice: 10,
      targetMargin: 40,
      createdAt: "",
      tiers: [
        { id: "single", label: "Hellish Blizzard", color: "#09f", slots: 1, costPerTier: 25, packsCount: 1, deductionType: "singles", boundLotId: 77, boundSinglesId: 701, sets: [] }
      ]
    },
    lots: [
      { id: 77, name: "Singles Lot", lotType: "singles", singlesPurchases: [{ id: 701, item: "Hellish Blizzard", cardNumber: "UE06BT/OPM-1-020-ALT1", quantity: 2, cost: 25, marketValue: 30 }] }
    ],
    wheelTallyByTier: [
      { tierId: "single", label: "Hellish Blizzard", color: "#09f", count: 1 }
    ],
    loadSalesForLotId: vi.fn(() => []),
    sales: []
  };

  const rows = WheelWindow.computed!.wheelSessionSourceGroups.call(vm as never);
  assert.equal(rows[0]!.detail, "Singles source");
  assert.equal(rows[0]!.tiers[0]!.label, "Hellish Blizzard #UE06BT/OPM-1-020-ALT1");
});

test("wheelSessionSourceGroups groups multiple pack tiers under the same source lot", () => {
  const vm = {
    wheelDisplayConfig: {
      id: 1,
      spinPrice: 10,
      targetMargin: 40,
      createdAt: "",
      tiers: [
        { id: "t1", label: "1 pack", color: "#f00", slots: 2, costPerTier: 5, packsCount: 1, deductionType: "packs", boundLotId: 42, sets: [] },
        { id: "t2", label: "3 packs", color: "#0f0", slots: 1, costPerTier: 8, packsCount: 3, deductionType: "packs", boundLotId: 42, sets: [] }
      ]
    },
    lots: [
      { id: 42, name: "Bulk Lot", lotType: "bulk", boxesPurchased: 1, packsPerBox: 8 }
    ],
    wheelTallyByTier: [
      { tierId: "t1", label: "1 pack", color: "#f00", count: 2 },
      { tierId: "t2", label: "3 packs", color: "#0f0", count: 1 }
    ],
    loadSalesForLotId: vi.fn(() => []),
    sales: []
  };

  const rows = WheelWindow.computed!.wheelSessionSourceGroups.call(vm as never);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.label, "Bulk Lot");
  assert.equal(rows[0]!.tiers.length, 2);
  assert.deepEqual(rows[0]!.tiers.map((entry: { tierId: string }) => entry.tierId), ["t1", "t2"]);
});

test("wheelSessionSourceGroups groups tracked and pool singles tiers under the same lot", () => {
  const vm = {
    wheelDisplayConfig: {
      id: 1,
      spinPrice: 10,
      targetMargin: 40,
      createdAt: "",
      tiers: [
        { id: "t1", label: "Hellish Blizzard", color: "#90f", slots: 1, costPerTier: 17, packsCount: 1, deductionType: "singles", boundLotId: 77, boundSinglesId: 701, sets: [] },
        { id: "t2", label: "AP card", color: "#fc0", slots: 1, costPerTier: 0, packsCount: 1, deductionType: "singles", boundLotId: 77, boundSinglesId: null, sets: [] }
      ]
    },
    lots: [
      {
        id: 77,
        name: "Union arena singles",
        lotType: "singles",
        singlesPurchases: [
          { id: 701, item: "Hellish Blizzard", cardNumber: "UE06BT/OPM-1-022-ALT1", quantity: 1, cost: 17, marketValue: 30 },
          { id: 702, item: "AP card", quantity: 23, cost: 0, marketValue: 3 }
        ]
      }
    ],
    wheelTallyByTier: [
      { tierId: "t1", label: "Hellish Blizzard", color: "#90f", count: 0 },
      { tierId: "t2", label: "AP card", color: "#fc0", count: 0 }
    ],
    loadSalesForLotId: vi.fn(() => []),
    sales: []
  };

  const rows = WheelWindow.computed!.wheelSessionSourceGroups.call(vm as never);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.label, "Union arena singles");
  assert.match(rows[0]!.remainingText, /24 items left/i);
  assert.equal(rows[0]!.tiers.length, 2);
  assert.equal(rows[0]!.tiers[0]!.label, "Hellish Blizzard #UE06BT/OPM-1-022-ALT1");
  assert.equal(rows[0]!.tiers[1]!.label, "AP card");
  assert.equal(rows[0]!.warning, false);
  assert.equal(rows[0]!.tiers[0]!.warning, true);
  assert.equal(rows[0]!.tiers[1]!.warning, false);
});

test("getWheelTierInventoryMeta marks exact last-hit stock as low stock", () => {
  const singlesMeta = getWheelTierInventoryMeta({
    lots: [{
      id: 77,
      name: "Union arena singles",
      lotType: "singles",
      singlesPurchases: [
        { id: 701, item: "Hellish Blizzard", quantity: 1, cost: 17, marketValue: 30 }
      ]
    }],
    loadSalesForLotId: () => []
  }, {
    id: "t1",
    label: "Hellish Blizzard",
    color: "#90f",
    slots: 1,
    costPerTier: 17,
    packsCount: 1,
    deductionType: "singles",
    boundLotId: 77,
    boundSinglesId: 701,
    sets: []
  });

  const packsMeta = getWheelTierInventoryMeta({
    lots: [{
      id: 42,
      name: "One punch man",
      lotType: "bulk",
      boxesPurchased: 1,
      packsPerBox: 1
    }],
    loadSalesForLotId: () => []
  }, {
    id: "t2",
    label: "1 Pack",
    color: "#f00",
    slots: 1,
    costPerTier: 4.67,
    packsCount: 1,
    deductionType: "packs",
    boundLotId: 42,
    sets: []
  });

  assert.equal(singlesMeta?.warning, true);
  assert.match(singlesMeta?.text || "", /1 item left/i);
  assert.equal(packsMeta?.warning, true);
  assert.match(packsMeta?.text || "", /1 item left/i);
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

test("landOnSlot preview mode opens preview chase flow without persisting", () => {
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
  assert.equal(saveWheelSession.mock.calls.length, 0);
  assert.deepEqual(triggerWheelCelebration.mock.calls, [[{
    label: "Chase Card",
    color: "#ff0",
    image: "https://img.test/chase.png",
    preview: true
  }]]);
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

test("drawWheel reuses a cached static wheel render when slots and size do not change", () => {
  const makeContext2d = () => ({
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
    lineTo: vi.fn(),
    drawImage: vi.fn(),
    imageSmoothingEnabled: true
  });

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
  assert.deepEqual(vm.wheelPreviewSpinCounts, [1]);
  assert.equal(vm.wheelPreviewTotalSpins, 1);
  assert.deepEqual(vm.wheelSpinCounts, [0]);
  assert.equal(vm.wheelTotalSpins, 0);
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

test("loadWheelFromSession remaps saved spin counts by tier after rebuild", () => {
  const sessionKey = getScopedWheelConfigSessionStorageKey({ type: "personal", workspaceId: null }, 99);
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
    wheelLastResultColor: "#f00"
  };

  WheelWindow.methods!.saveWheelSession.call(vm as never);

  assert.equal(mockStorage.setItem.mock.calls.length, 2);
  assert.equal(mockStorage.setItem.mock.calls[0]![0], "whatfees_wheel_session__cfg__42");
  const parsed = JSON.parse(store["whatfees_wheel_session__cfg__42"]!);
  assert.deepEqual(parsed.wheelSpinCounts, [1, 2]);
  assert.equal(parsed.wheelTotalSpins, 3);
  assert.equal(parsed.wheelSessionNetRevenue, 22.75);
  assert.equal(parsed.wheelFairnessHistory.length, 1);
  assert.equal(mockStorage.setItem.mock.calls[1]![0], "whatfees_wheel_session");

  Object.defineProperty(globalThis, "localStorage", { value: origLocalStorage, writable: true, configurable: true });
});

test("loadWheelFromSession restores session from localStorage", () => {
  const session = {
    wheelSpinCounts: [3, 4],
    wheelTotalSpins: 7,
    wheelSessionNetRevenue: 61.1,
    wheelSessionCostAdjustment: 5,
    wheelFairnessHistory: [{ spinNumber: 7, label: "Prize", color: "#0f0", hash: "hash-7", seed: "seed-7", timestamp: 7 }],
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
    activeScopeType: "personal",
    activeWorkspaceId: null,
    activeWheelSlots: [{}, {}], // 2 slots matches session spinCounts length
    wheelSpinCounts: [0, 0],
    wheelTotalSpins: 0,
    wheelSessionNetRevenue: 0,
    wheelSessionCostAdjustment: 0,
    wheelFairnessHistory: [],
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
  assert.equal(vm.wheelSessionNetRevenue, 61.1);
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
