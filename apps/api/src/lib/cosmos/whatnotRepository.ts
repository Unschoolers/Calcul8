import { randomUUID } from "node:crypto";
import type {
  ApiConfig,
  WhatnotConnectionDocument,
  WhatnotImportBatchDocument,
  WhatnotOAuthStateDocument,
  WhatnotSaleImportMappingDocument,
  WhatnotTargetMappingDocument
} from "../../types";
import { getContainers, isNotFoundError, withCosmosRetry } from "./core";
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
        AND c.status = @status
      ORDER BY c.updatedAt DESC
    `,
    parameters: [
      { name: "@scopeKey", value: normalizedScopeKey },
      { name: "@docType", value: "whatnot_import_batch" },
      { name: "@status", value: "pending_review" }
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
        AND c.status = @status
      ORDER BY c.updatedAt DESC
    `,
    parameters: [
      { name: "@scopeKey", value: normalizedScopeKey },
      { name: "@docType", value: "whatnot_import_batch" },
      { name: "@status", value: "pending_review" }
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
