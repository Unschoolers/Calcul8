import { HttpError } from "../lib/auth";
import {
  createPendingWhatnotImportBatch,
  getLatestPendingWhatnotImportBatch,
  getWhatnotConnection,
  getWhatnotImportBatch,
  getWhatnotSaleImportMappingByExternalSaleKeyHash,
  listPendingWhatnotImportBatches,
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
  WhatnotImportRowDocument,
  WhatnotMappedSaleType,
  SaleDocument
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
  buildMergedManualSalePayload,
  buildWhatnotManualDuplicateCandidate,
  resolveSuggestedTarget,
  resolveWhatnotScope,
  ReviewDecisionInput
} from "./whatnot-service-core";
import { listSalesForLot } from "../lib/cosmos/salesRepository";

function normalizeGroupingValue(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeGroupingDate(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value.slice(0, 10);
  }
  return formatLocalDate(parsed);
}

function buildManualCandidateGroupKey(
  row: Pick<WhatnotImportRowDocument, "buyerName" | "listingTitle" | "title" | "orderPlacedAt" | "date" | "externalAccountId">,
  lotId: string
): string | null {
  const buyerName = normalizeGroupingValue(row.buyerName);
  const listingTitle = normalizeGroupingValue(row.listingTitle ?? row.title);
  const orderDate = normalizeGroupingDate(row.orderPlacedAt ?? row.date);
  const normalizedLotId = normalizeId(lotId);
  if (!buyerName || !listingTitle || !orderDate || !normalizedLotId) {
    return null;
  }
  return [
    normalizeGroupingValue(row.externalAccountId),
    normalizedLotId,
    orderDate,
    buyerName,
    listingTitle
  ].join("::");
}

function buildManualConfirmGroupKey(
  row: Pick<WhatnotImportRowDocument, "listingTitle" | "title" | "orderPlacedAt" | "date" | "externalAccountId">,
  lotId: string,
  targetSaleId: string
): string | null {
  const listingTitle = normalizeGroupingValue(row.listingTitle ?? row.title);
  const orderDate = normalizeGroupingDate(row.orderPlacedAt ?? row.date);
  const normalizedLotId = normalizeId(lotId);
  const normalizedTargetSaleId = normalizeId(targetSaleId);
  if (!listingTitle || !orderDate || !normalizedLotId || !normalizedTargetSaleId) {
    return null;
  }
  return [
    normalizedTargetSaleId,
    normalizeGroupingValue(row.externalAccountId),
    normalizedLotId,
    orderDate,
    listingTitle
  ].join("::");
}

function buildGroupedImportRow(rows: WhatnotImportRowDocument[]): WhatnotImportRowDocument {
  const firstRow = rows[0]!;
  const resolveFirstNonEmpty = (selector: (row: WhatnotImportRowDocument) => unknown): string | undefined => {
    for (const row of rows) {
      const value = String(selector(row) ?? "").trim();
      if (value) return value;
    }
    return undefined;
  };
  return {
    ...firstRow,
    buyerName: resolveFirstNonEmpty((row) => row.buyerName),
    listingTitle: resolveFirstNonEmpty((row) => row.listingTitle) ?? firstRow.listingTitle,
    title: resolveFirstNonEmpty((row) => row.title) ?? firstRow.title,
    quantity: rows.reduce((sum, row) => sum + Math.max(1, Math.floor(Number(row.quantity) || 1)), 0),
    price: rows.reduce((sum, row) => sum + (Number(row.price) || 0), 0),
    buyerShipping: rows.reduce((sum, row) => sum + (Number(row.buyerShipping) || 0), 0)
  };
}

function applyManualDuplicateCandidate(
  row: WhatnotImportRowDocument,
  manualDuplicateCandidate: NonNullable<WhatnotImportRowDocument["manualDuplicateCandidate"]>
): WhatnotImportRowDocument {
  return {
    ...row,
    manualDuplicateCandidate,
    targetKind: "manual_candidate",
    targetSaleId: manualDuplicateCandidate.saleId
  };
}

async function attachManualDuplicateCandidates(
  config: ApiConfig,
  scopeKey: string,
  lots: ReturnType<typeof buildLotSnapshots>,
  rows: WhatnotImportRowDocument[]
): Promise<WhatnotImportRowDocument[]> {
  const salesByLot = new Map<string, Promise<SaleDocument[]>>();
  const getSalesForLot = (lotId: string): Promise<SaleDocument[]> => {
    const normalizedLotId = normalizeId(lotId);
    const cached = salesByLot.get(normalizedLotId);
    if (cached) return cached;
    const request = listSalesForLot(config, scopeKey, normalizedLotId);
    salesByLot.set(normalizedLotId, request);
    return request;
  };

  const individuallyMatchedRows = await Promise.all(rows.map(async (row) => {
    if (row.targetKind === "whatnot_mapping") {
      return row;
    }

    const lotId = parseLotIdNumber(row.suggestedLotId);
    if (!lotId) {
      return row;
    }

    const lot = lots.find((candidate) => Number(candidate.id) === lotId);
    if (!lot) {
      return row;
    }

    const sales = await getSalesForLot(lot.id);
    const manualDuplicateCandidate = buildWhatnotManualDuplicateCandidate(row, lot, sales);
    if (!manualDuplicateCandidate) {
      return row;
    }

    return applyManualDuplicateCandidate(row, manualDuplicateCandidate);
  }));

  const groupedRows = [...individuallyMatchedRows];
  const groupedIndexesByKey = new Map<string, number[]>();
  for (let index = 0; index < groupedRows.length; index += 1) {
    const row = groupedRows[index]!;
    if (row.targetKind === "whatnot_mapping" || row.manualDuplicateCandidate) {
      continue;
    }
    const lotId = parseLotIdNumber(row.suggestedLotId);
    if (!lotId) continue;
    const groupKey = buildManualCandidateGroupKey(row, String(lotId));
    if (!groupKey) continue;
    const groupIndexes = groupedIndexesByKey.get(groupKey) ?? [];
    groupIndexes.push(index);
    groupedIndexesByKey.set(groupKey, groupIndexes);
  }

  for (const indexes of groupedIndexesByKey.values()) {
    if (indexes.length <= 1) continue;
    const firstRow = groupedRows[indexes[0]!]!;
    const lotId = parseLotIdNumber(firstRow.suggestedLotId);
    if (!lotId) continue;
    const lot = lots.find((candidate) => Number(candidate.id) === lotId);
    if (!lot) continue;
    const sales = await getSalesForLot(lot.id);
    const groupedImportRow = buildGroupedImportRow(indexes.map((index) => groupedRows[index]!));
    const manualDuplicateCandidate = buildWhatnotManualDuplicateCandidate(groupedImportRow, lot, sales);
    if (!manualDuplicateCandidate) continue;

    for (const index of indexes) {
      groupedRows[index] = applyManualDuplicateCandidate(groupedRows[index]!, manualDuplicateCandidate);
    }
  }

  return groupedRows;
}

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
      await upsertSaleDocument(config, {
        scopeKey: scope.partitionKey,
        lotId: lot.id,
        saleId: String(saleIdNumber),
        sale: salePayload,
        updatedBy: actorUserId,
        mutationId: buildMutationId(batch.batchId, row)
      });
    }

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
