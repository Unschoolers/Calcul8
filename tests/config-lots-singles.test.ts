import assert from "node:assert/strict";
import { test, vi } from "vitest";
import type { Lot, SinglesPurchaseEntry } from "../src/types/app.ts";
import {
  appendBlankSinglesPurchaseRow,
  beginSinglesCsvImport,
  confirmSinglesCsvImport,
  removeSinglesPurchaseRowById,
  syncSinglesPurchaseRows
} from "../src/app-core/methods/config-lots-singles.ts";
import { makeLot } from "./helpers/fixtures.ts";

function makeState() {
  return {
    showSinglesCsvMapperModal: false,
    singlesCsvImportHeaders: [] as string[],
    singlesCsvImportRows: [] as string[][],
    singlesCsvImportCurrency: "CAD" as "CAD" | "USD",
    singlesCsvImportMode: "merge" as "append" | "merge" | "sync",
    singlesCsvMapItem: null as number | null,
    singlesCsvMapCardNumber: null as number | null,
    singlesCsvMapCondition: null as number | null,
    singlesCsvMapLanguage: null as number | null,
    singlesCsvMapCost: null as number | null,
    singlesCsvMapQuantity: null as number | null,
    singlesCsvMapMarketValue: null as number | null,
    currentLotType: "singles" as const,
    currency: "CAD" as "CAD" | "USD",
    singlesPurchases: [] as SinglesPurchaseEntry[],
    onSinglesPurchaseRowsChange: vi.fn(),
    notify: vi.fn()
  };
}

test("append/remove singles rows stay pure and predictable", () => {
  const rows = appendBlankSinglesPurchaseRow([], "USD");
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.currency, "USD");
  assert.equal(rows[0]?.quantity, 1);

  const filtered = removeSinglesPurchaseRowById([
    { ...rows[0]!, id: 1 },
    { ...rows[0]!, id: 2 }
  ], 1);
  assert.deepEqual(filtered.map((row) => row.id), [2]);
});

test("syncSinglesPurchaseRows normalizes rows and updates the active singles lot", () => {
  const lot = makeLot({ id: 1, lotType: "singles", singlesPurchases: [] });
  const context = {
    currentLotType: "singles" as const,
    currentLotId: 1,
    currency: "CAD" as "CAD" | "USD",
    lots: [lot],
    singlesPurchases: [
      {
        id: 0,
        item: "  Card A ",
        cardNumber: " 001 ",
        image: " https://img.test/a.jpg ",
        condition: " Near Mint ",
        language: " English ",
        cost: -5,
        currency: "USD" as const,
        quantity: "3.9" as unknown as number,
        marketValue: "4.25" as unknown as number
      }
    ],
    onSinglesPurchaseRowsChange: vi.fn(),
    recalculateDefaultPrices: vi.fn()
  };

  syncSinglesPurchaseRows(context);

  assert.equal(context.singlesPurchases[0]?.item, "Card A");
  assert.equal(context.singlesPurchases[0]?.quantity, 3);
  assert.equal(lot.singlesPurchases?.length, 1);
  assert.equal(context.recalculateDefaultPrices.mock.calls.length, 1);
});

test("beginSinglesCsvImport seeds mapper state from parsed headers", () => {
  const state = makeState();
  const started = beginSinglesCsvImport(
    state,
    "Item,Card Number,Condition,Language,Price,Qty,Market Value\nPikachu,025,NM,English,3.5,2,5"
  );

  assert.equal(started, true);
  assert.equal(state.showSinglesCsvMapperModal, true);
  assert.equal(state.singlesCsvMapItem, 0);
  assert.equal(state.singlesCsvMapQuantity, 5);
  assert.equal(state.singlesCsvMapMarketValue, 6);
});

test("confirmSinglesCsvImport validates state and applies merged rows", () => {
  const state = makeState();
  state.singlesCsvImportHeaders = ["Item", "Qty", "Card #"];
  state.singlesCsvImportRows = [["Pikachu", "2", "025"]];
  state.singlesCsvMapItem = 0;
  state.singlesCsvMapQuantity = 1;
  state.singlesCsvMapCardNumber = 2;
  state.onSinglesPurchaseRowsChange = vi.fn();

  const result = confirmSinglesCsvImport(state);

  assert.deepEqual(result, {
    ok: true,
    message: "Imported 1 item from CSV."
  });
  assert.equal(state.singlesPurchases.length, 1);
  assert.equal(state.onSinglesPurchaseRowsChange.mock.calls.length, 1);
  assert.equal(state.showSinglesCsvMapperModal, false);
});
