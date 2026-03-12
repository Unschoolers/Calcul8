import template from "./PortfolioWindow.html?raw";
import "./PortfolioWindow.css";
import { inject, type PropType } from "vue";
import { createWindowContextBridge } from "./contextBridge.ts";
import { filterLotOptionItems } from "../../app-core/shared/lot-option-items.ts";
import { PortfolioKpiCard } from "./PortfolioKpiCard.ts";

export const PortfolioWindow = {
  name: "PortfolioWindow",
  components: {
    PortfolioKpiCard
  },
  props: {
    ctx: {
      type: Object as PropType<Record<string, unknown>>,
      required: true
    }
  },
  data() {
    return {
      mobileKpiIndex: 0,
      portfolioLotFilterSearchQuery: "",
      portfolioLotFilterMenuOpen: false
    };
  },
  methods: {
    portfolioVisibleLotFilterIds(this: Record<string, unknown>): number[] {
      const selected = Array.isArray(this.portfolioLotFilterIds)
        ? this.portfolioLotFilterIds
        : [];
      const items = Array.isArray(this.portfolioLotFilterItems)
        ? this.portfolioLotFilterItems as Array<{ value?: number }>
        : [];
      const visibleIds = new Set(
        items
          .map((item) => Number(item?.value))
          .filter((value) => Number.isFinite(value))
      );
      return selected.filter((id) => visibleIds.has(Number(id)));
    },
    portfolioVisibleLotFilterItems(this: Record<string, unknown>) {
      const items = Array.isArray(this.portfolioLotFilterItems)
        ? this.portfolioLotFilterItems as Array<{
          title: string;
          value: number;
          subtitle: string;
          lotType: "bulk" | "singles";
          groupLabel?: string | null;
        }>
        : [];
      return filterLotOptionItems(items, String(this.portfolioLotFilterSearchQuery || ""));
    },

    portfolioLotFilterItemSelected(this: Record<string, unknown>, value: number): boolean {
      const selected = Array.isArray(this.portfolioLotFilterIds)
        ? this.portfolioLotFilterIds
        : [];
      return selected.some((id) => Number(id) === Number(value));
    },

    closePortfolioLotFilter(this: Record<string, unknown>): void {
      this.portfolioLotFilterMenuOpen = false;
      const blurFilter = this.blurPortfolioLotFilter as (() => void) | undefined;
      if (typeof blurFilter === "function") {
        blurFilter.call(this);
      }
    },

    blurPortfolioLotFilter(this: Record<string, unknown>): void {
      const filterRef = (this.$refs as { portfolioLotFilterSelect?: { blur?: () => void } | undefined } | undefined)?.portfolioLotFilterSelect;
      if (typeof filterRef?.blur === "function") {
        filterRef.blur();
      }
    },

    closePortfolioLotFilterOnEnter(this: Record<string, unknown>): void {
      const closeFilter = this.closePortfolioLotFilter as (() => void) | undefined;
      if (typeof closeFilter === "function") {
        closeFilter.call(this);
      }
    },

    portfolioLotFilterDefaultLabel(this: Record<string, unknown>): string {
      const filter = String(this.portfolioLotTypeFilter || "both");
      if (filter === "bulk") return "All bulk lots";
      if (filter === "singles") return "All singles lots";
      return "All lots";
    },

    mobileKpiSlideCount(this: Record<string, unknown>): number {
      return this.averagePortfolioForecastScenario ? 4 : 3;
    },

    mobileKpiEffectiveIndex(this: Record<string, unknown>): number {
      const getCount = this.mobileKpiSlideCount as (() => number) | undefined;
      const count = typeof getCount === "function" ? getCount.call(this) : 3;
      const raw = Number(this.mobileKpiIndex ?? 0);
      const normalized = Number.isFinite(raw) ? raw : 0;
      return Math.max(0, Math.min(count - 1, normalized));
    },

    setMobileKpiIndex(this: Record<string, unknown>, value: number): void {
      const getCount = this.mobileKpiSlideCount as (() => number) | undefined;
      const count = typeof getCount === "function" ? getCount.call(this) : 3;
      if (count <= 0) {
        this.mobileKpiIndex = 0;
        return;
      }
      const normalized = Number.isFinite(Number(value)) ? Number(value) : 0;
      this.mobileKpiIndex = Math.max(0, Math.min(count - 1, normalized));
    },

    cycleMobileKpi(this: Record<string, unknown>, delta: number): void {
      const getCount = this.mobileKpiSlideCount as (() => number) | undefined;
      const count = typeof getCount === "function" ? getCount.call(this) : 3;
      if (count <= 1) {
        this.mobileKpiIndex = 0;
        return;
      }
      const getIndex = this.mobileKpiEffectiveIndex as (() => number) | undefined;
      const current = typeof getIndex === "function" ? getIndex.call(this) : 0;
      const next = (current + delta + count) % count;
      this.mobileKpiIndex = next;
    },

    portfolioLotFilterPrimaryLabel(this: Record<string, unknown>): string {
      const getVisibleSelected = this.portfolioVisibleLotFilterIds as (() => number[]) | undefined;
      const selected = typeof getVisibleSelected === "function"
        ? getVisibleSelected.call(this)
        : [];
      const items = Array.isArray(this.portfolioLotFilterItems)
        ? this.portfolioLotFilterItems as Array<{ title?: string; value?: number }>
        : [];

      if (selected.length === 0) {
        const getDefaultLabel = this.portfolioLotFilterDefaultLabel as (() => string) | undefined;
        return typeof getDefaultLabel === "function"
          ? getDefaultLabel.call(this)
          : "All lots";
      }

      const first = items.find((item) => Number(item?.value) === Number(selected[0]));
      return typeof first?.title === "string" && first.title.trim().length > 0
        ? first.title
        : "Selected lots";
    },

    portfolioLotFilterRemainingCount(this: Record<string, unknown>): number {
      const getVisibleSelected = this.portfolioVisibleLotFilterIds as (() => number[]) | undefined;
      const selected = typeof getVisibleSelected === "function"
        ? getVisibleSelected.call(this)
        : [];
      return Math.max(0, selected.length - 1);
    },

    portfolioLotStatusTone(this: Record<string, unknown>, row: {
      salesCount?: number;
      totalProfit?: number;
      forecastProfitAverage?: number | null;
    }): "positive" | "negative" | "neutral" {
      const totalProfit = Number(row?.totalProfit ?? 0);
      const forecastProfitAverage = row?.forecastProfitAverage;
      if (totalProfit < 0) return "negative";
      if (totalProfit > 0) return "positive";
      if (typeof forecastProfitAverage === "number" && forecastProfitAverage !== 0) {
        return forecastProfitAverage > 0 ? "positive" : "negative";
      }
      return row?.salesCount ? "positive" : "neutral";
    },

    portfolioLotIsIncomplete(this: Record<string, unknown>, row: {
      soldPacks?: number;
      totalPacks?: number;
    }): boolean {
      return Number(row?.soldPacks ?? 0) < Number(row?.totalPacks ?? 0);
    },

    portfolioLotPrimaryProfitLabel(this: Record<string, unknown>, row: {
      salesCount?: number;
      realizedProfit?: number;
      forecastProfitAverage?: number | null;
      soldPacks?: number;
      totalPacks?: number;
      totalProfit?: number;
    }): string {
      const isIncomplete = this.portfolioLotIsIncomplete as ((r: typeof row) => boolean) | undefined;
      const incomplete = typeof isIncomplete === "function" ? isIncomplete.call(this, row) : false;
      const format = this.fmtCurrency as ((value: number | null | undefined, decimals?: number) => string) | undefined;

      if (incomplete && typeof row?.forecastProfitAverage === "number") {
        const value = row.forecastProfitAverage;
        const formatted = typeof format === "function" ? format.call(this, Math.abs(value)) : String(Math.abs(value));
        return value >= 0 ? `≈ $${formatted}` : `≈ -$${formatted}`;
      }

      if ((row?.salesCount ?? 0) > 0) {
        const value = Number(row?.realizedProfit ?? 0);
        const formatted = typeof format === "function" ? format.call(this, Math.abs(value)) : String(Math.abs(value));
        return `${value >= 0 ? "" : "-"}$${formatted}`;
      }

      const value = Number(row?.totalProfit ?? 0);
      const formatted = typeof format === "function" ? format.call(this, Math.abs(value)) : String(Math.abs(value));
      return `${value >= 0 ? "" : "-"}$${formatted}`;
    },

    portfolioLotPrimaryProfitChipColor(this: Record<string, unknown>, row: {
      salesCount?: number;
      realizedProfit?: number;
      forecastProfitAverage?: number | null;
      soldPacks?: number;
      totalPacks?: number;
      totalProfit?: number;
    }): "success" | "error" | "secondary" {
      const isIncomplete = this.portfolioLotIsIncomplete as ((r: typeof row) => boolean) | undefined;
      const incomplete = typeof isIncomplete === "function" ? isIncomplete.call(this, row) : false;
      if (incomplete && typeof row?.forecastProfitAverage === "number") {
        return row.forecastProfitAverage >= 0 ? "success" : "error";
      }
      if ((row?.salesCount ?? 0) > 0) {
        return Number(row?.realizedProfit ?? 0) >= 0 ? "success" : "error";
      }
      return Number(row?.totalProfit ?? 0) >= 0 ? "success" : "secondary";
    },

    portfolioAtRiskLotCount(this: Record<string, unknown>): number {
      const rows = Array.isArray(this.allLotPerformance)
        ? this.allLotPerformance as Array<{ totalProfit?: number }>
        : [];
      return rows.filter((row) => Number(row?.totalProfit ?? 0) < 0).length;
    },

    portfolioLotPerformanceUnderAmount(this: Record<string, unknown>): string {
      const rows = Array.isArray(this.allLotPerformance)
        ? this.allLotPerformance as Array<{ totalProfit?: number }>
        : [];
      const underAmount = rows.reduce((sum, row) => {
        const totalProfit = Number(row?.totalProfit ?? 0);
        return totalProfit < 0 ? sum + Math.abs(totalProfit) : sum;
      }, 0);
      const format = this.fmtCurrency as ((value: number | null | undefined, decimals?: number) => string) | undefined;
      return typeof format === "function"
        ? format.call(this, underAmount, 0)
        : String(Math.round(underAmount));
    },

    portfolioLotPerformanceOverAmount(this: Record<string, unknown>): string {
      const rows = Array.isArray(this.allLotPerformance)
        ? this.allLotPerformance as Array<{ totalProfit?: number }>
        : [];
      const overAmount = rows.reduce((sum, row) => {
        const totalProfit = Number(row?.totalProfit ?? 0);
        return totalProfit > 0 ? sum + totalProfit : sum;
      }, 0);
      const format = this.fmtCurrency as ((value: number | null | undefined, decimals?: number) => string) | undefined;
      return typeof format === "function"
        ? format.call(this, overAmount, 0)
        : String(Math.round(overAmount));
    },

    portfolioLotPerformanceKpiColor(this: Record<string, unknown>): "success" | "error" {
      const getAtRiskCount = this.portfolioAtRiskLotCount as (() => number) | undefined;
      const atRiskCount = typeof getAtRiskCount === "function" ? getAtRiskCount.call(this) : 0;
      return atRiskCount > 0 ? "error" : "success";
    },

    nextPortfolioChartView(this: Record<string, unknown>): "breakdown" | "trend" | "sellthrough" | "margin" {
      const current = String(this.portfolioChartView || "trend");
      if (current === "breakdown") return "trend";
      if (current === "trend") return "sellthrough";
      if (current === "sellthrough") return "margin";
      return "breakdown";
    },

    portfolioChartToggleTitle(this: Record<string, unknown>): string {
      const nextView = this.nextPortfolioChartView as (() => "breakdown" | "trend" | "sellthrough" | "margin") | undefined;
      const next = typeof nextView === "function" ? nextView.call(this) : "trend";
      if (next === "breakdown") return "Switch to breakdown view";
      if (next === "trend") return "Switch to trend view";
      if (next === "margin") return "Switch to sold profit margin view";
      return "Switch to sell-through view";
    },

    portfolioChartToggleIcon(this: Record<string, unknown>): string {
      const nextView = this.nextPortfolioChartView as (() => "breakdown" | "trend" | "sellthrough" | "margin") | undefined;
      const next = typeof nextView === "function" ? nextView.call(this) : "trend";
      if (next === "breakdown") return "mdi-chart-donut";
      if (next === "trend") return "mdi-chart-line";
      if (next === "margin") return "mdi-percent-outline";
      return "mdi-chart-bar";
    },

    portfolioChartSubtitle(this: Record<string, unknown>): string {
      const current = String(this.portfolioChartView || "trend");
      if (current === "breakdown") return "Revenue by lot";
      if (current === "sellthrough") return "Sell-through over time (%)";
      if (current === "margin") return "Sold profit margin by lot (%)";
      return "Cumulative portfolio profit trend";
    },

    portfolioChartAriaLabel(this: Record<string, unknown>): string {
      const current = String(this.portfolioChartView || "trend");
      if (current === "breakdown") {
        return "Portfolio revenue breakdown chart by lot.";
      }
      if (current === "sellthrough") {
        return "Portfolio sell-through percentage over time chart.";
      }
      if (current === "margin") {
        return "Portfolio sold profit margin percentage chart by lot.";
      }
      return "Portfolio cumulative profit trend chart.";
    },

    fmtCurrency(value: number | null | undefined, decimals = 2): string {
      const fn = (this as Record<string, unknown>).formatCurrency;
      if (typeof fn === "function") {
        return (fn as (v: number | null | undefined, d?: number) => string)(value, decimals);
      }
      if (value == null || Number.isNaN(Number(value))) return "0.00";
      return Number(value).toFixed(decimals);
    }
  },
  setup(props: { ctx: Record<string, unknown> }) {
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (injectedCtx ?? props.ctx) as Record<string, unknown>;
    return createWindowContextBridge(source);
  },
  template
};

