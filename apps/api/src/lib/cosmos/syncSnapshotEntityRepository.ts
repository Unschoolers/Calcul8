import type { Container } from "@azure/cosmos";
import type { ApiConfig, LotLivePricingDocument, SaleDocument } from "../../types";
import {
  getContainers,
  getExternalSyncContainer,
  isNotFoundError,
  type ExternalSyncSourceConfig,
  withCosmosRetry
} from "./core";
import { lotLivePricingDocumentId, saleDocumentId } from "./ids";
import {
  type ReplaceSyncScopeEntityDocumentsInput,
  type SyncScopeEntityDocuments
} from "./syncSnapshotRepository.shared";

function isSaleDocument(resource: unknown): resource is SaleDocument {
  return !!resource
    && typeof resource === "object"
    && (resource as { docType?: unknown }).docType === "sale";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPositiveFiniteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value) && value > 0;
}

function hasValidLotLivePricingFields(
  candidate: Partial<LotLivePricingDocument> | null | undefined,
  scopeKey?: string
): candidate is LotLivePricingDocument {
  if (!candidate) return false;
  const hasValidScope = scopeKey
    ? candidate.userId === scopeKey && candidate.scopeKey === scopeKey
    : isNonEmptyString(candidate.userId) && isNonEmptyString(candidate.scopeKey);
  return hasValidScope
    && candidate.docType === "lot_live_pricing"
    && isNonEmptyString(candidate.id)
    && isNonEmptyString(candidate.lotId)
    && isNonNegativeFiniteNumber(candidate.livePackPrice)
    && isNonNegativeFiniteNumber(candidate.liveBoxPriceSell)
    && isNonNegativeFiniteNumber(candidate.liveSpotPrice)
    && isPositiveFiniteInteger(candidate.version)
    && isNonEmptyString(candidate.updatedAt)
    && isNonEmptyString(candidate.updatedBy)
    && isNonEmptyString(candidate.mutationId);
}

function isLotLivePricingDocument(resource: unknown, scopeKey: string): resource is LotLivePricingDocument {
  const candidate = resource as Partial<LotLivePricingDocument> | null;
  return !!resource
    && typeof resource === "object"
    && hasValidLotLivePricingFields(candidate, scopeKey);
}

function isIncomingLotLivePricingDocument(resource: unknown): resource is LotLivePricingDocument {
  const candidate = resource as Partial<LotLivePricingDocument> | null;
  return !!resource
    && typeof resource === "object"
    && hasValidLotLivePricingFields(candidate);
}

async function getSyncScopeEntityDocumentsFromContainer(
  container: Container,
  scopeKey: string
): Promise<SyncScopeEntityDocuments> {
  const querySpec = {
    query: `
      SELECT * FROM c
      WHERE c.userId = @scopeKey
        AND (c.docType = @saleDocType OR c.docType = @livePricingDocType)
    `,
    parameters: [
      { name: "@scopeKey", value: scopeKey },
      { name: "@saleDocType", value: "sale" },
      { name: "@livePricingDocType", value: "lot_live_pricing" }
    ]
  };
  const iterator = container.items.query<SaleDocument | LotLivePricingDocument>(querySpec, {
    partitionKey: scopeKey
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  const saleDocuments: SaleDocument[] = [];
  const livePricingDocuments: LotLivePricingDocument[] = [];

  for (const resource of resources ?? []) {
    if (isSaleDocument(resource)) {
      saleDocuments.push(resource);
      continue;
    }
    if (isLotLivePricingDocument(resource, scopeKey)) {
      livePricingDocuments.push(resource);
    }
  }

  return { saleDocuments, livePricingDocuments };
}

function getSaleDocumentIdentityKey(document: Pick<SaleDocument, "lotId" | "saleId">): string {
  return `${document.lotId}::${document.saleId}`;
}

function getLotLivePricingIdentityKey(document: Pick<LotLivePricingDocument, "lotId">): string {
  return document.lotId;
}

export async function getSyncScopeEntityDocuments(
  config: ApiConfig,
  scopeKey: string
): Promise<SyncScopeEntityDocuments> {
  const { syncSnapshots } = getContainers(config);
  return getSyncScopeEntityDocumentsFromContainer(syncSnapshots, scopeKey);
}

export async function getSyncScopeEntityDocumentsFromExternalSource(
  source: ExternalSyncSourceConfig,
  scopeKey: string
): Promise<SyncScopeEntityDocuments> {
  const container = getExternalSyncContainer(source);
  return getSyncScopeEntityDocumentsFromContainer(container, scopeKey);
}

export async function replaceSyncScopeEntityDocuments(
  config: ApiConfig,
  input: ReplaceSyncScopeEntityDocumentsInput
): Promise<{ upsertedCount: number; deletedCount: number }> {
  const { syncSnapshots } = getContainers(config);
  const scopeKey = String(input.scopeKey || "").trim();
  const existing = await getSyncScopeEntityDocuments(config, scopeKey);

  const incomingSalesByKey = new Map(
    input.saleDocuments.map((document) => [getSaleDocumentIdentityKey(document), document] as const)
  );
  const incomingLivePricingDocuments = input.livePricingDocuments.filter(isIncomingLotLivePricingDocument);
  const incomingLivePricingByKey = new Map(
    incomingLivePricingDocuments.map((document) => [getLotLivePricingIdentityKey(document), document] as const)
  );

  let deletedCount = 0;
  for (const existingSale of existing.saleDocuments) {
    if (incomingSalesByKey.has(getSaleDocumentIdentityKey(existingSale))) continue;
    try {
      await withCosmosRetry(() => syncSnapshots.item(existingSale.id, scopeKey).delete());
      deletedCount += 1;
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }

  for (const existingLivePricing of existing.livePricingDocuments) {
    if (incomingLivePricingByKey.has(getLotLivePricingIdentityKey(existingLivePricing))) continue;
    try {
      await withCosmosRetry(() => syncSnapshots.item(existingLivePricing.id, scopeKey).delete());
      deletedCount += 1;
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }

  let upsertedCount = 0;
  for (const sourceSale of input.saleDocuments) {
    const document: SaleDocument = {
      ...sourceSale,
      id: saleDocumentId(scopeKey, sourceSale.lotId, sourceSale.saleId),
      userId: scopeKey,
      scopeKey
    };
    await withCosmosRetry(() => syncSnapshots.items.upsert<SaleDocument>(document));
    upsertedCount += 1;
  }

  for (const sourceLivePricing of incomingLivePricingDocuments) {
    const document: LotLivePricingDocument = {
      ...sourceLivePricing,
      id: lotLivePricingDocumentId(scopeKey, sourceLivePricing.lotId),
      userId: scopeKey,
      scopeKey
    };
    await withCosmosRetry(() => syncSnapshots.items.upsert<LotLivePricingDocument>(document));
    upsertedCount += 1;
  }

  return {
    upsertedCount,
    deletedCount
  };
}
