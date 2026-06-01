import { inject, type PropType } from "vue";
import { createWindowContextBridge } from "../shared/contextBridge.ts";
import { filterLotOptionItems } from "../../../app-core/shared/lot-option-items.ts";
import {
  resolveVuetifySlotString,
  resolveVuetifySlotValue
} from "../../../app-core/shared/vuetify-slot-items.ts";
import {
  buildPortfolioPulseInsights,
  buildPortfolioSalesByUserLegendItems,
  getNextPortfolioChartView,
  getPortfolioChartAriaLabel,
  getPortfolioChartSubtitle,
  getPortfolioChartToggleIcon,
  getPortfolioChartToggleTitle,
  getPortfolioSalesByUserAriaLabel,
  getPortfolioSalesByUserBestWeek,
  getPortfolioSalesByUserLeader,
  getPortfolioSalesByUserMetricLabel,
  getPortfolioSalesByUserSubtitle,
  getPortfolioSalesByUserTotalValue,
  getPortfolioSalesByUserWeekTotals,
  type PortfolioPulseInsight
} from "./portfolio-window-helpers.ts";
import type {
  PortfolioPulseDisplayInsight,
  PortfolioPulseStat,
  PortfolioPulseTone
} from "./PortfolioPulsePanel.ts";

type PortfolioLotFilterDisplayItem = {
  title: string;
  value: number | null;
  subtitle: string;
  lotType: "bulk" | "singles";
  symbolIcon: string;
  completionIcon: string | null;
  groupLabel: string | null;
};

type PortfolioDashboardPresetDisplayItem = {
  title: string;
  value: string;
  subtitle: string;
  icon: string;
};

function toDisplayNumber(value: unknown): number | null {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function toDisplayString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function resolvePortfolioLotFilterDisplayItem(item: unknown): PortfolioLotFilterDisplayItem {
  const lotType = resolveVuetifySlotString(item, ["lotType"]) === "singles" ? "singles" : "bulk";
  return {
    title: resolveVuetifySlotString(item, ["title"]),
    value: toDisplayNumber(resolveVuetifySlotValue(item, ["value"])),
    subtitle: resolveVuetifySlotString(item, ["subtitle"]),
    lotType,
    symbolIcon: resolveVuetifySlotString(item, ["symbolIcon"]) || (lotType === "singles" ? "mdi-cards-outline" : "mdi-cube-outline"),
    completionIcon: resolveVuetifySlotString(item, ["completionIcon"]) === "mdi-check-circle" ? "mdi-check-circle" : null,
    groupLabel: resolveVuetifySlotString(item, ["groupLabel"]) || null
  };
}

function resolvePortfolioDashboardPresetDisplayItem(item: unknown): PortfolioDashboardPresetDisplayItem {
  return {
    title: resolveVuetifySlotString(item, ["title"]),
    value: toDisplayString(resolveVuetifySlotValue(item, ["value"])),
    subtitle: resolveVuetifySlotString(item, ["subtitle"]),
    icon: resolveVuetifySlotString(item, ["icon"]) || "mdi-view-dashboard-outline"
  };
}

export const PortfolioWindowDefinition = {
  name: "PortfolioWindow",
  props: {
    ctx: {
      type: Object as PropType<Record<string, unknown>>,
      required: true
    }
  },
  data() {
    return {
      portfolioLotFilterSearchQuery: "",
      portfolioLotFilterMenuOpen: false
    };
  },
  methods: {
    portfolioVisibleLotFilterIds(this: Record<string, unknown>): number[] {
      const selected = Array.isArray(this.portfolioLotFilterIds) ? this.portfolioLotFilterIds : [];
      const items = Array.isArray(this.portfolioLotFilterItems)
        ? this.portfolioLotFilterItems as Array<{ value?: number }>
        : [];
      const visibleIds = new Set(
        items.map((item) => Number(item?.value)).filter((value) => Number.isFinite(value))
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
          isComplete: boolean;
          symbolIcon: string;
          completionIcon: string | null;
          groupLabel?: string | null;
        }>
        : [];
      return filterLotOptionItems(items, String(this.portfolioLotFilterSearchQuery || ""));
    },

    portfolioLotFilterItemSelected(this: Record<string, unknown>, value: number | null): boolean {
      if (value == null) return false;
      const selected = Array.isArray(this.portfolioLotFilterIds) ? this.portfolioLotFilterIds : [];
      return selected.some((id) => Number(id) === Number(value));
    },

    portfolioDashboardPresetItems(this: Record<string, unknown>): PortfolioDashboardPresetDisplayItem[] {
      const copy = this.portfolioCopy as ((key: string, fallback: string) => string) | undefined;
      const getCopy = (key: string, fallback: string) => (
        typeof copy === "function" ? copy.call(this, key, fallback) : fallback
      );
      return [
        {
          value: "all",
          icon: "mdi-view-dashboard-outline",
          title: getCopy("portfolioDashboardPresetAllLabel", "All lots"),
          subtitle: getCopy("portfolioDashboardPresetAllDescription", "Every lot in the selected type.")
        },
        {
          value: "active",
          icon: "mdi-trending-up",
          title: getCopy("portfolioDashboardPresetActiveLabel", "Active sellers"),
          subtitle: getCopy("portfolioDashboardPresetActiveDescription", "Lots with sales and inventory left.")
        },
        {
          value: "needs_first_sale",
          icon: "mdi-sparkles",
          title: getCopy("portfolioDashboardPresetNeedsFirstSaleLabel", "Needs first sale"),
          subtitle: getCopy("portfolioDashboardPresetNeedsFirstSaleDescription", "Available lots that have not moved yet.")
        },
        {
          value: "at_risk",
          icon: "mdi-alert-circle-outline",
          title: getCopy("portfolioDashboardPresetAtRiskLabel", "At risk"),
          subtitle: getCopy("portfolioDashboardPresetAtRiskDescription", "Selling lots that are still below break-even.")
        },
        {
          value: "profit_winners",
          icon: "mdi-trophy-outline",
          title: getCopy("portfolioDashboardPresetProfitWinnersLabel", "Profit winners"),
          subtitle: getCopy("portfolioDashboardPresetProfitWinnersDescription", "Lots with sales and positive profit.")
        },
        {
          value: "finished",
          icon: "mdi-check-circle-outline",
          title: getCopy("portfolioDashboardPresetFinishedLabel", "Finished lots"),
          subtitle: getCopy("portfolioDashboardPresetFinishedDescription", "Sold-out lots ready for review.")
        }
      ];
    },

    resolvePortfolioDashboardPresetItem(this: Record<string, unknown>, item: unknown): PortfolioDashboardPresetDisplayItem {
      return resolvePortfolioDashboardPresetDisplayItem(item);
    },

    portfolioSignedCurrency(this: Record<string, unknown>, value: number | null | undefined, includePositiveSign = true): string {
      const numericValue = Number(value ?? 0);
      const normalized = Number.isFinite(numericValue) ? numericValue : 0;
      const sign = normalized < 0 ? "-" : includePositiveSign && normalized > 0 ? "+" : "";
      const format = this.fmtCurrency as ((value: number | null | undefined, decimals?: number) => string) | undefined;
      const formatted = typeof format === "function"
        ? format.call(this, Math.abs(normalized))
        : Math.abs(normalized).toFixed(2);
      return `${sign}$${formatted}`;
    },

    portfolioPulseProfitTone(this: Record<string, unknown>): PortfolioPulseTone {
      const totals = this.portfolioTotals as { totalProfit?: number } | undefined;
      const profit = Number(totals?.totalProfit ?? 0);
      if (profit > 0) return "positive";
      if (profit < 0) return "negative";
      return "neutral";
    },

    portfolioPulseScopeLabel(this: Record<string, unknown>): string {
      const getVisibleSelected = this.portfolioVisibleLotFilterIds as (() => number[]) | undefined;
      const selected = typeof getVisibleSelected === "function" ? getVisibleSelected.call(this) : [];
      const copy = this.portfolioCopy as ((key: string, fallback: string) => string) | undefined;
      const getCopy = (key: string, fallback: string): string => (
        typeof copy === "function" ? copy.call(this, key, fallback) : fallback
      );

      if (selected.length > 0) {
        const primaryLabel = this.portfolioLotFilterPrimaryLabel as (() => string) | undefined;
        const label = typeof primaryLabel === "function" ? primaryLabel.call(this) : getCopy("portfolioPulseSelectedLotsLabel", "Selected lots");
        const remaining = Math.max(0, selected.length - 1);
        return remaining > 0 ? `${label} +${remaining}` : label;
      }

      const preset = String(this.portfolioDashboardPreset || "all");
      if (preset !== "all") {
        const items = this.portfolioDashboardPresetItems as (() => PortfolioDashboardPresetDisplayItem[]) | undefined;
        const item = typeof items === "function" ? items.call(this).find((candidate) => candidate.value === preset) : null;
        return item?.title || getCopy("portfolioDashboardPresetAllLabel", "All lots");
      }

      const defaultLabel = this.portfolioLotFilterDefaultLabel as (() => string) | undefined;
      return typeof defaultLabel === "function" ? defaultLabel.call(this) : getCopy("portfolioLotFilterAllLabel", "All lots");
    },

    portfolioPulseProfitableSummary(this: Record<string, unknown>): string {
      const totals = this.portfolioTotals as { profitableLotCount?: number; lotCount?: number } | undefined;
      const profitable = Number(totals?.profitableLotCount ?? 0);
      const lotCount = Number(totals?.lotCount ?? 0);
      const copy = this.portfolioCopy as ((key: string, fallback: string) => string) | undefined;
      const lotLabel = typeof copy === "function" ? copy.call(this, "portfolioLotCountLabel", "lot") : "lot";
      const profitableLabel = typeof copy === "function" ? copy.call(this, "portfolioKpiProfitableLabel", "profitable") : "profitable";
      return `${profitable} / ${lotCount} ${lotLabel}${lotCount === 1 ? "" : "s"} ${profitableLabel}`;
    },

    portfolioPulseStats(this: Record<string, unknown>): PortfolioPulseStat[] {
      const totals = this.portfolioTotals as {
        totalRevenue?: number;
        totalCost?: number;
        totalSalesCount?: number;
      } | undefined;
      const forecast = this.averagePortfolioForecastScenario as {
        forecastProfit?: number;
        forecastRevenue?: number;
        label?: string;
        modeCount?: number;
      } | null | undefined;
      const copy = this.portfolioCopy as ((key: string, fallback: string) => string) | undefined;
      const getCopy = (key: string, fallback: string): string => (
        typeof copy === "function" ? copy.call(this, key, fallback) : fallback
      );
      const signedCurrency = this.portfolioSignedCurrency as ((value: number | null | undefined, includePositiveSign?: boolean) => string) | undefined;
      const formatSigned = (value: number, includePositiveSign = true): string => (
        typeof signedCurrency === "function" ? signedCurrency.call(this, value, includePositiveSign) : `${value >= 0 ? "+" : "-"}$${Math.abs(value).toFixed(2)}`
      );
      const salesCount = Number(totals?.totalSalesCount ?? 0);
      const salesLabel = getCopy("portfolioSalesCountLabel", "sale");
      const forecastProfit = Number(forecast?.forecastProfit ?? 0);
      const forecastContext = getCopy("portfolioPulseProjectedForecastMeta", "If remaining inventory sells at forecast");

      return [
        {
          key: "revenue",
          label: getCopy("portfolioKpiTotalRevenueLabel", "Total revenue"),
          value: formatSigned(Number(totals?.totalRevenue ?? 0), false),
          meta: `${salesCount} ${salesLabel}${salesCount === 1 ? "" : "s"}`,
          icon: "mdi-cash-multiple",
          tone: "neutral"
        },
        {
          key: "cost",
          label: getCopy("portfolioKpiTotalCostLabel", "Total cost"),
          value: formatSigned(Number(totals?.totalCost ?? 0), false),
          meta: getCopy("portfolioPulseCurrentViewMeta", "Current view"),
          icon: "mdi-receipt-text-outline",
          tone: "neutral"
        },
        {
          key: "projected",
          label: getCopy("portfolioKpiProjectedProfitLabel", "Projected profit"),
          value: forecast ? formatSigned(forecastProfit) : "--",
          meta: forecast
            ? `${forecastContext} - ${getCopy("portfolioKpiAverageRevenueLabel", "Average revenue")} ${formatSigned(Number(forecast.forecastRevenue ?? 0), false)}`
            : getCopy("portfolioPulseNoForecastMeta", "No forecast yet"),
          icon: "mdi-crystal-ball",
          tone: forecastProfit > 0 ? "positive" : forecastProfit < 0 ? "negative" : "neutral"
        }
      ];
    },

    portfolioPulseInsights(this: Record<string, unknown>): PortfolioPulseDisplayInsight[] {
      const rows = Array.isArray(this.allLotPerformance)
        ? this.allLotPerformance as Array<{
          lotId: number;
          lotName: string;
          salesCount: number;
          realizedProfit?: number;
          totalProfit: number;
          soldPacks: number;
          totalPacks: number;
        }>
        : [];
      const copy = this.portfolioCopy as ((key: string, fallback: string) => string) | undefined;
      const getCopy = (key: string, fallback: string): string => (
        typeof copy === "function" ? copy.call(this, key, fallback) : fallback
      );
      const signedCurrency = this.portfolioSignedCurrency as ((value: number | null | undefined, includePositiveSign?: boolean) => string) | undefined;
      const formatSigned = (value: number, includePositiveSign = true): string => (
        typeof signedCurrency === "function" ? signedCurrency.call(this, value, includePositiveSign) : `${value >= 0 ? "+" : "-"}$${Math.abs(value).toFixed(2)}`
      );
      const insights = buildPortfolioPulseInsights(rows);

      if (insights.length === 0) {
        return [
          {
            key: "empty",
            label: getCopy("portfolioPulseNextMoveLabel", "Next move"),
            title: getCopy("portfolioPulseEmptyInsightTitle", "Record sales to unlock insights"),
            meta: getCopy("portfolioPulseEmptyInsightMeta", "Profit signals appear here after sales."),
            icon: "mdi-lightbulb-outline",
            tone: "neutral"
          }
        ];
      }

      const toDisplayInsight = (insight: PortfolioPulseInsight): PortfolioPulseDisplayInsight => {
        if (insight.kind === "risk") {
          return {
            key: `${insight.kind}-${insight.lotId}`,
            label: getCopy("portfolioPulseBreakEvenGapLabel", "Break-even gap"),
            title: `${getCopy("portfolioPulseRiskActionVerb", "Recover")} ${insight.lotName}`,
            meta: `${formatSigned(insight.amount ?? 0, false)} ${getCopy("portfolioPulseBreakEvenMeta", "to break even")}`,
            icon: insight.icon,
            tone: insight.tone
          };
        }

        if (insight.kind === "winner") {
          return {
            key: `${insight.kind}-${insight.lotId}`,
            label: getCopy("portfolioPulseKeepWorkingLabel", "Keep working"),
            title: `${getCopy("portfolioPulseWinnerActionVerb", "Protect")} ${insight.lotName}`,
            meta: `${formatSigned(insight.amount ?? 0)} ${getCopy("portfolioPulseProfitMeta", "profit")}`,
            icon: insight.icon,
            tone: insight.tone
          };
        }

        const nextActionVerb = insight.amount != null
          ? getCopy("portfolioPulseNextActionFixVerb", "Fix")
          : getCopy("portfolioPulseNextActionReviewVerb", "Review");
        return {
          key: `${insight.kind}-${insight.lotId}`,
          label: getCopy("portfolioPulseNextActionLabel", "Next action"),
          title: `${nextActionVerb} ${insight.lotName}`,
          meta: insight.amount != null
            ? `${formatSigned(insight.amount, false)} ${getCopy("portfolioPulseStillAtRiskMeta", "still at risk")}`
            : getCopy("portfolioPulseNeedsAttentionMeta", "Needs attention"),
          icon: insight.icon,
          tone: insight.tone
        };
      };

      return insights.map(toDisplayInsight);
    },

    resolvePortfolioLotFilterItem(this: Record<string, unknown>, item: unknown): PortfolioLotFilterDisplayItem {
      return resolvePortfolioLotFilterDisplayItem(item);
    },

    handlePortfolioLotFilterMenuUpdate(this: Record<string, unknown>, isOpen: boolean): void {
      this.portfolioLotFilterMenuOpen = isOpen;
      if (isOpen) {
        this.portfolioLotFilterSearchQuery = "";
      }
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

    portfolioLotFilterPrimaryItem(this: Record<string, unknown>) {
      const getVisibleSelected = this.portfolioVisibleLotFilterIds as (() => number[]) | undefined;
      const selected = typeof getVisibleSelected === "function" ? getVisibleSelected.call(this) : [];
      const items = Array.isArray(this.portfolioLotFilterItems)
        ? this.portfolioLotFilterItems as Array<{
          title?: string;
          value?: number;
          isComplete?: boolean;
          symbolIcon?: string;
          completionIcon?: string | null;
        }>
        : [];

      if (selected.length === 0) return null;
      return items.find((item) => Number(item?.value) === Number(selected[0])) ?? null;
    },

    portfolioLotFilterDefaultLabel(this: Record<string, unknown>): string {
      const filter = String(this.portfolioLotTypeFilter || "both");
      const translate = this.portfolioCopy as ((key: string, fallback: string) => string) | undefined;
      if (filter === "bulk") return typeof translate === "function" ? translate.call(this, "portfolioLotFilterBulkLabel", "All bulk lots") : "All bulk lots";
      if (filter === "singles") return typeof translate === "function" ? translate.call(this, "portfolioLotFilterSinglesLabel", "All singles lots") : "All singles lots";
      return typeof translate === "function" ? translate.call(this, "portfolioLotFilterAllLabel", "All lots") : "All lots";
    },

    portfolioLotFilterPrimaryLabel(this: Record<string, unknown>): string {
      const getVisibleSelected = this.portfolioVisibleLotFilterIds as (() => number[]) | undefined;
      const selected = typeof getVisibleSelected === "function" ? getVisibleSelected.call(this) : [];
      const items = Array.isArray(this.portfolioLotFilterItems)
        ? this.portfolioLotFilterItems as Array<{ title?: string; value?: number }>
        : [];

      if (selected.length === 0) {
        const getDefaultLabel = this.portfolioLotFilterDefaultLabel as (() => string) | undefined;
        return typeof getDefaultLabel === "function" ? getDefaultLabel.call(this) : "All lots";
      }

      const first = items.find((item) => Number(item?.value) === Number(selected[0]));
      return typeof first?.title === "string" && first.title.trim().length > 0 ? first.title : "Selected lots";
    },

    portfolioLotFilterRemainingCount(this: Record<string, unknown>): number {
      const getVisibleSelected = this.portfolioVisibleLotFilterIds as (() => number[]) | undefined;
      const selected = typeof getVisibleSelected === "function" ? getVisibleSelected.call(this) : [];
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
      const copy = this.portfolioCopy as ((key: string, fallback: string) => string) | undefined;
      const getCopy = (key: string, fallback: string): string => (
        typeof copy === "function" ? copy.call(this, key, fallback) : fallback
      );

      if (incomplete && typeof row?.forecastProfitAverage === "number") {
        const value = row.forecastProfitAverage;
        const formatted = typeof format === "function" ? format.call(this, Math.abs(value)) : String(Math.abs(value));
        return `${getCopy("portfolioLotProjectedLabel", "Projected")} ${value >= 0 ? "+" : "-"}$${formatted}`;
      }

      if ((row?.salesCount ?? 0) > 0) {
        const value = Number(row?.realizedProfit ?? 0);
        const formatted = typeof format === "function" ? format.call(this, Math.abs(value)) : String(Math.abs(value));
        const label = value >= 0 ? getCopy("portfolioLotProfitLabel", "Profit") : getCopy("portfolioLotLossLabel", "Loss");
        return `${label} ${value >= 0 ? "+" : "-"}$${formatted}`;
      }

      const value = Number(row?.totalProfit ?? 0);
      const formatted = typeof format === "function" ? format.call(this, Math.abs(value)) : String(Math.abs(value));
      return `${getCopy("portfolioLotNetLabel", "Net")} ${value >= 0 ? "+" : "-"}$${formatted}`;
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
      return typeof format === "function" ? format.call(this, underAmount, 0) : String(Math.round(underAmount));
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
      return typeof format === "function" ? format.call(this, overAmount, 0) : String(Math.round(overAmount));
    },

    portfolioLotPerformanceKpiColor(this: Record<string, unknown>): "success" | "error" {
      const getAtRiskCount = this.portfolioAtRiskLotCount as (() => number) | undefined;
      const atRiskCount = typeof getAtRiskCount === "function" ? getAtRiskCount.call(this) : 0;
      return atRiskCount > 0 ? "error" : "success";
    },

    nextPortfolioChartView(this: Record<string, unknown>): "breakdown" | "trend" | "sellthrough" | "margin" {
      return getNextPortfolioChartView(this.portfolioChartView);
    },

    portfolioChartToggleTitle(this: Record<string, unknown>): string {
      const nextView = this.nextPortfolioChartView as (() => "breakdown" | "trend" | "sellthrough" | "margin") | undefined;
      const next = typeof nextView === "function" ? nextView.call(this) : "trend";
      return getPortfolioChartToggleTitle(next, this.portfolioCopy as ((key: string, fallback: string) => string) | undefined);
    },

    portfolioChartToggleIcon(this: Record<string, unknown>): string {
      const nextView = this.nextPortfolioChartView as (() => "breakdown" | "trend" | "sellthrough" | "margin") | undefined;
      const next = typeof nextView === "function" ? nextView.call(this) : "trend";
      return getPortfolioChartToggleIcon(next);
    },

    portfolioChartSubtitle(this: Record<string, unknown>): string {
      return getPortfolioChartSubtitle(
        this.portfolioChartView,
        this.portfolioCopy as ((key: string, fallback: string) => string) | undefined
      );
    },

    portfolioChartAriaLabel(this: Record<string, unknown>): string {
      return getPortfolioChartAriaLabel(
        this.portfolioChartView,
        this.portfolioCopy as ((key: string, fallback: string) => string) | undefined
      );
    },

    portfolioSalesByUserMetricLabel(this: Record<string, unknown>): string {
      return getPortfolioSalesByUserMetricLabel(
        this.portfolioSalesByUserMetric,
        this.portfolioCopy as ((key: string, fallback: string) => string) | undefined
      );
    },

    portfolioSalesByUserTotalValue(this: Record<string, unknown>): number {
      const series = Array.isArray((this as { portfolioSalesByUserChartData?: { series?: Array<{ total?: number }> } }).portfolioSalesByUserChartData?.series)
        ? (this as { portfolioSalesByUserChartData: { series: Array<{ total?: number }> } }).portfolioSalesByUserChartData.series
        : [];
      return getPortfolioSalesByUserTotalValue(series);
    },

    portfolioSalesByUserLeader(this: Record<string, unknown>) {
      const series = Array.isArray((this as { portfolioSalesByUserChartData?: { series?: Array<{ key: string; label: string; color: string; total: number }> } }).portfolioSalesByUserChartData?.series)
        ? (this as { portfolioSalesByUserChartData: { series: Array<{ key: string; label: string; color: string; total: number }> } }).portfolioSalesByUserChartData.series
        : [];
      return getPortfolioSalesByUserLeader(series);
    },

    portfolioSalesByUserBestWeek(this: Record<string, unknown>) {
      const chartData = (this as {
        portfolioSalesByUserChartData?: {
          weeks?: Array<{ label: string }>;
          series?: Array<{ values: number[] }>;
        };
      }).portfolioSalesByUserChartData;
      const weeks = Array.isArray(chartData?.weeks) ? chartData!.weeks : [];
      const series = Array.isArray(chartData?.series) ? chartData!.series : [];
      return getPortfolioSalesByUserBestWeek(weeks, series);
    },

    portfolioSalesByUserLegendItems(this: Record<string, unknown>) {
      const state = this as {
        portfolioSalesByUserChartData?: {
          series?: Array<{ key: string; label: string; color: string; total: number }>;
        };
        workspaceMembers?: Array<{ userId: string; displayName?: string; photoUrl?: string }>;
        getWorkspaceMemberPresenceState?: (member: { userId: string }) => string;
        googleProfilePicture?: string;
        googleAvatarLoadFailed?: boolean;
      };
      const chartData = state.portfolioSalesByUserChartData;
      const series = Array.isArray(chartData?.series) ? chartData.series : [];
      const workspaceMembers = Array.isArray(state.workspaceMembers) ? state.workspaceMembers : [];
      const getPresence = typeof state.getWorkspaceMemberPresenceState === "function"
        ? state.getWorkspaceMemberPresenceState
        : null;
      const currentUserPhotoUrl = !state.googleAvatarLoadFailed && typeof state.googleProfilePicture === "string"
        ? state.googleProfilePicture.trim()
        : "";
      return buildPortfolioSalesByUserLegendItems({
        series,
        workspaceMembers,
        getPresence,
        currentUserPhotoUrl
      });
    },

    portfolioSalesByUserWeekTotals(this: Record<string, unknown>) {
      const chartData = (this as {
        portfolioSalesByUserChartData?: {
          weeks?: Array<{ label: string }>;
          series?: Array<{ values: number[] }>;
        };
      }).portfolioSalesByUserChartData;
      const weeks = Array.isArray(chartData?.weeks) ? chartData!.weeks : [];
      const series = Array.isArray(chartData?.series) ? chartData!.series : [];
      return getPortfolioSalesByUserWeekTotals(weeks, series);
    },

    portfolioSalesByUserSubtitle(): string {
      return getPortfolioSalesByUserSubtitle(this.portfolioCopy as ((key: string, fallback: string) => string) | undefined);
    },

    portfolioSalesByUserAriaLabel(this: Record<string, unknown>): string {
      return getPortfolioSalesByUserAriaLabel(
        this.portfolioSalesByUserMetric,
        this.portfolioCopy as ((key: string, fallback: string) => string) | undefined
      );
    },

    portfolioCopy(this: Record<string, unknown>, key: string, fallback: string): string {
      const translate = this.t as ((translationKey: string) => string) | undefined;
      if (typeof translate === "function") {
        const value = translate.call(this, key);
        if (typeof value === "string" && value.trim().length > 0) {
          return value;
        }
      }
      return fallback;
    },

    fmtCurrency(value: number | null | undefined, decimals = 2): string {
      const fn = (this as Record<string, unknown>).formatCurrency;
      if (typeof fn === "function") {
        return (fn as (v: number | null | undefined, d?: number) => string)(value, decimals);
      }
      return new Intl.NumberFormat(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }).format(value == null || Number.isNaN(Number(value)) ? 0 : Number(value));
    }
  },
  setup(props: { ctx: Record<string, unknown> }) {
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (injectedCtx ?? props.ctx) as Record<string, unknown>;
    return createWindowContextBridge(source);
  }
};

export const portfolioWindowDefinition = PortfolioWindowDefinition;
