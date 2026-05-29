import { HttpError } from "../../lib/auth";
import { upsertSaleDocument } from "../../lib/cosmos/salesRepository";
import { getEffectiveSyncSnapshot } from "../../lib/cosmos/syncSnapshotRepository";
import {
    claimPendingWhatnotImportBatch,
    completeWhatnotImportBatch,
    getWhatnotConnection,
    getWhatnotSaleImportMappingByExternalSaleKeyHash,
    releaseClaimedWhatnotImportBatch,
    upsertWhatnotConnection,
    upsertWhatnotSaleImportMapping,
    upsertWhatnotTargetMapping
} from "../../lib/cosmos/whatnotRepository";
import {
    buildWhatnotRememberedMatchKeys,
    hashWhatnotExternalSaleKey,
    hashWhatnotMatchKey
} from "../../lib/whatnot";
import type {
    ApiConfig,
    WhatnotImportRowDocument,
    WhatnotMappedSaleType
} from "../../types";
import { buildGroupedImportRow, buildManualConfirmGroupKey } from "./importGrouping";
import {
    allocateImportedSaleId,
    buildImportedSalePayload,
    buildMergedManualSalePayload,
    buildMutationId
} from "./saleBuilders";
import {
    buildLotSnapshots,
    normalizeId,
    parseLotIdNumber,
    resolveWhatnotScope,
    type ReviewDecisionInput
} from "./serviceCore";

export async function confirmWhatnotImportBatchForActor(
  config: ApiConfig,
  actorUserId: string,
  input: {
    batchId: string;
    workspaceId?: string;
    decisions: ReviewDecisionInput[];
  }
): Promise<{ importedCount: number; updatedCount: number; skippedCount: number }> {
  const scope = await resolveWhatnotScope(config, actorUserId, input.workspaceId, false);
  const connection = await getWhatnotConnection(config, scope.connectionScopeKey);

  const claim = await claimPendingWhatnotImportBatch(
    config,
    scope.partitionKey,
    input.batchId,
    new Date().toISOString()
  );
  if (claim.status === "not_found") {
    throw new HttpError(404, "Whatnot review batch was not found.");
  }
  if (claim.status === "already_completed" && claim.batch) {
    return {
      importedCount: claim.batch.importedCount,
      updatedCount: claim.batch.updatedCount,
      skippedCount: claim.batch.skippedCount
    };
  }
  if (claim.status !== "claimed" || !claim.batch) {
    throw new HttpError(409, "Whatnot review batch is already being confirmed. Refresh and try again.");
  }

  const batch = claim.batch;
  let writeStarted = false;

  try {
    const snapshot = await getEffectiveSyncSnapshot(config, scope.partitionKey);
    const lots = buildLotSnapshots(snapshot?.lots ?? []);
    const decisionsByRowId = new Map(
      input.decisions.map((decision) => [normalizeId(decision.rowId), decision] as const)
    );
    const manualGroupKeyByRowId = new Map<string, string>();
    const manualGroupRowsByKey = new Map<string, WhatnotImportRowDocument[]>();

    for (const row of batch.rows) {
      const decision = decisionsByRowId.get(row.rowId);
      if (!decision || decision.skip) continue;

      const targetLotId = parseLotIdNumber(decision.lotId ?? row.suggestedLotId);
      const requestedTargetKind = decision.targetKind ?? row.targetKind ?? "new";
      const requestedTargetSaleId = normalizeId(decision.targetSaleId ?? row.targetSaleId);
      if (!targetLotId || requestedTargetKind !== "manual_candidate" || !requestedTargetSaleId) {
        continue;
      }

      const groupKeyBase = buildManualConfirmGroupKey(row, String(targetLotId), requestedTargetSaleId);
      if (!groupKeyBase) {
        continue;
      }
      const groupKey = groupKeyBase;
      manualGroupKeyByRowId.set(row.rowId, groupKey);
      const groupRows = manualGroupRowsByKey.get(groupKey) ?? [];
      groupRows.push(row);
      manualGroupRowsByKey.set(groupKey, groupRows);
    }

    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const nextSaleIdByLotId = new Map<string, number>();
    const processedManualGroupKeys = new Set<string>();

    for (const row of batch.rows) {
      const decision = decisionsByRowId.get(row.rowId);
      if (!decision || decision.skip) {
        skippedCount += 1;
        continue;
      }

      const targetLotId = parseLotIdNumber(decision.lotId ?? row.suggestedLotId);
      if (!targetLotId) {
        throw new HttpError(400, `Lot is required for row ${row.rowId}.`);
      }

      const lot = lots.find((candidate) => Number(candidate.id) === targetLotId);
      if (!lot) {
        throw new HttpError(400, `Lot ${targetLotId} was not found in the current scope.`);
      }

      const requestedTargetKind = decision.targetKind ?? row.targetKind ?? "new";
      const requestedTargetSaleId = normalizeId(decision.targetSaleId ?? row.targetSaleId);
      const desiredSaleType = lot.lotType === "singles"
        ? "pack"
        : (decision.saleType ?? row.suggestedSaleType);
      const targetSaleType: WhatnotMappedSaleType = desiredSaleType ?? row.suggestedSaleType ?? "pack";
      if (requestedTargetKind !== "manual_candidate") {
        if (!desiredSaleType) {
          throw new HttpError(400, `Sale type is required for row ${row.rowId}.`);
        }
        if (desiredSaleType === "rtyh" && (!Number.isFinite(Number(decision.packsCount)) || Number(decision.packsCount) <= 0)) {
          throw new HttpError(400, `RTYH rows require packs sold for row ${row.rowId}.`);
        }
      }

      const externalSaleKeyHash = hashWhatnotExternalSaleKey(
        row.externalAccountId,
        row.externalOrderId,
        row.externalOrderItemId
      );
      const existingMapping = await getWhatnotSaleImportMappingByExternalSaleKeyHash(
        config,
        scope.partitionKey,
        externalSaleKeyHash
      );

      let saleIdNumber: number;
      let updateMode: "new" | "mapped" | "manual" = "new";
      let salePayload: Record<string, unknown>;
      let shouldWriteSale = true;

      if (requestedTargetKind === "manual_candidate") {
        if (!requestedTargetSaleId) {
          throw new HttpError(400, `Manual duplicate rows require a target sale for row ${row.rowId}.`);
        }
        saleIdNumber = Math.max(1, Math.floor(Number(requestedTargetSaleId) || 0));
        if (!saleIdNumber) {
          throw new HttpError(400, `Manual duplicate rows require a valid target sale for row ${row.rowId}.`);
        }
        const manualGroupKey = manualGroupKeyByRowId.get(row.rowId);
        const groupedRows = manualGroupKey ? manualGroupRowsByKey.get(manualGroupKey) : null;
        const groupedImportRow = groupedRows && groupedRows.length > 1
          ? buildGroupedImportRow(groupedRows)
          : row;
        shouldWriteSale = !manualGroupKey || !processedManualGroupKeys.has(manualGroupKey);
        if (manualGroupKey) {
          processedManualGroupKeys.add(manualGroupKey);
        }
        salePayload = await buildMergedManualSalePayload(
          config,
          scope.partitionKey,
          groupedImportRow,
          decision,
          lot,
          saleIdNumber
        );
        updateMode = "manual";
      } else if (requestedTargetKind === "whatnot_mapping" && requestedTargetSaleId) {
        saleIdNumber = Math.max(1, Math.floor(Number(requestedTargetSaleId) || 0));
        if (!saleIdNumber) {
          throw new HttpError(400, `Target sale is invalid for row ${row.rowId}.`);
        }
        salePayload = buildImportedSalePayload(row, decision, lot, saleIdNumber);
        updateMode = "mapped";
      } else if (existingMapping) {
        saleIdNumber = Math.max(1, Math.floor(Number(existingMapping.saleId) || 0));
        salePayload = buildImportedSalePayload(row, decision, lot, saleIdNumber);
        updateMode = "mapped";
      } else {
        saleIdNumber = await allocateImportedSaleId(config, scope.partitionKey, lot.id, nextSaleIdByLotId);
        salePayload = buildImportedSalePayload(row, decision, lot, saleIdNumber);
      }

      if (shouldWriteSale) {
        writeStarted = true;
        await upsertSaleDocument(config, {
          scopeKey: scope.partitionKey,
          lotId: lot.id,
          saleId: String(saleIdNumber),
          sale: salePayload,
          updatedBy: actorUserId,
          mutationId: buildMutationId(batch.batchId, row)
        });
      }

      writeStarted = true;
      await upsertWhatnotSaleImportMapping(config, {
        docType: "sale_import_mapping",
        scopeKey: scope.partitionKey,
        externalSaleKeyHash,
        provider: "whatnot",
        externalAccountId: row.externalAccountId,
        externalSaleId: row.externalSaleId,
        externalOrderId: row.externalOrderId,
        externalOrderItemId: row.externalOrderItemId,
        lotId: lot.id,
        saleId: String(saleIdNumber),
        payloadFingerprint: row.payloadFingerprint,
        updatedAt: new Date().toISOString()
      });

      const matchKeys = [...new Set(buildWhatnotRememberedMatchKeys(row))];
      for (const matchKey of matchKeys) {
        writeStarted = true;
        await upsertWhatnotTargetMapping(config, {
          scopeKey: scope.partitionKey,
          matchKeyHash: hashWhatnotMatchKey(matchKey),
          docType: "whatnot_target_mapping",
          provider: "whatnot",
          externalAccountId: row.externalAccountId,
          matchKey,
          lotId: lot.id,
          saleType: targetSaleType,
          updatedAt: new Date().toISOString(),
          confirmedByUserId: actorUserId
        });
      }

      if (updateMode === "new") {
        importedCount += 1;
      } else {
        updatedCount += 1;
      }
    }

    const completedAt = new Date().toISOString();
    writeStarted = true;
    const completedBatch = await completeWhatnotImportBatch(config, batch, {
      importedCount,
      updatedCount,
      skippedCount,
      completedAt
    });

    if (batch.origin === "oauth_sync" && connection && connection.status === "active") {
      writeStarted = true;
      await upsertWhatnotConnection(config, {
        ...connection,
        updatedAt: new Date().toISOString(),
        lastSyncedAt: new Date().toISOString()
      });
    }

    return {
      importedCount: completedBatch.importedCount,
      updatedCount: completedBatch.updatedCount,
      skippedCount: completedBatch.skippedCount
    };
  } catch (error) {
    if (!writeStarted) {
      await releaseClaimedWhatnotImportBatch(
        config,
        batch,
        new Date().toISOString(),
        error instanceof Error ? error.message : "Whatnot confirmation failed."
      ).catch(() => null);
    }
    throw error;
  }
}
