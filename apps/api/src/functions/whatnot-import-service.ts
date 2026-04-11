import { HttpError } from "../lib/auth";
import {
  createPendingWhatnotImportBatch,
  getWhatnotConnection,
  getWhatnotSaleImportMappingByExternalSaleKeyHash,
  listPendingWhatnotImportBatches,
  upsertWhatnotConnection,
  upsertWhatnotImportBatch
} from "../lib/cosmos/whatnotRepository";
import { getEffectiveSyncSnapshot } from "../lib/cosmos/syncSnapshotRepository";
import {
  buildWhatnotImportRowFromNormalizedInput,
  fetchWhatnotOrdersPage,
  hashWhatnotExternalSaleKey
} from "../lib/whatnot";
import type {
  ApiConfig,
  WhatnotImportBatchDocument,
  WhatnotImportRowDocument
} from "../types";
import {
  buildLotSnapshots,
  buildSyncWindowStart,
  CreateWhatnotImportBatchFromRowsInput,
  ensureFreshWhatnotConnection,
  MAX_SYNC_ROWS,
  normalizeId,
  resolveBatchExternalAccountId,
  resolveWhatnotScope
} from "./whatnot-service-core";
import { decorateDuplicateState, resolveSuggestedTarget } from "./whatnot-duplicate-detection";
import { attachManualDuplicateCandidates } from "./whatnot-import-grouping";

export { confirmWhatnotImportBatchForActor } from "./whatnot-import-confirm";

async function clearPendingWhatnotImportBatches(
  config: ApiConfig,
  scopeKey: string
): Promise<number> {
  const pendingBatches = await listPendingWhatnotImportBatches(config, scopeKey);
  if (pendingBatches.length === 0) {
    return 0;
  }

  const now = new Date().toISOString();
  await Promise.all(pendingBatches.map((batch) => upsertWhatnotImportBatch(config, {
    ...batch,
    status: "completed",
    rows: [],
    completedAt: now,
    updatedAt: now,
    errorMessage: "discarded"
  })));
  return pendingBatches.length;
}

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

  const enrichedRows = await attachManualDuplicateCandidates(config, scope.partitionKey, lots, rows);
  await clearPendingWhatnotImportBatches(config, scope.partitionKey);

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
    rows: enrichedRows
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

  const enrichedRows = await attachManualDuplicateCandidates(config, scope.partitionKey, lots, rows);
  await clearPendingWhatnotImportBatches(config, scope.partitionKey);

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
    rows: enrichedRows
  });
}

export async function discardWhatnotImportBatchForActor(
  config: ApiConfig,
  actorUserId: string,
  input: {
    batchId?: string;
    workspaceId?: string;
  }
): Promise<{ discarded: boolean; batchId: string | null }> {
  const scope = await resolveWhatnotScope(config, actorUserId, input.workspaceId, false);
  const discardedCount = await clearPendingWhatnotImportBatches(config, scope.partitionKey);
  const normalizedBatchId = normalizeId(input.batchId);
  if (discardedCount <= 0) {
    return {
      discarded: false,
      batchId: normalizedBatchId || null
    };
  }

  return {
    discarded: true,
    batchId: normalizedBatchId || null
  };
}
