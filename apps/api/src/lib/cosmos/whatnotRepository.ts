import { randomUUID } from "node:crypto";
import type {
  ApiConfig,
  WhatnotConnectionDocument,
  WhatnotImportBatchDocument,
  WhatnotConfirmationDecisionDocument,
  WhatnotOAuthStateDocument,
  WhatnotSaleImportMappingDocument,
  WhatnotTargetMappingDocument
} from "../../types";
import { getContainers, isConflictError, isNotFoundError, isPreconditionFailedError, withCosmosRetry } from "./core";
import {
  whatnotConnectionId,
  whatnotImportBatchId,
  whatnotOAuthStateId,
  whatnotSaleImportMappingId,
  whatnotTargetMappingId
} from "./ids";

const WHATNOT_OAUTH_STATE_PARTITION_KEY = "oauth:whatnot";

function normalizeId(raw: unknown): string {
  return String(raw ?? "").trim();
}

function isWhatnotConnectionDocument(resource: unknown): resource is WhatnotConnectionDocument {
  return !!resource
    && typeof resource === "object"
    && (resource as { docType?: unknown }).docType === "whatnot_connection";
}

function isWhatnotOAuthStateDocument(resource: unknown): resource is WhatnotOAuthStateDocument {
  return !!resource
    && typeof resource === "object"
    && (resource as { docType?: unknown }).docType === "whatnot_oauth_state";
}

function isWhatnotImportBatchDocument(resource: unknown): resource is WhatnotImportBatchDocument {
  return !!resource
    && typeof resource === "object"
    && (resource as { docType?: unknown }).docType === "whatnot_import_batch";
}

function isWhatnotTargetMappingDocument(resource: unknown): resource is WhatnotTargetMappingDocument {
  return !!resource
    && typeof resource === "object"
    && (resource as { docType?: unknown }).docType === "whatnot_target_mapping";
}

function isWhatnotSaleImportMappingDocument(resource: unknown): resource is WhatnotSaleImportMappingDocument {
  return !!resource
    && typeof resource === "object"
    && (resource as { docType?: unknown }).docType === "sale_import_mapping";
}

function readCosmosEtag(document: unknown): string {
  if (!document || typeof document !== "object") return "";
  return String((document as { _etag?: unknown })._etag ?? "").trim();
}

function buildIfMatchOptions(etag: string) {
  return {
    accessCondition: {
      type: "IfMatch" as const,
      condition: etag
    }
  };
}

export type WhatnotImportBatchClaimResult =
  | { status: "claimed"; batch: WhatnotImportBatchDocument }
  | { status: "already_completed"; batch: WhatnotImportBatchDocument }
  | { status: "not_claimable"; batch: WhatnotImportBatchDocument }
  | { status: "idempotency_mismatch"; batch: WhatnotImportBatchDocument }
  | { status: "conflict"; batch: null }
  | { status: "not_found"; batch: null };

function isCosmosClaimConflict(error: unknown): boolean {
  return isPreconditionFailedError(error) || isConflictError(error);
}

export async function getWhatnotConnection(
  config: ApiConfig,
  scopeKey: string
): Promise<WhatnotConnectionDocument | null> {
  const { entitlements } = getContainers(config);
  const normalizedScopeKey = normalizeId(scopeKey);

  try {
    const { resource } = await withCosmosRetry(() =>
      entitlements.item(whatnotConnectionId(normalizedScopeKey), normalizedScopeKey).read<WhatnotConnectionDocument>()
    );
    return isWhatnotConnectionDocument(resource) ? resource : null;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export async function upsertWhatnotConnection(
  config: ApiConfig,
  document: WhatnotConnectionDocument
): Promise<WhatnotConnectionDocument> {
  const { entitlements } = getContainers(config);
  const normalizedScopeKey = normalizeId(document.scopeKey);
  const input: WhatnotConnectionDocument = {
    ...document,
    id: whatnotConnectionId(normalizedScopeKey),
    userId: normalizedScopeKey,
    scopeKey: normalizedScopeKey
  };
  const { resource } = await withCosmosRetry(() =>
    entitlements.items.upsert<WhatnotConnectionDocument>(input)
  );

  if (!resource) {
    throw new Error("Failed to upsert Whatnot connection.");
  }

  return resource;
}

export async function deleteWhatnotConnection(
  config: ApiConfig,
  scopeKey: string
): Promise<void> {
  const { entitlements } = getContainers(config);
  const normalizedScopeKey = normalizeId(scopeKey);
  try {
    await withCosmosRetry(() =>
      entitlements.item(whatnotConnectionId(normalizedScopeKey), normalizedScopeKey).delete()
    );
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }
}

export async function createWhatnotOAuthState(
  config: ApiConfig,
  input: Omit<WhatnotOAuthStateDocument, "id" | "docType" | "userId">
): Promise<WhatnotOAuthStateDocument> {
  const { entitlements } = getContainers(config);
  const document: WhatnotOAuthStateDocument = {
    id: whatnotOAuthStateId(input.state),
    docType: "whatnot_oauth_state",
    userId: WHATNOT_OAUTH_STATE_PARTITION_KEY,
    ...input
  };
  const { resource } = await withCosmosRetry(() =>
    entitlements.items.upsert<WhatnotOAuthStateDocument>(document)
  );

  if (!resource) {
    throw new Error("Failed to create Whatnot OAuth state.");
  }

  return resource;
}

export async function consumeWhatnotOAuthState(
  config: ApiConfig,
  state: string
): Promise<WhatnotOAuthStateDocument | null> {
  const { entitlements } = getContainers(config);
  const id = whatnotOAuthStateId(normalizeId(state));

  try {
    const { resource } = await withCosmosRetry(() =>
      entitlements.item(id, WHATNOT_OAUTH_STATE_PARTITION_KEY).read<WhatnotOAuthStateDocument>()
    );
    if (!isWhatnotOAuthStateDocument(resource)) {
      return null;
    }

    try {
      await withCosmosRetry(() =>
        entitlements.item(id, WHATNOT_OAUTH_STATE_PARTITION_KEY).delete()
      );
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }

    return resource;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export async function getLatestPendingWhatnotImportBatch(
  config: ApiConfig,
  scopeKey: string
): Promise<WhatnotImportBatchDocument | null> {
  const { syncSnapshots } = getContainers(config);
  const normalizedScopeKey = normalizeId(scopeKey);
  const querySpec = {
    query: `
      SELECT TOP 1 * FROM c
      WHERE c.userId = @scopeKey
        AND c.docType = @docType
        AND c.status IN (@pendingStatus, @recoverableStatus, @processingStatus)
      ORDER BY c.updatedAt DESC
    `,
    parameters: [
      { name: "@scopeKey", value: normalizedScopeKey },
      { name: "@docType", value: "whatnot_import_batch" },
      { name: "@pendingStatus", value: "pending_review" },
      { name: "@recoverableStatus", value: "recoverable_error" },
      { name: "@processingStatus", value: "processing" }
    ]
  };
  const iterator = syncSnapshots.items.query<WhatnotImportBatchDocument>(querySpec, {
    partitionKey: normalizedScopeKey,
    maxItemCount: 1
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  const resource = resources?.find(isWhatnotImportBatchDocument);
  return resource ?? null;
}

export async function listPendingWhatnotImportBatches(
  config: ApiConfig,
  scopeKey: string
): Promise<WhatnotImportBatchDocument[]> {
  const { syncSnapshots } = getContainers(config);
  const normalizedScopeKey = normalizeId(scopeKey);
  const querySpec = {
    query: `
      SELECT * FROM c
      WHERE c.userId = @scopeKey
        AND c.docType = @docType
        AND c.status IN (@pendingStatus, @recoverableStatus)
      ORDER BY c.updatedAt DESC
    `,
    parameters: [
      { name: "@scopeKey", value: normalizedScopeKey },
      { name: "@docType", value: "whatnot_import_batch" },
      { name: "@pendingStatus", value: "pending_review" },
      { name: "@recoverableStatus", value: "recoverable_error" }
    ]
  };
  const iterator = syncSnapshots.items.query<WhatnotImportBatchDocument>(querySpec, {
    partitionKey: normalizedScopeKey
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return (resources ?? []).filter(isWhatnotImportBatchDocument);
}

export async function getWhatnotImportBatch(
  config: ApiConfig,
  scopeKey: string,
  batchId: string
): Promise<WhatnotImportBatchDocument | null> {
  const { syncSnapshots } = getContainers(config);
  const normalizedScopeKey = normalizeId(scopeKey);

  try {
    const { resource } = await withCosmosRetry(() =>
      syncSnapshots
        .item(whatnotImportBatchId(normalizedScopeKey, normalizeId(batchId)), normalizedScopeKey)
        .read<WhatnotImportBatchDocument>()
    );
    return isWhatnotImportBatchDocument(resource) ? resource : null;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export async function upsertWhatnotImportBatch(
  config: ApiConfig,
  document: Omit<WhatnotImportBatchDocument, "id">
): Promise<WhatnotImportBatchDocument> {
  const { syncSnapshots } = getContainers(config);
  const normalizedScopeKey = normalizeId(document.scopeKey);
  const input: WhatnotImportBatchDocument = {
    ...document,
    id: whatnotImportBatchId(normalizedScopeKey, document.batchId),
    userId: normalizedScopeKey,
    scopeKey: normalizedScopeKey
  };
  const { resource } = await withCosmosRetry(() =>
    syncSnapshots.items.upsert<WhatnotImportBatchDocument>(input)
  );

  if (!resource) {
    throw new Error("Failed to upsert Whatnot import batch.");
  }

  return resource;
}

export async function claimPendingWhatnotImportBatch(
  config: ApiConfig,
  scopeKey: string,
  batchId: string,
  claimedAt: string,
  recovery?: {
    fingerprint: string;
    decisions: WhatnotConfirmationDecisionDocument[];
    attemptId: string;
    actorUserId: string;
    leaseExpiresAt: string;
  }
): Promise<WhatnotImportBatchClaimResult> {
  const { syncSnapshots } = getContainers(config);
  const normalizedScopeKey = normalizeId(scopeKey);
  const normalizedBatchId = normalizeId(batchId);
  const existing = await getWhatnotImportBatch(config, normalizedScopeKey, normalizedBatchId);
  if (!existing) {
    return { status: "not_found", batch: null };
  }

  if (
    recovery
    && existing.confirmationFingerprint
    && existing.confirmationFingerprint !== recovery.fingerprint
  ) {
    return { status: "idempotency_mismatch", batch: existing };
  }

  if (existing.status === "completed") {
    return { status: "already_completed", batch: existing };
  }

  const leaseExpiresAt = Date.parse(existing.confirmationAttempt?.leaseExpiresAt ?? "");
  const claimedAtMs = Date.parse(claimedAt);
  const processingLeaseExpired = existing.status === "processing"
    && (!Number.isFinite(leaseExpiresAt) || leaseExpiresAt <= claimedAtMs);
  const canClaim = existing.status === "pending_review"
    || existing.status === "recoverable_error"
    || processingLeaseExpired;

  if (!canClaim) {
    return { status: "not_claimable", batch: existing };
  }

  const etag = readCosmosEtag(existing);
  if (!etag) {
    return { status: "conflict", batch: null };
  }

  const document: WhatnotImportBatchDocument = {
    ...existing,
    status: "processing",
    updatedAt: claimedAt,
    ...(recovery ? {
      confirmationFingerprint: existing.confirmationFingerprint || recovery.fingerprint,
      confirmationDecisions: existing.confirmationDecisions ?? recovery.decisions,
      confirmationAttempt: {
        attemptId: normalizeId(recovery.attemptId),
        actorUserId: normalizeId(recovery.actorUserId),
        // Legacy processing batches predate attempt metadata. Reclaiming one is
        // necessarily recovery attempt 2, not a fresh first execution.
        attemptNumber: Math.max(
          0,
          existing.confirmationAttempt?.attemptNumber ?? (existing.status === "processing" ? 1 : 0)
        ) + 1,
        adoptedLegacyProcessing: existing.confirmationAttempt?.adoptedLegacyProcessing
          ?? (existing.status === "processing" && !existing.confirmationAttempt),
        claimedAt,
        leaseExpiresAt: recovery.leaseExpiresAt
      },
      failedOperationKey: undefined,
      failedPhase: undefined,
      errorMessage: undefined
    } : {})
  };

  try {
    const { resource } = await withCosmosRetry(() =>
      syncSnapshots
        .item(document.id, normalizedScopeKey)
        .replace<WhatnotImportBatchDocument>(document, buildIfMatchOptions(etag))
    );
    if (!resource) {
      throw new Error("Failed to claim Whatnot import batch.");
    }
    return { status: "claimed", batch: resource };
  } catch (error) {
    if (isCosmosClaimConflict(error)) {
      return { status: "conflict", batch: null };
    }
    throw error;
  }
}

export async function checkpointWhatnotImportOperation(
  config: ApiConfig,
  input: {
    scopeKey: string;
    batchId: string;
    attemptId: string;
    operationKey: string;
    outcome: "imported" | "updated" | "skipped";
    saleId?: string;
    lotId?: string;
    completedAt: string;
    leaseExpiresAt?: string;
  }
): Promise<WhatnotImportBatchDocument> {
  const scopeKey = normalizeId(input.scopeKey);
  const batch = await getWhatnotImportBatch(config, scopeKey, input.batchId);
  if (!batch || batch.status !== "processing") {
    throw new Error("Whatnot import batch is not being confirmed.");
  }
  if (normalizeId(batch.confirmationAttempt?.attemptId) !== normalizeId(input.attemptId)) {
    throw new Error("Whatnot import batch confirmation attempt changed.");
  }
  const operationKey = normalizeId(input.operationKey);
  if (batch.confirmationProgress?.[operationKey]) return batch;
  const etag = readCosmosEtag(batch);
  if (!etag) throw new Error("Whatnot import batch changed while it was being confirmed.");

  const document: WhatnotImportBatchDocument = {
    ...batch,
    confirmationProgress: {
      ...(batch.confirmationProgress ?? {}),
      [operationKey]: {
        outcome: input.outcome,
        ...(normalizeId(input.saleId) ? { saleId: normalizeId(input.saleId) } : {}),
        ...(normalizeId(input.lotId) ? { lotId: normalizeId(input.lotId) } : {}),
        completedAt: input.completedAt
      }
    },
    confirmationAttempt: batch.confirmationAttempt && normalizeId(input.leaseExpiresAt)
      ? {
        ...batch.confirmationAttempt,
        leaseExpiresAt: normalizeId(input.leaseExpiresAt)
      }
      : batch.confirmationAttempt,
    updatedAt: input.completedAt
  };
  const { syncSnapshots } = getContainers(config);
  try {
    const { resource } = await withCosmosRetry(() =>
      syncSnapshots.item(batch.id, scopeKey).replace<WhatnotImportBatchDocument>(document, buildIfMatchOptions(etag))
    );
    if (!resource) throw new Error("Failed to checkpoint Whatnot import operation.");
    return resource;
  } catch (error) {
    if (isCosmosClaimConflict(error)) {
      throw new Error("Whatnot import batch changed while it was being confirmed.");
    }
    throw error;
  }
}

export async function initializeWhatnotConfirmationPlan(
  config: ApiConfig,
  input: {
    scopeKey: string;
    batchId: string;
    attemptId: string;
    plan: WhatnotImportBatchDocument["confirmationPlan"];
    initializedAt: string;
  }
): Promise<WhatnotImportBatchDocument> {
  const scopeKey = normalizeId(input.scopeKey);
  const batch = await getWhatnotImportBatch(config, scopeKey, input.batchId);
  if (!batch || batch.status !== "processing") {
    throw new Error("Whatnot import batch is not being confirmed.");
  }
  if (normalizeId(batch.confirmationAttempt?.attemptId) !== normalizeId(input.attemptId)) {
    throw new Error("Whatnot import batch confirmation attempt changed.");
  }
  if (batch.confirmationPlan) {
    if (JSON.stringify(batch.confirmationPlan) !== JSON.stringify(input.plan ?? [])) {
      throw new Error("Whatnot confirmation plan changed after initialization.");
    }
    return batch;
  }
  const etag = readCosmosEtag(batch);
  if (!etag) throw new Error("Whatnot import batch changed while its plan was initialized.");
  const document: WhatnotImportBatchDocument = {
    ...batch,
    confirmationPlan: input.plan ?? [],
    updatedAt: input.initializedAt
  };
  const { syncSnapshots } = getContainers(config);
  try {
    const { resource } = await withCosmosRetry(() =>
      syncSnapshots.item(batch.id, scopeKey).replace<WhatnotImportBatchDocument>(document, buildIfMatchOptions(etag))
    );
    if (!resource) throw new Error("Failed to initialize Whatnot confirmation plan.");
    return resource;
  } catch (error) {
    if (isCosmosClaimConflict(error)) {
      throw new Error("Whatnot import batch changed while its plan was initialized.");
    }
    throw error;
  }
}

export async function renewWhatnotImportConfirmationLease(
  config: ApiConfig,
  input: {
    scopeKey: string;
    batchId: string;
    attemptId: string;
    renewedAt: string;
    leaseExpiresAt: string;
  }
): Promise<WhatnotImportBatchDocument | null> {
  const scopeKey = normalizeId(input.scopeKey);
  const batch = await getWhatnotImportBatch(config, scopeKey, input.batchId);
  if (!batch || batch.status !== "processing") return null;
  if (normalizeId(batch.confirmationAttempt?.attemptId) !== normalizeId(input.attemptId)) return null;
  const etag = readCosmosEtag(batch);
  if (!etag || !batch.confirmationAttempt) return null;
  const document: WhatnotImportBatchDocument = {
    ...batch,
    confirmationAttempt: {
      ...batch.confirmationAttempt,
      leaseExpiresAt: input.leaseExpiresAt
    },
    updatedAt: input.renewedAt
  };
  const { syncSnapshots } = getContainers(config);
  try {
    const { resource } = await withCosmosRetry(() =>
      syncSnapshots.item(batch.id, scopeKey).replace<WhatnotImportBatchDocument>(document, buildIfMatchOptions(etag))
    );
    return resource ?? null;
  } catch (error) {
    if (isCosmosClaimConflict(error)) return null;
    throw error;
  }
}

export async function markWhatnotImportBatchRecoverable(
  config: ApiConfig,
  input: {
    scopeKey: string;
    batchId: string;
    attemptId: string;
    failedOperationKey?: string;
    failedPhase?: string;
    errorMessage: string;
    failedAt: string;
  }
): Promise<WhatnotImportBatchDocument | null> {
  const scopeKey = normalizeId(input.scopeKey);
  const batch = await getWhatnotImportBatch(config, scopeKey, input.batchId);
  if (!batch || batch.status !== "processing") return batch;
  if (normalizeId(batch.confirmationAttempt?.attemptId) !== normalizeId(input.attemptId)) return null;
  const etag = readCosmosEtag(batch);
  if (!etag) return null;
  const document: WhatnotImportBatchDocument = {
    ...batch,
    status: "recoverable_error",
    updatedAt: input.failedAt,
    failedOperationKey: normalizeId(input.failedOperationKey) || undefined,
    failedPhase: normalizeId(input.failedPhase) || undefined,
    errorMessage: normalizeId(input.errorMessage)
  };
  const { syncSnapshots } = getContainers(config);
  try {
    const { resource } = await withCosmosRetry(() =>
      syncSnapshots.item(batch.id, scopeKey).replace<WhatnotImportBatchDocument>(document, buildIfMatchOptions(etag))
    );
    return resource ?? null;
  } catch (error) {
    if (isCosmosClaimConflict(error)) return null;
    throw error;
  }
}

export async function completeWhatnotImportBatch(
  config: ApiConfig,
  batch: WhatnotImportBatchDocument,
  counts: {
    importedCount: number;
    updatedCount: number;
    skippedCount: number;
    completedAt: string;
  }
): Promise<WhatnotImportBatchDocument> {
  const { syncSnapshots } = getContainers(config);
  const normalizedScopeKey = normalizeId(batch.scopeKey);
  const etag = readCosmosEtag(batch);
  if (!etag) {
    throw new Error("Whatnot import batch changed while it was being confirmed.");
  }

  const document: WhatnotImportBatchDocument = {
    ...batch,
    id: whatnotImportBatchId(normalizedScopeKey, batch.batchId),
    userId: normalizedScopeKey,
    scopeKey: normalizedScopeKey,
    status: "completed",
    importedCount: Math.max(0, Math.floor(Number(counts.importedCount) || 0)),
    updatedCount: Math.max(0, Math.floor(Number(counts.updatedCount) || 0)),
    skippedCount: Math.max(0, Math.floor(Number(counts.skippedCount) || 0)),
    completedAt: counts.completedAt,
    updatedAt: counts.completedAt
  };

  try {
    const { resource } = await withCosmosRetry(() =>
      syncSnapshots
        .item(document.id, normalizedScopeKey)
        .replace<WhatnotImportBatchDocument>(document, buildIfMatchOptions(etag))
    );
    if (!resource) {
      throw new Error("Failed to complete Whatnot import batch.");
    }
    return resource;
  } catch (error) {
    if (isCosmosClaimConflict(error)) {
      throw new Error("Whatnot import batch changed while it was being confirmed.");
    }
    throw error;
  }
}

export async function releaseClaimedWhatnotImportBatch(
  config: ApiConfig,
  batch: WhatnotImportBatchDocument,
  releasedAt: string,
  errorMessage?: string
): Promise<WhatnotImportBatchDocument | null> {
  if (batch.status !== "processing") {
    return null;
  }

  const { syncSnapshots } = getContainers(config);
  const normalizedScopeKey = normalizeId(batch.scopeKey);
  const etag = readCosmosEtag(batch);
  if (!etag) {
    return null;
  }

  const document: WhatnotImportBatchDocument = {
    ...batch,
    id: whatnotImportBatchId(normalizedScopeKey, batch.batchId),
    userId: normalizedScopeKey,
    scopeKey: normalizedScopeKey,
    status: "pending_review",
    updatedAt: releasedAt,
    errorMessage: normalizeId(errorMessage)
  };

  try {
    const { resource } = await withCosmosRetry(() =>
      syncSnapshots
        .item(document.id, normalizedScopeKey)
        .replace<WhatnotImportBatchDocument>(document, buildIfMatchOptions(etag))
    );
    if (!resource) {
      throw new Error("Failed to release Whatnot import batch claim.");
    }
    return resource;
  } catch (error) {
    if (isCosmosClaimConflict(error)) {
      return null;
    }
    throw error;
  }
}

export async function createPendingWhatnotImportBatch(
  config: ApiConfig,
  input: Omit<WhatnotImportBatchDocument, "id" | "batchId" | "status">
): Promise<WhatnotImportBatchDocument> {
  return upsertWhatnotImportBatch(config, {
    ...input,
    batchId: randomUUID(),
    status: "pending_review"
  });
}

export async function upsertWhatnotTargetMapping(
  config: ApiConfig,
  document: Omit<WhatnotTargetMappingDocument, "id" | "userId" | "scopeKey">
    & { scopeKey: string; matchKeyHash: string }
): Promise<WhatnotTargetMappingDocument> {
  const { syncSnapshots } = getContainers(config);
  const normalizedScopeKey = normalizeId(document.scopeKey);
  const input: WhatnotTargetMappingDocument = {
    ...document,
    id: whatnotTargetMappingId(normalizedScopeKey, normalizeId(document.matchKeyHash)),
    userId: normalizedScopeKey,
    scopeKey: normalizedScopeKey
  };
  delete (input as WhatnotTargetMappingDocument & { matchKeyHash?: string }).matchKeyHash;
  const { resource } = await withCosmosRetry(() =>
    syncSnapshots.items.upsert<WhatnotTargetMappingDocument>(input)
  );

  if (!resource) {
    throw new Error("Failed to upsert Whatnot target mapping.");
  }

  return resource;
}

export async function getWhatnotTargetMappingByMatchKeyHash(
  config: ApiConfig,
  scopeKey: string,
  matchKeyHash: string
): Promise<WhatnotTargetMappingDocument | null> {
  const { syncSnapshots } = getContainers(config);
  const normalizedScopeKey = normalizeId(scopeKey);

  try {
    const { resource } = await withCosmosRetry(() =>
      syncSnapshots
        .item(whatnotTargetMappingId(normalizedScopeKey, normalizeId(matchKeyHash)), normalizedScopeKey)
        .read<WhatnotTargetMappingDocument>()
    );
    return isWhatnotTargetMappingDocument(resource) ? resource : null;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export async function upsertWhatnotSaleImportMapping(
  config: ApiConfig,
  document: Omit<WhatnotSaleImportMappingDocument, "id" | "userId" | "scopeKey">
    & { scopeKey: string; externalSaleKeyHash: string }
): Promise<WhatnotSaleImportMappingDocument> {
  const { syncSnapshots } = getContainers(config);
  const normalizedScopeKey = normalizeId(document.scopeKey);
  const input: WhatnotSaleImportMappingDocument = {
    ...document,
    id: whatnotSaleImportMappingId(normalizedScopeKey, normalizeId(document.externalSaleKeyHash)),
    userId: normalizedScopeKey,
    scopeKey: normalizedScopeKey
  };
  delete (input as WhatnotSaleImportMappingDocument & { externalSaleKeyHash?: string }).externalSaleKeyHash;
  const { resource } = await withCosmosRetry(() =>
    syncSnapshots.items.upsert<WhatnotSaleImportMappingDocument>(input)
  );

  if (!resource) {
    throw new Error("Failed to upsert Whatnot sale import mapping.");
  }

  return resource;
}

export async function getWhatnotSaleImportMappingByExternalSaleKeyHash(
  config: ApiConfig,
  scopeKey: string,
  externalSaleKeyHash: string
): Promise<WhatnotSaleImportMappingDocument | null> {
  const { syncSnapshots } = getContainers(config);
  const normalizedScopeKey = normalizeId(scopeKey);

  try {
    const { resource } = await withCosmosRetry(() =>
      syncSnapshots
        .item(whatnotSaleImportMappingId(normalizedScopeKey, normalizeId(externalSaleKeyHash)), normalizedScopeKey)
        .read<WhatnotSaleImportMappingDocument>()
    );
    return isWhatnotSaleImportMappingDocument(resource) ? resource : null;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}
