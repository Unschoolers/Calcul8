import { inject, type PropType } from "vue";
import {
  buildBuyerQuickViewSummary,
  type BuyerQuickViewSummary
} from "../../../app-core/computed/buyer-quick-view.ts";
import {
  buildCustomerPerformanceRows,
  buildCustomerPerformanceSummary,
  type CustomerPerformanceRow,
  type CustomerPerformanceSummary
} from "../../../app-core/computed/customer-performance.ts";
import {
  getPortfolioCustomerPerformanceSortOptions,
  getPortfolioLotPrimaryProfit,
  getPortfolioLotPerformanceSortOptions,
  getPortfolioPerformanceSortButtonClass,
  getPortfolioPerformanceSortIcon,
  normalizePortfolioSortDirection,
  sortCustomerPerformanceRows,
  sortPortfolioLotPerformanceRows,
  type PortfolioCustomerPerformanceSortKey,
  type PortfolioLotPerformanceSortKey,
  type PortfolioSortDirection,
  type PortfolioSortOption
} from "../../../app-core/computed/portfolio-performance.ts";
import { createWindowContextBridge } from "../shared/contextBridge.ts";
import { filterLotOptionItems } from "../../../app-core/shared/lot-option-items.ts";
import {
  resolveVuetifySlotString,
  resolveVuetifySlotValue
} from "../../../app-core/shared/vuetify-slot-items.ts";
import {
  buildPortfolioPulseInsights,
  buildPortfolioSalesByUserLegendItems,
  getPortfolioCopy,
  getNextPortfolioChartView,
  getPortfolioChartAriaLabel,
  getPortfolioChartSubtitle,
  getPortfolioChartToggleIcon,
  getPortfolioChartToggleTitle,
  getPortfolioSalesByUserChartSeries,
  getPortfolioSalesByUserChartWeeks,
  getPortfolioSalesByUserAriaLabel,
  getPortfolioSalesByUserBestWeek,
  getPortfolioSalesByUserLeader,
  getPortfolioSalesByUserMetricLabel,
  getPortfolioSalesByUserSubtitle,
  getPortfolioSalesByUserTotalValue,
  getPortfolioSalesByUserWeekTotals,
  type PortfolioPulseInsight
} from "./portfolio-window-helpers.ts";
import type { PortfolioPerformanceGridColumn } from "./PortfolioPerformanceGrid.ts";
import type { PortfolioPerformanceSheetModel } from "./PortfolioPerformanceSheet.ts";
import type {
  PortfolioPulseDisplayInsight,
  PortfolioPulsePanelModel,
  PortfolioPulseStat,
  PortfolioPulseTone
} from "./PortfolioPulsePanel.ts";
import type { Lot, PortfolioSalesByUserDrilldownRow, Sale } from "../../../types/app.ts";

type PortfolioPerformanceView = "lots" | "customers";

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
      portfolioLotFilterMenuOpen: false,
      portfolioSalesByUserDrilldownDialog: false,
      portfolioSalesByUserDrilldownWeekKey: "",
      portfolioPerformanceView: "lots" as PortfolioPerformanceView,
      portfolioLotPerformanceSortKey: "source" as PortfolioLotPerformanceSortKey,
      portfolioLotPerformanceSortDirection: "asc" as PortfolioSortDirection,
      portfolioCustomerPerformanceSortKey: "spent" as PortfolioCustomerPerformanceSortKey,
      portfolioCustomerPerformanceSortDirection: "desc" as PortfolioSortDirection,
      buyerQuickViewOpen: false,
      buyerQuickViewName: ""
    };
  },
  methods: {
    portfolioPerformanceLots(this: Record<string, unknown>): Lot[] {
      const lots = Array.isArray(this.lots) ? this.lots as Lot[] : [];
      const performanceRows = Array.isArray(this.allLotPerformance)
        ? this.allLotPerformance as Array<{ lotId?: number }>
        : [];
      const visibleIds = new Set(
        performanceRows.map((row) => Number(row?.lotId)).filter((lotId) => Number.isFinite(lotId))
      );
      if (visibleIds.size === 0) return lots;
      return lots.filter((lot) => visibleIds.has(Number(lot.id)));
    },

    portfolioPerformanceSalesByLotId(this: Record<string, unknown>): Map<number, Sale[]> {
      const source = this.salesByLotId instanceof Map ? this.salesByLotId as Map<number, Sale[]> : new Map<number, Sale[]>();
      const visibleLots = this.portfolioPerformanceLots as (() => Lot[]) | undefined;
      const lots = typeof visibleLots === "function" ? visibleLots.call(this) : [];
      if (lots.length === 0) return source;
      return new Map(lots.map((lot) => {
        const lotId = Number(lot.id);
        return [lotId, source.get(lotId) ?? []] as [number, Sale[]];
      }));
    },

    customerPerformanceRows(this: Record<string, unknown>): CustomerPerformanceRow[] {
      const visibleLots = this.portfolioPerformanceLots as (() => Lot[]) | undefined;
      const salesMap = this.portfolioPerformanceSalesByLotId as (() => Map<number, Sale[]>) | undefined;
      return buildCustomerPerformanceRows({
        lots: typeof visibleLots === "function" ? visibleLots.call(this) : [],
        salesByLotId: typeof salesMap === "function" ? salesMap.call(this) : new Map<number, Sale[]>()
      });
    },

    sortedCustomerPerformanceRows(this: Record<string, unknown>): CustomerPerformanceRow[] {
      const rows = (this.customerPerformanceRows as (() => CustomerPerformanceRow[]) | undefined)?.call(this) ?? [];
      const key = String(this.portfolioCustomerPerformanceSortKey || "spent") as PortfolioCustomerPerformanceSortKey;
      const direction = normalizePortfolioSortDirection(this.portfolioCustomerPerformanceSortDirection, "desc");
      return sortCustomerPerformanceRows(rows, key, direction);
    },

    setPortfolioCustomerPerformanceSort(this: Record<string, unknown>, key: PortfolioCustomerPerformanceSortKey): void {
      if (this.portfolioCustomerPerformanceSortKey === key) {
        this.portfolioCustomerPerformanceSortDirection = this.portfolioCustomerPerformanceSortDirection === "asc" ? "desc" : "asc";
        return;
      }
      this.portfolioCustomerPerformanceSortKey = key;
      this.portfolioCustomerPerformanceSortDirection = key === "customer" || key === "topLot" ? "asc" : "desc";
    },

    portfolioPerformanceSheetModel(this: Record<string, unknown>): PortfolioPerformanceSheetModel {
      const copy = getPortfolioCopy(this);
      const customerSummary = (this.customerPerformanceSummary as (() => CustomerPerformanceSummary) | undefined)?.call(this)
        ?? buildCustomerPerformanceSummary([]);
      const customerRows = (this.customerPerformanceRows as (() => CustomerPerformanceRow[]) | undefined)?.call(this) ?? [];
      const lotColumns = (this.portfolioLotPerformanceGridColumns as (() => Array<PortfolioPerformanceGridColumn>) | undefined)?.call(this) ?? [];
      const lotSortOptions = (this.portfolioLotPerformanceSortOptions as (() => Array<PortfolioSortOption<PortfolioLotPerformanceSortKey>>) | undefined)?.call(this) ?? [];
      const customerColumns = (this.portfolioCustomerPerformanceGridColumns as (() => Array<PortfolioPerformanceGridColumn>) | undefined)?.call(this) ?? [];
      const customerSortOptions = (this.portfolioCustomerPerformanceSortOptions as (() => Array<PortfolioSortOption<PortfolioCustomerPerformanceSortKey>>) | undefined)?.call(this) ?? [];
      const underAmount = (this.portfolioLotPerformanceUnderAmount as (() => string) | undefined)?.call(this) ?? "0";
      const overAmount = (this.portfolioLotPerformanceOverAmount as (() => string) | undefined)?.call(this) ?? "0";
      return {
        title: copy("portfolioPerformanceSheetTitle", "Performance sheet"),
        viewModeLabel: copy("portfolioPerformanceViewModeLabel", "View"),
        lotsViewLabel: copy("portfolioPerformanceLotsViewLabel", "Lot performance"),
        customersViewLabel: copy("portfolioPerformanceCustomersViewLabel", "Customer performance"),
        hasPortfolioData: Boolean(this.hasPortfolioData),
        lotTitle: copy("portfolioPerformanceTitle", "Lot performance"),
        customerTitle: copy("portfolioCustomerPerformanceTitle", "Customer performance"),
        lossLabel: copy("portfolioPerformanceLossLabel", "Loss"),
        lossAmount: underAmount,
        gainLabel: copy("portfolioPerformanceGainLabel", "Gain"),
        gainAmount: overAmount,
        customerCountLabel: copy("portfolioCustomerCountLabel", "Customers"),
        customerCount: customerSummary.customerCount,
        repeatCustomerLabel: copy("portfolioCustomerRepeatLabel", "Repeat"),
        repeatCustomerCount: customerSummary.repeatBuyerCount,
        sortLabel: copy("portfolioPerformanceSortLabel", "Sort by"),
        lotColumns,
        lotSortOptions,
        lotSortKey: String(this.portfolioLotPerformanceSortKey || "source"),
        lotSortDirection: normalizePortfolioSortDirection(this.portfolioLotPerformanceSortDirection),
        customerColumns,
        customerSortOptions,
        customerSortKey: String(this.portfolioCustomerPerformanceSortKey || "spent"),
        customerSortDirection: normalizePortfolioSortDirection(this.portfolioCustomerPerformanceSortDirection, "desc"),
        customerRowCount: customerRows.length,
        lotEmptyTitle: copy("portfolioPerformanceEmptyTitle", "No lot performance yet"),
        lotEmptyBody: copy("portfolioPerformanceEmptyBody", "Create lots and add sales to see which lots are ahead or behind."),
        customerEmptyTitle: copy("portfolioCustomerPerformanceEmptyTitle", "No customer performance yet"),
        customerEmptyBody: copy("portfolioCustomerPerformanceEmptyBody", "Add named customers to sales to see buyer performance here.")
      };
    },

    sortedPortfolioLotPerformanceRows(this: Record<string, unknown>): Array<Record<string, unknown>> {
      const rows = Array.isArray(this.allLotPerformance)
        ? this.allLotPerformance as Array<Record<string, unknown>>
        : [];
      const key = String(this.portfolioLotPerformanceSortKey || "source") as PortfolioLotPerformanceSortKey;
      const direction = normalizePortfolioSortDirection(this.portfolioLotPerformanceSortDirection, "asc");
      return sortPortfolioLotPerformanceRows(rows, key, direction);
    },

    setPortfolioLotPerformanceSort(this: Record<string, unknown>, key: PortfolioLotPerformanceSortKey): void {
      if (this.portfolioLotPerformanceSortKey === key) {
        this.portfolioLotPerformanceSortDirection = this.portfolioLotPerformanceSortDirection === "asc" ? "desc" : "asc";
        return;
      }
      this.portfolioLotPerformanceSortKey = key;
      this.portfolioLotPerformanceSortDirection = key === "name" ? "asc" : "desc";
    },

    portfolioLotPerformanceSortIcon(this: Record<string, unknown>, key: PortfolioLotPerformanceSortKey): string {
      return getPortfolioPerformanceSortIcon(
        String(this.portfolioLotPerformanceSortKey || "source") as PortfolioLotPerformanceSortKey,
        normalizePortfolioSortDirection(this.portfolioLotPerformanceSortDirection, "asc"),
        key
      );
    },

    portfolioCustomerPerformanceSortIcon(this: Record<string, unknown>, key: PortfolioCustomerPerformanceSortKey): string {
      return getPortfolioPerformanceSortIcon(
        String(this.portfolioCustomerPerformanceSortKey || "spent") as PortfolioCustomerPerformanceSortKey,
        normalizePortfolioSortDirection(this.portfolioCustomerPerformanceSortDirection, "desc"),
        key
      );
    },

    portfolioLotPerformanceSortOptions(this: Record<string, unknown>): Array<PortfolioSortOption<PortfolioLotPerformanceSortKey>> {
      return getPortfolioLotPerformanceSortOptions(getPortfolioCopy(this));
    },

    portfolioLotPerformanceGridColumns(this: Record<string, unknown>): Array<PortfolioPerformanceGridColumn<PortfolioLotPerformanceSortKey>> {
      return (this.portfolioLotPerformanceSortOptions as (() => Array<PortfolioSortOption<PortfolioLotPerformanceSortKey>>) | undefined)
        ?.call(this)
        .map((option) => ({
          ...option,
          numeric: option.key === "soldMargin" || option.key === "risk" || option.key === "profit"
        })) ?? [];
    },

    portfolioCustomerPerformanceSortOptions(this: Record<string, unknown>): Array<PortfolioSortOption<PortfolioCustomerPerformanceSortKey>> {
      return getPortfolioCustomerPerformanceSortOptions(getPortfolioCopy(this));
    },

    portfolioCustomerPerformanceGridColumns(this: Record<string, unknown>): Array<PortfolioPerformanceGridColumn<PortfolioCustomerPerformanceSortKey>> {
      return (this.portfolioCustomerPerformanceSortOptions as (() => Array<PortfolioSortOption<PortfolioCustomerPerformanceSortKey>>) | undefined)
        ?.call(this)
        .map((option) => ({
          ...option,
          numeric: option.key === "spent" || option.key === "purchases" || option.key === "lots"
        })) ?? [];
    },

    portfolioLotPerformanceSortButtonClass(this: Record<string, unknown>, key: PortfolioLotPerformanceSortKey): Record<string, boolean> {
      return getPortfolioPerformanceSortButtonClass(
        String(this.portfolioLotPerformanceSortKey || "source") as PortfolioLotPerformanceSortKey,
        key
      );
    },

    portfolioCustomerPerformanceSortButtonClass(this: Record<string, unknown>, key: PortfolioCustomerPerformanceSortKey): Record<string, boolean> {
      return getPortfolioPerformanceSortButtonClass(
        String(this.portfolioCustomerPerformanceSortKey || "spent") as PortfolioCustomerPerformanceSortKey,
        key
      );
    },

    customerPerformanceSummary(this: Record<string, unknown>): CustomerPerformanceSummary {
      const rows = this.customerPerformanceRows as (() => CustomerPerformanceRow[]) | undefined;
      return buildCustomerPerformanceSummary(typeof rows === "function" ? rows.call(this) : []);
    },

    openPortfolioBuyerQuickView(this: Record<string, unknown>, buyerName: string): void {
      const name = String(buyerName || "").trim();
      if (!name) return;
      this.buyerQuickViewName = name;
      this.buyerQuickViewOpen = true;
    },

    portfolioBuyerQuickViewSummary(this: Record<string, unknown>): BuyerQuickViewSummary | null {
      const visibleLots = this.portfolioPerformanceLots as (() => Lot[]) | undefined;
      const salesMap = this.portfolioPerformanceSalesByLotId as (() => Map<number, Sale[]>) | undefined;
      return buildBuyerQuickViewSummary({
        buyerName: String(this.buyerQuickViewName || ""),
        currentLotId: Number(this.currentLotId) || null,
        lots: typeof visibleLots === "function" ? visibleLots.call(this) : [],
        salesByLotId: typeof salesMap === "function" ? salesMap.call(this) : new Map<number, Sale[]>()
      });
    },

    customerPerformanceHighlights(this: Record<string, unknown>): Array<{ key: string; label: string; value: string; meta: string; icon: string }> {
      const summary = (this.customerPerformanceSummary as (() => CustomerPerformanceSummary) | undefined)?.call(this)
        ?? buildCustomerPerformanceSummary([]);
      const getCopy = getPortfolioCopy(this);
      const format = this.fmtCurrency as ((value: number | null | undefined, decimals?: number) => string) | undefined;
      const formatMoney = (value: number): string => `$${typeof format === "function" ? format.call(this, value) : value.toFixed(2)}`;
      const formatPercent = (value: number): string => `${typeof format === "function" ? format.call(this, value, 1) : value.toFixed(1)}%`;
      return [
        {
          key: "top-customer",
          label: getCopy("portfolioCustomerHighlightTopLabel", "Top customer"),
          value: summary.topCustomer?.username || getCopy("portfolioCustomerNoneLabel", "None"),
          meta: summary.topCustomer ? formatMoney(summary.topCustomer.totalSpent) : getCopy("portfolioCustomerNoSalesMeta", "No named customer sales"),
          icon: "mdi-account-star-outline"
        },
        {
          key: "repeat-buyers",
          label: getCopy("portfolioCustomerHighlightRepeatLabel", "Repeat buyers"),
          value: String(summary.repeatBuyerCount),
          meta: `${summary.customerCount} ${getCopy("portfolioCustomerCountMeta", "customers")}`,
          icon: "mdi-account-multiple-check-outline"
        },
        {
          key: "top-five-share",
          label: getCopy("portfolioCustomerHighlightConcentrationLabel", "Top 5 share"),
          value: formatPercent(summary.topFiveSharePercent),
          meta: formatMoney(summary.totalSpent),
          icon: "mdi-chart-pie"
        }
      ];
    },

    lotPerformanceHighlights(this: Record<string, unknown>): Array<{ key: string; label: string; value: string; meta: string; icon: string; tone: string }> {
      const insights = this.portfolioPulseInsights as (() => PortfolioPulseDisplayInsight[]) | undefined;
      return (typeof insights === "function" ? insights.call(this) : []).slice(0, 3).map((insight) => ({
        key: insight.key,
        label: insight.label,
        value: insight.title,
        meta: insight.meta,
        icon: insight.icon,
        tone: insight.tone
      }));
    },

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
      const getCopy = getPortfolioCopy(this);
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
      const getCopy = getPortfolioCopy(this);

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
      const getCopy = getPortfolioCopy(this);
      const lotLabel = getCopy("portfolioLotCountLabel", "lot");
      const profitableLabel = getCopy("portfolioKpiProfitableLabel", "profitable");
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
      const getCopy = getPortfolioCopy(this);
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
          key: "sold",
          label: getCopy("portfolioPulseSoldLabel", "Sold"),
          value: formatSigned(Number(totals?.totalRevenue ?? 0), false),
          meta: `${salesCount} ${salesLabel}${salesCount === 1 ? "" : "s"}`,
          icon: "mdi-cash-multiple",
          tone: "neutral"
        },
        {
          key: "invested",
          label: getCopy("portfolioPulseInvestedLabel", "Invested"),
          value: formatSigned(Number(totals?.totalCost ?? 0), false),
          meta: getCopy("portfolioPulseCurrentViewMeta", "Current view"),
          icon: "mdi-receipt-text-outline",
          tone: "neutral"
        },
        {
          key: "forecast",
          label: getCopy("portfolioPulseForecastLabel", "Forecast"),
          value: forecast ? formatSigned(forecastProfit) : "--",
          meta: forecast
            ? `${forecastContext} - ${getCopy("portfolioKpiAverageRevenueLabel", "Average revenue")} ${formatSigned(Number(forecast.forecastRevenue ?? 0), false)}`
            : getCopy("portfolioPulseNoForecastMeta", "No forecast yet"),
          icon: "mdi-crystal-ball",
          tone: forecastProfit > 0 ? "positive" : forecastProfit < 0 ? "negative" : "neutral"
        }
      ];
    },

    portfolioPulsePanelModel(this: Record<string, unknown>): PortfolioPulsePanelModel {
      const copy = getPortfolioCopy(this);
      const formatSigned = this.portfolioSignedCurrency as ((value: number | null | undefined) => string) | undefined;
      const totals = this.portfolioTotals as { totalProfit?: number } | undefined;
      const profit = Number(totals?.totalProfit ?? 0);
      return {
        title: copy("portfolioPulseTitle", "Portfolio pulse"),
        profitLabel: copy("portfolioPulseCurrentProfitLabel", "Current P/L"),
        profitValue: typeof formatSigned === "function" ? formatSigned.call(this, profit) : `${profit >= 0 ? "+" : "-"}$${Math.abs(profit).toFixed(2)}`,
        profitTone: (this.portfolioPulseProfitTone as (() => PortfolioPulseTone) | undefined)?.call(this) ?? "neutral",
        scopeLabel: (this.portfolioPulseScopeLabel as (() => string) | undefined)?.call(this) ?? "",
        profitableSummary: (this.portfolioPulseProfitableSummary as (() => string) | undefined)?.call(this) ?? "",
        summaryLabel: copy("portfolioPulseSummaryLabel", "Portfolio summary"),
        stats: (this.portfolioPulseStats as (() => PortfolioPulseStat[]) | undefined)?.call(this) ?? [],
        insightsTitle: copy("portfolioPulseInsightsTitle", "Seller insights"),
        insights: (this.portfolioPulseInsights as (() => PortfolioPulseDisplayInsight[]) | undefined)?.call(this) ?? []
      };
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
      const getCopy = getPortfolioCopy(this);
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
          const amount = formatSigned(insight.amount ?? 0, false);
          return {
            key: `${insight.kind}-${insight.lotId}`,
            label: getCopy("portfolioPulseRecoveryTargetLabel", "Recovery target"),
            title: `${getCopy("portfolioPulseNeedsPrefix", "Needs")} ${amount} ${getCopy("portfolioPulseBreakEvenMeta", "to break even")}`,
            meta: insight.lotName,
            icon: insight.icon,
            tone: insight.tone
          };
        }

        if (insight.kind === "winner") {
          return {
            key: `${insight.kind}-${insight.lotId}`,
            label: getCopy("portfolioPulseBestLotToKeepMovingLabel", "Best lot to keep moving"),
            title: `${getCopy("portfolioPulseKeepSellingVerb", "Keep selling")} ${insight.lotName}`,
            meta: `${formatSigned(insight.amount ?? 0)} ${getCopy("portfolioPulseProfitMeta", "profit")}`,
            icon: insight.icon,
            tone: insight.tone
          };
        }

        const nextActionVerb = insight.amount != null
          ? getCopy("portfolioPulseRiskActionVerb", "Recover")
          : getCopy("portfolioPulseNextActionReviewVerb", "Review");
        return {
          key: `${insight.kind}-${insight.lotId}`,
          label: getCopy("portfolioPulseNextBestActionLabel", "Next best action"),
          title: insight.amount != null
            ? `${nextActionVerb} ${formatSigned(insight.amount, false)} ${getCopy("portfolioPulseOnLotConnector", "on")} ${insight.lotName}`
            : `${nextActionVerb} ${insight.lotName}`,
          meta: insight.amount != null
            ? getCopy("portfolioPulseStillAtRiskMeta", "still at risk")
            : getCopy("portfolioPulseNeedsAttentionMeta", "Needs attention"),
          icon: insight.icon,
          tone: insight.tone
        };
      };

      const displayInsights = insights.map(toDisplayInsight);
      const primaryAction = displayInsights.find((insight, index) => insights[index]?.kind === "next_move");
      return primaryAction
        ? [primaryAction, ...displayInsights.filter((insight) => insight !== primaryAction)]
        : displayInsights;
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
      const getCopy = getPortfolioCopy(this);
      if (filter === "bulk") return getCopy("portfolioLotFilterBulkLabel", "All bulk lots");
      if (filter === "singles") return getCopy("portfolioLotFilterSinglesLabel", "All singles lots");
      return getCopy("portfolioLotFilterAllLabel", "All lots");
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

    portfolioLotStatusLabel(this: Record<string, unknown>, row: {
      salesCount?: number;
      soldPacks?: number;
      totalPacks?: number;
    }): string {
      const format = this.fmtCurrency as ((value: number | null | undefined, decimals?: number) => string) | undefined;
      const getCopy = getPortfolioCopy(this);
      const formatCount = (value: number): string => (
        typeof format === "function" ? format.call(this, value, 0) : String(Math.round(value))
      );
      const soldPacks = Math.max(0, Number(row?.soldPacks ?? 0) || 0);
      const totalPacks = Math.max(0, Number(row?.totalPacks ?? 0) || 0);
      if (totalPacks > 0 && soldPacks >= totalPacks) {
        return getCopy("portfolioLotCompleteLabel", "Complete");
      }
      if (totalPacks > 0) {
        return `${formatCount(soldPacks)} / ${formatCount(totalPacks)}`;
      }
      const salesCount = Math.max(0, Number(row?.salesCount ?? 0) || 0);
      if (salesCount > 0) {
        const label = salesCount === 1
          ? getCopy("portfolioSalesCountLabel", "sale")
          : getCopy("portfolioSalesPluralCountLabel", "sales");
        return `${formatCount(salesCount)} ${label}`;
      }
      return getCopy("portfolioLotNoSalesLabel", "No sales yet");
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
      const profit = getPortfolioLotPrimaryProfit(row);
      const format = this.fmtCurrency as ((value: number | null | undefined, decimals?: number) => string) | undefined;
      const formatted = typeof format === "function"
        ? format.call(this, Math.abs(profit.value), 0)
        : String(Math.round(Math.abs(profit.value)));
      return `${profit.projected ? "~" : ""}${profit.value >= 0 ? "+" : "-"}$${formatted}`;
    },

    portfolioLotPrimaryProfitTone(this: Record<string, unknown>, row: {
      salesCount?: number;
      realizedProfit?: number;
      forecastProfitAverage?: number | null;
      soldPacks?: number;
      totalPacks?: number;
      totalProfit?: number;
    }): "success" | "error" {
      return getPortfolioLotPrimaryProfit(row).tone;
    },

    portfolioLotPrimaryProfitValueClass(this: Record<string, unknown>, row: {
      salesCount?: number;
      realizedProfit?: number;
      forecastProfitAverage?: number | null;
      soldPacks?: number;
      totalPacks?: number;
      totalProfit?: number;
    }): Record<string, boolean> {
      const profit = getPortfolioLotPrimaryProfit(row);
      return {
        "is-positive": profit.tone === "success",
        "is-negative": profit.tone === "error",
        "is-projected": profit.projected
      };
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
      return getPortfolioChartToggleTitle(next, getPortfolioCopy(this));
    },

    portfolioChartToggleIcon(this: Record<string, unknown>): string {
      const nextView = this.nextPortfolioChartView as (() => "breakdown" | "trend" | "sellthrough" | "margin") | undefined;
      const next = typeof nextView === "function" ? nextView.call(this) : "trend";
      return getPortfolioChartToggleIcon(next);
    },

    portfolioChartSubtitle(this: Record<string, unknown>): string {
      return getPortfolioChartSubtitle(
        this.portfolioChartView,
        getPortfolioCopy(this)
      );
    },

    portfolioChartAriaLabel(this: Record<string, unknown>): string {
      return getPortfolioChartAriaLabel(
        this.portfolioChartView,
        getPortfolioCopy(this)
      );
    },

    portfolioSalesByUserMetricLabel(this: Record<string, unknown>): string {
      return getPortfolioSalesByUserMetricLabel(
        this.portfolioSalesByUserMetric,
        getPortfolioCopy(this)
      );
    },

    portfolioSalesByUserTotalValue(this: Record<string, unknown>): number {
      const series = getPortfolioSalesByUserChartSeries<{ total?: number }>(this.portfolioSalesByUserChartData);
      return getPortfolioSalesByUserTotalValue(series);
    },

    portfolioSalesByUserLeader(this: Record<string, unknown>) {
      const series = getPortfolioSalesByUserChartSeries<{ key: string; label: string; color: string; total: number }>(this.portfolioSalesByUserChartData);
      return getPortfolioSalesByUserLeader(series);
    },

    portfolioSalesByUserBestWeek(this: Record<string, unknown>) {
      const chartData = this.portfolioSalesByUserChartData;
      const weeks = getPortfolioSalesByUserChartWeeks<{ label: string }>(chartData);
      const series = getPortfolioSalesByUserChartSeries<{ values: number[] }>(chartData);
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
      const series = getPortfolioSalesByUserChartSeries<{ key: string; label: string; color: string; total: number }>(state.portfolioSalesByUserChartData);
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
      const chartData = this.portfolioSalesByUserChartData;
      const weeks = getPortfolioSalesByUserChartWeeks<{ key?: string; label: string }>(chartData);
      const series = getPortfolioSalesByUserChartSeries<{ values: number[] }>(chartData);
      return getPortfolioSalesByUserWeekTotals(weeks, series);
    },

    openPortfolioSalesByUserWeekDrilldown(this: Record<string, unknown>, week: { key?: string; label?: string } | null | undefined): void {
      const weekKey = String(week?.key || "").trim();
      if (!weekKey) return;
      this.portfolioSalesByUserDrilldownWeekKey = weekKey;
      this.portfolioSalesByUserDrilldownDialog = true;
    },

    closePortfolioSalesByUserWeekDrilldown(this: Record<string, unknown>): void {
      this.portfolioSalesByUserDrilldownDialog = false;
      this.portfolioSalesByUserDrilldownWeekKey = "";
    },

    portfolioSalesByUserSelectedDrilldownRows(this: Record<string, unknown>): PortfolioSalesByUserDrilldownRow[] {
      const selectedWeekKey = String(this.portfolioSalesByUserDrilldownWeekKey || "").trim();
      const rows = Array.isArray(this.portfolioSalesByUserDrilldownRows)
        ? this.portfolioSalesByUserDrilldownRows as PortfolioSalesByUserDrilldownRow[]
        : [];
      if (!selectedWeekKey) return [];
      return rows.filter((row) => row.weekKey === selectedWeekKey);
    },

    portfolioSalesByUserSelectedDrilldownWeekLabel(this: Record<string, unknown>): string {
      const selectedWeekKey = String(this.portfolioSalesByUserDrilldownWeekKey || "").trim();
      if (!selectedWeekKey) return "";
      const weeks = getPortfolioSalesByUserChartWeeks<{ key?: string; label: string }>(this.portfolioSalesByUserChartData);
      const week = weeks.find((candidate) => String(candidate.key || "") === selectedWeekKey);
      if (week?.label) return week.label;
      const rows = this.portfolioSalesByUserSelectedDrilldownRows as (() => PortfolioSalesByUserDrilldownRow[]) | undefined;
      if (typeof rows === "function") return rows.call(this)[0]?.weekLabel ?? "";
      const drilldownRows = Array.isArray(this.portfolioSalesByUserDrilldownRows)
        ? this.portfolioSalesByUserDrilldownRows as PortfolioSalesByUserDrilldownRow[]
        : [];
      return drilldownRows.find((row) => row.weekKey === selectedWeekKey)?.weekLabel ?? "";
    },

    portfolioSalesByUserDrilldownTitle(this: Record<string, unknown>): string {
      const getWeekLabel = this.portfolioSalesByUserSelectedDrilldownWeekLabel as (() => string) | undefined;
      const weekLabel = typeof getWeekLabel === "function"
        ? getWeekLabel.call(this)
        : PortfolioWindowDefinition.methods.portfolioSalesByUserSelectedDrilldownWeekLabel.call(this);
      const template = getPortfolioCopy(this)("portfolioSalesByUserDrilldownTitle", "Sales for {{week}}");
      return template.replace(/\{\{week\}\}/g, weekLabel);
    },

    portfolioSalesByUserWeekDrilldownLabel(this: Record<string, unknown>, week: { label?: string } | null | undefined): string {
      const template = getPortfolioCopy(this)("portfolioSalesByUserOpenWeekDrilldownLabel", "View sales for {{week}}");
      return template.replace(/\{\{week\}\}/g, String(week?.label || ""));
    },

    portfolioSalesByUserDrilldownSummary(this: Record<string, unknown>): string {
      const getRows = this.portfolioSalesByUserSelectedDrilldownRows as (() => PortfolioSalesByUserDrilldownRow[]) | undefined;
      const rows = typeof getRows === "function"
        ? getRows.call(this)
        : PortfolioWindowDefinition.methods.portfolioSalesByUserSelectedDrilldownRows.call(this);
      const getCopy = getPortfolioCopy(this);
      const format = this.fmtCurrency as ((value: number | null | undefined, decimals?: number) => string) | undefined;
      const formatCurrency = (value: number): string => `$${typeof format === "function" ? format.call(this, value) : value.toFixed(2)}`;
      const formatSigned = this.portfolioSignedCurrency as ((value: number | null | undefined, includePositiveSign?: boolean) => string) | undefined;
      const signedProfit = (value: number): string => (
        typeof formatSigned === "function"
          ? formatSigned.call(this, value)
          : `${value >= 0 ? "+" : "-"}$${Math.abs(value).toFixed(2)}`
      );
      const revenue = rows.reduce((sum, row) => sum + (Number(row.revenue) || 0), 0);
      const profit = rows.reduce((sum, row) => sum + (Number(row.profit) || 0), 0);
      const saleLabel = getCopy("portfolioSalesCountLabel", "sale");
      const revenueLabel = getCopy("portfolioSalesByUserMetricRevenueLabel", "revenue").toLowerCase();
      const profitLabel = getCopy("portfolioSalesByUserMetricProfitLabel", "profit").toLowerCase();

      return `${rows.length} ${saleLabel}${rows.length === 1 ? "" : "s"} - ${formatCurrency(revenue)} ${revenueLabel} - ${signedProfit(profit)} ${profitLabel}`;
    },

    portfolioSalesByUserSubtitle(): string {
      return getPortfolioSalesByUserSubtitle(getPortfolioCopy(this));
    },

    portfolioSalesByUserAriaLabel(this: Record<string, unknown>): string {
      return getPortfolioSalesByUserAriaLabel(
        this.portfolioSalesByUserMetric,
        getPortfolioCopy(this)
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
