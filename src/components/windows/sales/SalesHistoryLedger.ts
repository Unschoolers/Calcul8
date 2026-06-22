import { defineComponent, type PropType } from "vue";
import type { Sale } from "../../../types/app.ts";
import AppActionButton from "../../ui/AppActionButton.vue";
import AppMetricValue from "../../ui/AppMetricValue.vue";

type SortDirection = "asc" | "desc";
type SortKey = "units" | "type" | "price" | "profit" | "date" | "customer";

type SaleProfitPreviewLike = {
  value: number;
  sign: string;
  basisLabel: string;
  marketBasisValue?: number;
  allCostValue?: number;
} | null;

function saleUnits(sale: Sale): number {
  return Math.max(0, Number(sale.quantity) || 0);
}

function saleDateValue(sale: Sale): number {
  const parsed = Date.parse(String(sale.date || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function ledgerSortValue(
  ctx: {
    calculateSaleProfit: (sale: Sale) => number;
    getSaleProfitPreview: (sale: Sale) => SaleProfitPreviewLike;
  },
  sale: Sale,
  key: SortKey
): number | string {
  if (key === "date") return saleDateValue(sale);
  if (key === "units") return saleUnits(sale);
  if (key === "type") return sale.type;
  if (key === "price") return Number(sale.price) || 0;
  if (key === "customer") return String(sale.customer || "").toLocaleLowerCase();
  return Number(ctx.getSaleProfitPreview(sale)?.value ?? ctx.calculateSaleProfit(sale)) || 0;
}

export const SalesHistoryLedgerDefinition = defineComponent({
  name: "SalesHistoryLedger",
  components: {
    AppActionButton,
    AppMetricValue
  },
  props: {
    sales: {
      type: Array as PropType<Sale[]>,
      required: true
    },
    hasMore: {
      type: Boolean,
      default: false
    },
    nextBatchCount: {
      type: Number,
      default: 0
    },
    remainingCount: {
      type: Number,
      default: 0
    },
    t: {
      type: Function as PropType<(key: string) => string>,
      required: true
    },
    formatDate: {
      type: Function as PropType<(date: string) => string>,
      required: true
    },
    fmtCurrency: {
      type: Function as PropType<(value: number | null | undefined, decimals?: number) => string>,
      required: true
    },
    fmtUnits: {
      type: Function as PropType<(value: number | null | undefined) => string>,
      required: true
    },
    getSaleIcon: {
      type: Function as PropType<(type: Sale["type"]) => string>,
      required: true
    },
    getSaleColor: {
      type: Function as PropType<(type: Sale["type"]) => string>,
      required: true
    },
    calculateSaleProfit: {
      type: Function as PropType<(sale: Sale) => number>,
      required: true
    },
    getSaleProfitPreview: {
      type: Function as PropType<(sale: Sale) => SaleProfitPreviewLike>,
      required: true
    },
    isUnlinkedSinglesSale: {
      type: Function as PropType<(sale: Sale) => boolean>,
      required: true
    }
  },
  emits: ["edit", "delete", "load-more", "open-buyer"],
  data(): { sortKey: SortKey; sortDirection: SortDirection } {
    return {
      sortKey: "date",
      sortDirection: "desc"
    };
  },
  computed: {
    sortedLedgerSales(this: {
      sales?: Sale[];
      sortKey: SortKey;
      sortDirection: SortDirection;
      calculateSaleProfit: (sale: Sale) => number;
      getSaleProfitPreview: (sale: Sale) => SaleProfitPreviewLike;
    }): Sale[] {
      const direction = this.sortDirection === "asc" ? 1 : -1;
      return [...(Array.isArray(this.sales) ? this.sales : [])].sort((left, right) => {
        const leftValue = ledgerSortValue(this, left, this.sortKey);
        const rightValue = ledgerSortValue(this, right, this.sortKey);
        if (typeof leftValue === "string" || typeof rightValue === "string") {
          return String(leftValue).localeCompare(String(rightValue)) * direction;
        }
        if (leftValue === rightValue) {
          return (saleDateValue(right) - saleDateValue(left)) || (right.id - left.id);
        }
        return ((Number(leftValue) || 0) - (Number(rightValue) || 0)) * direction;
      });
    },
    sortOptions(this: { t: (key: string) => string }): Array<{ key: SortKey; label: string }> {
      return [
        { key: "units", label: this.t("salesHistorySortUnitsLabel") },
        { key: "type", label: this.t("salesHistorySortTypeLabel") },
        { key: "price", label: this.t("salesHistorySortPriceLabel") },
        { key: "profit", label: this.t("salesHistorySortProfitLabel") },
        { key: "date", label: this.t("salesHistorySortDateLabel") },
        { key: "customer", label: this.t("salesHistorySortCustomerLabel") }
      ];
    }
  },
  methods: {
    setSort(this: { sortKey: SortKey; sortDirection: SortDirection }, key: SortKey): void {
      if (this.sortKey === key) {
        this.sortDirection = this.sortDirection === "asc" ? "desc" : "asc";
        return;
      }
      this.sortKey = key;
      this.sortDirection = key === "customer" ? "asc" : "desc";
    },
    sortValue(
      this: {
        calculateSaleProfit: (sale: Sale) => number;
        getSaleProfitPreview: (sale: Sale) => SaleProfitPreviewLike;
      },
      sale: Sale,
      key: SortKey
    ): number | string {
      return ledgerSortValue(this, sale, key);
    },
    sortIcon(this: { sortKey: SortKey; sortDirection: SortDirection }, key: SortKey): string {
      if (this.sortKey !== key) return "mdi-swap-vertical";
      return this.sortDirection === "asc" ? "mdi-arrow-up" : "mdi-arrow-down";
    },
    sortButtonClass(this: { sortKey: SortKey }, key: SortKey): Record<string, boolean> {
      return {
        "is-active": this.sortKey === key
      };
    },
    saleUnitsLabel(sale: Sale): string {
      const unitsLabel = this.fmtUnits(saleUnits(sale));
      if (sale.type !== "rtyh") return unitsLabel;

      const soldItemCount = Math.max(0, Number(sale.packsCount) || 0);
      if (soldItemCount <= 0) return unitsLabel;
      return this.fmtUnits(soldItemCount);
    },
    saleTypeText(sale: Sale): string {
      if (sale.type === "box") return this.t("salesHistoryTypeBoxesLabel");
      if (sale.type === "rtyh") return this.t("salesHistoryTypeRandomHitLabel");
      if (sale.type === "wheel") return this.t("salesHistoryTypeWheelLabel");
      return this.t("salesHistoryTypeSinglesLabel");
    },
    saleTypeIcon(sale: Sale): string {
      return this.getSaleIcon(sale.type);
    },
    saleCustomerLabel(sale: Sale): string {
      const customer = String(sale.customer || "").trim();
      return customer || this.t("salesHistoryNoCustomerLabel");
    },
    hasNamedCustomer(sale: Sale): boolean {
      return String(sale.customer || "").trim().length > 0;
    },
    saleRevenueLabel(sale: Sale): string {
      return `$${this.fmtCurrency(Number(sale.price) || 0)}`;
    },
    saleProfitPreview(sale: Sale): SaleProfitPreviewLike {
      return this.getSaleProfitPreview(sale);
    },
    saleProfitValue(sale: Sale): number {
      return Number(this.saleProfitPreview(sale)?.value ?? this.calculateSaleProfit(sale)) || 0;
    },
    saleProfitTone(sale: Sale): "positive" | "negative" {
      return this.saleProfitValue(sale) >= 0 ? "positive" : "negative";
    },
    saleProfitLabel(sale: Sale): string {
      const preview = this.saleProfitPreview(sale);
      const value = Number(preview?.value ?? this.calculateSaleProfit(sale)) || 0;
      const prefix = preview ? preview.sign : value >= 0 ? "+" : "-";
      const basis = preview ? ` ${this.t("salesProfitVsLabel")} ${preview.basisLabel}` : "";
      return `${prefix}$${this.fmtCurrency(Math.abs(value))}${basis}`;
    },
    saleSecondaryProfitLabel(sale: Sale): string {
      const preview = this.saleProfitPreview(sale);
      if (!preview || Number(preview.marketBasisValue) <= 0) return "";
      const value = Number(preview.allCostValue) || 0;
      const sign = value >= 0 ? "+" : "-";
      return `${sign}$${this.fmtCurrency(Math.abs(value))} ${this.t("salesProfitVsCostLabel")}`;
    }
  }
});
