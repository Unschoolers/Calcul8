import { inject, type PropType } from "vue";
import { createWindowContextBridge } from "../contextBridge.ts";
import type { WhatnotImportReviewRow, WhatnotMappedSaleType } from "../../../types/app.ts";

function normalizeWhatnotGroupValue(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function getWhatnotRowGroupKey(row: WhatnotImportReviewRow): string | null {
  const variantId = normalizeWhatnotGroupValue(row.variantId);
  if (variantId) return `variant:${variantId}`;
  const productId = normalizeWhatnotGroupValue(row.productId);
  if (productId) return `product:${productId}`;
  const listingId = normalizeWhatnotGroupValue(row.listingId);
  if (listingId) return `listing:${listingId}`;
  const sku = normalizeWhatnotGroupValue(row.sku);
  if (sku) return `sku:${sku}`;
  const title = normalizeWhatnotGroupValue(row.title);
  const category = normalizeWhatnotGroupValue(row.productCategory);
  if (title && category) return `title-category:${title}::${category}`;
  if (title) return `title:${title}`;
  return null;
}

function titleCaseWords(value: string): string {
  return value
    .split(" ")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatWhatnotOrderStatus(value: string): string {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return "";
  const explicitLabels: Record<string, string> = {
    PENDING: "Pending",
    CREATED: "Created",
    PROCESSING: "Processing",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
    FAILED: "Failed",
    ORDER_EARNINGS: "Order earnings",
    ORDER_REFUND: "Order refund",
    SHIPPING_LABEL: "Shipping label",
    ADJUSTMENT: "Adjustment"
  };
  if (explicitLabels[normalized]) {
    return explicitLabels[normalized];
  }
  return titleCaseWords(normalized.toLowerCase().replace(/_/g, " "));
}

export const WhatnotReviewDialog = {
  name: "WhatnotReviewDialog",
  props: {
    ctx: {
      type: Object as PropType<Record<string, unknown> | null>,
      required: false,
      default: (): null => null
    }
  },
  setup(props: { ctx: Record<string, unknown> | null }) {
    const injectedCtx = inject<Record<string, unknown> | null>("appCtx", null);
    const source = (injectedCtx ?? props.ctx ?? {}) as Record<string, unknown>;
    return createWindowContextBridge(source);
  },
  methods: {
    whatnotOrderStatusLabel(rawStatus: string): string {
      return formatWhatnotOrderStatus(rawStatus);
    },

    whatnotSimilarRowCount(this: any, row: WhatnotImportReviewRow): number {
      const groupKey = getWhatnotRowGroupKey(row);
      if (!groupKey) return 1;
      return this.whatnotReviewRows.filter((candidate: WhatnotImportReviewRow) => getWhatnotRowGroupKey(candidate) === groupKey).length;
    },

    applyWhatnotSelectionToSimilarRows(
      this: any,
      row: WhatnotImportReviewRow,
      changes: {
        selectedLotId?: number | null;
        selectedSaleType?: WhatnotMappedSaleType | null;
        selectedPacksCount?: number | null;
      }
    ): void {
      const groupKey = getWhatnotRowGroupKey(row);
      if (!groupKey) return;
      for (const candidate of this.whatnotReviewRows as WhatnotImportReviewRow[]) {
        if (candidate.rowId === row.rowId) continue;
        if (getWhatnotRowGroupKey(candidate) !== groupKey) continue;
        if ("selectedLotId" in changes) {
          candidate.selectedLotId = changes.selectedLotId ?? null;
        }
        if ("selectedSaleType" in changes) {
          candidate.selectedSaleType = changes.selectedSaleType ?? null;
        }
        if ("selectedPacksCount" in changes) {
          candidate.selectedPacksCount = changes.selectedPacksCount ?? null;
        }
      }
    },

    handleWhatnotLotSelection(this: any, row: WhatnotImportReviewRow, value: number | null): void {
      row.selectedLotId = value;
      const selectedLot = this.lotItems.find((lot: { value: number; lotType?: string }) => lot.value === value);
      if (selectedLot?.lotType === "singles") {
        row.selectedSaleType = "pack";
      } else if (!row.selectedSaleType) {
        row.selectedSaleType = row.suggestedSaleType || "pack";
      }
      this.applyWhatnotSelectionToSimilarRows(row, {
        selectedLotId: row.selectedLotId,
        selectedSaleType: row.selectedSaleType
      });
    },

    handleWhatnotSaleTypeSelection(this: any, row: WhatnotImportReviewRow, value: WhatnotMappedSaleType | null): void {
      row.selectedSaleType = value;
      this.applyWhatnotSelectionToSimilarRows(row, {
        selectedSaleType: row.selectedSaleType
      });
    },

    handleWhatnotPacksCountChange(this: any, row: WhatnotImportReviewRow, value: number | null): void {
      row.selectedPacksCount = value == null ? null : Math.max(1, Math.floor(Number(value) || 0)) || null;
      this.applyWhatnotSelectionToSimilarRows(row, {
        selectedPacksCount: row.selectedPacksCount
      });
    }
  }
};
