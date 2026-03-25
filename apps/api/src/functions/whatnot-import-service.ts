import { HttpError } from "../lib/auth";
import {
  createPendingWhatnotImportBatch,
  getWhatnotConnection,
  getWhatnotImportBatch,
  getWhatnotSaleImportMappingByExternalSaleKeyHash,
  upsertWhatnotConnection,
  upsertWhatnotImportBatch,
  upsertWhatnotSaleImportMapping,
  upsertWhatnotTargetMapping
} from "../lib/cosmos/whatnotRepository";
import { upsertSaleDocument } from "../lib/cosmos/salesRepository";
import { getEffectiveSyncSnapshot } from "../lib/cosmos/syncSnapshotRepository";
import {
  buildWhatnotImportRowFromNormalizedInput,
  buildWhatnotRememberedMatchKeys,
  fetchWhatnotOrdersPage,
  hashWhatnotExternalSaleKey,
  hashWhatnotMatchKey
} from "../lib/whatnot";
import type {
  ApiConfig,
  WhatnotImportBatchDocument,
  WhatnotImportRowDocument
} from "../types";
import {
  allocateImportedSaleId,
  buildImportedSalePayload,
  buildLotSnapshots,
  buildMutationId,
  buildSyncWindowStart,
  CreateWhatnotImportBatchFromRowsInput,
  decorateDuplicateState,
  ensureFreshWhatnotConnection,
  MAX_SYNC_ROWS,
  normalizeId,
  parseLotIdNumber,
  resolveBatchExternalAccountId,
  resolveSuggestedTarget,
  resolveWhatnotScope,
  ReviewDecisionInput
} from "./whatnot-service-core";

export async function syncWhatnotOrdersForActor(
  config: ApiConfig,
  actorUserId: string,
  workspaceId?: string
): Promise<WhatnotImportBatchDocument> {
  const scope = await resolveWhatnotScope(config, actorUserId, workspaceId, Boolean(workspaceId));
  const existingConnection = await getWhatnotConnection(config, scope.connectionScopeKey);
  if (!existingConnection || existingConnection.status !== "active") {
    throw new HttpError(404, "Connect Whatnot first.");
  }

  const connection = await ensureFreshWhatnotConnection(config, existingConnection);
  const snapshot = await getEffectiveSyncSnapshot(config, scope.partitionKey);
  const lots = buildLotSnapshots(snapshot?.lots ?? []);
  const createdAtGte = buildSyncWindowStart(connection);
  const rows: WhatnotImportRowDocument[] = [];
  let after: string | null = null;

  while (rows.length < MAX_SYNC_ROWS) {
    const page = await fetchWhatnotOrdersPage(config, connection.accessTokenCiphertext, connection.externalAccountId, {
      createdAtGte,
      after
    });

    for (const rawRow of page.rows) {
      const externalSaleKeyHash = hashWhatnotExternalSaleKey(
        rawRow.externalAccountId,
        rawRow.externalOrderId,
        rawRow.externalOrderItemId
      );
      const existingMapping = await getWhatnotSaleImportMappingByExternalSaleKeyHash(
        config,
        scope.partitionKey,
        externalSaleKeyHash
      );
      let row = decorateDuplicateState(rawRow, existingMapping);
      row = await resolveSuggestedTarget(config, scope.partitionKey, lots, row);
      rows.push(row);
      if (rows.length >= MAX_SYNC_ROWS) break;
    }

    if (!page.nextCursor || page.rows.length === 0 || rows.length >= MAX_SYNC_ROWS) {
      break;
    }
    after = page.nextCursor;
  }

  const now = new Date().toISOString();
  const batch = await createPendingWhatnotImportBatch(config, {
    docType: "whatnot_import_batch",
    userId: scope.partitionKey,
    scopeKey: scope.partitionKey,
    origin: "oauth_sync",
    provider: "whatnot",
    externalAccountId: connection.externalAccountId,
    startedByUserId: actorUserId,
    startedAt: now,
    completedAt: null,
    updatedAt: now,
    importWindowStartedAt: createdAtGte,
    importedCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    rows
  });

  await upsertWhatnotConnection(config, {
    ...connection,
    lastSyncedAt: now,
    syncCursor: after,
    syncWindowStartedAt: createdAtGte,
    updatedAt: now
  });

  return batch;
}

export async function createWhatnotImportBatchFromRowsForActor(
  config: ApiConfig,
  actorUserId: string,
  input: CreateWhatnotImportBatchFromRowsInput
): Promise<WhatnotImportBatchDocument> {
  const scope = await resolveWhatnotScope(config, actorUserId, input.workspaceId, false);
  const rowsInput = Array.isArray(input.rows) ? input.rows : [];
  if (rowsInput.length === 0) {
    throw new HttpError(400, "Whatnot import requires at least one row.");
  }

  const externalAccountId = resolveBatchExternalAccountId(input.externalAccountId, rowsInput, scope.partitionKey);
  const snapshot = await getEffectiveSyncSnapshot(config, scope.partitionKey);
  const lots = buildLotSnapshots(snapshot?.lots ?? []);
  const seenExternalHashes = new Set<string>();
  const rows: WhatnotImportRowDocument[] = [];

  for (const rawRow of rowsInput.slice(0, MAX_SYNC_ROWS)) {
    const normalizedRow = buildWhatnotImportRowFromNormalizedInput({
      ...rawRow,
      externalAccountId
    });
    const externalSaleKeyHash = hashWhatnotExternalSaleKey(
      normalizedRow.externalAccountId,
      normalizedRow.externalOrderId,
      normalizedRow.externalOrderItemId
    );
    if (seenExternalHashes.has(externalSaleKeyHash)) {
      throw new HttpError(400, `Duplicate Whatnot import row for ${normalizedRow.externalSaleId}.`);
    }
    seenExternalHashes.add(externalSaleKeyHash);

    const existingMapping = await getWhatnotSaleImportMappingByExternalSaleKeyHash(
      config,
      scope.partitionKey,
      externalSaleKeyHash
    );
    let row = decorateDuplicateState(normalizedRow, existingMapping);
    row = await resolveSuggestedTarget(config, scope.partitionKey, lots, row);
    rows.push(row);
  }

  const now = new Date().toISOString();
  return createPendingWhatnotImportBatch(config, {
    docType: "whatnot_import_batch",
    userId: scope.partitionKey,
    scopeKey: scope.partitionKey,
    origin: "csv_manual",
    provider: "whatnot",
    externalAccountId,
    startedByUserId: actorUserId,
    startedAt: now,
    completedAt: null,
    updatedAt: now,
    importWindowStartedAt: now,
    importedCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    rows
  });
}

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

  const batch = await getWhatnotImportBatch(config, scope.partitionKey, input.batchId);
  if (!batch || batch.status !== "pending_review") {
    throw new HttpError(404, "Whatnot review batch was not found.");
  }

  const snapshot = await getEffectiveSyncSnapshot(config, scope.partitionKey);
  const lots = buildLotSnapshots(snapshot?.lots ?? []);
  const decisionsByRowId = new Map(
    input.decisions.map((decision) => [normalizeId(decision.rowId), decision] as const)
  );

  let importedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const nextSaleIdByLotId = new Map<string, number>();

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

    const desiredSaleType = lot.lotType === "singles"
      ? "pack"
      : (decision.saleType ?? row.suggestedSaleType);
    if (!desiredSaleType) {
      throw new HttpError(400, `Sale type is required for row ${row.rowId}.`);
    }
    if (desiredSaleType === "rtyh" && (!Number.isFinite(Number(decision.packsCount)) || Number(decision.packsCount) <= 0)) {
      throw new HttpError(400, `RTYH rows require packs sold for row ${row.rowId}.`);
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

    const saleIdNumber = existingMapping
      ? Math.max(1, Math.floor(Number(existingMapping.saleId) || 0))
      : await allocateImportedSaleId(config, scope.partitionKey, lot.id, nextSaleIdByLotId);
    const salePayload = buildImportedSalePayload(row, decision, lot, saleIdNumber);
    await upsertSaleDocument(config, {
      scopeKey: scope.partitionKey,
      lotId: lot.id,
      saleId: String(saleIdNumber),
      sale: salePayload,
      updatedBy: actorUserId,
      mutationId: buildMutationId(batch.batchId, row)
    });

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
      await upsertWhatnotTargetMapping(config, {
        scopeKey: scope.partitionKey,
        matchKeyHash: hashWhatnotMatchKey(matchKey),
        docType: "whatnot_target_mapping",
        provider: "whatnot",
        externalAccountId: row.externalAccountId,
        matchKey,
        lotId: lot.id,
        saleType: desiredSaleType,
        updatedAt: new Date().toISOString(),
        confirmedByUserId: actorUserId
      });
    }

    if (existingMapping) {
      updatedCount += 1;
    } else {
      importedCount += 1;
    }
  }

  await upsertWhatnotImportBatch(config, {
    ...batch,
    status: "completed",
    importedCount,
    updatedCount,
    skippedCount,
    completedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  if (batch.origin === "oauth_sync" && connection && connection.status === "active") {
    await upsertWhatnotConnection(config, {
      ...connection,
      updatedAt: new Date().toISOString(),
      lastSyncedAt: new Date().toISOString()
    });
  }

  return {
    importedCount,
    updatedCount,
    skippedCount
  };
}
