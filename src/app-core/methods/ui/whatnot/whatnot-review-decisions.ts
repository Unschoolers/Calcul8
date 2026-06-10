import type {
  Sale,
  WhatnotImportDecisionKind,
  WhatnotImportReviewRow,
  WhatnotMappedSaleType,
  WhatnotReviewImportAction
} from "../../../../types/app.ts";
import type { WhatnotApp } from "./whatnot-types.ts";

export interface WhatnotReviewDecision {
  rowId: string;
  lotId: number | null;
  saleType: WhatnotMappedSaleType | null;
  packsCount: number | null;
  skip: boolean;
  selectedImportAction: WhatnotReviewImportAction;
  targetKind: WhatnotImportDecisionKind | null;
  targetSaleId?: string;
}

export interface WhatnotReviewDecisionSummary {
  totalCount: number;
  readyCount: number;
  createCount: number;
  updateCount: number;
  skipCount: number;
  alreadyImportedCount: number;
  changedCount: number;
  missingIdentityCount: number;
  blockedCount: number;
  manualReviewCount: number;
}

export type WhatnotReviewChangeField = "date" | "saleTotal" | "buyerShipping";

export interface WhatnotReviewChangeDiff {
  field: WhatnotReviewChangeField;
  before: string | number;
  after: string | number;
}

export function resolveWhatnotSelectedImportAction(row: WhatnotImportReviewRow): WhatnotReviewImportAction {
  return row.selectedImportAction ?? (row.action === "update" ? "update_existing" : row.action === "skip" ? "skip" : "create");
}

export function hasStableWhatnotReviewIdentity(
  row: Pick<WhatnotImportReviewRow, "externalSaleId" | "externalOrderId" | "externalOrderItemId">
): boolean {
  return Boolean(
    String(row.externalSaleId ?? "").trim()
    && String(row.externalOrderId ?? "").trim()
    && String(row.externalOrderItemId ?? "").trim()
  );
}

function hasMappedWhatnotSale(row: WhatnotImportReviewRow): boolean {
  return Boolean(String(row.existingSaleId ?? row.targetSaleId ?? "").trim() || row.targetKind === "whatnot_mapping");
}

function getWhatnotReviewRowLabel(row: WhatnotImportReviewRow): string {
  return String(row.title || row.externalOrderId || row.rowId || "unknown").trim();
}

export function validateWhatnotReviewRowsForImport(app: Pick<WhatnotApp, "whatnotReviewRows" | "notify">): boolean {
  for (const row of app.whatnotReviewRows) {
    const selectedImportAction = resolveWhatnotSelectedImportAction(row);
    const shouldSkip = row.skipImport || selectedImportAction === "skip";
    if (shouldSkip) continue;

    if (!hasStableWhatnotReviewIdentity(row)) {
      app.notify(`Whatnot row ${getWhatnotReviewRowLabel(row)} is missing a stable import id. Skip it or upload the weekly Whatnot order report.`, "warning");
      return false;
    }
    if (!row.selectedLotId) {
      app.notify(`Choose a lot for ${row.title || row.externalOrderId}.`, "warning");
      return false;
    }
    const selectedSaleType = row.selectedSaleType ?? (row.suggestedSaleType ?? null);
    if (!selectedSaleType) {
      app.notify(`Choose a sale type for ${row.title || row.externalOrderId}.`, "warning");
      return false;
    }
    if (selectedSaleType === "rtyh" && (!row.selectedPacksCount || row.selectedPacksCount <= 0)) {
      app.notify(`Enter sold items for RTYH row ${row.title || row.externalOrderId}.`, "warning");
      return false;
    }
    if (selectedImportAction === "update_existing") {
      const targetSaleId = String(row.targetSaleId ?? row.manualDuplicateCandidate?.saleId ?? row.existingSaleId ?? "").trim();
      if (!targetSaleId) {
        app.notify(`Choose a matching sale to update for ${row.title || row.externalOrderId}.`, "warning");
        return false;
      }
    }
  }

  return true;
}

export function buildWhatnotReviewDecisionSummary(rows: WhatnotImportReviewRow[]): WhatnotReviewDecisionSummary {
  const summary: WhatnotReviewDecisionSummary = {
    totalCount: 0,
    readyCount: 0,
    createCount: 0,
    updateCount: 0,
    skipCount: 0,
    alreadyImportedCount: 0,
    changedCount: 0,
    missingIdentityCount: 0,
    blockedCount: 0,
    manualReviewCount: 0
  };

  for (const row of rows) {
    summary.totalCount += 1;
    const selectedImportAction = resolveWhatnotSelectedImportAction(row);
    const shouldSkip = row.skipImport || selectedImportAction === "skip";
    const hasStableIdentity = hasStableWhatnotReviewIdentity(row);
    const isBlocked = !hasStableIdentity && !shouldSkip;

    if (!hasStableIdentity) {
      summary.missingIdentityCount += 1;
    }
    if (isBlocked) {
      summary.blockedCount += 1;
    }
    if (row.action === "skip" && hasMappedWhatnotSale(row)) {
      summary.alreadyImportedCount += 1;
    }
    if (row.action === "update" && hasMappedWhatnotSale(row)) {
      summary.changedCount += 1;
    }

    if (shouldSkip) {
      summary.skipCount += 1;
    } else if (!isBlocked && selectedImportAction === "update_existing") {
      summary.updateCount += 1;
    } else if (!isBlocked) {
      summary.createCount += 1;
    }

    if (row.requiresManualReview && !shouldSkip && !isBlocked) {
      summary.manualReviewCount += 1;
    }
  }

  summary.readyCount = summary.createCount + summary.updateCount;
  return summary;
}

export function buildWhatnotReviewDecisions(rows: WhatnotImportReviewRow[]): WhatnotReviewDecision[] {
  return rows.map((row) => {
    const selectedImportAction = resolveWhatnotSelectedImportAction(row);
    const targetSaleId = String(row.targetSaleId ?? row.manualDuplicateCandidate?.saleId ?? row.existingSaleId ?? "").trim();
    const targetKind = selectedImportAction === "update_existing"
      ? (row.targetKind
        ?? (row.manualDuplicateCandidate
          ? "manual_candidate"
          : targetSaleId
            ? "whatnot_mapping"
            : null))
      : selectedImportAction === "create"
        ? "new"
        : null;

    return {
      rowId: row.rowId,
      lotId: row.selectedLotId,
      saleType: row.selectedSaleType,
      packsCount: row.selectedPacksCount,
      skip: row.skipImport || selectedImportAction === "skip",
      selectedImportAction,
      targetKind,
      targetSaleId: targetSaleId || undefined
    };
  });
}

function normalizeDateStamp(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value.slice(0, 10);
  }
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getSaleEffectiveTotal(sale: Sale): number {
  return sale.priceIsTotal ? Number(sale.price) || 0 : (Number(sale.price) || 0) * Math.max(1, Math.floor(Number(sale.quantity) || 1));
}

function moneyChanged(left: number, right: number): boolean {
  return Math.abs(left - right) >= 0.01;
}

export function buildWhatnotReviewChangeDiffs(
  row: WhatnotImportReviewRow,
  existingSale: Sale | null | undefined
): WhatnotReviewChangeDiff[] {
  if (!existingSale) return [];

  const diffs: WhatnotReviewChangeDiff[] = [];
  const existingDate = normalizeDateStamp(existingSale.date);
  const importDate = normalizeDateStamp(row.date);
  if (existingDate !== importDate) {
    diffs.push({
      field: "date",
      before: existingDate,
      after: importDate
    });
  }

  const existingTotal = roundCurrency(getSaleEffectiveTotal(existingSale));
  const importedTotal = roundCurrency(Number(row.price) || 0);
  if (moneyChanged(existingTotal, importedTotal)) {
    diffs.push({
      field: "saleTotal",
      before: existingTotal,
      after: importedTotal
    });
  }

  const existingBuyerShipping = roundCurrency(Number(existingSale.buyerShipping) || 0);
  const importedBuyerShipping = roundCurrency(Number(row.buyerShipping) || 0);
  if (moneyChanged(existingBuyerShipping, importedBuyerShipping)) {
    diffs.push({
      field: "buyerShipping",
      before: existingBuyerShipping,
      after: importedBuyerShipping
    });
  }

  return diffs;
}
