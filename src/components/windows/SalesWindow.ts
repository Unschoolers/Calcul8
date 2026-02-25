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
    visibleSortedSales(): Sale[] {
      const sales = Array.isArray(this.sortedSales) ? this.sortedSales as Sale[] : [];
      const limit = Math.max(0, Number(this.salesHistoryRenderCount) || 0);
      return sales.slice(0, limit);
    },

    hasMoreSalesHistory(): boolean {
      const totalCount = Array.isArray(this.sortedSales) ? this.sortedSales.length : 0;
      return totalCount > (this.visibleSortedSales as Sale[]).length;
    },

    remainingSalesHistoryCount(): number {
      const totalCount = Array.isArray(this.sortedSales) ? this.sortedSales.length : 0;
      return Math.max(0, totalCount - (this.visibleSortedSales as Sale[]).length);
    },

    nextSalesHistoryBatchCount(): number {
      return Math.min(SALES_HISTORY_RENDER_BATCH_SIZE, this.remainingSalesHistoryCount);
    }
  },
  watch: {
    currentLotId() {
      this.resetSalesHistoryRenderCount();
    },
    currentLotType() {
      this.resetSalesHistoryRenderCount();
    }
  },
  methods: {
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
      if (lotType !== "singles") {
        return `${sale.quantity}x ${sale.type.toUpperCase()} @ $${this.fmtCurrency(sale.price)}`;
      }

      const linkedLabel = this.getLinkedSinglesSaleLabel(sale);
      if (linkedLabel) {
        return `${sale.quantity}x ${linkedLabel} • Total $${this.fmtCurrency(sale.price)}`;
      }
      return `${sale.quantity}x CARD • Total $${this.fmtCurrency(sale.price)}`;
    },

    resetSalesHistoryRenderCount(): void {
      this.salesHistoryRenderCount = SALES_HISTORY_INITIAL_RENDER_COUNT;
    },

    loadMoreSalesHistory(): void {
      this.salesHistoryRenderCount += SALES_HISTORY_RENDER_BATCH_SIZE;
    }
  },
  mounted() {
    this.resetSalesHistoryRenderCount();
  },
  setup(props: { ctx: Record<string, unknown> }) {
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (injectedCtx ?? props.ctx) as Record<string, unknown>;
    return createWindowContextBridge(source);
  },
  template
};
