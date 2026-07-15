import type { Container } from "@azure/cosmos";
import type {
  ApiConfig,
  LotLivePricingDocument,
  SaleDocument,
  SyncMetaDocument
} from "../../types";
import {
  getContainers,
  isConflictError,
  isNotFoundError,
  isPreconditionFailedError,
  withCosmosRetry
} from "./core";
import {
  lotLivePricingDocumentId,
  saleDocumentId,
  syncMetaId
} from "./ids";

export class EntityVersionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntityVersionConflictError";
  }
}

interface UpsertSaleDocumentInput {
  scopeKey: string;
  lotId: string;
  saleId: string;
  sale: unknown;
  updatedBy: string;
  mutationId: string;
  baseVersion?: number;
}

interface DeleteSaleDocumentInput {
  scopeKey: string;
  lotId: string;
  saleId: string;
  updatedBy: string;
  mutationId: string;
  baseVersion?: number;
}

interface UpsertLotLivePricingInput {
  scopeKey: string;
  lotId: string;
  livePackPrice: number;
  liveBoxPriceSell: number;
  liveSpotPrice: number;
  updatedBy: string;
  mutationId: string;
  baseVersion?: number;
}

type SyncModeInput = {
  scopeKey: string;
  updatedAt: string;
  salesMode: "snapshot" | "entity";
  livePricingMode: "lot_defaults" | "entity";
};

export interface LotSalesSyncMetaRecord {
  activeCount: number;
  latestUpdatedAt: string | null;
}

interface FindWhatnotRecoverySaleInput {
  scopeKey: string;
  mutationId: string;
  externalAccountId: string;
  externalOrderId: string;
  externalOrderItemId: string;
  allowExternalIdentityMatch?: boolean;
}

function normalizeId(raw: string | number): string {
  return String(raw ?? "").trim();
}

function isSaleDocument(resource: unknown): resource is SaleDocument {
  if (!resource || typeof resource !== "object") return false;
  return (resource as { docType?: unknown }).docType === "sale";
}

function isLotLivePricingDocument(resource: unknown): resource is LotLivePricingDocument {
  if (!resource || typeof resource !== "object") return false;
  return (resource as { docType?: unknown }).docType === "lot_live_pricing";
}

function isSyncMetaDocument(resource: unknown): resource is SyncMetaDocument {
  if (!resource || typeof resource !== "object") return false;
  return (resource as { docType?: unknown }).docType === "sync_meta";
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

function throwEntityConflict(message: string): never {
  throw new EntityVersionConflictError(message);
}

function mapCosmosWriteConflict(error: unknown, message: string): never {
  if (isPreconditionFailedError(error) || isConflictError(error)) {
    throwEntityConflict(message);
  }
  throw error;
}

function compareSaleDocuments(left: SaleDocument, right: SaleDocument): number {
  if (left.lotId !== right.lotId) return left.lotId.localeCompare(right.lotId);

  const leftDate = String((left.sale as { date?: unknown })?.date ?? "");
  const rightDate = String((right.sale as { date?: unknown })?.date ?? "");
  if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
  return left.saleId.localeCompare(right.saleId);
}

export async function findSaleDocumentForWhatnotRecovery(
  config: ApiConfig,
  input: FindWhatnotRecoverySaleInput
): Promise<SaleDocument | null> {
  const { syncSnapshots } = getContainers(config);
  const scopeKey = normalizeId(input.scopeKey);
  const identityPredicate = input.allowExternalIdentityMatch
    ? `(c.mutationId = @mutationId OR (
          c.sale.externalProvider = @provider
          AND c.sale.externalAccountId = @externalAccountId
          AND c.sale.externalOrderId = @externalOrderId
          AND c.sale.externalOrderItemId = @externalOrderItemId
        ))`
    : `c.mutationId = @mutationId
        AND c.sale.externalProvider = @provider
        AND c.sale.externalAccountId = @externalAccountId
        AND c.sale.externalOrderId = @externalOrderId
        AND c.sale.externalOrderItemId = @externalOrderItemId`;
  const querySpec = {
    query: `
      SELECT * FROM c
      WHERE c.userId = @scopeKey
        AND c.docType = @docType
        AND (NOT IS_DEFINED(c.deletedAt) OR IS_NULL(c.deletedAt))
        AND ${identityPredicate}
    `,
    parameters: [
      { name: "@scopeKey", value: scopeKey },
      { name: "@docType", value: "sale" },
      { name: "@mutationId", value: normalizeId(input.mutationId) },
      { name: "@provider", value: "whatnot" },
      { name: "@externalAccountId", value: normalizeId(input.externalAccountId) },
      { name: "@externalOrderId", value: normalizeId(input.externalOrderId) },
      { name: "@externalOrderItemId", value: normalizeId(input.externalOrderItemId) }
    ]
  };
  const iterator = syncSnapshots.items.query<SaleDocument>(querySpec, {
    partitionKey: scopeKey,
    maxItemCount: 2
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  const matches = (resources ?? []).filter(isSaleDocument).filter((document) => !document.deletedAt);
  if (matches.length > 1) {
    throw new Error("Whatnot recovery found multiple matching sales.");
  }
  return matches[0] ?? null;
}

function normalizeLotIds(lotIds: string[] | null | undefined): string[] {
  return Array.from(new Set((lotIds ?? []).map((lotId) => normalizeId(lotId)).filter(Boolean)));
}

function filterAndSortSaleDocuments(resources: SaleDocument[]): SaleDocument[] {
  return (resources ?? [])
    .filter((resource) => isSaleDocument(resource))
    .sort(compareSaleDocuments);
}

async function getSaleDocumentFromContainer(
  container: Container,
  scopeKey: string,
  lotId: string,
  saleId: string
): Promise<SaleDocument | null> {
  const id = saleDocumentId(scopeKey, lotId, saleId);

  try {
    const { resource } = await withCosmosRetry(() =>
      container.item(id, scopeKey).read<SaleDocument>()
    );
    return isSaleDocument(resource) ? resource : null;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

async function getSyncMetaDocumentFromContainer(
  container: Container,
  scopeKey: string
): Promise<SyncMetaDocument | null> {
  const id = syncMetaId(scopeKey);

  try {
    const { resource } = await withCosmosRetry(() =>
      container.item(id, scopeKey).read<SyncMetaDocument>()
    );
    return isSyncMetaDocument(resource) ? resource : null;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export async function listSalesForScope(
  config: ApiConfig,
  scopeKey: string,
  lotIds: string[] | null = null
): Promise<SaleDocument[]> {
  const { syncSnapshots } = getContainers(config);
  const normalizedScopeKey = normalizeId(scopeKey);
  const normalizedLotIds = normalizeLotIds(lotIds);
  const querySpec = normalizedLotIds.length > 0
    ? {
      query: `
        SELECT * FROM c
        WHERE c.userId = @scopeKey
          AND c.docType = @docType
          AND ARRAY_CONTAINS(@lotIds, c.lotId)
          AND (NOT IS_DEFINED(c.deletedAt) OR IS_NULL(c.deletedAt))
      `,
      parameters: [
        { name: "@scopeKey", value: normalizedScopeKey },
        { name: "@docType", value: "sale" },
        { name: "@lotIds", value: normalizedLotIds }
      ]
    }
    : {
      query: `
        SELECT * FROM c
        WHERE c.userId = @scopeKey
          AND c.docType = @docType
          AND (NOT IS_DEFINED(c.deletedAt) OR IS_NULL(c.deletedAt))
      `,
      parameters: [
        { name: "@scopeKey", value: normalizedScopeKey },
        { name: "@docType", value: "sale" }
      ]
    };

  const iterator = syncSnapshots.items.query<SaleDocument>(querySpec, {
    partitionKey: normalizedScopeKey
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return filterAndSortSaleDocuments(resources ?? []);
}

export async function listSalesForLot(
  config: ApiConfig,
  scopeKey: string,
  lotId: string
): Promise<SaleDocument[]> {
  return listSalesForScope(config, scopeKey, [lotId]);
}

export async function getLotSalesSyncMeta(
  config: ApiConfig,
  scopeKey: string,
  lotId: string
): Promise<LotSalesSyncMetaRecord> {
  const { syncSnapshots } = getContainers(config);
  const normalizedScopeKey = normalizeId(scopeKey);
  const normalizedLotId = normalizeId(lotId);

  const activeCountIterator = syncSnapshots.items.query<number>({
    query: `
      SELECT VALUE COUNT(1)
      FROM c
      WHERE c.userId = @scopeKey
        AND c.docType = @docType
        AND c.lotId = @lotId
        AND (NOT IS_DEFINED(c.deletedAt) OR IS_NULL(c.deletedAt))
    `,
    parameters: [
      { name: "@scopeKey", value: normalizedScopeKey },
      { name: "@docType", value: "sale" },
      { name: "@lotId", value: normalizedLotId }
    ]
  }, {
    partitionKey: normalizedScopeKey
  });
  const latestUpdatedAtIterator = syncSnapshots.items.query<string>({
    query: `
      SELECT TOP 1 VALUE c.updatedAt
      FROM c
      WHERE c.userId = @scopeKey
        AND c.docType = @docType
        AND c.lotId = @lotId
      ORDER BY c.updatedAt DESC
    `,
    parameters: [
      { name: "@scopeKey", value: normalizedScopeKey },
      { name: "@docType", value: "sale" },
      { name: "@lotId", value: normalizedLotId }
    ]
  }, {
    partitionKey: normalizedScopeKey
  });

  const [{ resources: activeCountResources }, { resources: latestUpdatedAtResources }] = await Promise.all([
    withCosmosRetry(() => activeCountIterator.fetchAll()),
    withCosmosRetry(() => latestUpdatedAtIterator.fetchAll())
  ]);

  const activeCount = Number(activeCountResources?.[0]);
  const latestUpdatedAt = typeof latestUpdatedAtResources?.[0] === "string" && latestUpdatedAtResources[0].trim()
    ? latestUpdatedAtResources[0]
    : null;

  return {
    activeCount: Number.isFinite(activeCount) && activeCount >= 0 ? Math.floor(activeCount) : 0,
    latestUpdatedAt
  };
}

export async function getSaleDocument(
  config: ApiConfig,
  scopeKey: string,
  lotId: string,
  saleId: string
): Promise<SaleDocument | null> {
  const { syncSnapshots } = getContainers(config);
  return getSaleDocumentFromContainer(syncSnapshots, normalizeId(scopeKey), normalizeId(lotId), normalizeId(saleId));
}

export async function upsertSaleDocument(
  config: ApiConfig,
  input: UpsertSaleDocumentInput
): Promise<SaleDocument> {
  const { syncSnapshots } = getContainers(config);
  const scopeKey = normalizeId(input.scopeKey);
  const lotId = normalizeId(input.lotId);
  const saleId = normalizeId(input.saleId);
  const existing = await getSaleDocumentFromContainer(syncSnapshots, scopeKey, lotId, saleId);
  const existingVersion = existing?.version ?? 0;
  const requestedBaseVersion = Number.isFinite(Number(input.baseVersion))
    ? Math.max(0, Math.floor(Number(input.baseVersion)))
    : undefined;

  if (existing && requestedBaseVersion != null && requestedBaseVersion !== existingVersion) {
    throw new EntityVersionConflictError("Sale changed since it was last loaded.");
  }

  if (!existing && requestedBaseVersion != null && requestedBaseVersion !== 0) {
    throw new EntityVersionConflictError("Sale changed since it was last loaded.");
  }

  const nextVersion = existingVersion + 1;
  const document: SaleDocument = {
    id: saleDocumentId(scopeKey, lotId, saleId),
    docType: "sale",
    userId: scopeKey,
    scopeKey,
    lotId,
    saleId,
    sale: input.sale,
    version: nextVersion,
    updatedAt: new Date().toISOString(),
    updatedBy: normalizeId(input.updatedBy),
    mutationId: normalizeId(input.mutationId),
    deletedAt: null
  };

  let resource: SaleDocument | undefined;
  try {
    if (existing) {
      const etag = readCosmosEtag(existing);
      if (!etag) {
        throwEntityConflict("Sale changed since it was last loaded.");
      }
      ({ resource } = await withCosmosRetry(() =>
        syncSnapshots
          .item(document.id, scopeKey)
          .replace<SaleDocument>(document, buildIfMatchOptions(etag))
      ));
    } else {
      ({ resource } = await withCosmosRetry(() =>
        syncSnapshots.items.create<SaleDocument>(document)
      ));
    }
  } catch (error) {
    mapCosmosWriteConflict(error, "Sale changed since it was last loaded.");
  }

  if (!resource) {
    throw new Error("Failed to upsert sale document.");
  }

  return resource;
}

export async function deleteSaleDocument(
  config: ApiConfig,
  input: DeleteSaleDocumentInput
): Promise<SaleDocument | null> {
  const { syncSnapshots } = getContainers(config);
  const scopeKey = normalizeId(input.scopeKey);
  const lotId = normalizeId(input.lotId);
  const saleId = normalizeId(input.saleId);
  const existing = await getSaleDocumentFromContainer(syncSnapshots, scopeKey, lotId, saleId);
  if (!existing || existing.deletedAt) {
    return null;
  }

  const requestedBaseVersion = Number.isFinite(Number(input.baseVersion))
    ? Math.max(0, Math.floor(Number(input.baseVersion)))
    : undefined;
  if (requestedBaseVersion != null && requestedBaseVersion !== existing.version) {
    throw new EntityVersionConflictError("Sale changed since it was last loaded.");
  }

  const document: SaleDocument = {
    ...existing,
    version: existing.version + 1,
    updatedAt: new Date().toISOString(),
    updatedBy: normalizeId(input.updatedBy),
    mutationId: normalizeId(input.mutationId),
    deletedAt: new Date().toISOString()
  };

  const etag = readCosmosEtag(existing);
  if (!etag) {
    throwEntityConflict("Sale changed since it was last loaded.");
  }

  let resource: SaleDocument | undefined;
  try {
    ({ resource } = await withCosmosRetry(() =>
      syncSnapshots
        .item(document.id, scopeKey)
        .replace<SaleDocument>(document, buildIfMatchOptions(etag))
    ));
  } catch (error) {
    mapCosmosWriteConflict(error, "Sale changed since it was last loaded.");
  }

  if (!resource) {
    throw new Error("Failed to delete sale document.");
  }

  return resource;
}

export async function getLotLivePricing(
  config: ApiConfig,
  scopeKey: string,
  lotId: string
): Promise<LotLivePricingDocument | null> {
  const { syncSnapshots } = getContainers(config);
  const normalizedScopeKey = normalizeId(scopeKey);
  const normalizedLotId = normalizeId(lotId);
  const id = lotLivePricingDocumentId(normalizedScopeKey, normalizedLotId);

  try {
    const { resource } = await withCosmosRetry(() =>
      syncSnapshots.item(id, normalizedScopeKey).read<LotLivePricingDocument>()
    );
    return isLotLivePricingDocument(resource) ? resource : null;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export async function upsertLotLivePricing(
  config: ApiConfig,
  input: UpsertLotLivePricingInput
): Promise<LotLivePricingDocument> {
  const { syncSnapshots } = getContainers(config);
  const scopeKey = normalizeId(input.scopeKey);
  const lotId = normalizeId(input.lotId);
  const existing = await getLotLivePricing(config, scopeKey, lotId);
  const existingVersion = existing?.version ?? 0;
  const requestedBaseVersion = Number.isFinite(Number(input.baseVersion))
    ? Math.max(0, Math.floor(Number(input.baseVersion)))
    : undefined;

  if (existing && requestedBaseVersion != null && requestedBaseVersion !== existingVersion) {
    throw new EntityVersionConflictError("Live pricing changed since it was last loaded.");
  }

  if (!existing && requestedBaseVersion != null && requestedBaseVersion !== 0) {
    throw new EntityVersionConflictError("Live pricing changed since it was last loaded.");
  }

  const document: LotLivePricingDocument = {
    id: lotLivePricingDocumentId(scopeKey, lotId),
    docType: "lot_live_pricing",
    userId: scopeKey,
    scopeKey,
    lotId,
    livePackPrice: Number(input.livePackPrice) || 0,
    liveBoxPriceSell: Number(input.liveBoxPriceSell) || 0,
    liveSpotPrice: Number(input.liveSpotPrice) || 0,
    version: existingVersion + 1,
    updatedAt: new Date().toISOString(),
    updatedBy: normalizeId(input.updatedBy),
    mutationId: normalizeId(input.mutationId)
  };

  let resource: LotLivePricingDocument | undefined;
  try {
    if (existing) {
      const etag = readCosmosEtag(existing);
      if (!etag) {
        throwEntityConflict("Live pricing changed since it was last loaded.");
      }
      ({ resource } = await withCosmosRetry(() =>
        syncSnapshots
          .item(document.id, scopeKey)
          .replace<LotLivePricingDocument>(document, buildIfMatchOptions(etag))
      ));
    } else {
      ({ resource } = await withCosmosRetry(() =>
        syncSnapshots.items.create<LotLivePricingDocument>(document)
      ));
    }
  } catch (error) {
    mapCosmosWriteConflict(error, "Live pricing changed since it was last loaded.");
  }

  if (!resource) {
    throw new Error("Failed to upsert live pricing document.");
  }

  return resource;
}

export async function setSyncScopeEntityModes(
  config: ApiConfig,
  input: SyncModeInput
): Promise<SyncMetaDocument> {
  const { syncSnapshots } = getContainers(config);
  const scopeKey = normalizeId(input.scopeKey);
  const existing = await getSyncMetaDocumentFromContainer(syncSnapshots, scopeKey);
  const document: SyncMetaDocument = {
    id: syncMetaId(scopeKey),
    docType: "sync_meta",
    userId: scopeKey,
    version: existing?.version ?? 0,
    updatedAt: input.updatedAt,
    wheelConfigs: Array.isArray(existing?.wheelConfigs) ? existing.wheelConfigs : [],
    activeWheelConfigId: existing?.activeWheelConfigId ?? null,
    salesMode: input.salesMode,
    livePricingMode: input.livePricingMode
  };

  const { resource } = await withCosmosRetry(() =>
    syncSnapshots.items.upsert<SyncMetaDocument>(document)
  );

  if (!resource) {
    throw new Error("Failed to set sync scope entity modes.");
  }

  return resource;
}

export async function listSyncScopeKeys(config: ApiConfig): Promise<string[]> {
  const { syncSnapshots } = getContainers(config);
  const querySpec = {
    query: `
      SELECT c.userId
      FROM c
      WHERE c.docType = @syncMetaDocType OR c.docType = @syncPresetDocType
    `,
    parameters: [
      { name: "@syncMetaDocType", value: "sync_meta" },
      { name: "@syncPresetDocType", value: "sync_preset" }
    ]
  };

  const iterator = syncSnapshots.items.query<{ userId?: string }>(querySpec);
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  const seen = new Set<string>();
  for (const resource of resources ?? []) {
    const scopeKey = normalizeId(resource.userId ?? "");
    if (scopeKey) {
      seen.add(scopeKey);
    }
  }
  return [...seen].sort();
}

export async function getSyncMetaWithModes(
  config: ApiConfig,
  scopeKey: string
): Promise<SyncMetaDocument | null> {
  const { syncSnapshots } = getContainers(config);
  return getSyncMetaDocumentFromContainer(syncSnapshots, normalizeId(scopeKey));
}
