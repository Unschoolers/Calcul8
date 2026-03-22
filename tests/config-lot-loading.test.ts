import assert from "node:assert/strict";
import { test } from "vitest";
import { buildHydratedLotState } from "../src/app-core/methods/config-lot-loading.ts";
import { makeLot } from "./helpers/fixtures.ts";

test("buildHydratedLotState applies singles normalization, legacy tax fallback, and free-tier target profit clamp", () => {
  const lotId = 1704067200000;
  const lot = makeLot({
    id: lotId,
    lotType: "singles",
    purchaseDate: undefined,
    createdAt: undefined,
    taxRatePercent: 11,
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
  assert.equal(result.purchaseTaxPercent, 11);
  assert.equal(result.sellingTaxPercent, 11);
  assert.equal(result.externalSku, "BULK-BLEACH-02");
  assert.equal(result.targetProfitPercent, 0);
  assert.equal(result.singlesPurchases[0]?.item, "Card X");
  assert.equal(result.singlesPurchases[0]?.externalSku, "CARD-X-13");
  assert.equal(result.singlesPurchases[0]?.quantity, 2);
});

test("buildHydratedLotState preserves non-singles catalog source target and defaults invalid pro target to 15", () => {
  const lot = makeLot({
    lotType: "bulk",
    targetProfitPercent: Number.NaN
  });

  const result = buildHydratedLotState(lot, {
    hasProAccess: true,
    todayDate: "2026-03-22",
    currentNewLotCatalogSource: "pokemon"
  });

  assert.equal(result.newLotType, "bulk");
  assert.equal(result.newLotCatalogSource, "pokemon");
  assert.equal(result.targetProfitPercent, 15);
});
