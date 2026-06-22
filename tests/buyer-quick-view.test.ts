import assert from "node:assert/strict";
import { describe, test } from "vitest";
import type { Lot, Sale } from "../src/types/app.ts";
import {
  buildBuyerQuickViewSummary,
  normalizeBuyerKey
} from "../src/app-core/computed/buyer-quick-view.ts";

function lot(id: number, name: string): Lot {
  return {
    id,
    name,
    boxPriceCost: 0,
    boxesPurchased: 0,
    packsPerBox: 1,
    costInputMode: "total",
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1,
    purchaseDate: "2026-01-01",
    purchaseShippingCost: 0,
    purchaseTaxPercent: 0,
    sellingTaxPercent: 0,
    sellingShippingPerOrder: 0,
    includeTax: false,
    spotPrice: 0,
    boxPriceSell: 0,
    packPrice: 0,
    targetProfitPercent: 0,
    feeProfilePreset: "whatnot",
    platformFeePercent: 0,
    additionalFeePercent: 0,
    additionalFeeAppliesTo: "sale_only",
    fixedFeePerOrder: 0
  };
}

function sale(overrides: Partial<Sale>): Sale {
  return {
    id: 1,
    type: "pack",
    quantity: 1,
    packsCount: 1,
    price: 0,
    buyerShipping: 0,
    date: "2026-01-01",
    ...overrides
  };
}

describe("buyer quick view summary", () => {
  test("normalizes buyer names for matching without changing the display name", () => {
    assert.equal(normalizeBuyerKey("  Alice   Smoke "), "alice smoke");
    assert.equal(normalizeBuyerKey(null), "");
  });

  test("summarizes current-lot and all-lot buyer purchases", () => {
    const summary = buildBuyerQuickViewSummary({
      buyerName: "Alice",
      currentLotId: 1,
      lots: [lot(1, "Kaiju #8"), lot(2, "Demon Slayer v2")],
      salesByLotId: new Map([
        [
          1,
          [
            sale({ id: 101, customer: "Alice", quantity: 2, price: 8, date: "2026-03-01" }),
            sale({ id: 102, customer: "Bob", quantity: 1, price: 10, date: "2026-03-02" }),
            sale({ id: 103, customer: "Alice", type: "box", quantity: 1, price: 120, priceIsTotal: true, date: "2026-03-03" })
          ]
        ],
        [2, [sale({ id: 201, customer: "Alice", quantity: 1, price: 9, date: "2026-03-05" })]]
      ])
    });

    assert.ok(summary);
    assert.equal(summary.username, "Alice");
    assert.equal(summary.totalSpentForCurrentLot, 136);
    assert.equal(summary.totalSpentAllLots, 145);
    assert.equal(summary.purchasesForCurrentLot, 2);
    assert.equal(summary.purchasesAllLots, 3);
    assert.equal(summary.lastPurchaseDate, "2026-03-05");
    assert.deepEqual(
      summary.groupedByLot.map((entry) => ({
        lotId: entry.lotId,
        lotName: entry.lotName,
        purchases: entry.purchaseCount,
        total: entry.totalSpent,
        current: entry.isCurrentLot
      })),
      [
        { lotId: 1, lotName: "Kaiju #8", purchases: 2, total: 136, current: true },
        { lotId: 2, lotName: "Demon Slayer v2", purchases: 1, total: 9, current: false }
      ]
    );
  });

  test("matches buyer names across whitespace and case", () => {
    const summary = buildBuyerQuickViewSummary({
      buyerName: " alice  smoke ",
      currentLotId: 2,
      lots: [lot(1, "Union arena singles"), lot(2, "Kaiju #8")],
      salesByLotId: new Map([
        [1, [sale({ id: 101, customer: "Alice Smoke", quantity: 1, price: 4, date: "2026-02-01" })]],
        [2, [sale({ id: 201, customer: "  ALICE   SMOKE ", quantity: 3, price: 5, date: "2026-02-03" })]]
      ])
    });

    assert.ok(summary);
    assert.equal(summary.username, "alice smoke");
    assert.equal(summary.totalSpentForCurrentLot, 15);
    assert.equal(summary.totalSpentAllLots, 19);
    assert.equal(summary.groupedByLot[0]?.lotId, 2);
  });

  test("returns null when there is no named buyer or no matching purchases", () => {
    const lots = [lot(1, "Kaiju #8")];
    const salesByLotId = new Map([[1, [sale({ customer: "Alice", price: 8 })]]]);

    assert.equal(buildBuyerQuickViewSummary({ buyerName: "", currentLotId: 1, lots, salesByLotId }), null);
    assert.equal(buildBuyerQuickViewSummary({ buyerName: "Bob", currentLotId: 1, lots, salesByLotId }), null);
  });
});
