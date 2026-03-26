import type { Container } from "@azure/cosmos";
import type {
  ApiConfig,
  LotLivePricingDocument,
  SaleDocument,
  SyncMetaDocument
} from "../../types";
import {
  getContainers,
  isNotFoundError,
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

export async function listSalesForLot(
  config: ApiConfig,
  scopeKey: string,
  lotId: string
): Promise<SaleDocument[]> {
  const { syncSnapshots } = getContainers(config);
  const normalizedScopeKey = normalizeId(scopeKey);
  const normalizedLotId = normalizeId(lotId);
  const querySpec = {
    query: `
      SELECT * FROM c
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
  };

  const iterator = syncSnapshots.items.query<SaleDocument>(querySpec, {
    partitionKey: normalizedScopeKey
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return (resources ?? [])
    .filter((resource) => isSaleDocument(resource))
    .sort((left, right) => {
      const leftDate = String((left.sale as { date?: unknown })?.date ?? "");
      const rightDate = String((right.sale as { date?: unknown })?.date ?? "");
      if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
      return left.saleId.localeCompare(right.saleId);
    });
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

  const { resource } = await withCosmosRetry(() =>
    syncSnapshots.items.upsert<SaleDocument>(document)
  );

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

  const { resource } = await withCosmosRetry(() =>
    syncSnapshots.items.upsert<SaleDocument>(document)
  );

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

  const { resource } = await withCosmosRetry(() =>
    syncSnapshots.items.upsert<LotLivePricingDocument>(document)
  );

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
