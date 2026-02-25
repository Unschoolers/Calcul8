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
      salesHistoryRenderCount: SALES_HISTORY_INITIAL_RENDER_COUNT
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

    fmtCurrency(value: number | null | undefined, decimals = 2): string {
      const fn = (this as Record<string, unknown>).formatCurrency;
      if (typeof fn === "function") {
        return (fn as (v: number | null | undefined, d?: number) => string)(value, decimals);
      }
      if (value == null || Number.isNaN(Number(value))) return "0.00";
      return Number(value).toFixed(decimals);
    },

    isUnlinkedSinglesSale(sale: Sale): boolean {
      const lotType = (this as Record<string, unknown>).currentLotType;
      if (lotType !== "singles") return false;

      const rawId = Number(sale?.singlesPurchaseEntryId);
      if (!Number.isFinite(rawId) || rawId <= 0) return true;

      const entryId = Math.floor(rawId);
      const entries = ((this as Record<string, unknown>).singlesPurchases || []) as SinglesPurchaseEntry[];
      return !entries.some((entry) => Number(entry.id) === entryId);
    },

    getLinkedSinglesSaleLabel(sale: Sale): string {
      const lotType = (this as Record<string, unknown>).currentLotType;
      if (lotType !== "singles") return "";

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
      const isMobile = Boolean(
        ((this as Record<string, unknown>).$vuetify as { display?: { smAndDown?: boolean } } | undefined)
          ?.display
          ?.smAndDown
      );
      const priceLabel = isMobile ? `$${this.fmtCurrency(sale.price)}` : `Total $${this.fmtCurrency(sale.price)}`;
      if (lotType !== "singles") {
        return `${sale.quantity}x ${sale.type.toUpperCase()} @ $${this.fmtCurrency(sale.price)}`;
      }

      const linkedLabel = this.getLinkedSinglesSaleLabel(sale);
      if (linkedLabel) {
        return `${sale.quantity}x ${linkedLabel} • ${priceLabel}`;
      }
      return `${sale.quantity}x CARD • ${priceLabel}`;
    },

    resetSalesHistoryRenderCount(): void {
      const vm = this as Record<string, unknown> & { salesHistoryRenderCount?: number };
      vm.salesHistoryRenderCount = SALES_HISTORY_INITIAL_RENDER_COUNT;
    },

    loadMoreSalesHistory(): void {
      const vm = this as Record<string, unknown> & { salesHistoryRenderCount?: number };
      vm.salesHistoryRenderCount = Number(vm.salesHistoryRenderCount || 0) + SALES_HISTORY_RENDER_BATCH_SIZE;
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
