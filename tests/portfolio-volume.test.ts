import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { portfolioComputed } from "../src/app-core/computed/portfolio.ts";
import {
  buildPortfolioHistoryChartConfig,
  buildPortfolioSalesByUserChartConfig
} from "../src/app-core/methods/sales-chart-config.ts";
import { createDenseVolumeFixture } from "./helpers/volume-fixtures.ts";
import {
  buildPortfolioSalesByUserChartData,
  buildPortfolioSalesByUserDrilldownRows
} from "../src/app-core/computed/portfolio-sales-by-user.ts";

function createPortfolioContext() {
  const { lot, sales } = createDenseVolumeFixture();
  const context = {
    lots: [lot],
    sales: [],
    currentLotId: lot.id,
    portfolioLotFilterIds: [],
    portfolioLotTypeFilter: "both",
    portfolioDashboardPreset: "all",
    salesCacheEpoch: 0,
    getAllSalesByLotId: () => new Map([[lot.id, sales]]),
    hasProAccess: false,
    livePackPrice: 0,
    liveBoxPriceSell: 0,
    liveSpotPrice: 0,
    whatnotFeeSummary: null,
    activeScopeType: "personal",
    workspaceMembers: [],
    portfolioSalesByUserMetric: "count",
    preferredLanguage: "en"
  };
  const selectedLotIds = portfolioComputed.portfolioSelectedLotIds.call(context as never);
  const computationContext = { ...context, portfolioSelectedLotIds: selectedLotIds };
  const rows = portfolioComputed.allLotPerformance.call(computationContext as never);
  const totals = portfolioComputed.portfolioTotals.call({ ...computationContext, allLotPerformance: rows } as never);
  const chartData = portfolioComputed.portfolioSalesByUserChartData.call(computationContext as never);

  return { lot, sales, rows, totals, chartData };
}

describe("portfolio volume paths", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-20T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts all historical sales in portfolio totals and history chart", () => {
    const { lot, sales, rows, totals } = createPortfolioContext();
    const row = rows[0]!;
    const grossSalesOracle = sales.reduce((sum, sale) => sum + sale.price, 0);
    const itemCostOracle = lot.singlesPurchases!.reduce((sum, item) => sum + item.cost * item.quantity, 0);

    expect(sales).toHaveLength(1_000);
    expect(row.salesCount).toBe(1_000);
    expect(row.totalPacks).toBe(1_500);
    expect(row.soldPacks).toBe(1_000);
    expect(grossSalesOracle).toBe(14_490);
    expect(itemCostOracle).toBe(9_002);
    expect(row.totalRevenue).toBeCloseTo(grossSalesOracle * (1 - 0.08 - 0.029) - sales.length * 0.3, 8);
    expect(totals.totalSalesCount).toBe(1_000);
    expect(totals.totalRevenue).toBe(row.totalRevenue);
    expect(row.totalRevenue).toBeCloseTo(12_610.59, 8);
    expect(totals.totalCost).toBe(row.totalCost);
    expect(row.totalCost).toBe(9_002);
    expect(totals.totalProfit).toBeCloseTo(row.totalProfit, 8);
    expect(row.totalProfit).toBeCloseTo(3_608.59, 8);
    expect(row.realizedCost).toBeCloseTo(5_996, 8);
    expect(row.realizedProfit).toBeCloseTo(6_614.59, 8);

    const config = buildPortfolioHistoryChartConfig({
      portfolioChartView: "trend",
      filteredLots: [lot],
      allLotPerformance: rows,
      salesByLotId: new Map([[lot.id, sales]]),
      formatCurrency: (value) => String(value),
      formatDate: (value) => value,
      todayDate: "2025-09-26"
    });
    const labels = config?.data.labels ?? [];
    const actual = config?.data.datasets[0]?.data as number[] | undefined;

    expect(labels).toHaveLength(1_000);
    expect(labels[0]).toBe("2023-01-01");
    expect(labels.at(-1)).toBe("2025-09-26");
    expect(actual).toHaveLength(1_000);
    expect(actual?.every(Number.isFinite)).toBe(true);
    expect(actual?.at(-1)).toBeCloseTo(row.totalProfit, 8);
  });

  it("keeps the separate sales-by-user chart on its rolling eight-week window", () => {
    const { chartData, sales, totals } = createPortfolioContext();

    expect(sales).toHaveLength(1_000);
    expect(totals.totalSalesCount).toBe(1_000);
    expect(totals.totalRevenue).toBeCloseTo(12_610.59, 8);
    expect(totals.totalCost).toBe(9_002);
    expect(totals.totalProfit).toBeCloseTo(3_608.59, 8);
    expect(chartData.weeks).toHaveLength(8);
    expect(chartData.weeks.at(-1)?.key).toBe("2026-10-19");
    expect(chartData.series).toHaveLength(0);
  });

  it("includes every sale in the fixture dates that fall inside the eight-week window and builds the labeled count chart", () => {
    vi.setSystemTime(new Date("2025-09-26T12:00:00.000Z"));
    const { chartData, sales, totals } = createPortfolioContext();
    const config = buildPortfolioSalesByUserChartConfig({
      chartData,
      metric: "count",
      compactMode: false,
      formatCurrency: (value) => String(value)
    });
    const series = chartData.series[0];
    const dataset = config?.data.datasets[0];
    const visibleCount = chartData.series.reduce((sum, item) => sum + item.total, 0);
    const visibleFixtureSales = sales.filter((sale) => sale.date >= "2025-08-04" && sale.date <= "2025-09-28");

    expect(sales).toHaveLength(1_000);
    expect(totals.totalSalesCount).toBe(1_000);
    expect(totals.totalRevenue).toBeCloseTo(12_610.59, 8);
    expect(totals.totalCost).toBe(9_002);
    expect(totals.totalProfit).toBeCloseTo(3_608.59, 8);
    expect(visibleFixtureSales).toHaveLength(54);
    expect(chartData.weeks).toHaveLength(8);
    expect(chartData.weeks[0]?.key).toBe("2025-08-04");
    expect(chartData.weeks.at(-1)?.key).toBe("2025-09-22");
    expect(series?.total).toBe(54);
    expect(series?.values.every(Number.isFinite)).toBe(true);
    expect(visibleCount).toBe(54);
    expect(visibleCount).toBe(7 * 7 + 5);
    expect(visibleCount + (sales.length - visibleFixtureSales.length)).toBe(1_000);
    expect(config?.data.labels).toHaveLength(8);
    expect(dataset?.label).toBe(series?.label);
    expect(dataset?.data).toEqual(series?.values);
    expect((dataset?.data as number[]).reduce((sum, value) => sum + value, 0)).toBe(54);
  });

  it("uses the requested period consistently in chart and drilldown builders", () => {
    vi.setSystemTime(new Date("2025-09-26T12:00:00.000Z"));
    const { lot, sales } = createDenseVolumeFixture();
    const common = {
      lots: [lot],
      salesByLotId: new Map([[lot.id, sales]]),
      selectedLotIds: [lot.id],
      scopeType: "personal" as const,
      workspaceMembers: [],
      todayDate: "2025-09-26"
    };
    const chartData = buildPortfolioSalesByUserChartData({ ...common, metric: "count", period: 4 } as never);
    const rows = buildPortfolioSalesByUserDrilldownRows({ ...common, period: 4 } as never);

    expect(chartData.weeks).toHaveLength(4);
    expect(chartData.series.reduce((sum, series) => sum + series.total, 0)).toBe(26);
    expect(rows).toHaveLength(26);
  });

  it("keeps both portfolio computed paths on the local current week near Monday midnight UTC", () => {
    vi.setSystemTime(new Date(2026, 9, 18, 22));
    const { lot, sales } = createDenseVolumeFixture();
    const boundarySales = [
      { ...sales[0]!, id: 20_001, date: "2026-10-12" },
      { ...sales[0]!, id: 20_002, date: "2026-10-19" }
    ];
    const context = {
      lots: [lot],
      getAllSalesByLotId: () => new Map([[lot.id, boundarySales]]),
      portfolioSelectedLotIds: [lot.id],
      portfolioSalesByUserMetric: "count",
      portfolioSalesByUserPeriod: 8,
      activeScopeType: "personal",
      workspaceMembers: [],
      preferredLanguage: "en"
    };

    const chart = portfolioComputed.portfolioSalesByUserChartData.call(context as never);
    const rows = portfolioComputed.portfolioSalesByUserDrilldownRows.call(context as never);

    expect(chart.weeks.at(-1)?.key).toBe("2026-10-12");
    expect(chart.series.reduce((sum, series) => sum + series.total, 0)).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.date).toBe("2026-10-12");
  });
});
