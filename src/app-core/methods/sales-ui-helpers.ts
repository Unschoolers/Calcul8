import type { SaleType } from "../../types/app.ts";
import type { AppContext } from "../context-app.ts";
import { formatLocalizedCompactDate } from "../i18n/index.ts";

type ChartRefreshTargetTab = "sales" | "portfolio";
type TabChartRefreshContext = Pick<AppContext, "currentTab" | "initSalesChart" | "initPortfolioChart" | "$nextTick">;

const pendingTabChartRefreshes = new WeakMap<object, number>();

export function firstFiniteNonNegative(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    const next = Number(value);
    if (Number.isFinite(next) && next >= 0) {
      return next;
    }
  }
  return null;
}

export function resolveDefaultSaleUnitPrice(
  context: Pick<AppContext, "liveBoxPriceSell" | "boxPriceSell" | "liveSpotPrice" | "spotPrice" | "livePackPrice" | "packPrice">,
  type: SaleType
): number {
  if (type === "box") {
    return firstFiniteNonNegative(context.liveBoxPriceSell, context.boxPriceSell) ?? 0;
  }
  if (type === "rtyh") {
    return firstFiniteNonNegative(context.liveSpotPrice, context.spotPrice) ?? 0;
  }
  return firstFiniteNonNegative(context.livePackPrice, context.packPrice) ?? 0;
}

export function safeDestroyChart(chart: { stop: () => void; destroy: () => void } | null): void {
  if (!chart) return;
  try {
    chart.stop();
    chart.destroy();
  } catch {
    // Ignore teardown errors from stale canvas/context during rapid UI toggles.
  }
}

export function isSmallDisplay(context: Pick<AppContext, "$vuetify">): boolean {
  const vuetify = (context as unknown as { $vuetify?: { display?: { smAndDown?: boolean } } }).$vuetify;
  return Boolean(vuetify?.display?.smAndDown);
}

export function formatCompactChartDate(value: string, preferredLanguage?: string): string {
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnlyMatch
    ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatLocalizedCompactDate(
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    preferredLanguage
  );
}

export function refreshChartsForCurrentTab(
  context: Pick<AppContext, "currentTab" | "initSalesChart" | "initPortfolioChart" | "$nextTick">
): void {
  const runRefresh = () => {
    if (context.currentTab === "sales") {
      context.initSalesChart();
      return;
    }
    if (context.currentTab === "portfolio") {
      context.initPortfolioChart();
    }
  };

  const scheduleNextTick = (context as Partial<AppContext>).$nextTick;
  if (typeof scheduleNextTick === "function") {
    void scheduleNextTick.call(context, runRefresh);
    return;
  }
  runRefresh();
}

export function cancelQueuedTabChartRefresh(context: object): void {
  const timeoutId = pendingTabChartRefreshes.get(context);
  if (timeoutId == null) return;
  globalThis.clearTimeout(timeoutId);
  pendingTabChartRefreshes.delete(context);
}

export function queueTabChartRefreshAfterSettle(
  context: TabChartRefreshContext,
  targetTab: ChartRefreshTargetTab,
  delayMs = 250
): void {
  cancelQueuedTabChartRefresh(context as object);

  const runRefresh = () => {
    if (context.currentTab !== targetTab) return;
    const initChart = targetTab === "sales"
      ? () => context.initSalesChart()
      : () => context.initPortfolioChart();
    const scheduleNextTick = context.$nextTick;
    if (typeof scheduleNextTick === "function") {
      void scheduleNextTick.call(context, initChart);
      return;
    }
    initChart();
  };

  const normalizedDelayMs = Math.max(0, Math.floor(Number(delayMs) || 0));
  if (normalizedDelayMs === 0) {
    runRefresh();
    return;
  }

  const timeoutId = globalThis.setTimeout(() => {
    pendingTabChartRefreshes.delete(context as object);
    runRefresh();
  }, normalizedDelayMs) as unknown as number;
  pendingTabChartRefreshes.set(context as object, timeoutId);
}

export function focusSaleQuantityInput(context: Pick<AppContext, "$refs" | "$nextTick">): void {
  const scheduleNextTick = (context as Partial<AppContext>).$nextTick;
  const runFocus = () => {
    if (!context.$refs) return;
    const refs = context.$refs as {
      saleQuantityInput?:
        | HTMLInputElement
        | { focus?: () => void; $el?: Element | null }
        | null;
    };
    const quantityRef = refs.saleQuantityInput;
    if (!quantityRef) return;

    if (typeof quantityRef.focus === "function") {
      quantityRef.focus();
      return;
    }

    if (typeof quantityRef === "object" && quantityRef !== null && "$el" in quantityRef) {
      const input = quantityRef.$el?.querySelector("input");
      if (input instanceof HTMLInputElement) {
        input.focus();
      }
    }
  };

  if (typeof scheduleNextTick === "function") {
    void scheduleNextTick.call(context, runFocus);
    return;
  }

  runFocus();
}

export function resolveCanvasRef(
  context: Pick<AppContext, "$refs">,
  windowRefName: "salesWindow" | "portfolioWindow",
  canvasRefName: string
): HTMLCanvasElement | null {
  if (!context.$refs) return null;
  const rootRefs = context.$refs as Record<string, unknown>;

  const direct = rootRefs[canvasRefName];
  if (direct instanceof HTMLCanvasElement) {
    return direct;
  }

  const windowComponent = rootRefs[windowRefName] as { $refs?: Record<string, unknown> } | undefined;
  const nested = windowComponent?.$refs?.[canvasRefName];
  if (nested instanceof HTMLCanvasElement) {
    return nested;
  }

  return null;
}

