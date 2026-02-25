import { CosmosClient, type Container } from "@azure/cosmos";
import type {
  ApiConfig,
  EntitlementDocument,
  MigrationMarkerDocument,
  MigrationRunDocument,
  PurchaseVerificationResultDocument,
  PlayPurchaseDocument,
  SyncMetaDocument,
  SyncPresetDocument,
  SyncSnapshotDocument
} from "../types";
import { calculateSyncPresetDiff, type SyncPresetState } from "./syncDiff";
import { buildLegacyUserEntitlementDocumentId } from "./scopeKeys";

interface CosmosCache {
  entitlements: Container;
  syncSnapshots: Container;
  migrationRuns: Container;
}

let cosmosCache: CosmosCache | null = null;
const COSMOS_MAX_RETRY_ATTEMPTS = 3;
const COSMOS_BASE_RETRY_DELAY_MS = 200;
const EPOCH_DATE_ISO = "1970-01-01T00:00:00.000Z";

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

function isConflictError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  const statusCode = (error as { statusCode?: unknown }).statusCode;

  return code === 409 || statusCode === 409 || code === "Conflict" || code === "conflict";
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
  return buildLegacyUserEntitlementDocumentId(userId);
}

function playPurchaseId(purchaseTokenHash: string): string {
  return `play_purchase:${purchaseTokenHash}`;
}

function purchaseVerificationResultId(userId: string, provider: string, idempotencyKey: string): string {
  return `purchase_verify:${userId}:${provider}:${idempotencyKey}`;
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

function migrationMarkerId(migrationId: string): string {
  return `migration_marker:${migrationId}`;
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
    syncSnapshots: database.container(config.syncContainerId),
    migrationRuns: database.container(config.migrationRunsContainerId)
  };

  return cosmosCache;
}

export async function upsertMigrationRun(
  config: ApiConfig,
  document: MigrationRunDocument
): Promise<MigrationRunDocument> {
  const { migrationRuns } = getContainers(config);
  const { resource } = await withCosmosRetry(() =>
    migrationRuns.items.upsert<MigrationRunDocument>(document)
  );

  if (!resource) {
    throw new Error("Failed to upsert migration run.");
  }

  return resource;
}

export interface UpsertMigrationMarkerInput {
  migrationId: string;
  runId: string;
  triggeredByUserId: string;
  note: string;
  result: Record<string, unknown> | null;
}

export async function upsertMigrationMarker(
  config: ApiConfig,
  input: UpsertMigrationMarkerInput
): Promise<MigrationMarkerDocument> {
  const { migrationRuns } = getContainers(config);
  const document: MigrationMarkerDocument = {
    id: migrationMarkerId(input.migrationId),
    docType: "migration_marker",
    migrationId: input.migrationId,
    updatedAt: new Date().toISOString(),
    lastRunId: input.runId,
    triggeredByUserId: input.triggeredByUserId,
    note: input.note,
    result: input.result
  };

  const { resource } = await withCosmosRetry(() =>
    migrationRuns.items.upsert<MigrationMarkerDocument>(document)
  );

  if (!resource) {
    throw new Error("Failed to upsert migration marker.");
  }

  return resource;
}

export async function getMigrationMarker(
  config: ApiConfig,
  migrationId: string
): Promise<MigrationMarkerDocument | null> {
  const { migrationRuns } = getContainers(config);
  const markerId = migrationMarkerId(migrationId);
  const querySpec = {
    query: "SELECT TOP 1 * FROM c WHERE c.id = @id AND c.docType = @docType",
    parameters: [
      { name: "@id", value: markerId },
      { name: "@docType", value: "migration_marker" }
    ]
  };

  const iterator = migrationRuns.items.query<MigrationMarkerDocument>(querySpec, {
    maxItemCount: 1
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return resources?.[0] ?? null;
}

interface ListMigrationRunsOptions {
  migrationId?: string;
  limit?: number;
}

export async function listMigrationRuns(
  config: ApiConfig,
  { migrationId, limit = 20 }: ListMigrationRunsOptions = {}
): Promise<MigrationRunDocument[]> {
  const { migrationRuns } = getContainers(config);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 20;

  const querySpec = migrationId
    ? {
      query: `SELECT TOP ${safeLimit} * FROM c WHERE c.docType = @docType AND c.migrationId = @migrationId ORDER BY c.startedAt DESC`,
      parameters: [
        { name: "@docType", value: "migration_run" },
        { name: "@migrationId", value: migrationId }
      ]
    }
    : {
      query: `SELECT TOP ${safeLimit} * FROM c WHERE c.docType = @docType ORDER BY c.startedAt DESC`,
      parameters: [{ name: "@docType", value: "migration_run" }]
    };

  const iterator = migrationRuns.items.query<MigrationRunDocument>(querySpec, {
    maxItemCount: safeLimit
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return resources ?? [];
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

interface PurchaseVerificationResultLookupInput {
  userId: string;
  provider: string;
  idempotencyKey: string;
}

export async function getPurchaseVerificationResult(
  config: ApiConfig,
  input: PurchaseVerificationResultLookupInput
): Promise<PurchaseVerificationResultDocument | null> {
  const { entitlements } = getContainers(config);
  const id = purchaseVerificationResultId(input.userId, input.provider, input.idempotencyKey);

  try {
    const { resource } = await withCosmosRetry(() =>
      entitlements.item(id, input.userId).read<PurchaseVerificationResultDocument>()
    );
    if (!resource || resource.docType !== "purchase_verification_result") {
      return null;
    }
    return resource;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

interface CreatePurchaseVerificationResultInput {
  userId: string;
  provider: string;
  idempotencyKey: string;
  responseStatus: number;
  responseBody: Record<string, unknown>;
  createdAt: string;
}

export async function createPurchaseVerificationResult(
  config: ApiConfig,
  input: CreatePurchaseVerificationResultInput
): Promise<PurchaseVerificationResultDocument> {
  const { entitlements } = getContainers(config);
  const document: PurchaseVerificationResultDocument = {
    id: purchaseVerificationResultId(input.userId, input.provider, input.idempotencyKey),
    docType: "purchase_verification_result",
    userId: input.userId,
    provider: input.provider,
    idempotencyKey: input.idempotencyKey,
    responseStatus: input.responseStatus,
    responseBody: input.responseBody,
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  };

  try {
    const { resource } = await withCosmosRetry(() =>
      entitlements.items.create<PurchaseVerificationResultDocument>(document)
    );

    if (!resource) {
      throw new Error("Failed to create purchase verification result.");
    }

    return resource;
  } catch (error) {
    if (isConflictError(error)) {
      const existing = await getPurchaseVerificationResult(config, {
        userId: input.userId,
        provider: input.provider,
        idempotencyKey: input.idempotencyKey
      });
      if (existing) return existing;
    }
    throw error;
  }
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

  const lots = presetDocuments.map((document) => document.preset);
  const salesByLot = Object.fromEntries(
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

interface IncrementalSyncUpsertInput {
  userId: string;
  lots: unknown[];
  salesByLot: Record<string, unknown[]>;
  version: number;
  updatedAt: string;
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
