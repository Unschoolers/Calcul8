import Chart from "chart.js/auto";
import type { AppContext } from "../context-app.ts";
import {
  buildPortfolioBreakdownChartConfig,
  buildPortfolioHistoryChartConfig,
  buildPortfolioMarginChartConfig,
  buildPortfolioSalesByUserChartConfig,
  buildSalesPieChartConfig,
  buildSalesProfitTrendChartConfig,
  buildSalesTrendChartConfig
} from "./sales-chart-config.ts";
import { getTodayDate } from "./config-shared.ts";
import { formatCompactChartDate, isSmallDisplay, resolveCanvasRef, safeDestroyChart } from "./sales-ui-helpers.ts";
import { queuePortfolioSalesHydration } from "./sales-portfolio-hydration.ts";
import { observeElementResize, type StopHandle } from "../ui/vueuse.ts";

const SALES_CHART_RETRY_DELAY_MS = 120;
const SALES_CHART_MAX_INIT_RETRIES = 5;
const pendingSalesChartInitRetries = new WeakMap<object, number>();
const salesChartInitRetryCounts = new WeakMap<object, number>();
const pendingSalesChartResizeObservers = new WeakMap<object, StopHandle>();

function clearPendingSalesChartRetry(context: object): void {
  const timeoutId = pendingSalesChartInitRetries.get(context);
  if (timeoutId != null) {
    globalThis.clearTimeout(timeoutId);
    pendingSalesChartInitRetries.delete(context);
  }
  const stopResizeObserver = pendingSalesChartResizeObservers.get(context);
  if (stopResizeObserver) {
    stopResizeObserver();
    pendingSalesChartResizeObservers.delete(context);
  }
  salesChartInitRetryCounts.delete(context);
}

function isCanvasReady(canvas: HTMLCanvasElement): boolean {
  if (typeof canvas.isConnected === "boolean" && !canvas.isConnected) return false;
  if (typeof canvas.getBoundingClientRect !== "function") return true;
  const rect = canvas.getBoundingClientRect();
  return Number(rect.width) > 0 && Number(rect.height) > 0;
}

function queueSalesChartInitRetry(context: AppContext): void {
  if (context.currentTab !== "sales") return;
  if (pendingSalesChartInitRetries.has(context)) return;

  const attempt = (salesChartInitRetryCounts.get(context) ?? 0) + 1;
  if (attempt > SALES_CHART_MAX_INIT_RETRIES) return;
  salesChartInitRetryCounts.set(context, attempt);

  const timeoutId = globalThis.setTimeout(() => {
    pendingSalesChartInitRetries.delete(context);
    if (context.currentTab !== "sales") return;
    const runRetry = () => context.initSalesChart();
    if (typeof context.$nextTick === "function") {
      void context.$nextTick(runRetry);
      return;
    }
    runRetry();
  }, SALES_CHART_RETRY_DELAY_MS) as unknown as number;
  pendingSalesChartInitRetries.set(context, timeoutId);
}

function queueSalesChartResizeRetry(context: AppContext, canvas: HTMLCanvasElement): void {
  if (context.currentTab !== "sales") return;
  if (pendingSalesChartResizeObservers.has(context)) return;

  const stop = observeElementResize(canvas, () => {
    if (!isCanvasReady(canvas)) return;
    const stopResizeObserver = pendingSalesChartResizeObservers.get(context);
    if (stopResizeObserver) {
      stopResizeObserver();
      pendingSalesChartResizeObservers.delete(context);
    }
    const runRetry = () => context.initSalesChart();
    if (typeof context.$nextTick === "function") {
      void context.$nextTick(runRetry);
      return;
    }
    runRetry();
  });
  pendingSalesChartResizeObservers.set(context, stop);
}

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

  const hasTrendSales = Array.isArray(context.sales) && context.sales.length > 0;
  if (context.chartView !== "pie" && !hasTrendSales) {
    clearPendingSalesChartRetry(context);
    return;
  }

  const chartCanvas = context.chartView === "pie"
    ? resolveCanvasRef(context, "salesWindow", "salesChartCanvas")
    : resolveCanvasRef(context, "salesWindow", "salesTrendChart");
  if (!chartCanvas) {
    queueSalesChartInitRetry(context);
    return;
  }
  if (!isCanvasReady(chartCanvas)) {
    queueSalesChartResizeRetry(context, chartCanvas);
    queueSalesChartInitRetry(context);
    return;
  }
  clearPendingSalesChartRetry(context);

  const existingSalesChart = Chart.getChart(chartCanvas);
  if (existingSalesChart) {
    safeDestroyChart(existingSalesChart);
  }

  const ctx = chartCanvas.getContext("2d");
  if (!ctx) return;
  if (context.chartView !== "pie") {
    const trendConfig = context.chartView === "profit"
      ? buildSalesProfitTrendChartConfig({
        sales: context.sales,
        calculateSaleProfit: (sale) => context.calculateSaleProfit(sale),
        formatCurrency: (value, decimals) => context.formatCurrency(value, decimals),
        formatDate: (value) => context.formatDate(value),
        formatCompactDate: (value) => formatCompactChartDate(value, context.preferredLanguage)
      })
      : buildSalesTrendChartConfig({
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

