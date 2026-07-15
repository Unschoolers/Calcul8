import { HttpError } from "../../lib/auth";
import {
  findSaleDocumentForWhatnotRecovery,
  getSaleDocument,
  upsertSaleDocument
} from "../../lib/cosmos/salesRepository";
import {
  checkpointWhatnotImportOperation,
  getWhatnotSaleImportMappingByExternalSaleKeyHash,
  renewWhatnotImportConfirmationLease,
  upsertWhatnotSaleImportMapping,
  upsertWhatnotTargetMapping
} from "../../lib/cosmos/whatnotRepository";
import {
  buildWhatnotRememberedMatchKeys,
  hashWhatnotExternalSaleKey,
  hashWhatnotMatchKey
} from "../../lib/whatnot";
import type { ApiConfig, WhatnotImportBatchDocument, WhatnotMappedSaleType } from "../../types";
import { buildGroupedImportRow } from "./importGrouping";
import { buildImportedSalePayload, buildMergedManualSalePayload } from "./saleBuilders";
import type { WhatnotConfirmationRuntimeOperation } from "./confirmationPlan";
import { normalizeId } from "./serviceCore";

export interface WhatnotConfirmationRunResult {
  batch: WhatnotImportBatchDocument;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
}

function saleMatchesPlannedExternalIdentity(
  saleDocument: Awaited<ReturnType<typeof getSaleDocument>>,
  plannedHashes: readonly string[]
): boolean {
  if (!saleDocument || !saleDocument.sale || typeof saleDocument.sale !== "object") return false;
  const sale = saleDocument.sale as {
    externalProvider?: unknown;
    externalAccountId?: unknown;
    externalOrderId?: unknown;
    externalOrderItemId?: unknown;
    externalTransactionRefs?: unknown;
  };
  const hashes = new Set<string>();
  if (sale.externalProvider === "whatnot") {
    hashes.add(hashWhatnotExternalSaleKey(
      String(sale.externalAccountId ?? ""),
      String(sale.externalOrderId ?? ""),
      String(sale.externalOrderItemId ?? "")
    ));
  }
  if (Array.isArray(sale.externalTransactionRefs)) {
    for (const rawRef of sale.externalTransactionRefs) {
      if (!rawRef || typeof rawRef !== "object") continue;
      const ref = rawRef as { provider?: unknown; accountId?: unknown; orderId?: unknown; orderItemId?: unknown };
      if (ref.provider !== "whatnot") continue;
      hashes.add(hashWhatnotExternalSaleKey(
        String(ref.accountId ?? ""),
        String(ref.orderId ?? ""),
        String(ref.orderItemId ?? "")
      ));
    }
  }
  return plannedHashes.some((hash) => hashes.has(hash));
}

export async function runWhatnotConfirmationPlan(
  config: ApiConfig,
  input: {
    actorUserId: string;
    scopeKey: string;
    batch: WhatnotImportBatchDocument;
    attemptId: string;
    operations: readonly WhatnotConfirmationRuntimeOperation[];
    leaseMs: number;
    onPhase(operationKey: string, phase: string): void;
  }
): Promise<WhatnotConfirmationRunResult> {
  let batch = input.batch;
  let importedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const renewLease = async (operationKey: string, phase: string): Promise<void> => {
    input.onPhase(operationKey, phase);
    const renewedAt = new Date().toISOString();
    const renewed = await renewWhatnotImportConfirmationLease(config, {
      scopeKey: input.scopeKey,
      batchId: batch.batchId,
      attemptId: input.attemptId,
      renewedAt,
      leaseExpiresAt: new Date(Date.parse(renewedAt) + input.leaseMs).toISOString()
    });
    if (!renewed) {
      throw new HttpError(409, "Another confirmation attempt owns this Whatnot review.", "OPERATION_IN_PROGRESS");
    }
    batch = renewed;
  };

  for (const operation of input.operations) {
    const row = operation.rows[0]!;
    const decision = operation.decision;
    const operationKey = operation.plan.operationKey;
    const completedOperation = batch.confirmationProgress?.[operationKey];
    if (completedOperation) {
      if (completedOperation.outcome === "imported") importedCount += 1;
      else if (completedOperation.outcome === "updated") updatedCount += 1;
      else skippedCount += 1;
      continue;
    }

    if (operation.plan.updateMode === "skip") {
      await renewLease(operationKey, "checkpoint");
      batch = await checkpointWhatnotImportOperation(config, {
        scopeKey: input.scopeKey,
        batchId: batch.batchId,
        attemptId: input.attemptId,
        operationKey,
        outcome: "skipped",
        completedAt: new Date().toISOString(),
        leaseExpiresAt: new Date(Date.now() + input.leaseMs).toISOString()
      });
      skippedCount += 1;
      continue;
    }
    if (!decision || !operation.lot || !operation.plan.saleId || !operation.plan.lotId) {
      throw new HttpError(409, "Stored Whatnot confirmation plan is incomplete.", "RECOVERY_CONFLICT");
    }

    const lot = operation.lot;
    const targetSaleType: WhatnotMappedSaleType = operation.plan.targetSaleType ?? "pack";
    if (
      operation.plan.updateMode !== "manual"
      && targetSaleType === "rtyh"
      && (!Number.isFinite(Number(decision.packsCount)) || Number(decision.packsCount) <= 0)
    ) {
      throw new HttpError(400, `RTYH rows require packs sold for row ${row.rowId}.`);
    }

    const saleIdNumber = Math.max(1, Math.floor(Number(operation.plan.saleId) || 0));
    const mutationId = operation.plan.mutationId;
    const updateMode = operation.plan.updateMode;
    const salePayload = updateMode === "manual"
      ? await buildMergedManualSalePayload(
        config,
        input.scopeKey,
        operation.rows.length > 1 ? buildGroupedImportRow(operation.rows) : row,
        decision,
        lot,
        saleIdNumber
      )
      : buildImportedSalePayload(row, decision, lot, saleIdNumber);
    let shouldWriteSale = true;

    const isRecoveryAttempt = (batch.confirmationAttempt?.attemptNumber ?? 1) > 1;
    const plannedSale = await getSaleDocument(config, input.scopeKey, lot.id, String(saleIdNumber));
    const operationMappings = isRecoveryAttempt
      ? await Promise.all(operation.rows.map((candidate) => getWhatnotSaleImportMappingByExternalSaleKeyHash(
        config,
        input.scopeKey,
        hashWhatnotExternalSaleKey(candidate.externalAccountId, candidate.externalOrderId, candidate.externalOrderItemId)
      )))
      : [];
    const hasPersistedOperationMapping = operationMappings.some((mapping) =>
      mapping?.importBatchId === batch.batchId && mapping.importOperationKey === operationKey
    );

    if (isRecoveryAttempt && operation.plan.saleWriteProven) {
      if (!saleMatchesPlannedExternalIdentity(plannedSale, operation.plan.externalSaleKeyHashes)) {
        throw new HttpError(
          409,
          "The recovered Whatnot sale identity no longer matches the immutable plan.",
          "RECOVERY_CONFLICT"
        );
      }
      shouldWriteSale = false;
    } else if (isRecoveryAttempt && plannedSale?.mutationId === mutationId) {
      shouldWriteSale = false;
    } else if (isRecoveryAttempt && updateMode !== "new" && hasPersistedOperationMapping) {
      // A durable mapping proves the planned update completed. Do not replay
      // the sale write over a later seller edit.
      shouldWriteSale = false;
    } else if (isRecoveryAttempt && updateMode !== "new") {
      const saleStillAtPlannedBase = plannedSale
        ? plannedSale.version === (operation.plan.expectedSaleVersion ?? 0)
          && normalizeId(plannedSale.mutationId) === normalizeId(operation.plan.expectedSaleMutationId)
        : (operation.plan.expectedSaleVersion ?? 0) === 0;
      if (!saleStillAtPlannedBase) {
        throw new HttpError(
          409,
          "The planned Whatnot target changed before the update could be recovered.",
          "RECOVERY_CONFLICT"
        );
      }
    } else if (isRecoveryAttempt) {
      input.onPhase(operationKey, "sale_recovery");
      const recoveredSale = await findSaleDocumentForWhatnotRecovery(config, {
        scopeKey: input.scopeKey,
        mutationId,
        externalAccountId: row.externalAccountId,
        externalOrderId: row.externalOrderId,
        externalOrderItemId: row.externalOrderItemId,
        allowExternalIdentityMatch: true
      });
      if (recoveredSale) {
        if (
          normalizeId(recoveredSale.lotId) !== normalizeId(lot.id)
          || normalizeId(recoveredSale.saleId) !== String(saleIdNumber)
        ) {
          throw new HttpError(
            409,
            "A recovered Whatnot sale belongs to a different planned identity.",
            "RECOVERY_CONFLICT"
          );
        }
        shouldWriteSale = false;
      } else if (plannedSale || hasPersistedOperationMapping) {
        throw new HttpError(
          409,
          "The planned Whatnot sale changed or was removed before recovery completed.",
          "RECOVERY_CONFLICT"
        );
      }
    } else if (updateMode === "new" && plannedSale && plannedSale.mutationId !== mutationId) {
      throw new HttpError(409, "The planned Whatnot sale ID is already in use.", "RECOVERY_CONFLICT");
    }

    if (shouldWriteSale) {
      await renewLease(operationKey, "sale");
      await upsertSaleDocument(config, {
        scopeKey: input.scopeKey,
        lotId: lot.id,
        saleId: String(saleIdNumber),
        sale: salePayload,
        updatedBy: input.actorUserId,
        mutationId
      });
    }

    for (const mappingRow of operation.rows) {
      await renewLease(operationKey, "sale_mapping");
      await upsertWhatnotSaleImportMapping(config, {
        docType: "sale_import_mapping",
        scopeKey: input.scopeKey,
        externalSaleKeyHash: hashWhatnotExternalSaleKey(
          mappingRow.externalAccountId,
          mappingRow.externalOrderId,
          mappingRow.externalOrderItemId
        ),
        provider: "whatnot",
        externalAccountId: mappingRow.externalAccountId,
        externalSaleId: mappingRow.externalSaleId,
        externalOrderId: mappingRow.externalOrderId,
        externalOrderItemId: mappingRow.externalOrderItemId,
        lotId: lot.id,
        saleId: String(saleIdNumber),
        payloadFingerprint: mappingRow.payloadFingerprint,
        importBatchId: batch.batchId,
        importOperationKey: operationKey,
        updatedAt: new Date().toISOString()
      });
    }

    const writtenMatchHashes = new Set<string>();
    for (const mappingRow of operation.rows) {
      for (const matchKey of buildWhatnotRememberedMatchKeys(mappingRow)) {
        const matchKeyHash = hashWhatnotMatchKey(matchKey);
        if (writtenMatchHashes.has(matchKeyHash)) continue;
        writtenMatchHashes.add(matchKeyHash);
        await renewLease(operationKey, "target_mapping");
        await upsertWhatnotTargetMapping(config, {
          scopeKey: input.scopeKey,
          matchKeyHash,
          docType: "whatnot_target_mapping",
          provider: "whatnot",
          externalAccountId: mappingRow.externalAccountId,
          matchKey,
          lotId: lot.id,
          saleType: targetSaleType,
          updatedAt: new Date().toISOString(),
          confirmedByUserId: input.actorUserId
        });
      }
    }

    await renewLease(operationKey, "checkpoint");
    batch = await checkpointWhatnotImportOperation(config, {
      scopeKey: input.scopeKey,
      batchId: batch.batchId,
      attemptId: input.attemptId,
      operationKey,
      outcome: operation.plan.outcome,
      saleId: String(saleIdNumber),
      lotId: lot.id,
      completedAt: new Date().toISOString(),
      leaseExpiresAt: new Date(Date.now() + input.leaseMs).toISOString()
    });

    if (operation.plan.outcome === "imported") importedCount += 1;
    else if (operation.plan.outcome === "updated") updatedCount += 1;
    else skippedCount += 1;
  }

  return { batch, importedCount, updatedCount, skippedCount };
}
