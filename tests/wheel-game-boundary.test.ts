import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { createDefaultTier, createDefaultWheelConfig } from "../src/components/windows/game/services/wheelDefaults.ts";
import { createWheelSale } from "../src/components/windows/game/services/wheelSales.ts";
import { remapSpinCountsByTier } from "../src/components/windows/game/services/wheelCountRemapping.ts";
import { buildSlotsFromConfig } from "../src/components/windows/game/services/wheelSlots.ts";
import {
  calculateWheelSessionNetRevenue,
  computeExpectedMargin
} from "../src/components/windows/game/services/wheelPricing.ts";
import type { WheelConfig } from "../src/types/app.ts";

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

test("game boundary modules keep sales creation separate from pricing math", () => {
  vi.spyOn(Date, "now").mockReturnValue(1000);
  vi.setSystemTime(new Date("2026-05-01T12:00:00Z"));

  const sale = createWheelSale({
    config: createSingleTierConfig(),
    tier: "tier-a",
    cost: 4,
    packsCount: 1,
    deductionType: "packs",
    label: "Prize",
    lotId: 44,
    lots: [{
      id: 44,
      name: "Lot",
      lotType: "bulk",
      sellingShippingPerOrder: 3,
      sellingTaxPercent: 0,
      platformFeePercent: 0,
      additionalFeePercent: 0,
      additionalFeeAppliesTo: "sale_only",
      fixedFeePerOrder: 0
    }],
    spinNumber: 7
  });

  assert.equal(sale.type, "wheel");
  assert.equal(sale.date, "2026-05-01");
  assert.equal(sale.memo, "Wheel spin #7: Prize");
  assert.equal(sale.buyerShipping, 3);
  assert.equal(sale.netRevenue, 10);
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
  const lots = [{
    id: 5,
    name: "Fees",
    lotType: "bulk" as const,
    sellingShippingPerOrder: 0,
    sellingTaxPercent: 0,
    platformFeePercent: 10,
    additionalFeePercent: 0,
    additionalFeeAppliesTo: "sale_only" as const,
    fixedFeePerOrder: 0
  }];

  assert.equal(computeExpectedMargin(config, undefined, lots).margin, 80);
  assert.equal(calculateWheelSessionNetRevenue(config, buildSlotsFromConfig(config), [2], undefined, lots), 18);
});

