import {
  buildBuyerQuickViewSummary,
  type BuyerQuickViewSummary
} from "../../../app-core/computed/buyer-quick-view.ts";
import type { Lot, Sale, SinglesPurchaseEntry } from "../../../types/app.ts";
import type { AppKpiItem } from "../../ui/AppKpiGrid.ts";
import { useSalesWindowPorts } from "./salesWindowPorts.ts";

const SALES_HISTORY_INITIAL_RENDER_COUNT = 80;
const SALES_HISTORY_RENDER_BATCH_SIZE = 80;

function resolveSalesTranslation(
  vm: Record<string, unknown>,
  key: string,
  fallback = ""
): string {
  const translate = vm.t as ((translationKey: string) => string) | undefined;
  if (typeof translate === "function") {
    const translated = translate.call(vm, key);
    if (typeof translated === "string" && translated.trim()) {
      return translated;
    }
  }
  return fallback;
}

function formatSalesKpiCurrency(vm: Record<string, unknown>, value: number, decimals = 2): string {
  const format = vm.fmtCurrency;
  if (typeof format === "function") {
    return String((format as (amount: number, decimals?: number) => string).call(vm, value, decimals));
  }
  const contextFormat = vm.formatCurrency;
  if (typeof contextFormat === "function") {
    return String((contextFormat as (amount: number, decimals?: number) => string).call(vm, value, decimals));
  }
  return Number(value || 0).toFixed(decimals);
}

function formatSalesKpiUnits(vm: Record<string, unknown>, value: number): string {
  const format = vm.fmtUnits;
  if (typeof format === "function") {
    return String((format as (amount: number) => string).call(vm, value));
  }
  return Math.abs(value - Math.round(value)) < 0.0001 ? String(Math.round(value)) : value.toFixed(2);
}

function formatSalesKpiDate(vm: Record<string, unknown>, value: string): string {
  const format = vm.formatDate;
  if (typeof format === "function") {
    return String((format as (date: string) => string).call(vm, value));
  }
  return value;
}

function saleUnits(sale: Sale): number {
  return Math.max(0, Number(sale.packsCount ?? sale.quantity) || 0);
}

function saleNetRevenue(sale: Sale): number {
  const netRevenue = Number(sale.netRevenue);
  if (Number.isFinite(netRevenue)) return netRevenue;
  return Math.max(0, Number(sale.price) || 0);
}

function saleGrossRevenue(sale: Sale): number {
  const price = Math.max(0, Number(sale.price) || 0);
  if (sale.priceIsTotal) return price;
  return price * Math.max(1, Number(sale.quantity) || 1);
}

function topBuyerSummary(sales: Sale[]): { name: string; units: number; gross: number } | null {
  const buyers = new Map<string, { name: string; units: number; gross: number }>();
  for (const sale of sales) {
    const name = String(sale.customer || "").trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase();
    const current = buyers.get(key) ?? { name, units: 0, gross: 0 };
    current.units += saleUnits(sale);
    current.gross += saleGrossRevenue(sale);
    buyers.set(key, current);
  }

  return [...buyers.values()].sort((left, right) => {
    if (right.units !== left.units) return right.units - left.units;
    if (right.gross !== left.gross) return right.gross - left.gross;
    return left.name.localeCompare(right.name);
  })[0] ?? null;
}

function salesProgressPercent(vm: Record<string, unknown>): number {
  const lotType = String(vm.currentLotType || "bulk");
  if (lotType === "singles") {
    const trackedTotal = Math.max(0, Number(vm.singlesTrackedTotalCount) || 0);
    const trackedSold = Math.max(0, Number(vm.singlesTrackedSoldCount) || 0);
    return trackedTotal > 0 ? (trackedSold / trackedTotal) * 100 : 0;
  }
  return Math.max(0, Number(vm.salesProgress) || 0);
}

export const SalesWindowDefinition = {
  name: "SalesWindow",
  data() {
    return {
      salesHistoryRenderCount: SALES_HISTORY_INITIAL_RENDER_COUNT,
      liveForecastScenarioIndex: 0,
      buyerQuickViewOpen: false,
      buyerQuickViewName: ""
    };
  },
  computed: {
    buyerQuickViewSummary(this: Record<string, unknown>): BuyerQuickViewSummary | null {
      const lots = Array.isArray(this.lots) ? this.lots as Lot[] : [];
      const salesByLotId = this.salesByLotId instanceof Map ? this.salesByLotId as Map<number, Sale[]> : new Map<number, Sale[]>();
      return buildBuyerQuickViewSummary({
        buyerName: String(this.buyerQuickViewName || ""),
        currentLotId: Number(this.currentLotId) || null,
        lots,
        salesByLotId
      });
    },

    visibleSortedSales(this: Record<string, unknown>): Sale[] {
      const vm = this as Record<string, unknown>;
      const sales = Array.isArray(vm.sortedSales) ? vm.sortedSales as Sale[] : [];
      const limit = Math.max(0, Number(vm.salesHistoryRenderCount) || 0);
      return sales.slice(0, limit);
    },

    hasMoreSalesHistory(this: Record<string, unknown>): boolean {
      const vm = this as Record<string, unknown>;
      const sales = Array.isArray(vm.sortedSales) ? vm.sortedSales as Sale[] : [];
      const limit = Math.max(0, Number(vm.salesHistoryRenderCount) || 0);
      return sales.length > limit;
    },

    remainingSalesHistoryCount(this: Record<string, unknown>): number {
      const vm = this as Record<string, unknown>;
      const sales = Array.isArray(vm.sortedSales) ? vm.sortedSales as Sale[] : [];
      const limit = Math.max(0, Number(vm.salesHistoryRenderCount) || 0);
      return Math.max(0, sales.length - limit);
    },

    nextSalesHistoryBatchCount(this: Record<string, unknown>): number {
      const vm = this as Record<string, unknown>;
      const sales = Array.isArray(vm.sortedSales) ? vm.sortedSales as Sale[] : [];
      const limit = Math.max(0, Number(vm.salesHistoryRenderCount) || 0);
      const remaining = Math.max(0, sales.length - limit);
      return Math.min(SALES_HISTORY_RENDER_BATCH_SIZE, remaining);
    },

    visibleLiveForecastScenarios(this: Record<string, unknown>): Array<Record<string, unknown>> {
      const vm = this as Record<string, unknown>;
      const scenarios = Array.isArray(vm.liveForecastScenarios)
        ? (vm.liveForecastScenarios as Array<Record<string, unknown>>)
        : [];
      if (scenarios.length === 0) return [];
      const isMobile = Boolean(
        (vm.$vuetify as { display?: { smAndDown?: boolean } } | undefined)?.display?.smAndDown
      );
      if (!isMobile) return scenarios;
      const index = Math.max(0, Number(vm.liveForecastScenarioIndex) || 0) % scenarios.length;
      return [scenarios[index]!];
    },

    hasMultipleLiveForecastScenarios(this: Record<string, unknown>): boolean {
      const vm = this as Record<string, unknown>;
      const scenarios = Array.isArray(vm.liveForecastScenarios)
        ? (vm.liveForecastScenarios as Array<Record<string, unknown>>)
        : [];
      return scenarios.length > 1;
    },

    activeLiveForecastPosition(this: Record<string, unknown>): number {
      const vm = this as Record<string, unknown>;
      const scenarios = Array.isArray(vm.liveForecastScenarios)
        ? (vm.liveForecastScenarios as Array<Record<string, unknown>>)
        : [];
      if (scenarios.length === 0) return 0;
      const index = Math.max(0, Number(vm.liveForecastScenarioIndex) || 0) % scenarios.length;
      return index + 1;
    },

    bulkBoxProgressText(this: Record<string, unknown>): string {
      const packsPerBox = Math.max(0, Number(this.packsPerBox) || 0);
      if (packsPerBox <= 0) return "";
      const soldPacks = Math.max(0, Number(this.soldPacksCount) || 0);
      const totalPacks = Math.max(0, Number(this.totalPacks) || 0);
      const fmtUnits = this.fmtUnits as ((value: number | null | undefined) => string) | undefined;
      const format = typeof fmtUnits === "function"
        ? (value: number) => fmtUnits.call(this, value)
        : (value: number) => String(value);
      const boxLabel = resolveSalesTranslation(this, "salesBoxesLabel", "boxes");
      return `${format(soldPacks / packsPerBox)} / ${format(totalPacks / packsPerBox)} ${boxLabel}`;
    },

    salesHistorySummaryLabel(this: Record<string, unknown>): string {
      const vm = this as Record<string, unknown>;
      const percent = Number(vm.salesHistorySoldPercent) || 0;
      const formatter = vm.formatCurrency as ((value: number | null | undefined, decimals?: number) => string) | undefined;
      const formatted = typeof formatter === "function" ? formatter(percent, 1) : percent.toFixed(1);
      return `${formatted}%`;
    },

    salesHistorySoldPercent(this: Record<string, unknown>): number {
      return salesProgressPercent(this);
    },

    salesStatusProgressPercentLabel(this: Record<string, unknown>): string {
      return `${formatSalesKpiCurrency(this, salesProgressPercent(this), 1)}%`;
    },

    salesStatusRealizedProfit(this: Record<string, unknown>): number {
      const vm = this as Record<string, unknown> & {
        sales?: Sale[] | null;
        calculateSaleProfit?: (sale: Sale) => number;
      };
      const sales = Array.isArray(vm.sales) ? vm.sales : [];
      const calculateSaleProfit = vm.calculateSaleProfit;
      if (typeof calculateSaleProfit !== "function") return 0;
      return sales.reduce((sum, sale) => sum + (Number(calculateSaleProfit.call(this, sale)) || 0), 0);
    },

    salesStatusRealizedMarginPercent(this: Record<string, unknown>): number | null {
      const vm = this as Record<string, unknown> & {
        salesStatusRealizedProfit?: number;
        salesStatus?: { revenue?: number } | null;
      };
      const realizedProfit = Number(vm.salesStatusRealizedProfit);
      const realizedRevenue = Number(vm.salesStatus?.revenue);
      if (!Number.isFinite(realizedProfit) || !Number.isFinite(realizedRevenue) || realizedRevenue <= 0) {
        return null;
      }
      return (realizedProfit / realizedRevenue) * 100;
    },

    salesSnapshotKpis(this: Record<string, unknown>): AppKpiItem[] {
      const lotType = String(this.currentLotType || "bulk");
      const sales = Array.isArray(this.sortedSales) ? this.sortedSales as Sale[] : [];
      const soldItems = Math.max(0, Number(this.soldPacksCount) || 0);
      const trackedSoldItems = Math.max(0, Number(this.singlesTrackedSoldCount) || 0);
      const totalItems = lotType === "singles"
        ? Math.max(0, Number(this.singlesTrackedTotalCount) || 0)
        : Math.max(0, Number(this.totalPacks) || 0);
      const remainingItems = Math.max(0, totalItems - (lotType === "singles"
        ? trackedSoldItems
        : soldItems));
      const soldBasis = lotType === "singles"
        ? trackedSoldItems
        : soldItems;
      const revenue = Number((this.salesStatus as { revenue?: number } | undefined)?.revenue ?? 0);
      const cost = Math.max(0, Number(this.totalCaseCost) || 0);
      const averageNet = soldItems > 0 ? revenue / soldItems : 0;
      const soldPercent = totalItems > 0 ? (soldBasis / totalItems) * 100 : 0;
      const kpis: AppKpiItem[] = [];
      const lastSale = sales[0];
      const topBuyer = topBuyerSummary(sales);

      kpis.push({
        id: "revenue",
        label: resolveSalesTranslation(this, "salesStatusRevenueLabel", "Revenue"),
        value: `$${formatSalesKpiCurrency(this, revenue)}`,
        meta: resolveSalesTranslation(this, "salesKpiSoldNetMeta", "Recorded sold net"),
        icon: "mdi-cash-register",
        tone: "neutral"
      });

      kpis.push({
        id: "cost",
        label: resolveSalesTranslation(this, "salesStatusCostLabel", "Cost"),
        value: `$${formatSalesKpiCurrency(this, cost)}`,
        meta: resolveSalesTranslation(this, "salesKpiLotCostMeta", "Lot cost basis"),
        icon: "mdi-receipt-text-outline",
        tone: "neutral"
      });

      const packsPerBox = Math.max(0, Number(this.packsPerBox) || 0);
      const boxLabel = resolveSalesTranslation(this, "salesBoxesLabel", "boxes");
      const itemLabel = resolveSalesTranslation(this, "salesItemsLabel", "items");
      kpis.push({
        id: "inventory",
        label: resolveSalesTranslation(this, "salesKpiInventoryLabel", "Inventory"),
        value: lotType !== "singles" && packsPerBox > 0
          ? `${formatSalesKpiUnits(this, soldItems / packsPerBox)} / ${formatSalesKpiUnits(this, totalItems / packsPerBox)} ${boxLabel}`
          : `${formatSalesKpiUnits(this, soldBasis)} / ${formatSalesKpiUnits(this, totalItems)} ${itemLabel}`,
        meta: [
          `${formatSalesKpiUnits(this, soldBasis)} ${resolveSalesTranslation(this, "salesKpiSoldShortMeta", "sold")}`,
          `${formatSalesKpiUnits(this, remainingItems)} ${resolveSalesTranslation(this, "salesKpiLeftShortMeta", "left")}`,
          `${formatSalesKpiCurrency(this, soldPercent, 1)}%`
        ].join(" • "),
        icon: "mdi-view-dashboard-outline",
        tone: "neutral"
      });

      kpis.push({
        id: "top-buyer",
        label: resolveSalesTranslation(this, "salesKpiTopBuyerLabel", "Top buyer"),
        value: topBuyer?.name || resolveSalesTranslation(this, "salesKpiNoSalesValue", "None"),
        meta: topBuyer
          ? `${formatSalesKpiUnits(this, topBuyer.units)} ${itemLabel} • $${formatSalesKpiCurrency(this, topBuyer.gross)}`
          : resolveSalesTranslation(this, "salesKpiNoBuyerMeta", "No named buyer yet"),
        icon: "mdi-account-star-outline",
        tone: "neutral"
      });

      kpis.push({
        id: "last-sale",
        label: resolveSalesTranslation(this, "salesKpiLastSaleLabel", "Last sale"),
        value: lastSale ? formatSalesKpiDate(this, lastSale.date) : resolveSalesTranslation(this, "salesKpiNoSalesValue", "None"),
        meta: lastSale
          ? `${formatSalesKpiUnits(this, saleUnits(lastSale))} ${resolveSalesTranslation(this, saleUnits(lastSale) === 1 ? "salesKpiItemNetMeta" : "salesKpiItemsNetMeta", saleUnits(lastSale) === 1 ? "item net" : "items net")} $${formatSalesKpiCurrency(this, saleNetRevenue(lastSale))}`
          : resolveSalesTranslation(this, "salesKpiNoSalesMeta", "Record a sale to start tracking"),
        icon: "mdi-calendar-clock",
        tone: "neutral"
      });

      if (lotType !== "singles") {
        const currentBoxSold = packsPerBox > 0 ? soldItems % packsPerBox : 0;
        const toNextBox = packsPerBox > 0 && currentBoxSold > 0 ? packsPerBox - currentBoxSold : 0;
        kpis.push({
          id: "box-progress",
          label: resolveSalesTranslation(this, "salesKpiNextBoxLabel", "Next full box"),
          value: `${formatSalesKpiUnits(this, toNextBox)} ${resolveSalesTranslation(this, "salesKpiToNextBoxValue", "to next box")}`,
          meta: packsPerBox > 0
            ? `${formatSalesKpiUnits(this, currentBoxSold)} / ${formatSalesKpiUnits(this, packsPerBox)} ${resolveSalesTranslation(this, "salesKpiCurrentBoxMeta", "current box")}`
            : resolveSalesTranslation(this, "salesKpiBoxUnavailableMeta", "Set packs per box"),
          icon: "mdi-package-variant-closed",
          tone: "neutral"
        });
      }

      if (lotType === "singles") {
        kpis.push({
          id: "avg-net",
          label: resolveSalesTranslation(this, "salesKpiAvgNetItemLabel", "Avg net/item"),
          value: `$${formatSalesKpiCurrency(this, averageNet)}`,
          meta: resolveSalesTranslation(this, "salesKpiAvgNetItemMeta", "Across sold items"),
          icon: "mdi-cash-multiple",
          tone: "neutral"
        });
      }

      return kpis;
    }
  },
  watch: {
    currentLotId(this: Record<string, unknown>) {
      const vm = this as Record<string, unknown> & { resetSalesHistoryRenderCount?: () => void };
      vm.resetSalesHistoryRenderCount?.();
    },
    currentLotType(this: Record<string, unknown>) {
      const vm = this as Record<string, unknown> & { resetSalesHistoryRenderCount?: () => void };
      vm.resetSalesHistoryRenderCount?.();
    }
  },
  methods: {
    translate(key: string, fallback = ""): string {
      return resolveSalesTranslation(this as Record<string, unknown>, key, fallback);
    },

    salesStatusToneClass(): string {
      const salesStatus = (this as Record<string, unknown>).salesStatus as { color?: string } | undefined;
      const rawColor = String(salesStatus?.color || "").toLowerCase();
      if (rawColor === "success") return "sales-status-card--success";
      if (rawColor === "error") return "sales-status-card--error";
      if (rawColor === "warning") return "sales-status-card--warning";
      if (rawColor === "primary") return "sales-status-card--primary";
      if (rawColor === "secondary") return "sales-status-card--secondary";
      return "sales-status-card--neutral";
    },

    salesStatusProgressColor(): string {
      const salesStatus = (this as Record<string, unknown>).salesStatus as { color?: string } | undefined;
      const rawColor = String(salesStatus?.color || "").toLowerCase();
      if (rawColor === "success") return "success";
      if (rawColor === "error") return "error";
      if (rawColor === "warning") return "warning";
      if (rawColor === "primary") return "primary";
      if (rawColor === "secondary") return "secondary";
      return "primary";
    },

    salesStatusProgressFillColor(this: Record<string, unknown>): string {
      const lotType = String(this.currentLotType || "bulk");
      const percent = lotType === "singles"
        ? (Math.max(0, Number(this.singlesTrackedTotalCount) || 0) > 0
          ? (Math.max(0, Number(this.singlesTrackedSoldCount) || 0) / Math.max(1, Number(this.singlesTrackedTotalCount) || 0)) * 100
          : 0)
        : Math.max(0, Number(this.salesProgress) || 0);
      const clamped = Math.max(0, Math.min(100, percent));
      const hue = clamped <= 50
        ? 4 + ((48 - 4) * (clamped / 50))
        : 48 + ((135 - 48) * ((clamped - 50) / 50));
      return `hsl(${hue.toFixed(1)}deg 82% 56%)`;
    },

    fmtCurrency(value: number | null | undefined, decimals = 2): string {
      const formatCurrency = (this as Record<string, unknown>).formatCurrency;
      if (typeof formatCurrency === "function") {
        return (formatCurrency as (v: number | null | undefined, d?: number) => string)(value, decimals);
      }
      return new Intl.NumberFormat(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }).format(value == null || Number.isNaN(Number(value)) ? 0 : Number(value));
    },

    fmtUnits(value: number | null | undefined): string {
      const numeric = Number(value) || 0;
      if (Math.abs(numeric - Math.round(numeric)) < 0.0001) {
        return String(Math.round(numeric));
      }
      return this.fmtCurrency(numeric, 2);
    },

    isUnlinkedSinglesSale(sale: Sale): boolean {
      const lotType = (this as Record<string, unknown>).currentLotType;
      if (lotType !== "singles") return false;

      if (Array.isArray(sale?.singlesItems) && sale.singlesItems.length > 0) {
        const entries = ((this as Record<string, unknown>).singlesPurchases || []) as SinglesPurchaseEntry[];
        return sale.singlesItems.some((line) => {
          const rawId = Number(line?.singlesPurchaseEntryId);
          if (!Number.isFinite(rawId) || rawId <= 0) return true;
          const entryId = Math.floor(rawId);
          return !entries.some((entry) => Number(entry.id) === entryId);
        });
      }

      const rawId = Number(sale?.singlesPurchaseEntryId);
      if (!Number.isFinite(rawId) || rawId <= 0) return true;

      const entryId = Math.floor(rawId);
      const entries = ((this as Record<string, unknown>).singlesPurchases || []) as SinglesPurchaseEntry[];
      return !entries.some((entry) => Number(entry.id) === entryId);
    },

    getLinkedSinglesSaleLabel(sale: Sale): string {
      const lotType = (this as Record<string, unknown>).currentLotType;
      if (lotType !== "singles") return "";

      if (Array.isArray(sale?.singlesItems) && sale.singlesItems.length > 0) {
        const entries = ((this as Record<string, unknown>).singlesPurchases || []) as SinglesPurchaseEntry[];
        const linkedEntryIds = sale.singlesItems
          .map((line) => Number(line?.singlesPurchaseEntryId))
          .filter((value) => Number.isFinite(value) && value > 0)
          .map((value) => Math.floor(value));
        const uniqueIds = [...new Set(linkedEntryIds)];
        if (uniqueIds.length !== 1) {
          return uniqueIds.length > 1 ? `${uniqueIds.length} ${resolveSalesTranslation(this as Record<string, unknown>, "salesItemsLabel", "items")}` : "";
        }
        const entry = entries.find((candidate) => Number(candidate.id) === uniqueIds[0]);
        if (!entry) return "";
        const item = String(entry.item || "").trim();
        const cardNumber = String(entry.cardNumber || "").trim();
        if (item && cardNumber) return `${item} #${cardNumber}`;
        if (item) return item;
        if (cardNumber) return `#${cardNumber}`;
        return "";
      }

      const rawId = Number(sale?.singlesPurchaseEntryId);
      if (!Number.isFinite(rawId) || rawId <= 0) return "";

      const entryId = Math.floor(rawId);
      const entries = ((this as Record<string, unknown>).singlesPurchases || []) as SinglesPurchaseEntry[];
      const entry = entries.find((candidate) => Number(candidate.id) === entryId);
      if (!entry) return "";

      const item = String(entry.item || "").trim();
      const cardNumber = String(entry.cardNumber || "").trim();
      if (item && cardNumber) return `${item} #${cardNumber}`;
      if (item) return item;
      if (cardNumber) return `#${cardNumber}`;
      return "";
    },

    saleListTitle(sale: Sale): string {
      const lotType = (this as Record<string, unknown>).currentLotType;
      const priceLabel = `$${this.fmtCurrency(sale.price)}`;
      const quantity = Math.max(0, Number(sale.quantity) || 0);
      const typeLabel = sale.type === "box"
        ? (quantity === 1 ? resolveSalesTranslation(this as Record<string, unknown>, "salesSaleTypeBoxLabel", "box") : resolveSalesTranslation(this as Record<string, unknown>, "salesSaleTypeBoxesLabel", "boxes"))
        : sale.type === "rtyh"
          ? resolveSalesTranslation(this as Record<string, unknown>, "salesSaleTypeRandomHitLabel", "random hit")
          : sale.type === "wheel"
            ? resolveSalesTranslation(this as Record<string, unknown>, "salesSaleTypeWheelLabel", "spin")
            : (quantity === 1 ? resolveSalesTranslation(this as Record<string, unknown>, "salesSaleTypeItemLabel", "item") : resolveSalesTranslation(this as Record<string, unknown>, "salesSaleTypeItemsLabel", "items"));
      if (lotType !== "singles") {
        return `${quantity} ${typeLabel} @ ${priceLabel}`;
      }

      const linkedLabel = this.getLinkedSinglesSaleLabel(sale);
      if (linkedLabel) {
        return `${quantity} ${typeLabel} • ${linkedLabel} • ${priceLabel}`;
      }
      return `${quantity} ${typeLabel} • ${priceLabel}`;
    },

    resetSalesHistoryRenderCount(): void {
      const vm = this as Record<string, unknown> & { salesHistoryRenderCount?: number };
      vm.salesHistoryRenderCount = SALES_HISTORY_INITIAL_RENDER_COUNT;
    },

    loadMoreSalesHistory(): void {
      const vm = this as Record<string, unknown> & { salesHistoryRenderCount?: number };
      vm.salesHistoryRenderCount = Number(vm.salesHistoryRenderCount || 0) + SALES_HISTORY_RENDER_BATCH_SIZE;
    },

    openBuyerQuickView(buyerName: string): void {
      const normalizedName = String(buyerName || "").trim();
      if (!normalizedName) return;
      const vm = this as Record<string, unknown> & {
        buyerQuickViewOpen?: boolean;
        buyerQuickViewName?: string;
      };
      vm.buyerQuickViewName = normalizedName;
      vm.buyerQuickViewOpen = true;
    },

    cycleLiveForecastScenario(direction: -1 | 1): void {
      const vm = this as Record<string, unknown> & {
        liveForecastScenarios?: unknown;
        liveForecastScenarioIndex?: number;
      };
      const scenarios = Array.isArray(vm.liveForecastScenarios) ? vm.liveForecastScenarios : [];
      if (scenarios.length <= 1) return;
      const current = Math.max(0, Number(vm.liveForecastScenarioIndex) || 0);
      const next = (current + direction + scenarios.length) % scenarios.length;
      vm.liveForecastScenarioIndex = next;
    },

    salesHistorySummaryValueStyle(this: Record<string, unknown>): Record<string, string> {
      const percent = Math.max(0, Math.min(100, Number(this.salesHistorySoldPercent) || 0));
      const hue = percent <= 50
        ? 4 + ((48 - 4) * (percent / 50))
        : 48 + ((135 - 48) * ((percent - 50) / 50));
      return {
        color: `hsl(${hue.toFixed(1)}deg 82% 56%)`
      };
    }
  },
  mounted(this: Record<string, unknown>) {
    const vm = this as Record<string, unknown> & { resetSalesHistoryRenderCount?: () => void };
    vm.resetSalesHistoryRenderCount?.();
  },
  setup() {
    return useSalesWindowPorts();
  }
};
