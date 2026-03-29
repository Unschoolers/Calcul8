import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { configPricingMethods } from "../src/app-core/methods/config-pricing.ts";
import type { FeeProfilePreset } from "../src/types/app.ts";
import { makeLotSetup } from "./helpers/fixtures.ts";

type PricingContext = Record<string, unknown>;

function createContext(overrides: PricingContext = {}): PricingContext {
  const setup = makeLotSetup();
  return {
    ...setup,
    totalCaseCost: 1120,
    totalSpots: 80,
    totalPacks: 256,
    currentLotType: "bulk",
    canUsePaidActions: true,
    showProfitCalculator: false,
    autoSaveSetup: vi.fn(),
    syncLivePricesFromDefaults: vi.fn(),
    recalculateDefaultPrices: vi.fn(),
    notify: vi.fn(),
    applyLiveSinglesSuggestedPricing: vi.fn(),
    ...overrides
  };
}

test("onPurchaseConfigChange preserves explicit fee fields on unrelated selling edits", () => {
  const context = createContext({
    feeProfilePreset: "whatnot",
    platformFeePercent: 7,
    additionalFeePercent: 1.5,
    additionalFeeAppliesTo: "sale_only",
    fixedFeePerOrder: 0.1,
    sellingTaxPercent: 12,
    sellingShippingPerOrder: 8
  });

  configPricingMethods.onPurchaseConfigChange.call(context as never);

  assert.equal(context.feeProfilePreset, "whatnot");
  assert.equal(context.platformFeePercent, 7);
  assert.equal(context.additionalFeePercent, 1.5);
  assert.equal(context.additionalFeeAppliesTo, "sale_only");
  assert.equal(context.fixedFeePerOrder, 0.1);
  assert.equal((context.recalculateDefaultPrices as ReturnType<typeof vi.fn>).mock.calls.length, 1);
});

test("setFeeProfilePreset updates explicit fee fields and recalculates defaults", () => {
  const context = createContext({
    feeProfilePreset: "whatnot",
    platformFeePercent: 7,
    additionalFeePercent: 1.5,
    additionalFeeAppliesTo: "sale_only",
    fixedFeePerOrder: 0.1
  });

  configPricingMethods.setFeeProfilePreset.call(context as never, "none" as FeeProfilePreset);

  assert.equal(context.feeProfilePreset, "none");
  assert.equal(context.platformFeePercent, 0);
  assert.equal(context.additionalFeePercent, 0);
  assert.equal(context.additionalFeeAppliesTo, "sale_only");
  assert.equal(context.fixedFeePerOrder, 0);
  assert.equal((context.recalculateDefaultPrices as ReturnType<typeof vi.fn>).mock.calls.length, 1);
});

test("setFeeProfilePreset can restore the Whatnot preset fields", () => {
  const context = createContext({
    feeProfilePreset: "none",
    platformFeePercent: 0,
    additionalFeePercent: 0,
    additionalFeeAppliesTo: "sale_only",
    fixedFeePerOrder: 0
  });

  configPricingMethods.setFeeProfilePreset.call(context as never, "whatnot" as FeeProfilePreset);

  assert.equal(context.feeProfilePreset, "whatnot");
  assert.equal(context.platformFeePercent, 8);
  assert.equal(context.additionalFeePercent, 2.9);
  assert.equal(context.additionalFeeAppliesTo, "sale_plus_shipping");
  assert.equal(context.fixedFeePerOrder, 0.3);
  assert.equal((context.recalculateDefaultPrices as ReturnType<typeof vi.fn>).mock.calls.length, 1);
});
