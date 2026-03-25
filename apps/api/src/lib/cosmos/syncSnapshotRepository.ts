import type { Container } from "@azure/cosmos";
import type {
  ApiConfig,
  LotLivePricingDocument,
  SaleDocument,
  SyncMetaDocument,
  SyncPresetDocument,
  SyncSnapshotDocument
} from "../../types";
import {
  EPOCH_DATE_ISO,
  getContainers,
  getExternalSyncContainer,
  isNotFoundError,
  type ExternalSyncSourceConfig,
  withCosmosRetry
} from "./core";
import {
  lotLivePricingDocumentId,
  saleDocumentId,
  syncMetaId,
  syncPresetId,
  syncSnapshotId
} from "./ids";
import { calculateSyncPresetDiff, type SyncPresetState } from "../syncDiff";

export async function getSyncPresetDocuments(
  config: ApiConfig,
  userId: string
): Promise<SyncPresetDocument[]> {
  const { syncSnapshots } = getContainers(config);
  return getSyncPresetDocumentsFromContainer(syncSnapshots, userId);
}

async function getSyncPresetDocumentsFromContainer(
  container: Container,
  userId: string
): Promise<SyncPresetDocument[]> {
  const querySpec = {
    query: "SELECT * FROM c WHERE c.userId = @userId AND c.docType = @docType",
    parameters: [
      { name: "@userId", value: userId },
      { name: "@docType", value: "sync_preset" }
    ]
  };
  const iterator = container.items.query<SyncPresetDocument>(querySpec, {
    partitionKey: userId
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return resources ?? [];
}

export async function getSyncMetaDocument(
  config: ApiConfig,
  userId: string
): Promise<SyncMetaDocument | null> {
  const { syncSnapshots } = getContainers(config);
  return getSyncMetaDocumentFromContainer(syncSnapshots, userId);
}

export async function getSyncMetaDocumentFromExternalSource(
  source: ExternalSyncSourceConfig,
  userId: string
): Promise<SyncMetaDocument | null> {
  const container = getExternalSyncContainer(source);
  return getSyncMetaDocumentFromContainer(container, userId);
}

async function getSyncMetaDocumentFromContainer(
  container: Container,
  userId: string
): Promise<SyncMetaDocument | null> {
  const id = syncMetaId(userId);

  try {
    const { resource } = await withCosmosRetry(() => container.item(id, userId).read<SyncMetaDocument>());
    return resource ?? null;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

function toPresetState(document: SyncPresetDocument): SyncPresetState {
  return {
    presetId: document.presetId,
    preset: document.preset,
    sales: document.sales
  };
}

export async function getSyncSnapshotFromPresetDocuments(
  config: ApiConfig,
  userId: string
): Promise<SyncSnapshotDocument | null> {
  const { syncSnapshots } = getContainers(config);
  return getSyncSnapshotFromContainer(syncSnapshots, userId);
}

async function getSyncSnapshotFromContainer(
  container: Container,
  userId: string
): Promise<SyncSnapshotDocument | null> {
  const [presetDocuments, metaDocument] = await Promise.all([
    getSyncPresetDocumentsFromContainer(container, userId),
    getSyncMetaDocumentFromContainer(container, userId)
  ]);

  const wheelConfigs = Array.isArray(metaDocument?.wheelConfigs) ? metaDocument.wheelConfigs : [];
  const activeWheelConfigId = normalizeActiveWheelConfigId(metaDocument?.activeWheelConfigId);

  if (presetDocuments.length === 0 && wheelConfigs.length === 0) {
    return null;
  }

  const lots = presetDocuments.map((document) => document.preset);
  const salesByLot = metaDocument?.salesMode === "entity"
    ? {}
    : Object.fromEntries(
      presetDocuments.map((document) => [
        document.presetId,
        Array.isArray(document.sales) ? document.sales : []
      ])
    ) as Record<string, unknown[]>;

  const maxVersion = Math.max(
    0,
    metaDocument?.version ?? 0,
    ...presetDocuments.map((document) => document.version || 0)
  );
  const latestUpdatedAt = [
    metaDocument?.updatedAt,
    ...presetDocuments.map((document) => document.updatedAt)
  ]
    .filter((value): value is string => typeof value === "string")
    .toSorted()
    .at(-1) ?? EPOCH_DATE_ISO;

  return {
    id: syncSnapshotId(userId),
    userId,
    lots,
    salesByLot,
    wheelConfigs,
    activeWheelConfigId,
    version: maxVersion,
    updatedAt: latestUpdatedAt
  };
}

export async function getEffectiveSyncSnapshot(
  config: ApiConfig,
  userId: string
): Promise<SyncSnapshotDocument | null> {
  return getSyncSnapshotFromPresetDocuments(config, userId);
}

export async function getEffectiveSyncSnapshotFromExternalSource(
  source: ExternalSyncSourceConfig,
  userId: string
): Promise<SyncSnapshotDocument | null> {
  const container = getExternalSyncContainer(source);
  return getSyncSnapshotFromContainer(container, userId);
}

type SyncScopeEntityDocuments = {
  saleDocuments: SaleDocument[];
  livePricingDocuments: LotLivePricingDocument[];
};

function isSaleDocument(resource: unknown): resource is SaleDocument {
  return !!resource
    && typeof resource === "object"
    && (resource as { docType?: unknown }).docType === "sale";
}

function isLotLivePricingDocument(resource: unknown): resource is LotLivePricingDocument {
  return !!resource
    && typeof resource === "object"
    && (resource as { docType?: unknown }).docType === "lot_live_pricing";
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
    if (isLotLivePricingDocument(resource)) {
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

interface ReplaceSyncScopeEntityDocumentsInput extends SyncScopeEntityDocuments {
  scopeKey: string;
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
  const incomingLivePricingByKey = new Map(
    input.livePricingDocuments.map((document) => [getLotLivePricingIdentityKey(document), document] as const)
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

  for (const sourceLivePricing of input.livePricingDocuments) {
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

interface IncrementalSyncUpsertInput {
  userId: string;
  lots: unknown[];
  salesByLot: Record<string, unknown[]>;
  wheelConfigs: unknown[];
  activeWheelConfigId: number | null;
  version: number;
  updatedAt: string;
}

function normalizeActiveWheelConfigId(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.floor(parsed);
}

function buildIncomingPresetStates(
  lots: unknown[],
  salesByLot: Record<string, unknown[]>
): SyncPresetState[] {
  return lots.flatMap((lot): SyncPresetState[] => {
    if (typeof lot !== "object" || lot === null || Array.isArray(lot)) {
      return [];
    }
    const presetIdRaw = (lot as { id?: unknown }).id;
    if (typeof presetIdRaw !== "string" && typeof presetIdRaw !== "number") {
      return [];
    }

    const presetId = String(presetIdRaw);
    return [{
      presetId,
      preset: lot,
      sales: Array.isArray(salesByLot[presetId]) ? salesByLot[presetId] : []
    }];
  });
}

interface IncrementalSyncUpsertResult {
  changed: boolean;
  upsertedCount: number;
  deletedCount: number;
}

export async function upsertSyncSnapshotIncremental(
  config: ApiConfig,
  input: IncrementalSyncUpsertInput
): Promise<IncrementalSyncUpsertResult> {
  const { syncSnapshots } = getContainers(config);
  const existingDocuments = await getSyncPresetDocuments(config, input.userId);
  const existingMetaDocument = await getSyncMetaDocument(config, input.userId);
  const existingStates = existingDocuments.map(toPresetState);
  const incomingStates = buildIncomingPresetStates(input.lots, input.salesByLot);
  const diff = calculateSyncPresetDiff(existingStates, incomingStates);

  const incomingById = new Map<string, SyncPresetState>();
  for (const state of incomingStates) {
    incomingById.set(state.presetId, state);
  }

  let upsertedCount = 0;
  for (const presetId of diff.upsertPresetIds) {
    const state = incomingById.get(presetId);
    if (!state) continue;

    const document: SyncPresetDocument = {
      id: syncPresetId(input.userId, presetId),
      docType: "sync_preset",
      userId: input.userId,
      presetId,
      preset: state.preset,
      sales: state.sales,
      version: input.version,
      updatedAt: input.updatedAt
    };

    await withCosmosRetry(() => syncSnapshots.items.upsert<SyncPresetDocument>(document));
    upsertedCount += 1;
  }

  let deletedCount = 0;
  for (const presetId of diff.deletePresetIds) {
    const id = syncPresetId(input.userId, presetId);
    try {
      await withCosmosRetry(() => syncSnapshots.item(id, input.userId).delete());
      deletedCount += 1;
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }

  const nextWheelConfigs = Array.isArray(input.wheelConfigs) ? input.wheelConfigs : [];
  const nextActiveWheelConfigId = normalizeActiveWheelConfigId(input.activeWheelConfigId);
  const existingWheelConfigs = Array.isArray(existingMetaDocument?.wheelConfigs) ? existingMetaDocument.wheelConfigs : [];
  const existingActiveWheelConfigId = normalizeActiveWheelConfigId(existingMetaDocument?.activeWheelConfigId);
  const wheelConfigChanged =
    JSON.stringify(existingWheelConfigs) !== JSON.stringify(nextWheelConfigs)
    || existingActiveWheelConfigId !== nextActiveWheelConfigId;
  const changed = upsertedCount > 0 || deletedCount > 0 || wheelConfigChanged;

  if (changed) {
    const metaDocument: SyncMetaDocument = {
      id: syncMetaId(input.userId),
      docType: "sync_meta",
      userId: input.userId,
      version: input.version,
      updatedAt: input.updatedAt,
      wheelConfigs: nextWheelConfigs,
      activeWheelConfigId: nextActiveWheelConfigId,
      salesMode: existingMetaDocument?.salesMode,
      livePricingMode: existingMetaDocument?.livePricingMode
    };
    await withCosmosRetry(() => syncSnapshots.items.upsert<SyncMetaDocument>(metaDocument));
  }

  return {
    changed,
    upsertedCount,
    deletedCount
  };
}

export async function deleteAllSyncData(
  config: ApiConfig,
  userId: string
): Promise<void> {
  const { syncSnapshots } = getContainers(config);

  const presetDocuments = await getSyncPresetDocuments(config, userId);
  for (const document of presetDocuments) {
    try {
      await withCosmosRetry(() => syncSnapshots.item(document.id, userId).delete());
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }

  const deletions = [
    () => syncSnapshots.item(syncMetaId(userId), userId).delete(),
    () => syncSnapshots.item(syncSnapshotId(userId), userId).delete()
  ];

  for (const deletion of deletions) {
    try {
      await withCosmosRetry(deletion);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }
}
