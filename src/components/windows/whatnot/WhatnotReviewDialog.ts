import { inject, type PropType } from "vue";
import { createWindowContextBridge } from "../shared/contextBridge.ts";
import { translateAppMessage } from "../../../app-core/i18n/index.ts";
import {
  buildWhatnotReviewChangeDiffs,
  buildWhatnotReviewDecisionSummary,
  hasStableWhatnotReviewIdentity,
  resolveWhatnotSelectedImportAction,
  type WhatnotReviewChangeDiff
} from "../../../app-core/methods/ui/whatnot/whatnot-review-decisions.ts";
import { isSinglesLot } from "../../../app-core/shared/lot-types.ts";
import type {
  Sale,
  WhatnotImportReviewRow,
  WhatnotImportDecisionKind,
  WhatnotManualDuplicateCandidate,
  WhatnotMappedSaleType,
  WhatnotReviewImportAction
} from "../../../types/app.ts";

function normalizeWhatnotGroupValue(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function formatWhatnotLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeWhatnotGroupDate(value: unknown): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return trimmed.slice(0, 10);
  }
  return formatWhatnotLocalDate(parsed);
}

function moneyClose(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.01;
}

function getWhatnotFallbackGroupKey(row: WhatnotImportReviewRow): string | null {
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

function getWhatnotRowGroupKey(row: WhatnotImportReviewRow): string | null {
  const buyerName = normalizeWhatnotGroupValue(row.buyerName);
  const listingTitle = normalizeWhatnotGroupValue(row.listingTitle ?? row.title);
  const orderDate = normalizeWhatnotGroupDate(row.orderPlacedAt ?? row.date);
  if (buyerName && listingTitle && orderDate) {
    return `buyer:${buyerName}::date:${orderDate}::listing:${listingTitle}`;
  }
  return getWhatnotFallbackGroupKey(row);
}

function titleCaseWords(value: string): string {
  return value
    .split(" ")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function translateWhatnotMessage(preferredLanguage: string, key: string, params?: Record<string, string | number>): string {
  return translateAppMessage(preferredLanguage, key, params);
}

function getWhatnotPreferredLanguage(context: Record<string, unknown> | null | undefined): string {
  return String(context?.preferredLanguage ?? "");
}

function formatWhatnotOrderStatus(value: string, preferredLanguage: string): string {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return "";
  const explicitLabels: Record<string, string> = {
    PENDING: translateWhatnotMessage(preferredLanguage, "whatnotReviewStatusPending"),
    CREATED: translateWhatnotMessage(preferredLanguage, "whatnotReviewStatusCreated"),
    PROCESSING: translateWhatnotMessage(preferredLanguage, "whatnotReviewStatusProcessing"),
    COMPLETED: translateWhatnotMessage(preferredLanguage, "whatnotReviewStatusCompleted"),
    CANCELLED: translateWhatnotMessage(preferredLanguage, "whatnotReviewStatusCancelled"),
    FAILED: translateWhatnotMessage(preferredLanguage, "whatnotReviewStatusFailed"),
    ORDER_EARNINGS: translateWhatnotMessage(preferredLanguage, "whatnotReviewStatusOrderEarnings"),
    ORDER_REFUND: translateWhatnotMessage(preferredLanguage, "whatnotReviewStatusOrderRefund"),
    SHIPPING_LABEL: translateWhatnotMessage(preferredLanguage, "whatnotReviewStatusShippingLabel"),
    ADJUSTMENT: translateWhatnotMessage(preferredLanguage, "whatnotReviewStatusAdjustment")
  };
  if (explicitLabels[normalized]) {
    return explicitLabels[normalized];
  }
  return titleCaseWords(normalized.toLowerCase().replace(/_/g, " "));
}

function formatWhatnotReviewAction(value: WhatnotReviewImportAction | null | undefined, preferredLanguage: string): string {
  if (value === "update_existing") return translateWhatnotMessage(preferredLanguage, "whatnotReviewActionUpdateExistingLabel");
  if (value === "split_group") return translateWhatnotMessage(preferredLanguage, "whatnotReviewActionSplitGroupLabel");
  if (value === "skip") return translateWhatnotMessage(preferredLanguage, "whatnotReviewActionSkipLabel");
  return translateWhatnotMessage(preferredLanguage, "whatnotReviewActionCreateLabel");
}

function formatWhatnotReviewActionHint(value: WhatnotReviewImportAction | null | undefined, preferredLanguage: string): string {
  if (value === "update_existing") return translateWhatnotMessage(preferredLanguage, "whatnotReviewActionUpdateExistingHint");
  if (value === "split_group") return translateWhatnotMessage(preferredLanguage, "whatnotReviewActionSplitGroupHint");
  if (value === "skip") return translateWhatnotMessage(preferredLanguage, "whatnotReviewActionSkipHint");
  return translateWhatnotMessage(preferredLanguage, "whatnotReviewActionCreateHint");
}

function formatWhatnotAutomaticAction(value: WhatnotImportReviewRow["action"], preferredLanguage: string): string {
  if (value === "update") return translateWhatnotMessage(preferredLanguage, "whatnotReviewAutoUpdateLabel");
  if (value === "skip") return translateWhatnotMessage(preferredLanguage, "whatnotReviewAutoSkipLabel");
  return translateWhatnotMessage(preferredLanguage, "whatnotReviewAutoCreateLabel");
}

function formatWhatnotCandidateSummary(candidate: WhatnotManualDuplicateCandidate, preferredLanguage: string): string {
  const parts = [
    candidate.saleSummary.date,
    `$${candidate.saleSummary.price.toFixed(2)}`,
    `${candidate.saleSummary.quantity} ${translateWhatnotMessage(preferredLanguage, "saleEditorQtyShortLabel")}`,
    `${candidate.saleSummary.packsCount} ${translateWhatnotMessage(preferredLanguage, "salesItemsLabel")}`
  ].filter((part) => part.trim().length > 0);
  return parts.join(" • ");
}

function formatWhatnotCandidateTarget(candidate: WhatnotManualDuplicateCandidate): string {
  const customer = candidate.saleSummary.customer?.trim();
  const memo = candidate.saleSummary.memo?.trim();
  if (customer && memo) return `${customer} • ${memo}`;
  if (customer) return customer;
  if (memo) return memo;
  return candidate.saleId;
}

function getSaleEffectiveTotal(sale: Sale): number {
  return sale.priceIsTotal ? sale.price : sale.price * sale.quantity;
}

function getSaleCustomerValue(sale: Sale): string {
  return String(sale.customer ?? sale.memo ?? "").trim();
}

function findWhatnotReviewTargetSale(
  context: Record<string, unknown>,
  row: WhatnotImportReviewRow
): Sale | null {
  const selectedLotId = Number(row.selectedLotId ?? row.suggestedLotId ?? 0);
  if (!Number.isFinite(selectedLotId) || selectedLotId <= 0) return null;

  const targetSaleId = String(row.targetSaleId ?? row.manualDuplicateCandidate?.saleId ?? row.existingSaleId ?? "").trim();
  if (!targetSaleId) return null;

  const loadSalesForLotId = context.loadSalesForLotId;
  if (typeof loadSalesForLotId !== "function") return null;

  const sales = loadSalesForLotId.call(context, selectedLotId);
  if (!Array.isArray(sales)) return null;
  return (sales as Sale[]).find((sale) => String(sale.id ?? "").trim() === targetSaleId) ?? null;
}

type WhatnotReviewSelectionChanges = {
  selectedLotId?: number | null;
  selectedSaleType?: WhatnotMappedSaleType | null;
  selectedPacksCount?: number | null;
  selectedImportAction?: WhatnotReviewImportAction;
  targetKind?: WhatnotImportDecisionKind | null;
  targetSaleId?: string | null;
  skipImport?: boolean;
};

function getWhatnotSelectedLotId(row: WhatnotImportReviewRow): number {
  const selectedLotId = Number(row.selectedLotId ?? row.suggestedLotId ?? 0);
  return Number.isFinite(selectedLotId) && selectedLotId > 0 ? selectedLotId : 0;
}

function getWhatnotManualCandidateSaleId(row: WhatnotImportReviewRow): string {
  return String(row.manualDuplicateCandidate?.saleId ?? row.targetSaleId ?? "").trim();
}

function applyWhatnotRowSelectionChanges(
  row: WhatnotImportReviewRow,
  changes: WhatnotReviewSelectionChanges
): void {
  if ("selectedLotId" in changes) {
    row.selectedLotId = changes.selectedLotId ?? null;
  }
  if ("selectedSaleType" in changes) {
    row.selectedSaleType = changes.selectedSaleType ?? null;
  }
  if ("selectedPacksCount" in changes) {
    row.selectedPacksCount = changes.selectedPacksCount ?? null;
  }
  if ("selectedImportAction" in changes) {
    row.selectedImportAction = changes.selectedImportAction;
  }
  if ("targetKind" in changes) {
    row.targetKind = changes.targetKind ?? null;
  }
  if ("targetSaleId" in changes) {
    row.targetSaleId = changes.targetSaleId ?? null;
  }
  if ("skipImport" in changes) {
    row.skipImport = changes.skipImport ?? false;
  }
}

function resolveWhatnotBuyerLabel(row: WhatnotImportReviewRow, preferredLanguage: string): string {
  const buyerName = String(row.buyerName ?? "").trim();
  if (buyerName) return buyerName;

  const candidateCustomer = String(row.manualDuplicateCandidate?.saleSummary.customer ?? "").trim();
  if (candidateCustomer) return candidateCustomer;

  return translateWhatnotMessage(preferredLanguage, "whatnotReviewUnknownBuyer");
}

function buildWhatnotCandidateFromSale(
  sale: Sale,
  score: number,
  reasons: string[]
): WhatnotManualDuplicateCandidate {
  return {
    saleId: String(sale.id ?? "").trim(),
    confidence: score >= 80 ? "high" : "medium",
    reasonSummary: reasons.join("; "),
    saleSummary: {
      date: sale.date,
      price: Number(sale.price) || 0,
      quantity: Math.max(0, Math.floor(Number(sale.quantity) || 0)),
      packsCount: Math.max(0, Math.floor(Number(sale.packsCount) || 0)),
      customer: String(sale.customer ?? "").trim() || undefined,
      memo: String(sale.memo ?? "").trim() || undefined
    }
  };
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
  computed: {
    whatnotReviewGroups(this: any): Array<{
      key: string;
      buyerLabel: string;
      listingLabel: string;
      orderDateLabel: string;
      rows: WhatnotImportReviewRow[];
      }> {
      const preferredLanguage = getWhatnotPreferredLanguage(this);
      const rows = Array.isArray(this.whatnotReviewRows) ? [...this.whatnotReviewRows] as WhatnotImportReviewRow[] : [];
      rows.sort((left, right) => {
        const leftBuyer = resolveWhatnotBuyerLabel(left, preferredLanguage).toLowerCase();
        const rightBuyer = resolveWhatnotBuyerLabel(right, preferredLanguage).toLowerCase();
        if (leftBuyer !== rightBuyer) return leftBuyer.localeCompare(rightBuyer);

        const leftDate = String(left.orderPlacedAt ?? left.date ?? "").trim();
        const rightDate = String(right.orderPlacedAt ?? right.date ?? "").trim();
        if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);

        const leftListing = String(left.listingTitle ?? left.title ?? "").trim().toLowerCase();
        const rightListing = String(right.listingTitle ?? right.title ?? "").trim().toLowerCase();
        if (leftListing !== rightListing) return leftListing.localeCompare(rightListing);

        return String(left.externalOrderId ?? left.rowId ?? "").localeCompare(String(right.externalOrderId ?? right.rowId ?? ""));
      });

      const groups: Array<{
        key: string;
        buyerLabel: string;
        listingLabel: string;
        orderDateLabel: string;
        rows: WhatnotImportReviewRow[];
      }> = [];

      for (const row of rows) {
        const key = getWhatnotRowGroupKey(row) ?? `row:${row.rowId}`;
        const lastGroup = groups[groups.length - 1];
        if (!lastGroup || lastGroup.key !== key) {
          groups.push({
            key,
            buyerLabel: resolveWhatnotBuyerLabel(row, preferredLanguage),
            listingLabel: String(row.listingTitle ?? row.title ?? "").trim() || translateWhatnotMessage(preferredLanguage, "whatnotReviewUntitledListing"),
            orderDateLabel: String(row.orderPlacedAt ?? row.date ?? "").trim() || "",
            rows: [row]
          });
          continue;
        }
        lastGroup.rows.push(row);
        if (lastGroup.buyerLabel === translateWhatnotMessage(preferredLanguage, "whatnotReviewUnknownBuyer")) {
          lastGroup.buyerLabel = resolveWhatnotBuyerLabel(row, preferredLanguage);
        }
      }

      return groups;
    },

    whatnotReviewDecisionSummary(this: any) {
      return buildWhatnotReviewDecisionSummary(Array.isArray(this.whatnotReviewRows) ? this.whatnotReviewRows as WhatnotImportReviewRow[] : []);
    }
  },
  methods: {
    whatnotOrderStatusLabel(this: any, rawStatus: string): string {
      return formatWhatnotOrderStatus(rawStatus, getWhatnotPreferredLanguage(this));
    },

    whatnotImportActionLabel(this: any, action: WhatnotReviewImportAction | null | undefined): string {
      return formatWhatnotReviewAction(action, getWhatnotPreferredLanguage(this));
    },

    whatnotImportActionHint(this: any, action: WhatnotReviewImportAction | null | undefined): string {
      return formatWhatnotReviewActionHint(action, getWhatnotPreferredLanguage(this));
    },

    whatnotReviewActionColor(action: WhatnotReviewImportAction | null | undefined): string {
      if (action === "update_existing") return "warning";
      if (action === "split_group") return "info";
      if (action === "skip") return "default";
      return "success";
    },

    whatnotSelectedImportAction(this: any, row: WhatnotImportReviewRow): WhatnotReviewImportAction {
      return resolveWhatnotSelectedImportAction(row);
    },

    whatnotSelectedImportActionLabel(this: any, row: WhatnotImportReviewRow): string {
      return formatWhatnotReviewAction(this.whatnotSelectedImportAction(row), getWhatnotPreferredLanguage(this));
    },

    whatnotSelectedImportActionHint(this: any, row: WhatnotImportReviewRow): string {
      return formatWhatnotReviewActionHint(this.whatnotSelectedImportAction(row), getWhatnotPreferredLanguage(this));
    },

    buildWhatnotClientManualDuplicateCandidates(this: any, row: WhatnotImportReviewRow): WhatnotManualDuplicateCandidate[] {
      const selectedLotId = Number(row.selectedLotId ?? row.suggestedLotId ?? 0);
      if (!Number.isFinite(selectedLotId) || selectedLotId <= 0) {
        return row.manualDuplicateCandidate ? [row.manualDuplicateCandidate] : [];
      }

      const sales = typeof this.loadSalesForLotId === "function"
        ? this.loadSalesForLotId(selectedLotId) as Sale[]
        : [];
      if (!Array.isArray(sales) || sales.length === 0) {
        return row.manualDuplicateCandidate ? [row.manualDuplicateCandidate] : [];
      }

      const groupKey = getWhatnotRowGroupKey(row);
      const groupedRows = Array.isArray(this.whatnotReviewRows)
        ? (this.whatnotReviewRows as WhatnotImportReviewRow[]).filter((candidate) => (
          Number(candidate.selectedLotId ?? candidate.suggestedLotId ?? 0) === selectedLotId
          && getWhatnotRowGroupKey(candidate) === groupKey
        ))
        : [row];
      const effectiveRows = groupedRows.length > 0 ? groupedRows : [row];
      const groupedQuantity = effectiveRows.reduce((sum, candidate) => sum + Math.max(1, Math.floor(Number(candidate.quantity) || 1)), 0);
      const groupedTotal = effectiveRows.reduce((sum, candidate) => sum + (Number(candidate.price) || 0), 0);
      const groupedDate = normalizeWhatnotGroupDate(row.orderPlacedAt ?? row.date);
      const groupedBuyer = normalizeWhatnotGroupValue(row.buyerName);
      const matches: Array<{ candidate: WhatnotManualDuplicateCandidate; score: number }> = [];

      for (const sale of sales) {
        if (!sale) continue;
        if (normalizeWhatnotGroupDate(sale.date) !== groupedDate) continue;
        if (Math.max(0, Math.floor(Number(sale.quantity) || 0)) !== groupedQuantity) continue;
        if (!moneyClose(getSaleEffectiveTotal(sale), groupedTotal)) continue;

        let score = 60;
        const reasons = [translateWhatnotMessage(getWhatnotPreferredLanguage(this), "whatnotReviewExactMatchReason")];
        const saleCustomer = normalizeWhatnotGroupValue(getSaleCustomerValue(sale));
        if (groupedBuyer && saleCustomer && groupedBuyer === saleCustomer) {
          score += 25;
          reasons.push(translateWhatnotMessage(getWhatnotPreferredLanguage(this), "whatnotReviewBuyerMatchesCustomerReason"));
        } else if (groupedBuyer) {
          reasons.push(translateWhatnotMessage(getWhatnotPreferredLanguage(this), "whatnotReviewBuyerAvailableReason"));
        }
        matches.push({
          candidate: buildWhatnotCandidateFromSale(sale, score, reasons),
          score
        });
      }

      matches.sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return left.candidate.saleId.localeCompare(right.candidate.saleId);
      });
      return matches.map((entry) => entry.candidate);
    },

    buildWhatnotClientManualDuplicateCandidate(this: any, row: WhatnotImportReviewRow): WhatnotManualDuplicateCandidate | null {
      return this.buildWhatnotClientManualDuplicateCandidates(row)[0] ?? null;
    },

    whatnotManualDuplicateCandidateOptions(this: any, row: WhatnotImportReviewRow): Array<{ title: string; value: string }> {
      return this.buildWhatnotClientManualDuplicateCandidates(row).map((candidate: WhatnotManualDuplicateCandidate) => ({
        title: `${candidate.saleId} • ${formatWhatnotCandidateTarget(candidate)} • ${formatWhatnotCandidateSummary(candidate, getWhatnotPreferredLanguage(this))}`,
        value: candidate.saleId
      }));
    },

    syncWhatnotManualDuplicateCandidate(this: any, row: WhatnotImportReviewRow): void {
      if (row.existingSaleId) return;

      const candidate = this.buildWhatnotClientManualDuplicateCandidate(row);
      row.manualDuplicateCandidate = candidate;

      if (candidate) {
        if (row.targetKind == null || row.targetKind === "new" || row.targetKind === "manual_candidate") {
          row.targetKind = this.whatnotSelectedImportAction(row) === "update_existing" ? "manual_candidate" : row.targetKind ?? "new";
          const candidateOptions = this.buildWhatnotClientManualDuplicateCandidates(row);
          const requestedSaleId = String(row.targetSaleId ?? "").trim();
          const hasRequestedSaleId = candidateOptions.some((entry: WhatnotManualDuplicateCandidate) => entry.saleId === requestedSaleId);
          row.targetSaleId = this.whatnotSelectedImportAction(row) === "update_existing"
            ? (hasRequestedSaleId ? requestedSaleId : candidate.saleId)
            : row.targetSaleId ?? null;
        }
        return;
      }

      if (row.targetKind === "manual_candidate") {
        row.targetKind = this.whatnotSelectedImportAction(row) === "create" ? "new" : null;
        row.targetSaleId = null;
      }
    },

    syncWhatnotManualDuplicateCandidatesForGroup(this: any, row: WhatnotImportReviewRow): void {
      const groupKey = getWhatnotRowGroupKey(row);
      const selectedLotId = Number(row.selectedLotId ?? row.suggestedLotId ?? 0);
      for (const candidate of this.whatnotReviewRows as WhatnotImportReviewRow[]) {
        const candidateLotId = Number(candidate.selectedLotId ?? candidate.suggestedLotId ?? 0);
        if (groupKey && getWhatnotRowGroupKey(candidate) === groupKey && candidateLotId === selectedLotId) {
          this.syncWhatnotManualDuplicateCandidate(candidate);
        }
      }
    },

    whatnotCanUpdateRow(this: any, row: WhatnotImportReviewRow): boolean {
      const candidates = this.buildWhatnotClientManualDuplicateCandidates(row);
      return Boolean(candidates.length > 0 || row.existingSaleId || row.targetSaleId);
    },

    whatnotSplitGroupRowCount(this: any, row: WhatnotImportReviewRow): number {
      const targetSaleId = getWhatnotManualCandidateSaleId(row);
      const selectedLotId = getWhatnotSelectedLotId(row);
      if (!targetSaleId || !selectedLotId) return 1;
      return (this.whatnotReviewRows as WhatnotImportReviewRow[]).filter((candidate) => (
        candidate.rowId === row.rowId
        || (
          getWhatnotSelectedLotId(candidate) === selectedLotId
          && getWhatnotManualCandidateSaleId(candidate) === targetSaleId
        )
      )).length;
    },

    whatnotCanSplitGroup(this: any, row: WhatnotImportReviewRow): boolean {
      return this.whatnotSplitGroupRowCount(row) > 1;
    },

    whatnotRowTargetLabel(this: any, row: WhatnotImportReviewRow): string {
      const selectedImportAction = this.whatnotSelectedImportAction(row);
      if (selectedImportAction === "skip") return translateWhatnotMessage(getWhatnotPreferredLanguage(this), "whatnotReviewSelectedActionSkipLabel");
      if (selectedImportAction === "split_group") return translateWhatnotMessage(getWhatnotPreferredLanguage(this), "whatnotReviewSplitGroupTargetLabel", { count: this.whatnotSplitGroupRowCount(row) });
      if (selectedImportAction === "create") return translateWhatnotMessage(getWhatnotPreferredLanguage(this), "whatnotReviewCreateNewSaleLabel");
      const candidates = this.buildWhatnotClientManualDuplicateCandidates(row);
      const selectedCandidate = candidates.find((candidate: WhatnotManualDuplicateCandidate) => candidate.saleId === String(row.targetSaleId ?? "").trim()) ?? candidates[0];
      if (selectedCandidate) {
        return translateWhatnotMessage(getWhatnotPreferredLanguage(this), "whatnotReviewTargetDuplicateLabel", { id: selectedCandidate.saleId });
      }
      if (row.targetSaleId) {
        return translateWhatnotMessage(getWhatnotPreferredLanguage(this), "whatnotReviewTargetSaleLabel", { id: row.targetSaleId });
      }
      if (row.existingSaleId) {
        return translateWhatnotMessage(getWhatnotPreferredLanguage(this), "whatnotReviewTargetSaleLabel", { id: row.existingSaleId });
      }
      return translateWhatnotMessage(getWhatnotPreferredLanguage(this), "whatnotReviewUpdateRequestedLabel");
    },

    whatnotAutomaticActionLabel(this: any, row: WhatnotImportReviewRow): string {
      return formatWhatnotAutomaticAction(row.action, getWhatnotPreferredLanguage(this));
    },

    whatnotReviewIdentityBadge(this: any, row: WhatnotImportReviewRow): { color: string; label: string } {
      const preferredLanguage = getWhatnotPreferredLanguage(this);
      if (!hasStableWhatnotReviewIdentity(row)) {
        return {
          color: "error",
          label: translateWhatnotMessage(preferredLanguage, "whatnotReviewIdentityMissingLabel")
        };
      }

      const hasMappedSale = Boolean(String(row.existingSaleId ?? row.targetSaleId ?? "").trim() || row.targetKind === "whatnot_mapping");
      if (row.action === "skip" && hasMappedSale) {
        return {
          color: "info",
          label: translateWhatnotMessage(preferredLanguage, "whatnotReviewIdentityAlreadyImportedLabel")
        };
      }

      if (row.action === "update" && hasMappedSale) {
        return {
          color: "warning",
          label: translateWhatnotMessage(preferredLanguage, "whatnotReviewIdentityChangedLabel")
        };
      }

      return {
        color: "success",
        label: translateWhatnotMessage(preferredLanguage, "whatnotReviewIdentityNewLabel")
      };
    },

    whatnotReviewChangeDiffs(this: any, row: WhatnotImportReviewRow): WhatnotReviewChangeDiff[] {
      if (resolveWhatnotSelectedImportAction(row) !== "update_existing") return [];
      return buildWhatnotReviewChangeDiffs(row, findWhatnotReviewTargetSale(this, row));
    },

    whatnotReviewChangeDiffLabel(this: any, diff: WhatnotReviewChangeDiff): string {
      const preferredLanguage = getWhatnotPreferredLanguage(this);
      if (diff.field === "date") return translateWhatnotMessage(preferredLanguage, "whatnotReviewChangeDateLabel");
      if (diff.field === "buyerShipping") return translateWhatnotMessage(preferredLanguage, "whatnotReviewChangeBuyerShippingLabel");
      return translateWhatnotMessage(preferredLanguage, "whatnotReviewChangeSaleTotalLabel");
    },

    whatnotReviewChangeDiffValue(this: any, diff: WhatnotReviewChangeDiff, value: string | number): string {
      if (typeof value !== "number") return value;
      if (diff.field === "saleTotal" || diff.field === "buyerShipping") {
        const formatter = typeof this.formatCurrency === "function" ? this.formatCurrency : (amount: number) => amount.toFixed(2);
        return `$${formatter.call(this, value)}`;
      }
      return String(value);
    },

    whatnotManualDuplicateCandidateLabel(candidate: WhatnotManualDuplicateCandidate): string {
      return `${candidate.saleId} • ${formatWhatnotCandidateTarget(candidate)}`;
    },

    whatnotManualDuplicateCandidateSummary(this: any, candidate: WhatnotManualDuplicateCandidate): string {
      return formatWhatnotCandidateSummary(candidate, getWhatnotPreferredLanguage(this));
    },

    handleWhatnotTargetSaleSelection(this: any, row: WhatnotImportReviewRow, value: string | null): void {
      const selectedSaleId = String(value ?? "").trim();
      row.targetSaleId = selectedSaleId || null;
      if (!selectedSaleId) {
        row.targetKind = row.existingSaleId ? "whatnot_mapping" : null;
        return;
      }

      const candidate = this.buildWhatnotClientManualDuplicateCandidates(row).find((entry: WhatnotManualDuplicateCandidate) => entry.saleId === selectedSaleId);
      if (candidate) {
        row.targetKind = "manual_candidate";
        row.manualDuplicateCandidate = candidate;
        return;
      }

      if (row.existingSaleId && selectedSaleId === row.existingSaleId) {
        row.targetKind = "whatnot_mapping";
      }
    },

    whatnotSimilarRowCount(this: any, row: WhatnotImportReviewRow): number {
      const groupKey = getWhatnotRowGroupKey(row);
      if (!groupKey) return 1;
      return this.whatnotReviewRows.filter((candidate: WhatnotImportReviewRow) => getWhatnotRowGroupKey(candidate) === groupKey).length;
    },

    applyWhatnotSelectionToSimilarRows(
      this: any,
      row: WhatnotImportReviewRow,
        changes: WhatnotReviewSelectionChanges
    ): void {
      const groupKey = getWhatnotRowGroupKey(row);
      if (!groupKey) return;
      for (const candidate of this.whatnotReviewRows as WhatnotImportReviewRow[]) {
        if (candidate.rowId === row.rowId) continue;
        if (getWhatnotRowGroupKey(candidate) !== groupKey) continue;
        applyWhatnotRowSelectionChanges(candidate, changes);
      }
    },

    applyWhatnotSelectionToManualCandidateRows(
      this: any,
      row: WhatnotImportReviewRow,
      changes: WhatnotReviewSelectionChanges
    ): void {
      const targetSaleId = getWhatnotManualCandidateSaleId(row);
      const selectedLotId = getWhatnotSelectedLotId(row);
      if (!targetSaleId || !selectedLotId) return;
      for (const candidate of this.whatnotReviewRows as WhatnotImportReviewRow[]) {
        if (candidate.rowId === row.rowId) continue;
        if (getWhatnotSelectedLotId(candidate) !== selectedLotId) continue;
        if (getWhatnotManualCandidateSaleId(candidate) !== targetSaleId) continue;
        applyWhatnotRowSelectionChanges(candidate, changes);
      }
    },

    handleWhatnotLotSelection(this: any, row: WhatnotImportReviewRow, value: number | null): void {
      row.selectedLotId = value;
      const selectedLot = this.lotItems.find((lot: { value: number; lotType?: string }) => lot.value === value);
      if (isSinglesLot(selectedLot)) {
        row.selectedSaleType = "pack";
      } else if (!row.selectedSaleType) {
        row.selectedSaleType = row.suggestedSaleType || "pack";
      }
      this.applyWhatnotSelectionToSimilarRows(row, {
        selectedLotId: row.selectedLotId,
        selectedSaleType: row.selectedSaleType
      });
      this.syncWhatnotManualDuplicateCandidatesForGroup(row);
    },

    handleWhatnotSaleTypeSelection(this: any, row: WhatnotImportReviewRow, value: WhatnotMappedSaleType | null): void {
      row.selectedSaleType = value;
      this.applyWhatnotSelectionToSimilarRows(row, {
        selectedSaleType: row.selectedSaleType
      });
      this.syncWhatnotManualDuplicateCandidatesForGroup(row);
    },

    handleWhatnotPacksCountChange(this: any, row: WhatnotImportReviewRow, value: number | null): void {
      row.selectedPacksCount = value == null ? null : Math.max(1, Math.floor(Number(value) || 0)) || null;
      this.applyWhatnotSelectionToSimilarRows(row, {
        selectedPacksCount: row.selectedPacksCount
      });
    },

    handleWhatnotImportActionSelection(this: any, row: WhatnotImportReviewRow, value: WhatnotReviewImportAction | null): void {
      const selectedImportAction = value ?? "create";
      row.selectedImportAction = selectedImportAction;
      row.skipImport = selectedImportAction === "skip";

      if (selectedImportAction === "skip") {
        row.targetKind = null;
        row.targetSaleId = null;
      } else if (selectedImportAction === "split_group") {
        row.targetKind = "new";
        row.targetSaleId = null;
      } else if (selectedImportAction === "create") {
        row.targetKind = "new";
        row.targetSaleId = null;
      } else if (this.buildWhatnotClientManualDuplicateCandidates(row).length > 0) {
        const candidates = this.buildWhatnotClientManualDuplicateCandidates(row);
        const selectedCandidate = candidates.find((candidate: WhatnotManualDuplicateCandidate) => candidate.saleId === String(row.targetSaleId ?? "").trim()) ?? candidates[0]!;
        row.targetKind = "manual_candidate";
        row.targetSaleId = selectedCandidate.saleId;
        row.manualDuplicateCandidate = selectedCandidate;
      } else if (row.existingSaleId) {
        row.targetKind = "whatnot_mapping";
        row.targetSaleId = row.existingSaleId;
      } else if (row.targetSaleId) {
        row.targetKind = "whatnot_mapping";
      }

      const changes = {
        selectedImportAction: row.selectedImportAction,
        targetKind: row.targetKind,
        targetSaleId: row.targetSaleId,
        skipImport: row.skipImport
      };
      this.applyWhatnotSelectionToSimilarRows(row, changes);
      if (selectedImportAction === "split_group" || selectedImportAction === "update_existing") {
        this.applyWhatnotSelectionToManualCandidateRows(row, changes);
      }
      this.syncWhatnotManualDuplicateCandidatesForGroup(row);

      const candidate = this.buildWhatnotClientManualDuplicateCandidate(row);
      if (selectedImportAction === "update_existing" && candidate && !row.existingSaleId) {
        row.targetKind = "manual_candidate";
        row.targetSaleId = candidate.saleId;
        row.manualDuplicateCandidate = candidate;
      }
    }
  }
};
