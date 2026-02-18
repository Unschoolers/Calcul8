import { CosmosClient, type Container } from "@azure/cosmos";
import type {
  ApiConfig,
  EntitlementDocument,
  PlayPurchaseDocument,
  SyncMetaDocument,
  SyncPresetDocument,
  SyncSnapshotDocument
} from "../types";
import { calculateSyncPresetDiff, type SyncPresetState } from "./syncDiff";
import { extractCanonicalSyncShape } from "./syncShape";

interface CosmosCache {
  entitlements: Container;
  syncSnapshots: Container;
}

let cosmosCache: CosmosCache | null = null;
const COSMOS_MAX_RETRY_ATTEMPTS = 3;
const COSMOS_BASE_RETRY_DELAY_MS = 200;
const EPOCH_DATE_ISO = "1970-01-01T00:00:00.000Z";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  const statusCode = (error as { statusCode?: unknown }).statusCode;

  return (
    code === 404 ||
    statusCode === 404 ||
    code === "NotFound" ||
    code === "notfound"
  );
}

function isRetryableCosmosError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  const code = (error as { code?: unknown }).code;

  return (
    statusCode === 408 ||
    statusCode === 429 ||
    statusCode === 449 ||
    statusCode === 500 ||
    statusCode === 503 ||
    code === "RequestTimeout" ||
    code === "TooManyRequests"
  );
}

function getRetryAfterMs(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const retryAfterInMs = (error as { retryAfterInMs?: unknown }).retryAfterInMs;
  if (typeof retryAfterInMs === "number" && Number.isFinite(retryAfterInMs) && retryAfterInMs >= 0) {
    return retryAfterInMs;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withCosmosRetry<T>(operation: () => Promise<T>): Promise<T> {
  let attempt = 0;

  while (true) {
    attempt += 1;
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableCosmosError(error) || attempt >= COSMOS_MAX_RETRY_ATTEMPTS) {
        throw error;
      }

      const retryAfterMs = getRetryAfterMs(error);
      const exponentialDelayMs = COSMOS_BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      const jitterMs = Math.round(Math.random() * 100);
      await sleep(retryAfterMs ?? exponentialDelayMs + jitterMs);
    }
  }
}

function entitlementId(userId: string): string {
  return `entitlement:${userId}`;
}

function playPurchaseId(purchaseTokenHash: string): string {
  return `play_purchase:${purchaseTokenHash}`;
}

function syncSnapshotId(userId: string): string {
  return `sync:${userId}`;
}

function syncPresetId(userId: string, presetId: string): string {
  return `sync:preset:${userId}:${presetId}`;
}

function syncMetaId(userId: string): string {
  return `sync:meta:${userId}`;
}

function normalizeSyncVersion(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function normalizeSyncUpdatedAt(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : EPOCH_DATE_ISO;
}

function normalizeSyncSnapshotDocument(raw: unknown, fallbackUserId: string): SyncSnapshotDocument | null {
  if (!isRecord(raw)) return null;
  const canonicalShape = extractCanonicalSyncShape(raw);
  if (!canonicalShape) return null;

  return {
    id: typeof raw.id === "string" ? raw.id : syncSnapshotId(fallbackUserId),
    userId: typeof raw.userId === "string" ? raw.userId : fallbackUserId,
    presets: canonicalShape.presets,
    salesByPreset: canonicalShape.salesByPreset,
    version: normalizeSyncVersion(raw.version),
    updatedAt: normalizeSyncUpdatedAt(raw.updatedAt)
  };
}

function getContainers(config: ApiConfig): CosmosCache {
  if (cosmosCache) return cosmosCache;

  const client = new CosmosClient({
    endpoint: config.cosmosEndpoint,
    key: config.cosmosKey
  });
  const database = client.database(config.cosmosDatabaseId);

  cosmosCache = {
    entitlements: database.container(config.entitlementsContainerId),
    syncSnapshots: database.container(config.syncContainerId)
  };

  return cosmosCache;
}

export async function getEntitlement(
  config: ApiConfig,
  userId: string
): Promise<EntitlementDocument | null> {
  const { entitlements } = getContainers(config);
  const id = entitlementId(userId);

  try {
    const { resource } = await withCosmosRetry(() => entitlements.item(id, userId).read<EntitlementDocument>());
    return resource ?? null;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export async function upsertEntitlement(
  config: ApiConfig,
  entitlement: EntitlementDocument
): Promise<EntitlementDocument> {
  const { entitlements } = getContainers(config);
  const { resource } = await withCosmosRetry(() =>
    entitlements.items.upsert<EntitlementDocument>({
      ...entitlement,
      id: entitlementId(entitlement.userId)
    })
  );

  if (!resource) {
    throw new Error("Failed to upsert entitlement.");
  }

  return resource;
}

export async function getPlayPurchaseByTokenHash(
  config: ApiConfig,
  purchaseTokenHash: string
): Promise<PlayPurchaseDocument | null> {
  const { entitlements } = getContainers(config);
  const querySpec = {
    query: "SELECT TOP 1 * FROM c WHERE c.docType = @docType AND c.purchaseTokenHash = @purchaseTokenHash",
    parameters: [
      { name: "@docType", value: "play_purchase" },
      { name: "@purchaseTokenHash", value: purchaseTokenHash }
    ]
  };

  const iterator = entitlements.items.query<PlayPurchaseDocument>(querySpec, {
    maxItemCount: 1
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return resources?.[0] ?? null;
}

export async function listPlayPurchasesForUser(
  config: ApiConfig,
  userId: string
): Promise<PlayPurchaseDocument[]> {
  const { entitlements } = getContainers(config);
  const querySpec = {
    query: "SELECT * FROM c WHERE c.userId = @userId AND c.docType = @docType",
    parameters: [
      { name: "@userId", value: userId },
      { name: "@docType", value: "play_purchase" }
    ]
  };

  const iterator = entitlements.items.query<PlayPurchaseDocument>(querySpec, {
    partitionKey: userId
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return resources ?? [];
}

export async function upsertPlayPurchase(
  config: ApiConfig,
  purchase: PlayPurchaseDocument
): Promise<PlayPurchaseDocument> {
  const { entitlements } = getContainers(config);
  const { resource } = await withCosmosRetry(() =>
    entitlements.items.upsert<PlayPurchaseDocument>({
      ...purchase,
      id: playPurchaseId(purchase.purchaseTokenHash)
    })
  );

  if (!resource) {
    throw new Error("Failed to upsert play purchase.");
  }

  return resource;
}

export async function deleteEntitlement(
  config: ApiConfig,
  userId: string
): Promise<void> {
  const { entitlements } = getContainers(config);
  const id = entitlementId(userId);

  try {
    await withCosmosRetry(() => entitlements.item(id, userId).delete());
  } catch (error) {
    if (isNotFoundError(error)) return;
    throw error;
  }
}

export async function deletePlayPurchasesForUser(
  config: ApiConfig,
  userId: string
): Promise<void> {
  const { entitlements } = getContainers(config);
  const purchases = await listPlayPurchasesForUser(config, userId);

  for (const purchase of purchases) {
    try {
      await withCosmosRetry(() => entitlements.item(purchase.id, userId).delete());
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }
}

export async function getSyncSnapshot(
  config: ApiConfig,
  userId: string
): Promise<SyncSnapshotDocument | null> {
  const { syncSnapshots } = getContainers(config);
  const id = syncSnapshotId(userId);

  try {
    const { resource } = await withCosmosRetry(() => syncSnapshots.item(id, userId).read<Record<string, unknown>>());
    return normalizeSyncSnapshotDocument(resource, userId);
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export async function getLegacySyncSnapshot(
  config: ApiConfig,
  userId: string
): Promise<SyncSnapshotDocument | null> {
  return getSyncSnapshot(config, userId);
}

export async function getSyncPresetDocuments(
  config: ApiConfig,
  userId: string
): Promise<SyncPresetDocument[]> {
  const { syncSnapshots } = getContainers(config);
  const querySpec = {
    query: "SELECT * FROM c WHERE c.userId = @userId AND c.docType = @docType",
    parameters: [
      { name: "@userId", value: userId },
      { name: "@docType", value: "sync_preset" }
    ]
  };
  const iterator = syncSnapshots.items.query<SyncPresetDocument>(querySpec, {
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
  const id = syncMetaId(userId);

  try {
    const { resource } = await withCosmosRetry(() => syncSnapshots.item(id, userId).read<SyncMetaDocument>());
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
  const [presetDocuments, metaDocument] = await Promise.all([
    getSyncPresetDocuments(config, userId),
    getSyncMetaDocument(config, userId)
  ]);

  if (presetDocuments.length === 0) {
    return null;
  }

  const presets = presetDocuments.map((document) => document.preset);
  const salesByPreset = Object.fromEntries(
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
    presets,
    salesByPreset,
    version: maxVersion,
    updatedAt: latestUpdatedAt
  };
}

export async function getEffectiveSyncSnapshot(
  config: ApiConfig,
  userId: string
): Promise<SyncSnapshotDocument | null> {
  const fromPresetDocs = await getSyncSnapshotFromPresetDocuments(config, userId);
  if (fromPresetDocs) {
    return fromPresetDocs;
  }
  return getLegacySyncSnapshot(config, userId);
}

interface IncrementalSyncUpsertInput {
  userId: string;
  presets: unknown[];
  salesByPreset: Record<string, unknown[]>;
  version: number;
  updatedAt: string;
}

function buildIncomingPresetStates(
  presets: unknown[],
  salesByPreset: Record<string, unknown[]>
): SyncPresetState[] {
  return presets.flatMap((preset): SyncPresetState[] => {
    if (typeof preset !== "object" || preset === null || Array.isArray(preset)) {
      return [];
    }
    const presetIdRaw = (preset as { id?: unknown }).id;
    if (typeof presetIdRaw !== "string" && typeof presetIdRaw !== "number") {
      return [];
    }

    const presetId = String(presetIdRaw);
    return [{
      presetId,
      preset,
      sales: Array.isArray(salesByPreset[presetId]) ? salesByPreset[presetId] : []
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
  const existingStates = existingDocuments.map(toPresetState);
  const incomingStates = buildIncomingPresetStates(input.presets, input.salesByPreset);
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

  const changed = upsertedCount > 0 || deletedCount > 0;

  if (changed) {
    const metaDocument: SyncMetaDocument = {
      id: syncMetaId(input.userId),
      docType: "sync_meta",
      userId: input.userId,
      version: input.version,
      updatedAt: input.updatedAt
    };
    await withCosmosRetry(() => syncSnapshots.items.upsert<SyncMetaDocument>(metaDocument));
  }

  return {
    changed,
    upsertedCount,
    deletedCount
  };
}

export async function upsertSyncSnapshot(
  config: ApiConfig,
  snapshot: SyncSnapshotDocument
): Promise<SyncSnapshotDocument> {
  const { syncSnapshots } = getContainers(config);
  const { resource } = await withCosmosRetry(() =>
    syncSnapshots.items.upsert<SyncSnapshotDocument>({
      ...snapshot,
      id: syncSnapshotId(snapshot.userId)
    })
  );

  if (!resource) {
    throw new Error("Failed to upsert sync snapshot.");
  }

  return resource;
}

export async function deleteSyncSnapshot(
  config: ApiConfig,
  userId: string
): Promise<void> {
  const { syncSnapshots } = getContainers(config);
  const id = syncSnapshotId(userId);

  try {
    await withCosmosRetry(() => syncSnapshots.item(id, userId).delete());
  } catch (error) {
    if (isNotFoundError(error)) return;
    throw error;
  }
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
