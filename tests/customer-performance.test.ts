import assert from "node:assert/strict";
import { describe, test } from "vitest";
import type { Lot, Sale } from "../src/types/app.ts";
import {
  buildCustomerPerformanceRows,
  buildCustomerPerformanceSummary
} from "../src/app-core/computed/customer-performance.ts";

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

describe("customer performance", () => {
  test("groups named customers across lots by normalized buyer name", () => {
    const rows = buildCustomerPerformanceRows({
      lots: [lot(1, "Kaiju #8"), lot(2, "Union arena singles")],
      salesByLotId: new Map([
        [
          1,
          [
            sale({ id: 101, customer: "Alice", quantity: 2, price: 8, date: "2026-03-01" }),
            sale({ id: 102, customer: "  ALICE  ", type: "box", quantity: 1, price: 120, priceIsTotal: true, date: "2026-03-05" }),
            sale({ id: 103, customer: "", quantity: 1, price: 99, date: "2026-03-06" })
          ]
        ],
        [2, [sale({ id: 201, customer: "Bob", quantity: 3, price: 10, date: "2026-03-03" })]]
      ])
    });

    assert.deepEqual(
      rows.map((row) => ({
        name: row.username,
        total: row.totalSpent,
        purchases: row.purchaseCount,
        lotCount: row.lotCount,
        topLot: row.topLotName,
        last: row.lastPurchaseDate
      })),
      [
        {
          name: "Alice",
          total: 136,
          purchases: 2,
          lotCount: 1,
          topLot: "Kaiju #8",
          last: "2026-03-05"
        },
        {
          name: "Bob",
          total: 30,
          purchases: 1,
          lotCount: 1,
          topLot: "Union arena singles",
          last: "2026-03-03"
        }
      ]
    );
  });

  test("summarizes customer highlights without treating anonymous sales as customers", () => {
    const rows = buildCustomerPerformanceRows({
      lots: [lot(1, "Kaiju #8"), lot(2, "Union arena singles"), lot(3, "Nikke")],
      salesByLotId: new Map([
        [1, [sale({ id: 101, customer: "Alice", quantity: 1, price: 50, date: "2026-03-01" })]],
        [2, [sale({ id: 201, customer: "Bob", quantity: 1, price: 10, date: "2026-03-02" }), sale({ id: 202, customer: "Bob", quantity: 1, price: 15, date: "2026-03-04" })]],
        [3, [sale({ id: 301, customer: "", quantity: 1, price: 500, date: "2026-03-05" })]]
      ])
    });

    const summary = buildCustomerPerformanceSummary(rows);

    assert.equal(summary.customerCount, 2);
    assert.equal(summary.repeatBuyerCount, 1);
    assert.equal(summary.totalSpent, 75);
    assert.equal(summary.topCustomer?.username, "Alice");
    assert.equal(summary.lastActiveCustomer?.username, "Bob");
    assert.equal(summary.topFiveSharePercent, 100);
  });
});
