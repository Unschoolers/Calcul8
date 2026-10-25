import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";

const chartConfigs: Array<Record<string, unknown>> = [];
const queuePortfolioSalesHydrationMock = vi.hoisted(() => vi.fn());
vi.mock("chart.js/auto", () => {
  class MockChart {
    static getChart() { return undefined; }
    constructor(_context: unknown, config: Record<string, unknown>) { chartConfigs.push(config); }
    stop() {}
    destroy() {}
  }
  return { default: MockChart };
});
vi.mock("../src/app-core/methods/sales-portfolio-hydration.ts", () => ({
  queuePortfolioSalesHydration: queuePortfolioSalesHydrationMock
}));

import { initPortfolioCharts } from "../src/app-core/methods/sales-charts.ts";
import { appWatch } from "../src/app-core/watch.ts";

afterEach(() => {
  chartConfigs.length = 0;
  queuePortfolioSalesHydrationMock.mockClear();
  vi.unstubAllGlobals();
});

class FakeCanvas {
  isConnected = true;
  getContext() { return {}; }
}

function makeContext(portfolioChartView: "margin" | "trend" | "sales") {
  vi.stubGlobal("HTMLCanvasElement", FakeCanvas);
  const primary = new FakeCanvas();
  const byUser = new FakeCanvas();
  return {
    currentTab: "portfolio",
    isOffline: true,
    activeScopeType: "workspace",
    activeWorkspaceId: "workspace-1",
    portfolioChartView,
    portfolioSection: "analytics",
    portfolioSalesGrouping: "person",
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
  assert.equal(chartConfigs.length, 1);
  const marginConfig = chartConfigs[0] as { data: { datasets: Array<{ label?: string }> } };
  assert.equal(marginConfig.data.datasets[0]?.label, "Marge sur les ventes (%)");

  chartConfigs.length = 0;
  initPortfolioCharts(makeContext("trend") as never);
  assert.equal(chartConfigs.length, 1);
  const historyConfig = chartConfigs[0] as { data: { datasets: Array<{ label?: string }> } };
  assert.equal(historyConfig.data.datasets[0]?.label, "Investissement récupéré à ce jour");
  assert.equal(historyConfig.data.datasets[1]?.label, "Objectif de récupération de l’investissement");

  chartConfigs.length = 0;
  const salesCanvasContext = makeContext("sales");
  salesCanvasContext.$refs.portfolioWindow.$refs.portfolioChartCanvas = undefined;
  initPortfolioCharts(salesCanvasContext as never);
  assert.equal(chartConfigs.length, 1, "the sales chart builds independently of the primary canvas");
  const salesConfig = chartConfigs[0] as {
    options: {
      plugins: {
        tooltip: {
          callbacks: {
            label(context: { parsed: { y: number }; dataset: { label: string } }): string;
          };
        };
      };
    };
  };
  assert.equal(
    salesConfig.options.plugins.tooltip.callbacks.label({ parsed: { y: 2 }, dataset: { label: "Vous" } }),
    "Vous: 2 ventes"
  );
});

test("portfolio hydration runs without canvases and chart rendering waits for a visible section", () => {
  const context = makeContext("trend");
  context.$refs.portfolioWindow.$refs = {};
  initPortfolioCharts(context as never);

  assert.equal(queuePortfolioSalesHydrationMock.mock.calls.length, 1);
  assert.equal(chartConfigs.length, 0);

  chartConfigs.length = 0;
  const detailsContext = makeContext("trend");
  detailsContext.portfolioSection = "details";
  initPortfolioCharts(detailsContext as never);
  assert.equal(queuePortfolioSalesHydrationMock.mock.calls.length, 2);
  assert.equal(chartConfigs.length, 0, "details has no chart canvas to initialize");
});

test("portfolio chart initialization ignores detached canvases", () => {
  const context = makeContext("trend");
  context.$refs.portfolioWindow.$refs.portfolioChartCanvas.isConnected = false;
  initPortfolioCharts(context as never);
  assert.equal(chartConfigs.length, 0);
});

test("portfolio section, receipt, grouping, and sales-cache watchers refresh after Vue renders", () => {
  const queued: Array<() => void> = [];
  const initPortfolioChart = vi.fn();
  const context = {
    currentTab: "portfolio",
    initPortfolioChart,
    $nextTick: (callback: () => void) => { queued.push(callback); }
  };

  appWatch.portfolioSection.call(context as never);
  appWatch.portfolioReceiptFilter.call(context as never);
  appWatch.portfolioSalesGrouping.call(context as never);
  appWatch.salesCacheEpoch.call(context as never);

  assert.equal(initPortfolioChart.mock.calls.length, 0, "refreshes wait for the DOM update");
  assert.equal(queued.length, 4);
  queued.forEach((callback) => callback());
  assert.equal(initPortfolioChart.mock.calls.length, 4);

  queued.length = 0;
  context.currentTab = "sales";
  appWatch.portfolioReceiptFilter.call(context as never);
  assert.equal(queued.length, 0, "off-tab receipt changes do not render a portfolio chart");
});
