import assert from "node:assert/strict";
import { test } from "vitest";
import {
  applySystemPricingDefaultsToLot,
  lotUsesSystemPricingDefaults,
  normalizeSystemPricingDefaults
} from "../src/app-core/shared/system-pricing-defaults.ts";
import { DEFAULT_VALUES } from "../src/constants.ts";
import { makeLot } from "./helpers/fixtures.ts";

test("normalizeSystemPricingDefaults coerces invalid seller assumptions to safe defaults", () => {
  const defaults = normalizeSystemPricingDefaults({
    sellingCurrency: "EUR",
    sellingTaxPercent: Number.NaN,
    sellingShippingPerOrder: -3,
    targetProfitPercent: -10,
    spotsPerBox: 0,
    feeProfilePreset: "none"
  });

  assert.equal(defaults.sellingCurrency, "CAD");
  assert.equal(defaults.sellingTaxPercent, DEFAULT_VALUES.SELLING_TAX_RATE_PERCENT);
  assert.equal(defaults.sellingShippingPerOrder, DEFAULT_VALUES.SELLING_SHIPPING_PER_ORDER);
  assert.equal(defaults.targetProfitPercent, 0);
  assert.equal(defaults.spotsPerBox, DEFAULT_VALUES.SPOTS_PER_BOX);
  assert.equal(defaults.feeProfilePreset, "none");
  assert.equal(defaults.platformFeePercent, 0);
  assert.equal(defaults.additionalFeePercent, 0);
  assert.equal(defaults.additionalFeeAppliesTo, "sale_only");
  assert.equal(defaults.fixedFeePerOrder, 0);
});

test("applySystemPricingDefaultsToLot only updates lots that inherit system seller defaults", () => {
  const defaults = normalizeSystemPricingDefaults({
    sellingCurrency: "USD",
    sellingTaxPercent: 9.5,
    sellingShippingPerOrder: 4,
    targetProfitPercent: 22,
    spotsPerBox: 12,
    feeProfilePreset: "whatnot"
  });

  const inheritingLot = makeLot({
    usesSystemPricingDefaults: true,
    sellingCurrency: "CAD",
    sellingTaxPercent: 99,
    sellingShippingPerOrder: 99,
    targetProfitPercent: 3,
    spotsPerBox: 2,
    externalSku: "LOT-ONLY"
  });
  const customLot = makeLot({
    usesSystemPricingDefaults: false,
    sellingCurrency: "CAD",
    sellingTaxPercent: 13,
    sellingShippingPerOrder: 2,
    targetProfitPercent: 11,
    spotsPerBox: 6
  });

  const updatedInheritingLot = applySystemPricingDefaultsToLot(inheritingLot, defaults);
  const updatedCustomLot = applySystemPricingDefaultsToLot(customLot, defaults);

  assert.equal(lotUsesSystemPricingDefaults(updatedInheritingLot), true);
  assert.equal(updatedInheritingLot.sellingCurrency, "USD");
  assert.equal(updatedInheritingLot.sellingTaxPercent, 9.5);
  assert.equal(updatedInheritingLot.sellingShippingPerOrder, 4);
  assert.equal(updatedInheritingLot.targetProfitPercent, 22);
  assert.equal(updatedInheritingLot.spotsPerBox, 12);
  assert.equal(updatedInheritingLot.feeProfilePreset, "whatnot");
  assert.equal(updatedInheritingLot.platformFeePercent, 8);
  assert.equal(updatedInheritingLot.additionalFeePercent, 2.9);
  assert.equal(updatedInheritingLot.additionalFeeAppliesTo, "sale_plus_shipping");
  assert.equal(updatedInheritingLot.fixedFeePerOrder, 0.3);
  assert.equal(updatedInheritingLot.externalSku, "LOT-ONLY");

  assert.equal(lotUsesSystemPricingDefaults(updatedCustomLot), false);
  assert.equal(updatedCustomLot.sellingCurrency, "CAD");
  assert.equal(updatedCustomLot.sellingTaxPercent, 13);
  assert.equal(updatedCustomLot.sellingShippingPerOrder, 2);
  assert.equal(updatedCustomLot.targetProfitPercent, 11);
  assert.equal(updatedCustomLot.spotsPerBox, 6);
});
