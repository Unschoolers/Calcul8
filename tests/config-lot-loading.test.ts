import assert from "node:assert/strict";
import { test } from "vitest";
import { buildHydratedLotState } from "../src/app-core/methods/config-lot-loading.ts";
import { makeLot } from "./helpers/fixtures.ts";

test("buildHydratedLotState applies singles normalization, tax defaults, and free-tier target profit clamp", () => {
  const lotId = 1704067200000;
  const lot = makeLot({
    id: lotId,
    lotType: "singles",
    purchaseDate: undefined,
    createdAt: undefined,
    purchaseTaxPercent: undefined,
    sellingTaxPercent: undefined,
    externalSku: "  BULK-BLEACH-02 ",
    targetProfitPercent: -5,
    singlesPurchases: [
      {
        id: 0,
        item: "  Card X  ",
        cardNumber: " 13 ",
        externalSku: "  CARD-X-13 ",
        cost: "2.5" as unknown as number,
        quantity: "2" as unknown as number,
        marketValue: "3.5" as unknown as number
      }
    ]
  });

  const result = buildHydratedLotState(lot, {
    hasProAccess: false,
    todayDate: "2026-03-22",
    currentNewLotCatalogSource: "pokemon"
  });

  assert.equal(result.newLotType, "singles");
  assert.equal(result.newLotCatalogSource, "ua");
  assert.equal(result.purchaseDate, "2024-01-01");
  assert.equal(result.purchaseTaxPercent, 15);
  assert.equal(result.sellingTaxPercent, 15);
  assert.equal(result.feeProfilePreset, "whatnot");
  assert.equal(result.platformFeePercent, 8);
  assert.equal(result.additionalFeePercent, 2.9);
  assert.equal(result.additionalFeeAppliesTo, "sale_plus_shipping");
  assert.equal(result.fixedFeePerOrder, 0.3);
  assert.equal(result.externalSku, "BULK-BLEACH-02");
  assert.equal(result.targetProfitPercent, 0);
  assert.equal(result.singlesPurchases[0]?.item, "Card X");
  assert.equal(result.singlesPurchases[0]?.externalSku, "CARD-X-13");
  assert.equal(result.singlesPurchases[0]?.quantity, 2);
  assert.equal(result.singlesPurchases[0]?.marketValueCurrency, "USD");
});

test("buildHydratedLotState preserves non-singles catalog source target and defaults invalid pro target to 15", () => {
  const lot = makeLot({
    lotType: "bulk",
    targetProfitPercent: Number.NaN,
    feeProfilePreset: "none",
    platformFeePercent: 0,
    additionalFeePercent: 0,
    additionalFeeAppliesTo: "sale_only",
    fixedFeePerOrder: 0
  });

  const result = buildHydratedLotState(lot, {
    hasProAccess: true,
    todayDate: "2026-03-22",
    currentNewLotCatalogSource: "pokemon"
  });

  assert.equal(result.newLotType, "bulk");
  assert.equal(result.newLotCatalogSource, "pokemon");
  assert.equal(result.targetProfitPercent, 15);
  assert.equal(result.feeProfilePreset, "none");
  assert.equal(result.platformFeePercent, 0);
  assert.equal(result.additionalFeePercent, 0);
  assert.equal(result.additionalFeeAppliesTo, "sale_only");
  assert.equal(result.fixedFeePerOrder, 0);
});

test("buildHydratedLotState defaults custom singles market value currency to the lot currency", () => {
  const lot = makeLot({
    lotType: "singles",
    currency: "CAD",
    singlesCatalogSource: "none",
    singlesPurchases: [
      {
        id: 1,
        item: "Custom Card",
        cost: 2,
        currency: "CAD",
        quantity: 1,
        marketValue: 5
      }
    ]
  });

  const result = buildHydratedLotState(lot, {
    hasProAccess: true,
    todayDate: "2026-03-22",
    currentNewLotCatalogSource: "none"
  });

  assert.equal(result.newLotCatalogSource, "none");
  assert.equal(result.singlesPurchases[0]?.marketValueCurrency, "CAD");
});
