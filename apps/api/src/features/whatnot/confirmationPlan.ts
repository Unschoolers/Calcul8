import { HttpError } from "../../lib/auth";
import { findSaleDocumentForWhatnotRecovery, getSaleDocument } from "../../lib/cosmos/salesRepository";
import { getWhatnotSaleImportMappingByExternalSaleKeyHash } from "../../lib/cosmos/whatnotRepository";
import {
  buildWhatnotRememberedMatchKeys,
  hashWhatnotExternalSaleKey,
  hashWhatnotMatchKey
} from "../../lib/whatnot";
import type {
  ApiConfig,
  WhatnotConfirmationPlanOperationDocument,
  WhatnotImportRowDocument,
  WhatnotMappedSaleType
} from "../../types";
import { buildManualConfirmGroupKey } from "./importGrouping";
import { allocateImportedSaleId, buildMutationId } from "./saleBuilders";
import { buildWhatnotConfirmationOperationKey } from "./confirmationRecovery";
import {
  normalizeId,
  parseLotIdNumber,
  type LotSnapshot,
  type ReviewDecisionInput
} from "./serviceCore";

export interface WhatnotConfirmationRuntimeOperation {
  plan: WhatnotConfirmationPlanOperationDocument;
  rows: WhatnotImportRowDocument[];
  decision: ReviewDecisionInput | null;
  lot: LotSnapshot | null;
}

function buildLogicalRowGroups(
  rows: readonly WhatnotImportRowDocument[],
  decisionsByRowId: ReadonlyMap<string, ReviewDecisionInput>
): WhatnotImportRowDocument[][] {
  const groupKeyByRowId = new Map<string, string>();
  const groupRowsByKey = new Map<string, WhatnotImportRowDocument[]>();
  for (const row of rows) {
    const decision = decisionsByRowId.get(row.rowId);
    if (!decision || decision.skip || decision.selectedImportAction === "skip" || decision.selectedImportAction === "split_group") {
      continue;
    }
    const lotId = parseLotIdNumber(decision.lotId ?? row.suggestedLotId);
    const targetKind = decision.targetKind ?? row.targetKind ?? "new";
    const targetSaleId = normalizeId(decision.targetSaleId ?? row.targetSaleId);
    if (!lotId || targetKind !== "manual_candidate" || !targetSaleId) continue;
    const groupKey = buildManualConfirmGroupKey(row, String(lotId), targetSaleId);
    if (!groupKey) continue;
    groupKeyByRowId.set(row.rowId, groupKey);
    groupRowsByKey.set(groupKey, [...(groupRowsByKey.get(groupKey) ?? []), row]);
  }

  const emittedGroups = new Set<string>();
  const logicalGroups: WhatnotImportRowDocument[][] = [];
  for (const row of rows) {
    const groupKey = groupKeyByRowId.get(row.rowId);
    if (!groupKey) {
      logicalGroups.push([row]);
      continue;
    }
    if (emittedGroups.has(groupKey)) continue;
    emittedGroups.add(groupKey);
    logicalGroups.push(groupRowsByKey.get(groupKey) ?? [row]);
  }
  return logicalGroups;
}

export async function buildWhatnotConfirmationPlan(
  config: ApiConfig,
  input: {
    scopeKey: string;
    batchId: string;
    rows: readonly WhatnotImportRowDocument[];
    decisionsByRowId: ReadonlyMap<string, ReviewDecisionInput>;
    lots: readonly LotSnapshot[];
    existingPlan?: readonly WhatnotConfirmationPlanOperationDocument[];
    recoveryAttempt?: boolean;
    legacyAdoption?: boolean;
  }
): Promise<WhatnotConfirmationRuntimeOperation[]> {
  const nextSaleIdByLotId = new Map<string, number>();
  const existingPlanByKey = new Map((input.existingPlan ?? []).map((operation) => [operation.operationKey, operation]));
  const operations: WhatnotConfirmationRuntimeOperation[] = [];

  for (const operationRows of buildLogicalRowGroups(input.rows, input.decisionsByRowId)) {
    const row = operationRows[0]!;
    const decision = input.decisionsByRowId.get(row.rowId) ?? null;
    const rowIds = operationRows.map((candidate) => candidate.rowId).sort();
    const operationKey = buildWhatnotConfirmationOperationKey(input.batchId, rowIds);
    const mutationId = operationRows.length === 1
      ? buildMutationId(input.batchId, row)
      : `whatnot_import:${input.batchId}:operation:${operationKey}`;
    const storedPlan = existingPlanByKey.get(operationKey);
    const shouldSkip = !decision || decision.skip || decision.selectedImportAction === "skip";
    if (shouldSkip) {
      const plan: WhatnotConfirmationPlanOperationDocument = storedPlan ?? {
        operationKey,
        rowIds,
        mutationId: `whatnot_import:${input.batchId}:skip:${operationKey}`,
        outcome: "skipped",
        updateMode: "skip",
        externalSaleKeyHashes: [],
        rememberedMatchKeyHashes: []
      };
      operations.push({ plan, rows: operationRows, decision, lot: null });
      continue;
    }

    const lotId = parseLotIdNumber(decision.lotId ?? row.suggestedLotId);
    const lot = input.lots.find((candidate) => Number(candidate.id) === lotId) ?? null;
    if (!lot || !lotId) throw new HttpError(400, `Lot is required for row ${row.rowId}.`);
    const splitGroup = decision.selectedImportAction === "split_group";
    const targetKind = splitGroup ? "new" : (decision.targetKind ?? row.targetKind ?? "new");
    const targetSaleId = normalizeId(decision.targetSaleId ?? row.targetSaleId);
    const externalSaleKeyHashes = operationRows.map((candidate) => hashWhatnotExternalSaleKey(
      candidate.externalAccountId,
      candidate.externalOrderId,
      candidate.externalOrderItemId
    ));
    const rememberedMatchKeyHashes = [...new Set(operationRows.flatMap((candidate) =>
      buildWhatnotRememberedMatchKeys(candidate).map(hashWhatnotMatchKey)
    ))].sort();
    const targetSaleType: WhatnotMappedSaleType = lot.lotType === "singles"
      ? "pack"
      : (decision.saleType ?? row.suggestedSaleType ?? "pack");

    if (storedPlan) {
      operations.push({ plan: storedPlan, rows: operationRows, decision, lot });
      continue;
    }

    const existingMapping = operationRows.length === 1
      ? await getWhatnotSaleImportMappingByExternalSaleKeyHash(config, input.scopeKey, externalSaleKeyHashes[0]!)
      : null;
    let saleId: number;
    let updateMode: WhatnotConfirmationPlanOperationDocument["updateMode"] = "new";
    if ((splitGroup && existingMapping) || (targetKind === "whatnot_mapping" && targetSaleId) || existingMapping) {
      saleId = Math.max(1, Math.floor(Number(targetSaleId || existingMapping?.saleId) || 0));
      updateMode = "mapped";
    } else if (targetKind === "manual_candidate") {
      saleId = Math.max(1, Math.floor(Number(targetSaleId) || 0));
      updateMode = "manual";
    } else {
      const recoveredSale = input.recoveryAttempt
        ? await findSaleDocumentForWhatnotRecovery(config, {
          scopeKey: input.scopeKey,
          mutationId,
          externalAccountId: row.externalAccountId,
          externalOrderId: row.externalOrderId,
          externalOrderItemId: row.externalOrderItemId,
          allowExternalIdentityMatch: true
        })
        : null;
      if (recoveredSale) {
        if (normalizeId(recoveredSale.lotId) !== normalizeId(lot.id)) {
          throw new HttpError(409, "A recovered Whatnot sale belongs to a different lot.", "RECOVERY_CONFLICT");
        }
        saleId = Math.max(1, Math.floor(Number(recoveredSale.saleId) || 0));
      } else {
        saleId = await allocateImportedSaleId(config, input.scopeKey, lot.id, nextSaleIdByLotId);
      }
    }
    if (!saleId) throw new HttpError(400, `Target sale is invalid for row ${row.rowId}.`);
    const legacyRecoveredSale = input.recoveryAttempt && updateMode !== "new"
      ? await findSaleDocumentForWhatnotRecovery(config, {
        scopeKey: input.scopeKey,
        mutationId,
        externalAccountId: row.externalAccountId,
        externalOrderId: row.externalOrderId,
        externalOrderItemId: row.externalOrderItemId,
        allowExternalIdentityMatch: true
      })
      : null;
    if (
      input.legacyAdoption
      && updateMode !== "new"
      && !legacyRecoveredSale
      && existingMapping?.importBatchId !== input.batchId
    ) {
      throw new HttpError(
        409,
        "This legacy Whatnot update cannot prove whether its sale write completed.",
        "RECOVERY_CONFLICT"
      );
    }
    if (
      legacyRecoveredSale
      && (
        normalizeId(legacyRecoveredSale.lotId) !== normalizeId(lot.id)
        || normalizeId(legacyRecoveredSale.saleId) !== String(saleId)
      )
    ) {
      throw new HttpError(409, "A recovered Whatnot update has a different planned identity.", "RECOVERY_CONFLICT");
    }
    const expectedSale = updateMode === "new"
      ? null
      : await getSaleDocument(config, input.scopeKey, lot.id, String(saleId));

    const plan: WhatnotConfirmationPlanOperationDocument = {
      operationKey,
      rowIds,
      mutationId,
      outcome: updateMode === "new" ? "imported" : "updated",
      updateMode,
      lotId: lot.id,
      saleId: String(saleId),
      targetSaleType,
      ...(updateMode !== "new" ? {
        expectedSaleVersion: expectedSale?.version ?? 0,
        expectedSaleMutationId: normalizeId(expectedSale?.mutationId),
        saleWriteProven: Boolean(legacyRecoveredSale)
      } : {}),
      externalSaleKeyHashes,
      rememberedMatchKeyHashes
    };
    operations.push({ plan, rows: operationRows, decision, lot });
  }

  if (input.existingPlan && operations.length !== input.existingPlan.length) {
    throw new HttpError(409, "Stored Whatnot confirmation plan no longer matches the review batch.", "RECOVERY_CONFLICT");
  }
  return operations;
}
