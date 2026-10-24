import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

const chartConfigs: Array<Record<string, unknown>> = [];
vi.mock("chart.js/auto", () => {
  class MockChart {
    static getChart() { return undefined; }
    constructor(_context: unknown, config: Record<string, unknown>) { chartConfigs.push(config); }
    stop() {}
    destroy() {}
  }
  return { default: MockChart };
});

import { initPortfolioCharts } from "../src/app-core/methods/sales-charts.ts";

afterEach(() => {
  chartConfigs.length = 0;
  vi.unstubAllGlobals();
});

class FakeCanvas {
  isConnected = true;
  getContext() { return {}; }
}

function makeContext(portfolioChartView: "margin" | "trend") {
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  const primary = new FakeCanvas();
  const byUser = new FakeCanvas();
  return {
    currentTab: "portfolio",
    isOffline: true,
    activeScopeType: "workspace",
    activeWorkspaceId: "workspace-1",
    portfolioChartView,
    preferredLanguage: "fr-CA",
    portfolioChart: null,
    portfolioSalesByUserChart: null,
    allLotPerformance: [{
      lotId: 1, lotName: "Lot A", salesCount: 1, totalRevenue: 12, totalCost: 8,
      totalProfit: 4, realizedCost: 8, realizedProfit: 4, realizedMarginPercent: 33.3,
      soldPacks: 1, totalPacks: 2, lastSaleDate: "2026-10-20", forecastProfitAverage: null,
      forecastRevenueAverage: null, forecastScenarioCount: 0
    }],
    portfolioSelectedLotIds: [1],
    lots: [{ id: 1, name: "Lot A", boxPriceCost: 8, boxesPurchased: 0, packsPerBox: 1,
      spotsPerBox: 1, costInputMode: "perBox", currency: "CAD", sellingCurrency: "CAD",
      exchangeRate: 1, purchaseDate: "2026-10-01", purchaseShippingCost: 0,
      purchaseTaxPercent: 0, sellingTaxPercent: 0, sellingShippingPerOrder: 0,
      feeProfilePreset: "none", platformFeePercent: 0, additionalFeePercent: 0,
      additionalFeeAppliesTo: "sale_only", fixedFeePerOrder: 0, includeTax: false,
      spotPrice: 0, boxPriceSell: 0, packPrice: 0, targetProfitPercent: 50 }],
    sales: [{ id: 1, type: "pack", quantity: 1, packsCount: 1, price: 12,
      buyerShipping: 0, date: "2026-10-20" }],
    salesByLotId: new Map([[1, [{ id: 1, type: "pack", quantity: 1, packsCount: 1,
      price: 12, buyerShipping: 0, date: "2026-10-20" }]]]),
    portfolioSalesByUserChartData: { weeks: [{ key: "2026-10-19", label: "Oct 19" }],
      series: [{ key: "self", label: "Vous", values: [1], total: 1, color: "#F7B500" }] },
    portfolioSalesByUserMetric: "count",
    formatCurrency: (value: number, decimals = 2) => Number(value).toFixed(decimals),
    formatDate: (value: string) => value,
    getAllSalesByLotId: () => new Map([[1, [{ id: 1, type: "pack", quantity: 1,
      packsCount: 1, price: 12, buyerShipping: 0, date: "2026-10-20" }]]]),
    loadSalesForLotId: () => [],
    $refs: { portfolioWindow: { $refs: { portfolioChartCanvas: primary, portfolioSalesByUserChartCanvas: byUser } } }
  };
}

test("initPortfolioCharts passes the selected locale into actual Portfolio chart configs", () => {
  initPortfolioCharts(makeContext("margin") as never);
  assert.ok(chartConfigs.length >= 2, `captured ${chartConfigs.length} Portfolio chart configurations`);
  const marginConfig = chartConfigs[0] as { data: { datasets: Array<{ label?: string }> } };
  assert.equal(marginConfig.data.datasets[0]?.label, "Marge sur les ventes (%)");
  const userConfig = chartConfigs[1] as { options: { plugins: { tooltip: { callbacks: { label: (context: unknown) => string } } } } };
  assert.equal(userConfig.options.plugins.tooltip.callbacks.label({ parsed: { y: 2 }, dataset: { label: "Vous" } }), "Vous: 2 ventes");

  chartConfigs.length = 0;
  initPortfolioCharts(makeContext("trend") as never);
  const historyConfig = chartConfigs[0] as { data: { datasets: Array<{ label?: string }> } };
  assert.equal(historyConfig.data.datasets[0]?.label, "Profit/perte cumulé réel");
  assert.equal(historyConfig.data.datasets[1]?.label, "Profit/perte cible");
});
