import { createHash } from "node:crypto";
import { HttpError } from "../../lib/auth";
import type {
  WhatnotConfirmationDecisionDocument,
  WhatnotImportRowDocument,
  WhatnotMappedSaleType
} from "../../types";
import {
  normalizeId,
  parseLotIdNumber,
  type LotSnapshot,
  type ReviewDecisionInput
} from "./serviceCore";

export interface WhatnotConfirmationDecisionInput {
  rowId?: unknown;
  skip?: unknown;
  lotId?: unknown;
  saleType?: unknown;
  packsCount?: unknown;
  targetKind?: unknown;
  targetSaleId?: unknown;
  selectedImportAction?: unknown;
}

export type NormalizedWhatnotConfirmationDecision = WhatnotConfirmationDecisionDocument;

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizePositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function normalizeSaleType(value: unknown): WhatnotMappedSaleType | null {
  return value === "pack" || value === "box" || value === "rtyh" ? value : null;
}

function normalizeTargetKind(value: unknown): NormalizedWhatnotConfirmationDecision["targetKind"] {
  return value === "new" || value === "whatnot_mapping" || value === "manual_candidate" ? value : null;
}

function normalizeImportAction(value: unknown): NormalizedWhatnotConfirmationDecision["selectedImportAction"] {
  return value === "create" || value === "update_existing" || value === "skip" || value === "split_group"
    ? value
    : null;
}

export function normalizeWhatnotConfirmationDecisions(
  decisions: readonly WhatnotConfirmationDecisionInput[]
): NormalizedWhatnotConfirmationDecision[] {
  return decisions
    .map((decision) => ({
      rowId: normalizeText(decision.rowId),
      skip: decision.skip === true,
      lotId: normalizePositiveInteger(decision.lotId),
      saleType: normalizeSaleType(decision.saleType),
      packsCount: normalizePositiveInteger(decision.packsCount),
      targetKind: normalizeTargetKind(decision.targetKind),
      targetSaleId: normalizeText(decision.targetSaleId) || null,
      selectedImportAction: normalizeImportAction(decision.selectedImportAction)
    }))
    .sort((left, right) => left.rowId.localeCompare(right.rowId));
}

export function buildWhatnotConfirmationFingerprint(
  decisions: readonly NormalizedWhatnotConfirmationDecision[]
): string {
  return createHash("sha256").update(JSON.stringify(decisions)).digest("hex");
}

export function buildWhatnotConfirmationOperationKey(batchId: string, rowIds: readonly string[]): string {
  const normalizedRowIds = [...new Set(rowIds.map(normalizeText).filter(Boolean))].sort();
  return createHash("sha256")
    .update(`${normalizeText(batchId)}:${normalizedRowIds.join(":")}`)
    .digest("hex");
}

export function validateWhatnotConfirmationPlan(
  rows: readonly WhatnotImportRowDocument[],
  decisionsByRowId: ReadonlyMap<string, ReviewDecisionInput>,
  lots: readonly LotSnapshot[]
): void {
  for (const row of rows) {
    const decision = decisionsByRowId.get(row.rowId);
    if (!decision || decision.skip || decision.selectedImportAction === "skip") continue;

    const targetLotId = parseLotIdNumber(decision.lotId ?? row.suggestedLotId);
    if (!targetLotId) {
      throw new HttpError(400, `Lot is required for row ${row.rowId}.`);
    }
    const lot = lots.find((candidate) => Number(candidate.id) === targetLotId);
    if (!lot) {
      throw new HttpError(400, `Lot ${targetLotId} was not found in the current scope.`);
    }

    const shouldSplitGroup = decision.selectedImportAction === "split_group";
    const requestedTargetKind = shouldSplitGroup
      ? "new"
      : (decision.targetKind ?? row.targetKind ?? "new");
    const requestedTargetSaleId = normalizeId(decision.targetSaleId ?? row.targetSaleId);
    const desiredSaleType = lot.lotType === "singles"
      ? "pack"
      : (decision.saleType ?? row.suggestedSaleType);

    if (requestedTargetKind === "manual_candidate") {
      const saleId = Math.floor(Number(requestedTargetSaleId) || 0);
      if (!requestedTargetSaleId || saleId < 1) {
        throw new HttpError(400, `Manual duplicate rows require a valid target sale for row ${row.rowId}.`);
      }
      continue;
    }

    if (!desiredSaleType) {
      throw new HttpError(400, `Sale type is required for row ${row.rowId}.`);
    }
    if (
      desiredSaleType === "rtyh"
      && (!Number.isFinite(Number(decision.packsCount)) || Number(decision.packsCount) <= 0)
    ) {
      throw new HttpError(400, `RTYH rows require packs sold for row ${row.rowId}.`);
    }
  }
}
