import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  getPortfolioCustomerPerformanceSortOptions,
  getPortfolioLotPerformanceSortOptions,
  getPortfolioPerformanceSortButtonClass,
  getPortfolioPerformanceSortIcon,
  normalizePortfolioSortDirection,
  sortCustomerPerformanceRows,
  sortPortfolioLotPerformanceRows
} from "../src/app-core/computed/portfolio-performance.ts";
import type { CustomerPerformanceRow } from "../src/app-core/computed/customer-performance.ts";

describe("portfolio performance helpers", () => {
  test("sorts lot rows by at-risk amount while preserving source order by default", () => {
    const rows = [
      { lotId: 1, lotName: "Low risk", salesCount: 2, soldPacks: 8, totalPacks: 16, realizedMarginPercent: 12, totalProfit: -5, realizedProfit: 20, forecastProfitAverage: 10 },
      { lotId: 2, lotName: "High risk", salesCount: 1, soldPacks: 4, totalPacks: 16, realizedMarginPercent: 6, totalProfit: -100, realizedProfit: 4, forecastProfitAverage: 8 },
      { lotId: 3, lotName: "Winner", salesCount: 3, soldPacks: 16, totalPacks: 16, realizedMarginPercent: 22, totalProfit: 50, realizedProfit: 50, forecastProfitAverage: 50 }
    ];

    assert.deepEqual(sortPortfolioLotPerformanceRows(rows, "source", "asc").map((row) => row.lotName), ["Low risk", "High risk", "Winner"]);
    assert.deepEqual(sortPortfolioLotPerformanceRows(rows, "risk", "desc").map((row) => row.lotName), ["High risk", "Low risk", "Winner"]);
  });

  test("sorts customer rows by dates and exposes compact sort option metadata", () => {
    const rows: CustomerPerformanceRow[] = [
      { username: "Recent", normalizedKey: "recent", totalSpent: 10, purchaseCount: 1, lotCount: 1, lastPurchaseDate: "2026-05-01", topLotId: 1, topLotName: "Low risk", topLotSpent: 10 },
      { username: "Older", normalizedKey: "older", totalSpent: 100, purchaseCount: 2, lotCount: 2, lastPurchaseDate: "2026-03-01", topLotId: 2, topLotName: "High risk", topLotSpent: 80 }
    ];
    const copy = (_key: string, fallback: string): string => fallback;

    assert.deepEqual(sortCustomerPerformanceRows(rows, "last", "asc").map((row) => row.username), ["Older", "Recent"]);
    assert.deepEqual(getPortfolioLotPerformanceSortOptions(copy).map((option) => `${option.key}:${option.label}`), [
      "name:Lot",
      "status:Status",
      "soldMargin:Sold margin",
      "risk:At risk",
      "profit:Profit"
    ]);
    assert.deepEqual(getPortfolioCustomerPerformanceSortOptions(copy).map((option) => `${option.key}:${option.label}`), [
      "customer:Customer",
      "spent:Spent",
      "purchases:Purchases",
      "lots:Lots",
      "last:Last purchase",
      "topLot:Top lot"
    ]);
    assert.equal(normalizePortfolioSortDirection("asc", "desc"), "asc");
    assert.equal(getPortfolioPerformanceSortIcon("spent", "desc", "spent"), "mdi-arrow-down");
    assert.deepEqual(getPortfolioPerformanceSortButtonClass("spent", "customer"), { "is-active": false });
  });
});
