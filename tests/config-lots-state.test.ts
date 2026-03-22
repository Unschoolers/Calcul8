import assert from "node:assert/strict";
import { test } from "vitest";
import type { Lot, SinglesPurchaseEntry } from "../src/types/app.ts";
import {
  createNextSinglesEntryId,
  normalizeSinglesPurchaseEntries,
  resetSinglesCsvImportState,
  resolveCurrentLot
} from "../src/app-core/methods/config-lots-state.ts";
import { makeLot } from "./helpers/fixtures.ts";

function makeSinglesEntry(overrides: Partial<SinglesPurchaseEntry> = {}): SinglesPurchaseEntry {
  return {
    id: 1,
    item: "",
    cardNumber: "",
    image: "",
    condition: "",
    language: "",
    cost: 0,
    currency: "CAD",
    quantity: 1,
    marketValue: 0,
    ...overrides
  };
}

test("createNextSinglesEntryId advances beyond the highest positive integer id", () => {
  const nextId = createNextSinglesEntryId([
    makeSinglesEntry({ id: 100 }),
    makeSinglesEntry({ id: 105.9 }),
    makeSinglesEntry({ id: Number.NaN }),
    makeSinglesEntry({ id: -1 })
  ]);

  assert.equal(nextId >= 106, true);
});

test("normalizeSinglesPurchaseEntries trims values, normalizes numbers, and deduplicates ids", () => {
  const rows = normalizeSinglesPurchaseEntries([
    makeSinglesEntry({
      id: 5,
      item: "  Card A ",
      cardNumber: " 001 ",
      externalSku: "  UA-BLEACH-001 ",
      image: " https://img.test/a.jpg ",
      condition: " Near Mint ",
      language: " English ",
      cost: -4,
      quantity: "3.8" as unknown as number,
      marketValue: "4.25" as unknown as number
    }),
    makeSinglesEntry({
      id: 5,
      item: "  ",
      cardNumber: 123 as unknown as string,
      cost: "oops" as unknown as number,
      quantity: -1,
      marketValue: -9,
      currency: "nope" as unknown as "CAD" | "USD"
    })
  ], "USD");

  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.id, 5);
  assert.equal(rows[1]?.id > 5, true);
  assert.equal(rows[0]?.item, "Card A");
  assert.equal(rows[0]?.cardNumber, "001");
  assert.equal(rows[0]?.externalSku, "UA-BLEACH-001");
  assert.equal(rows[0]?.image, "https://img.test/a.jpg");
  assert.equal(rows[0]?.condition, "Near Mint");
  assert.equal(rows[0]?.language, "English");
  assert.equal(rows[0]?.cost, 0);
  assert.equal(rows[0]?.quantity, 3);
  assert.equal(rows[0]?.marketValue, 4.25);
  assert.equal(rows[1]?.currency, "USD");
});

test("resolveCurrentLot returns the selected lot when present", () => {
  const lot = makeLot({ id: 202 });
  assert.equal(resolveCurrentLot([makeLot(), lot], 202), lot);
  assert.equal(resolveCurrentLot([makeLot()], 999), null);
  assert.equal(resolveCurrentLot([makeLot()], null), null);
});

test("resetSinglesCsvImportState restores mapper state to defaults", () => {
  const target = {
    showSinglesCsvMapperModal: true,
    singlesCsvImportHeaders: ["A"],
    singlesCsvImportRows: [["B"]],
    singlesCsvImportCurrency: "USD" as "CAD" | "USD",
    singlesCsvImportMode: "sync" as "append" | "merge" | "sync",
    singlesCsvMapItem: 0 as number | null,
    singlesCsvMapCardNumber: 1 as number | null,
    singlesCsvMapCondition: 2 as number | null,
    singlesCsvMapLanguage: 3 as number | null,
    singlesCsvMapCost: 4 as number | null,
    singlesCsvMapQuantity: 5 as number | null,
    singlesCsvMapMarketValue: 6 as number | null
  };

  resetSinglesCsvImportState(target, "CAD");

  assert.equal(target.showSinglesCsvMapperModal, false);
  assert.deepEqual(target.singlesCsvImportHeaders, []);
  assert.deepEqual(target.singlesCsvImportRows, []);
  assert.equal(target.singlesCsvImportCurrency, "CAD");
  assert.equal(target.singlesCsvImportMode, "merge");
  assert.equal(target.singlesCsvMapItem, null);
  assert.equal(target.singlesCsvMapCardNumber, null);
  assert.equal(target.singlesCsvMapCondition, null);
  assert.equal(target.singlesCsvMapLanguage, null);
  assert.equal(target.singlesCsvMapCost, null);
  assert.equal(target.singlesCsvMapQuantity, null);
  assert.equal(target.singlesCsvMapMarketValue, null);
});
