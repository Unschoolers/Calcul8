import Chart from "chart.js/auto";
import type { AppContext } from "../context-app.ts";
import {
  buildPortfolioBreakdownChartConfig,
  buildPortfolioHistoryChartConfig,
  buildPortfolioMarginChartConfig,
  buildPortfolioSalesByUserChartConfig,
  buildSalesPieChartConfig,
  buildSalesTrendChartConfig
} from "./sales-chart-config.ts";
import { getTodayDate } from "./config-shared.ts";
import { formatCompactChartDate, isSmallDisplay, resolveCanvasRef, safeDestroyChart } from "./sales-ui-helpers.ts";
import { queuePortfolioSalesHydration } from "./sales-portfolio-hydration.ts";

function getPortfolioSalesByLotId(
  context: Pick<AppContext, "currentLotId" | "sales" | "loadSalesForLotId"> & Partial<Pick<AppContext, "getAllSalesByLotId">>,
  lotIds: number[]
) {
  if (typeof context.getAllSalesByLotId === "function") {
    return context.getAllSalesByLotId(lotIds);
  }
  return new Map(
    lotIds.map((lotId) => [
      lotId,
      context.currentLotId === lotId ? context.sales : context.loadSalesForLotId(lotId)
    ] as const)
  );
}

export function initSalesChartDisplay(context: AppContext): void {
  safeDestroyChart(context.salesChart);
  context.salesChart = null;

  const chartCanvas = context.chartView === "pie"
    ? resolveCanvasRef(context, "salesWindow", "salesChartCanvas")
    : resolveCanvasRef(context, "salesWindow", "salesTrendChart");
  if (!chartCanvas) return;
  const existingSalesChart = Chart.getChart(chartCanvas);
  if (existingSalesChart) {
    safeDestroyChart(existingSalesChart);
  }

  const ctx = chartCanvas.getContext("2d");
  if (!ctx) return;
  if (context.chartView !== "pie") {
    const trendConfig = buildSalesTrendChartConfig({
      sales: context.sales,
      totalCaseCost: context.totalCaseCost,
      sellingTaxPercent: context.sellingTaxPercent,
      formatCurrency: (value, decimals) => context.formatCurrency(value, decimals),
      formatDate: (value) => context.formatDate(value),
      formatCompactDate: (value) => formatCompactChartDate(value, context.preferredLanguage)
    });
    if (!trendConfig) return;
    context.salesChart = new Chart(ctx, trendConfig);
    return;
  }

  const soldPacks = context.soldPacksCount;
  const totalPacks = context.totalPacks;
  const unsoldPacks = Math.max(0, totalPacks - soldPacks);
  const soldNet = context.totalRevenue;
  const grossUnsold = unsoldPacks * (context.packPrice || 0);
  const unsoldNet = context.netFromGross(grossUnsold, context.sellingShippingPerOrder, unsoldPacks);
  context.salesChart = new Chart(ctx, buildSalesPieChartConfig({
    soldPacks,
    totalPacks,
    currentLotType: context.currentLotType,
    soldNet,
    unsoldNet,
    formatCurrency: (value, decimals) => context.formatCurrency(value, decimals),
    compactMode: isSmallDisplay(context)
  }));
}

export function initPortfolioCharts(context: AppContext): void {
  safeDestroyChart(context.portfolioChart);
  context.portfolioChart = null;
  safeDestroyChart(context.portfolioSalesByUserChart);
  context.portfolioSalesByUserChart = null;

  if (context.currentTab !== "portfolio") return;
  queuePortfolioSalesHydration(context);

  const chartCanvas = resolveCanvasRef(context, "portfolioWindow", "portfolioChartCanvas");
  if (!chartCanvas) return;
  const existingPortfolioChart = Chart.getChart(chartCanvas);
  if (existingPortfolioChart) {
    safeDestroyChart(existingPortfolioChart);
  }

  const ctx = chartCanvas.getContext("2d");
  if (!ctx) return;

  let primaryChartConfig:
    | ReturnType<typeof buildPortfolioBreakdownChartConfig>
    | ReturnType<typeof buildPortfolioMarginChartConfig>
    | ReturnType<typeof buildPortfolioHistoryChartConfig>
    | null = null;

  if (context.portfolioChartView === "breakdown") {
    primaryChartConfig = buildPortfolioBreakdownChartConfig({
      rows: context.allLotPerformance,
      compactLegend: isSmallDisplay(context),
      formatCurrency: (value, decimals) => context.formatCurrency(value, decimals)
    });
  } else if (context.portfolioChartView === "margin") {
    primaryChartConfig = buildPortfolioMarginChartConfig({
      rows: context.allLotPerformance,
      compactMode: isSmallDisplay(context),
      formatCurrency: (value, decimals) => context.formatCurrency(value, decimals)
    });
  } else {
    const selectedLotIdSet = new Set(context.portfolioSelectedLotIds);
    const filteredLots = context.lots.filter((lot) => selectedLotIdSet.has(lot.id));
    const salesByLotId = getPortfolioSalesByLotId(context, filteredLots.map((lot) => lot.id));
    primaryChartConfig = buildPortfolioHistoryChartConfig({
      portfolioChartView: context.portfolioChartView,
      filteredLots,
      allLotPerformance: context.allLotPerformance,
      salesByLotId,
      formatCurrency: (value, decimals) => context.formatCurrency(value, decimals),
      formatDate: (value) => context.formatDate(value),
      formatCompactDate: (value) => formatCompactChartDate(value, context.preferredLanguage),
      compactMode: isSmallDisplay(context),
      todayDate: getTodayDate()
    });
  }

  if (primaryChartConfig) {
    context.portfolioChart = new Chart(ctx, primaryChartConfig);
  }

  const salesByUserCanvas = resolveCanvasRef(context, "portfolioWindow", "portfolioSalesByUserChartCanvas");
  if (!salesByUserCanvas) return;
  const existingSalesByUserChart = Chart.getChart(salesByUserCanvas);
  if (existingSalesByUserChart) {
    safeDestroyChart(existingSalesByUserChart);
  }

  const salesByUserCtx = salesByUserCanvas.getContext("2d");
  if (!salesByUserCtx) return;

  const salesByUserConfig = buildPortfolioSalesByUserChartConfig({
    chartData: context.portfolioSalesByUserChartData,
    metric: context.portfolioSalesByUserMetric,
    compactMode: isSmallDisplay(context),
    formatCurrency: (value, decimals) => context.formatCurrency(value, decimals)
  });
  if (!salesByUserConfig) return;
  context.portfolioSalesByUserChart = new Chart(salesByUserCtx, salesByUserConfig);
}

