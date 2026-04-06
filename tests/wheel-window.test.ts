import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { getWheelTierInventoryMeta } from "../src/components/windows/wheelSaleSupport.ts";
import {
    buildSlotsFromConfig,
    computeExpectedMargin,
    createDefaultTier,
    createDefaultWheelConfig,
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

test("computeExpectedMargin uses profit relative to cost so wheel margin matches lot math", () => {
  const config: WheelConfig = {
    id: 1,
    name: "Single Tier",
    spinPrice: 9,
    targetMargin: 15,
    createdAt: "",
    tiers: [
      { id: "t1", label: "1 Pack", color: "#f00", slots: 1, costPerTier: 7, packsCount: 1, deductionType: "packs", sets: [] }
    ]
  };

  const result = computeExpectedMargin(config, {
    platformFeePercent: 8,
    additionalFeePercent: 2.9,
    additionalFeeAppliesTo: "sale_plus_shipping",
    fixedFeePerOrder: 0.3
  });

  assert.ok(result.margin !== null);
  assert.ok(Math.abs(result.margin - 10.2714285714) < 0.001);
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

test("wheelSessionMarginDisplay shows dash when no cost", () => {
  const vm = { wheelSessionCost: 0, wheelSessionProfit: 0 };
  assert.equal(WheelWindow.computed!.wheelSessionMarginDisplay.call(vm as never), "—");
});

test("wheelSessionMarginDisplay shows profit relative to cost", () => {
  const vm = { wheelSessionCost: 80, wheelSessionProfit: 20 };
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
