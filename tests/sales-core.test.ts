import assert from "node:assert/strict";
import { test } from "vitest";
import type { NewSaleDraft, Sale, SinglesPurchaseEntry } from "../src/types/app.ts";
import { buildSaleSaveResult, normalizeDraftSinglesSaleLines } from "../src/app-core/methods/sales-core.ts";

function makeDraft(overrides: Partial<NewSaleDraft> = {}): NewSaleDraft {
  return {
    type: "pack",
    quantity: 1,
    packsCount: null,
    singlesPurchaseEntryId: null,
    singlesItems: undefined,
    price: 10,
    customer: "",
    memo: "",
    buyerShipping: 0,
    date: "2026-02-21",
    ...overrides
  };
}

function makeSale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: 1,
    type: "pack",
    quantity: 1,
    packsCount: 1,
    price: 10,
    buyerShipping: 0,
    date: "2026-02-21",
    ...overrides
  };
}

function makeSinglesEntry(overrides: Partial<SinglesPurchaseEntry> = {}): SinglesPurchaseEntry {
  return {
    id: 101,
    item: "Card A",
    cardNumber: "001",
    cost: 5,
    quantity: 3,
    marketValue: 7,
    currency: "CAD",
    ...overrides
  };
}

test("normalizeDraftSinglesSaleLines falls back to legacy single-line fields", () => {
  const lines = normalizeDraftSinglesSaleLines(makeDraft({
    quantity: 2,
    price: 40,
    singlesPurchaseEntryId: 55,
    singlesItems: undefined
  }));

  assert.deepEqual(lines, [
    {
      singlesPurchaseEntryId: 55,
      quantity: 2,
      price: 40
    }
  ]);
});

test("buildSaleSaveResult builds a bulk RTYH sale and normalizes invalid date", () => {
  const result = buildSaleSaveResult({
    canUsePaidActions: true,
    currentLotType: "bulk",
    sales: [],
    editingSale: null,
    newSale: makeDraft({
      type: "rtyh",
      quantity: 3,
      packsCount: 7,
      price: 15,
      date: "invalid-date"
    }),
    packsPerBox: 16,
    singlesPurchases: [],
    todayDate: "2026-02-22"
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected save result");
  }
  assert.equal(result.sale.type, "rtyh");
  assert.equal(result.sale.quantity, 1);
  assert.equal(result.sale.packsCount, 7);
  assert.equal(result.sale.date, "2026-02-22");
});

test("buildSaleSaveResult trims and persists customer notes separately from memo", () => {
  const result = buildSaleSaveResult({
    canUsePaidActions: true,
    currentLotType: "bulk",
    sales: [],
    editingSale: null,
    newSale: makeDraft({
      customer: "  Alex  ",
      memo: "  thank you  "
    }),
    packsPerBox: 16,
    singlesPurchases: [],
    todayDate: "2026-02-22"
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected save result");
  }
  assert.equal(result.sale.customer, "Alex");
  assert.equal(result.sale.memo, "thank you");
});

test("buildSaleSaveResult aggregates singles lines into a total-price sale", () => {
  const result = buildSaleSaveResult({
    canUsePaidActions: true,
    currentLotType: "singles",
    sales: [],
    editingSale: null,
    newSale: makeDraft({
      quantity: null,
      price: null,
      singlesItems: [
        { lineId: 1, singlesPurchaseEntryId: 71, quantity: 2, price: 40 },
        { lineId: 2, singlesPurchaseEntryId: 71, quantity: 1, price: 22 }
      ]
    }),
    packsPerBox: 16,
    singlesPurchases: [makeSinglesEntry({ id: 71, quantity: 3 })],
    todayDate: "2026-02-22"
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected save result");
  }
  assert.equal(result.sale.quantity, 3);
  assert.equal(result.sale.packsCount, 3);
  assert.equal(result.sale.price, 62);
  assert.equal(result.sale.priceIsTotal, true);
  assert.deepEqual(result.sale.singlesItems, [
    { singlesPurchaseEntryId: 71, quantity: 2, price: 40 },
    { singlesPurchaseEntryId: 71, quantity: 1, price: 22 }
  ]);
  assert.equal(result.sale.singlesPurchaseEntryId, undefined);
});

test("buildSaleSaveResult rejects singles quantity that exceeds remaining stock", () => {
  const result = buildSaleSaveResult({
    canUsePaidActions: true,
    currentLotType: "singles",
    sales: [],
    editingSale: null,
    newSale: makeDraft({
      quantity: null,
      price: null,
      singlesItems: [
        { lineId: 1, singlesPurchaseEntryId: 81, quantity: 2, price: 40 },
        { lineId: 2, singlesPurchaseEntryId: 81, quantity: 1, price: 22 }
      ]
    }),
    packsPerBox: 16,
    singlesPurchases: [makeSinglesEntry({ id: 81, quantity: 2 })],
    todayDate: "2026-02-22"
  });

  assert.deepEqual(result, {
    ok: false,
    color: "warning",
    message: "Quantity exceeds selected item stock (2 available)."
  });
});

test("buildSaleSaveResult returns an error when the edited sale no longer exists", () => {
  const editingSale = makeSale({ id: 42 });
  const result = buildSaleSaveResult({
    canUsePaidActions: true,
    currentLotType: "bulk",
    sales: [],
    editingSale,
    newSale: makeDraft({
      quantity: 2,
      price: 10
    }),
    packsPerBox: 16,
    singlesPurchases: [],
    todayDate: "2026-02-22"
  });

  assert.deepEqual(result, {
    ok: false,
    color: "error",
    message: "Could not find the sale to update. Please try again."
  });
});

test("memo edits preserve imported transaction links and wheel accounting metadata", () => {
  const existing = makeSale({ type: "wheel", quantity: 2, packsCount: 2, linkedWheelId: 5,
    winningTierId: "tier-1", costOfWinningTier: 3, netRevenue: 8,
    externalProvider: "whatnot", externalAccountId: "seller", externalSaleId: "s1",
    externalOrderId: "o1", externalOrderItemId: "i1",
    externalTransactionRefs: [{ provider: "whatnot", accountId: "seller", ledgerTransactionId: "tx1", orderId: "o1", orderItemId: "i1" }] });
  const result = buildSaleSaveResult({ canUsePaidActions: true, currentLotType: "bulk", sales: [existing], editingSale: existing,
    newSale: makeDraft({ type: "wheel", quantity: 2, packsCount: 2, memo: "Corrected memo" }), packsPerBox: 8, singlesPurchases: [] });
  assert.ok(result.ok);
  for (const key of ["linkedWheelId", "winningTierId", "costOfWinningTier", "netRevenue", "externalProvider", "externalAccountId", "externalSaleId", "externalOrderId", "externalOrderItemId", "externalTransactionRefs"] as const) {
    assert.deepEqual(result.sale[key], existing[key]);
  }
  assert.equal(result.sale.memo, "Corrected memo");
  assert.equal(result.sale.packsCount, 2);
  assert.equal(result.sale.priceIsTotal, true);
});

test("changing a wheel sale price invalidates stored revenue and keeps the spin price as a total", () => {
  const existing = makeSale({ type: "wheel", quantity: 2, packsCount: 2, linkedWheelId: 5, netRevenue: 8 });
  const result = buildSaleSaveResult({ canUsePaidActions: true, currentLotType: "bulk", sales: [existing], editingSale: existing,
    newSale: makeDraft({ type: "wheel", quantity: 2, packsCount: 2, price: 15 }), packsPerBox: 8, singlesPurchases: [] });
  assert.ok(result.ok);
  assert.equal(result.sale.netRevenue, undefined);
  assert.equal(result.sale.priceIsTotal, true);
  assert.equal(result.sale.linkedWheelId, 5);
});

test("editing a singles wheel prize preserves its wheel type and inventory link", () => {
  const existing = makeSale({ type: "wheel", singlesPurchaseEntryId: 101, linkedWheelId: 5, netRevenue: 8 });
  const result = buildSaleSaveResult({ canUsePaidActions: true, currentLotType: "singles", sales: [existing], editingSale: existing,
    newSale: makeDraft({ type: "wheel", packsCount: 1, singlesItems: [{ lineId: 1, singlesPurchaseEntryId: 101, quantity: 1, price: 10 }] }),
    packsPerBox: 8, singlesPurchases: [makeSinglesEntry()] });
  assert.ok(result.ok);
  assert.equal(result.sale.type, "wheel");
  assert.equal(result.sale.singlesPurchaseEntryId, 101);
  assert.equal(result.sale.netRevenue, 8);
});
