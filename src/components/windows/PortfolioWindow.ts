import template from "./PortfolioWindow.html?raw";
import "./PortfolioWindow.css";
import { inject, type PropType } from "vue";
import { createWindowContextBridge } from "./contextBridge.ts";
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
      mobileKpiIndex: 0
    };
  },
  methods: {
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
      const selected = Array.isArray(this.portfolioLotFilterIds)
        ? this.portfolioLotFilterIds
        : [];
      const items = Array.isArray(this.portfolioLotFilterItems)
        ? this.portfolioLotFilterItems as Array<{ title?: string; value?: number }>
        : [];

      if (selected.length === 0) {
        return "All lots";
      }

      const first = items.find((item) => Number(item?.value) === Number(selected[0]));
      return typeof first?.title === "string" && first.title.trim().length > 0
        ? first.title
        : "Selected lots";
    },

    portfolioLotFilterRemainingCount(this: Record<string, unknown>): number {
      const selected = Array.isArray(this.portfolioLotFilterIds)
        ? this.portfolioLotFilterIds
        : [];
      return Math.max(0, selected.length - 1);
    },

    nextPortfolioChartView(this: Record<string, unknown>): "breakdown" | "trend" | "sellthrough" {
      const current = String(this.portfolioChartView || "trend");
      if (current === "breakdown") return "trend";
      if (current === "trend") return "sellthrough";
      return "breakdown";
    },

    portfolioChartToggleTitle(this: Record<string, unknown>): string {
      const nextView = this.nextPortfolioChartView as (() => "breakdown" | "trend" | "sellthrough") | undefined;
      const next = typeof nextView === "function" ? nextView.call(this) : "trend";
      if (next === "breakdown") return "Switch to breakdown view";
      if (next === "trend") return "Switch to trend view";
      return "Switch to sell-through view";
    },

    portfolioChartToggleIcon(this: Record<string, unknown>): string {
      const nextView = this.nextPortfolioChartView as (() => "breakdown" | "trend" | "sellthrough") | undefined;
      const next = typeof nextView === "function" ? nextView.call(this) : "trend";
      if (next === "breakdown") return "mdi-chart-donut";
      if (next === "trend") return "mdi-chart-line";
      return "mdi-chart-bar";
    },

    portfolioChartSubtitle(this: Record<string, unknown>): string {
      const current = String(this.portfolioChartView || "trend");
      if (current === "breakdown") return "Revenue by lot";
      if (current === "sellthrough") return "Sell-through over time (%)";
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
