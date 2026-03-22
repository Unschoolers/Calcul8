import assert from "node:assert/strict";
import { test } from "vitest";
import { DEFAULT_VALUES } from "../src/constants.ts";
import type { Lot, LotSetup } from "../src/types/app.ts";
import {
  createNewLotRecord,
  getDeleteLotConfirmationText,
  normalizeSelectedLotId,
  validateRenameLotName
} from "../src/app-core/methods/config-lot-crud.ts";
import { makeLot, makeLotSetup } from "./helpers/fixtures.ts";

test("createNewLotRecord builds singles lots with normalized defaults", () => {
  const result = createNewLotRecord({
    lots: [makeLot({ id: 1, lotType: "singles", singlesCatalogSource: "pokemon", sellingTaxPercent: 17 })],
    currentLotId: 1,
    newLotName: "  New Singles  ",
    newLotType: "singles",
    newLotCatalogSource: "ua",
    purchaseUiMode: "simple",
    setup: makeLotSetup(),
    todayDate: "2026-03-22",
    generatedId: 999
  });

  assert.equal(result.lot.id, 999);
  assert.equal(result.lot.name, "New Singles");
  assert.equal(result.lot.lotType, "singles");
  assert.equal(result.lot.singlesCatalogSource, "ua");
  assert.deepEqual(result.lot.singlesPurchases, []);
  assert.equal(result.lot.costInputMode, "total");
  assert.equal(result.lot.boxPriceCost, 0);
  assert.equal(result.lot.boxesPurchased, 0);
  assert.equal(result.lot.packsPerBox, 1);
  assert.equal(result.lot.purchaseShippingCost, 0);
  assert.equal(result.lot.purchaseTaxPercent, 0);
  assert.equal(result.lot.includeTax, false);
  assert.equal(result.lot.sellingTaxPercent, 17);
});

test("createNewLotRecord uses fallback selling tax when previous tax is invalid", () => {
  const result = createNewLotRecord({
    lots: [makeLot({ id: 1, sellingTaxPercent: Number.NaN })],
    currentLotId: 1,
    newLotName: "Bulk Lot",
    newLotType: "bulk",
    newLotCatalogSource: "pokemon",
    purchaseUiMode: "expert",
    setup: makeLotSetup({ sellingTaxPercent: 99 }),
    todayDate: "2026-03-22",
    generatedId: 200
  });

  assert.equal(result.lot.sellingTaxPercent, DEFAULT_VALUES.SELLING_TAX_RATE_PERCENT);
  assert.equal(result.lot.externalSku, "");
  assert.equal(result.nextLotCatalogSource, "none");
});

test("validateRenameLotName enforces blank and duplicate checks", () => {
  const lot = makeLot({ id: 1, name: "Lot A" });
  const lots = [lot, makeLot({ id: 2, name: "Lot B" })];

  assert.deepEqual(validateRenameLotName(lots, lot, "   "), {
    ok: false,
    message: "Please enter a lot name"
  });
  assert.deepEqual(validateRenameLotName(lots, lot, " lot b "), {
    ok: false,
    message: "A lot with this name already exists"
  });
  assert.deepEqual(validateRenameLotName(lots, lot, " Lot A "), {
    ok: true,
    nextName: "Lot A",
    changed: false
  });
});

test("normalizeSelectedLotId and delete copy helpers stay simple and deterministic", () => {
  assert.equal(normalizeSelectedLotId(42), 42);
  assert.equal(normalizeSelectedLotId(0), null);
  assert.equal(normalizeSelectedLotId(Number.NaN), null);
  assert.equal(getDeleteLotConfirmationText("Lot A", 0), "Delete \"Lot A\" permanently?");
  assert.equal(getDeleteLotConfirmationText("Lot A", 2), "Delete \"Lot A\" and 2 linked sales permanently?");
});
