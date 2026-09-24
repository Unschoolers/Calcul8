import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { createDefaultTier, createDefaultWheelConfig } from "../src/components/windows/game/services/wheelDefaults.ts";
import { settleGameOutcomeSale } from "../src/components/windows/game/services/gameOutcomeSettlement.ts";
import { remapSpinCountsByTier } from "../src/components/windows/game/services/wheelCountRemapping.ts";
import { buildSlotsFromConfig } from "../src/components/windows/game/services/wheelSlots.ts";
import {
  calculateWheelSessionNetRevenue,
  calculateWheelTierNetRevenuePerSpin,
  computeExpectedMargin
} from "../src/components/windows/game/services/wheelPricing.ts";
import type { WheelConfig } from "../src/types/app.ts";
import { makeLot } from "./helpers/fixtures.ts";

function createSingleTierConfig(overrides: Partial<WheelConfig> = {}): WheelConfig {
  return {
    id: 12,
    name: "Boundary Wheel",
    spinPrice: 10,
    targetMargin: 15,
    createdAt: "",
    tiers: [{
      id: "tier-a",
      label: "Prize",
      color: "#f00",
      slots: 2,
      costPerTier: 4,
      packsCount: 1,
      deductionType: "packs",
      sets: []
    }],
    ...overrides
  };
}

test("game boundary modules keep default config and tier construction outside wheelHelpers", () => {
  vi.spyOn(Date, "now").mockReturnValue(123456);
  const tier = createDefaultTier(1, ["#f0a500"]);
  const config = createDefaultWheelConfig();

  assert.equal(tier.label, "Tier 2");
  assert.equal(tier.color, "#8e44ad");
  assert.equal(config.gameType, "wheel");
  assert.equal(config.name, "New Wheel");
  assert.equal(config.tiers[0]?.label, "1 Item");
});

test("game boundary modules keep count remapping tier-aware", () => {
  const newSlots = [
    { tier: "a", name: "A", color: "#f00", cost: 1, packsCount: 1, deductionType: "packs" as const, isChase: false },
    { tier: "a", name: "A", color: "#f00", cost: 1, packsCount: 1, deductionType: "packs" as const, isChase: false },
    { tier: "b", name: "B", color: "#0f0", cost: 1, packsCount: 1, deductionType: "packs" as const, isChase: false }
  ];

  assert.deepEqual(remapSpinCountsByTier(["a", "b"], [3, 2], newSlots), [2, 1, 2]);
});

test("game boundary modules keep slot construction in the game domain", () => {
  const slots = buildSlotsFromConfig(createSingleTierConfig());

  assert.equal(slots.length, 2);
  assert.equal(slots[0]?.tier, "tier-a");
});

test("game boundary modules keep sales creation separate from pricing math", async () => {
  vi.spyOn(Date, "now").mockReturnValue(1000);
  vi.setSystemTime(new Date("2026-05-01T12:00:00Z"));

  const sale = await settleGameOutcomeSale({
    config: createSingleTierConfig(),
    tierId: "tier-a",
    cost: 4,
    packsCount: 1,
    deductionType: "packs",
    label: "Prize",
    lotId: 44,
    lots: [makeLot({
      id: 44,
      name: "Lot",
      lotType: "bulk",
      sellingShippingPerOrder: 3,
      sellingTaxPercent: 0,
      platformFeePercent: 0,
      additionalFeePercent: 0,
      additionalFeeAppliesTo: "sale_only",
      fixedFeePerOrder: 0
    })],
    spinNumber: 7
  }, {
    now: () => new Date(),
    nextId: (spinNumber) => Date.now() + (spinNumber ?? 0),
    recordSale: () => undefined
  });

  assert.equal(sale?.type, "wheel");
  assert.equal(sale?.date, "2026-05-01");
  assert.equal(sale?.memo, "Wheel spin #7: Prize");
  assert.equal(sale?.buyerShipping, 3);
  assert.equal(sale?.netRevenue, 10);
});

test("game boundary modules keep expected and realized wheel revenue in pricing helpers", () => {
  const config = createSingleTierConfig({
    spinPrice: 10,
    tiers: [{
      id: "tier-a",
      label: "Prize",
      color: "#f00",
      slots: 1,
      costPerTier: 5,
      packsCount: 1,
      deductionType: "packs",
      sets: [],
      boundLotId: 5
    }]
  });
  const lots = [makeLot({
    id: 5,
    name: "Fees",
    lotType: "bulk" as const,
    sellingShippingPerOrder: 0,
    sellingTaxPercent: 0,
    platformFeePercent: 10,
    additionalFeePercent: 0,
    additionalFeeAppliesTo: "sale_only" as const,
    fixedFeePerOrder: 0
  })];

  assert.equal(computeExpectedMargin(config, undefined, lots).margin, 80);
  assert.equal(calculateWheelSessionNetRevenue(config, buildSlotsFromConfig(config), [2], undefined, lots), 18);
});

test("multi-lot wheel projections use each source lot vertical and retain processing fees", () => {
  const config = createSingleTierConfig({ spinPrice: 100, tiers: [{
    id: "tier-a", label: "Mix", color: "#f00", slots: 1, costPerTier: 1,
    packsCount: 1, deductionType: "packs", sets: [], boundLotId: 1,
    boundLotIds: [1, 2]
  }] });
  const lots = [
    makeLot({ id: 1, feeProfilePreset: "whatnot", whatnotVertical: "tcg", platformFeePercent: 8, additionalFeePercent: 2.9, additionalFeeAppliesTo: "sale_only", fixedFeePerOrder: 0.3 }),
    makeLot({ id: 2, feeProfilePreset: "whatnot", whatnotVertical: "coins", platformFeePercent: 8, additionalFeePercent: 2.9, additionalFeeAppliesTo: "sale_only", fixedFeePerOrder: 0.3 })
  ];
  const summary = { currentTier: 2 as const, periodStart: "2026-09-21" };
  const tcg = calculateWheelTierNetRevenuePerSpin(config, config.tiers[0]!, [lots[0]!], undefined, summary);
  const mixed = calculateWheelTierNetRevenuePerSpin(config, config.tiers[0]!, lots, undefined, summary);
  const coins = calculateWheelTierNetRevenuePerSpin(config, { ...config.tiers[0]!, boundLotIds: [2], boundLotId: 2 }, lots, undefined, summary);
  assert.ok(coins > mixed && mixed > tcg, "the mixed tier averages TCG and coin commission independently");
  assert.ok(tcg < 100 * (1 - 0.075) - 0.3, "configured processing percentage is retained in addition to commission");
});

test("unbound wheel tier keeps current-lot fallback fee input", () => {
  const config = createSingleTierConfig({ spinPrice: 20, tiers: [{
    id: "tier-a", label: "Unbound", color: "#f00", slots: 1, costPerTier: 1,
    packsCount: 1, deductionType: "packs", sets: []
  }] });
  const fallback = { platformFeePercent: 5, additionalFeePercent: 2.9, additionalFeeAppliesTo: "sale_only" as const, fixedFeePerOrder: 0.3 };
  const currentLot = makeLot({ id: 6, feeProfilePreset: "whatnot", whatnotVertical: "tcg", platformFeePercent: 8, additionalFeePercent: 2.9, additionalFeeAppliesTo: "sale_only", fixedFeePerOrder: 0.3 });
  const projected = calculateWheelTierNetRevenuePerSpin(config, config.tiers[0]!, [currentLot], fallback, { currentTier: 6, periodStart: "2026-09-21" }, currentLot);
  assert.equal(projected, 20 * (1 - 0.065 - 0.029) - 0.3);
});
