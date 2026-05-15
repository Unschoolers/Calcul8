import type {
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

export function resolveWhatnotSelectedImportAction(row: WhatnotImportReviewRow): WhatnotReviewImportAction {
  return row.selectedImportAction ?? (row.action === "update" ? "update_existing" : row.action === "skip" ? "skip" : "create");
}

export function validateWhatnotReviewRowsForImport(app: Pick<WhatnotApp, "whatnotReviewRows" | "notify">): boolean {
  for (const row of app.whatnotReviewRows) {
    const selectedImportAction = resolveWhatnotSelectedImportAction(row);
    const shouldSkip = row.skipImport || selectedImportAction === "skip";
    if (shouldSkip) continue;

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
