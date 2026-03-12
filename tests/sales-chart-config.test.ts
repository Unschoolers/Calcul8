import assert from "node:assert/strict";
import { test } from "vitest";
import type { Lot, LotPerformanceSummary, Sale } from "../src/types/app.ts";
import {
  buildPortfolioBreakdownChartConfig,
  buildPortfolioMarginChartConfig,
  buildPortfolioHistoryChartConfig,
  buildSalesPieChartConfig,
  buildSalesTrendChartConfig
} from "../src/app-core/methods/sales-chart-config.ts";

function formatCurrency(value: number, decimals = 2): string {
  return Number(value).toFixed(decimals);
}

function formatDate(value: string): string {
  return `D:${value}`;
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

function makeLot(overrides: Partial<Lot> = {}): Lot {
  return {
    id: 1700000000000,
    name: "Lot 1",
    boxPriceCost: 0,
    boxesPurchased: 0,
    packsPerBox: 16,
    spotsPerBox: 16,
    costInputMode: "perBox",
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    purchaseDate: "2026-02-01",
    purchaseShippingCost: 0,
    purchaseTaxPercent: 0,
    sellingTaxPercent: 15,
    sellingShippingPerOrder: 3,
    includeTax: true,
    spotPrice: 0,
    boxPriceSell: 0,
    packPrice: 0,
    targetProfitPercent: 15,
    ...overrides
  };
}

function makePerformance(
  overrides: Partial<LotPerformanceSummary & { lotId: number; lotName: string; realizedCost?: number; realizedProfit?: number; realizedMarginPercent?: number | null }> = {}
) {
  return {
    lotId: 1700000000000,
    lotName: "Lot 1",
    salesCount: 1,
    totalRevenue: 120,
    totalCost: 80,
    totalProfit: 40,
    marginPercent: 50,
    realizedCost: 80,
    realizedProfit: 40,
    realizedMarginPercent: 33.3333,
    soldPacks: 2,
    totalPacks: 10,
    lastSaleDate: "2026-02-21",
    ...overrides
  };
}

test("buildSalesTrendChartConfig returns null when there are no sales", () => {
  const config = buildSalesTrendChartConfig({
    sales: [],
    totalCaseCost: 100,
    sellingTaxPercent: 15,
    formatCurrency,
    formatDate
  });

  assert.equal(config, null);
});

test("buildSalesTrendChartConfig returns a line config with start label", () => {
  const config = buildSalesTrendChartConfig({
    sales: [makeSale({ date: "2026-02-20" })],
    totalCaseCost: 100,
    sellingTaxPercent: 15,
    formatCurrency,
    formatDate
  });

  assert.equal(config?.type, "line");
  assert.deepEqual(config?.data.labels, ["Start", "D:2026-02-20"]);
  assert.equal(config?.data.datasets[0]?.borderColor, "#34C759");
});

test("buildSalesPieChartConfig uses card inventory labels for singles lots", () => {
  const config = buildSalesPieChartConfig({
    soldPacks: 3,
    totalPacks: 10,
    currentLotType: "singles",
    soldNet: 77,
    unsoldNet: 21,
    formatCurrency
  });

  assert.equal(config.type, "doughnut");
  assert.deepEqual(config.data.labels, ["Sold items: 3", "Remaining items: 7"]);
  assert.deepEqual(config.data.datasets[0]?.data, [3, 7]);
});

test("buildPortfolioBreakdownChartConfig uses right-side legend for compact mode", () => {
  const config = buildPortfolioBreakdownChartConfig({
    rows: [makePerformance()],
    compactLegend: true,
    formatCurrency
  });

  assert.equal(config?.type, "pie");
  assert.equal(config?.options?.plugins?.legend?.display, true);
  assert.equal(config?.options?.plugins?.legend?.position, "bottom");
  assert.equal(config?.data.labels?.[0], "Lot 1");
  assert.equal(config?.data.datasets[0]?.backgroundColor?.[0], "#D7A300");
  assert.equal(config?.data.datasets[0]?.borderColor, "rgba(247, 181, 0, 0.9)");
});

test("buildPortfolioMarginChartConfig creates a sorted horizontal bar chart and keeps unsold lots at 0%", () => {
  const config = buildPortfolioMarginChartConfig({
    rows: [
      makePerformance({ lotId: 1, lotName: "Lot 1", realizedMarginPercent: 12.5, realizedProfit: 25 }),
      makePerformance({ lotId: 2, lotName: "Lot 2", realizedMarginPercent: -4.5, realizedProfit: -9 }),
      makePerformance({ lotId: 3, lotName: "Lot 3", realizedMarginPercent: 33.3, realizedProfit: 50 }),
      makePerformance({ lotId: 4, lotName: "Lot 4", salesCount: 0, soldPacks: 0, totalPacks: 10, realizedMarginPercent: null, realizedProfit: 0 })
    ],
    compactMode: true,
    formatCurrency
  });

  assert.equal(config?.type, "bar");
  assert.equal(config?.options?.indexAxis, "y");
  assert.deepEqual(config?.data.labels, ["Lot 3", "Lot 1", "Lot 4", "Lot 2"]);
  assert.deepEqual(config?.data.datasets[0]?.data, [33.3, 12.5, 0, -4.5]);
  assert.equal(config?.data.datasets[0]?.label, "Sold profit margin %");
});

test("buildPortfolioHistoryChartConfig creates a trend config with target dataset", () => {
  const config = buildPortfolioHistoryChartConfig({
    portfolioChartView: "trend",
    filteredLots: [makeLot()],
    allLotPerformance: [makePerformance()],
    salesByLotId: new Map([[1700000000000, [makeSale({ quantity: 2, packsCount: 2, price: 12, buyerShipping: 1 })]]]),
    formatCurrency,
    formatDate,
    todayDate: "2026-02-22"
  });

  assert.equal(config?.type, "line");
  assert.equal(config?.data.datasets.length, 2);
  assert.equal(config?.data.datasets[0]?.label, "Actual cumulative P/L");
  assert.equal(config?.data.datasets[1]?.label, "Target P/L");
  assert.equal(typeof config?.data.datasets[0]?.segment?.borderColor, "function");
  assert.ok(Array.isArray(config?.data.datasets[0]?.pointBackgroundColor));
});

test("buildPortfolioHistoryChartConfig uses compact mobile labels and legend settings", () => {
  const config = buildPortfolioHistoryChartConfig({
    portfolioChartView: "trend",
    filteredLots: [makeLot()],
    allLotPerformance: [makePerformance()],
    salesByLotId: new Map([[1700000000000, [makeSale({ quantity: 2, packsCount: 2, price: 12, buyerShipping: 1 })]]]),
    formatCurrency,
    formatDate,
    formatCompactDate: (value) => `M:${value.slice(5)}`,
    compactMode: true,
    todayDate: "2026-02-22"
  });

  assert.equal(config?.type, "line");
  assert.ok((config?.data.labels?.[0] || "").startsWith("M:"));
  assert.equal(config?.options?.plugins?.legend?.position, "bottom");
  assert.equal(config?.options?.scales?.x?.type, "category");
  assert.equal(config?.options?.scales?.x?.offset, false);
  assert.equal(config?.options?.scales?.x?.ticks?.callback, undefined);
  assert.equal(config?.options?.scales?.x?.ticks?.maxTicksLimit, 4);
  assert.equal(config?.data.datasets[0]?.pointHoverRadius, 6);
  assert.equal(config?.data.datasets[0]?.pointHitRadius, 16);
  assert.equal(config?.options?.interaction?.intersect, false);
});

test("buildPortfolioHistoryChartConfig creates a sell-through bar config", () => {
  const config = buildPortfolioHistoryChartConfig({
    portfolioChartView: "sellthrough",
    filteredLots: [makeLot()],
    allLotPerformance: [makePerformance()],
    salesByLotId: new Map([[1700000000000, [makeSale({ quantity: 2, packsCount: 2, price: 12, buyerShipping: 1 })]]]),
    formatCurrency,
    formatDate,
    todayDate: "2026-02-22"
  });

  assert.equal(config?.type, "bar");
  assert.equal(config?.data.datasets[0]?.label, "Sell-through %");
  assert.equal(config?.data.datasets[1]?.label, "Trend");
  assert.equal(config?.data.datasets[1]?.type, "line");
  assert.equal(config?.options?.scales?.y?.max, 100);
});

test("buildPortfolioHistoryChartConfig uses compact tick settings for sell-through mobile charts", () => {
  const config = buildPortfolioHistoryChartConfig({
    portfolioChartView: "sellthrough",
    filteredLots: [makeLot()],
    allLotPerformance: [makePerformance()],
    salesByLotId: new Map([[1700000000000, [makeSale({ quantity: 2, packsCount: 2, price: 12, buyerShipping: 1 })]]]),
    formatCurrency,
    formatDate,
    formatCompactDate: (value) => `M:${value.slice(5)}`,
    compactMode: true,
    todayDate: "2026-02-22"
  });

  assert.equal(config?.type, "bar");
  assert.ok((config?.data.labels?.[0] || "").startsWith("M:"));
  assert.equal(config?.options?.scales?.x?.type, "category");
  assert.equal(config?.options?.scales?.x?.offset, true);
  assert.equal(config?.options?.scales?.x?.ticks?.callback, undefined);
  assert.equal(config?.options?.scales?.x?.ticks?.maxTicksLimit, 4);
  assert.equal(config?.options?.layout?.padding?.left, 4);
  assert.equal(config?.options?.layout?.padding?.right, 4);
  assert.equal(config?.data.datasets[0]?.clip, 8);
  assert.equal(config?.data.datasets[0]?.categoryPercentage, 0.96);
  assert.equal(config?.data.datasets[0]?.barPercentage, 0.92);
});

test("buildPortfolioHistoryChartConfig uses historical inventory for past sell-through bars", () => {
  const lot1 = makeLot({
    id: 1706745600000,
    purchaseDate: "2026-02-01"
  });
  const lot2 = makeLot({
    id: 1740787200000,
    purchaseDate: "2026-03-01",
    name: "Lot 2"
  });
  const config = buildPortfolioHistoryChartConfig({
    portfolioChartView: "sellthrough",
    filteredLots: [lot1, lot2],
    allLotPerformance: [
      makePerformance({
        lotId: 1706745600000,
        lotName: "Lot 1",
        totalPacks: 10
      }),
      makePerformance({
        lotId: 1740787200000,
        lotName: "Lot 2",
        totalPacks: 10,
        totalRevenue: 0,
        totalCost: 80,
        totalProfit: -80,
        marginPercent: null,
        soldPacks: 0,
        salesCount: 0,
        lastSaleDate: null
      })
    ],
    salesByLotId: new Map([
      [1706745600000, [makeSale({ date: "2026-02-10", packsCount: 2 })]],
      [1740787200000, []]
    ]),
    formatCurrency,
    formatDate,
    todayDate: "2026-03-10"
  });

  assert.equal(config?.type, "bar");
  assert.deepEqual(config?.data.labels, ["D:2026-02-10", "D:2026-03-01"]);
  assert.deepEqual(
    (config?.data.datasets[0]?.data || []).map((value) => Number(Number(value).toFixed(2))),
    [20, 10]
  );
});
