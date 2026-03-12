import template from "./SalesWindow.html?raw";
import "./SalesWindow.css";
import { inject, type PropType } from "vue";
import type { Sale, SinglesPurchaseEntry } from "../../types/app.ts";
import { createWindowContextBridge } from "./contextBridge.ts";

const SALES_HISTORY_INITIAL_RENDER_COUNT = 80;
const SALES_HISTORY_RENDER_BATCH_SIZE = 80;

export const SalesWindow = {
  name: "SalesWindow",
  props: {
    ctx: {
      type: Object as PropType<Record<string, unknown>>,
      required: true
    }
  },
  data() {
    return {
      salesHistoryRenderCount: SALES_HISTORY_INITIAL_RENDER_COUNT,
      liveForecastScenarioIndex: 0
    };
  },
  computed: {
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
      return `${format(soldPacks / packsPerBox)} / ${format(totalPacks / packsPerBox)} boxes`;
    },

    salesHistorySummaryLabel(this: Record<string, unknown>): string {
      return `${this.salesHistorySoldPercent.toFixed(1)}%`;
    },

    salesHistorySoldPercent(this: Record<string, unknown>): number {
      const lotType = String(this.currentLotType || "bulk");
      if (lotType === "singles") {
        const trackedTotal = Math.max(0, Number(this.singlesTrackedTotalCount) || 0);
        const trackedSold = Math.max(0, Number(this.singlesTrackedSoldCount) || 0);
        return trackedTotal > 0 ? (trackedSold / trackedTotal) * 100 : 0;
      }
      return Math.max(0, Number(this.salesProgress) || 0);
    },

    salesStatusSummaryLine(this: Record<string, unknown>): string {
      return `Rev $${this.fmtCurrency(this.salesStatus?.revenue ?? 0)} • Cost $${this.fmtCurrency(this.totalCaseCost)}`;
    },

    salesStatusProgressLine(this: Record<string, unknown>): string {
      const lotType = String(this.currentLotType || "bulk");
      if (lotType === "singles") {
        const trackedSold = Math.max(0, Number(this.singlesTrackedSoldCount) || 0);
        const trackedTotal = Math.max(0, Number(this.singlesTrackedTotalCount) || 0);
        const parts = [`${trackedSold} / ${trackedTotal} items`];
        const unlinkedSold = Math.max(0, Number(this.singlesUnlinkedSoldCount) || 0);
        if (unlinkedSold > 0) {
          parts.push(`${unlinkedSold} unlinked`);
        }
        return parts.join(" • ");
      }

      const soldPacks = Math.max(0, Number(this.soldPacksCount) || 0);
      const totalPacks = Math.max(0, Number(this.totalPacks) || 0);
      const parts: string[] = [];
      if (this.bulkBoxProgressText) {
        parts.push(this.bulkBoxProgressText);
      }
      parts.push(`${soldPacks} / ${totalPacks} items`);
      return parts.join(" • ");
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
      const fn = (this as Record<string, unknown>).formatCurrency;
      if (typeof fn === "function") {
        return (fn as (v: number | null | undefined, d?: number) => string)(value, decimals);
      }
      if (value == null || Number.isNaN(Number(value))) return "0.00";
      return Number(value).toFixed(decimals);
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
          return uniqueIds.length > 1 ? `${uniqueIds.length} items` : "";
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
        ? (quantity === 1 ? "box" : "boxes")
        : sale.type === "rtyh"
          ? "RTYH"
          : (quantity === 1 ? "item" : "items");
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
  setup(props: { ctx: Record<string, unknown> }) {
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (injectedCtx ?? props.ctx) as Record<string, unknown>;
    return createWindowContextBridge(source);
  },
  template
};
