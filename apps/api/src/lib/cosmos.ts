import { CosmosClient, type Container } from "@azure/cosmos";
import type {
  ApiConfig,
  EntitlementDocument,
  SyncMetaDocument,
  SyncPresetDocument,
  SyncSnapshotDocument
} from "../types";
import { calculateSyncPresetDiff, type SyncPresetState } from "./syncDiff";

interface CosmosCache {
  entitlements: Container;
  syncSnapshots: Container;
}

let cosmosCache: CosmosCache | null = null;

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

function entitlementId(userId: string): string {
  return `entitlement:${userId}`;
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
    const { resource } = await entitlements.item(id, userId).read<EntitlementDocument>();
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
  const { resource } = await entitlements.items.upsert<EntitlementDocument>({
    ...entitlement,
    id: entitlementId(entitlement.userId)
  });

  if (!resource) {
    throw new Error("Failed to upsert entitlement.");
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
    await entitlements.item(id, userId).delete();
  } catch (error) {
    if (isNotFoundError(error)) return;
    throw error;
  }
}

export async function getSyncSnapshot(
  config: ApiConfig,
  userId: string
): Promise<SyncSnapshotDocument | null> {
  const { syncSnapshots } = getContainers(config);
  const id = syncSnapshotId(userId);

  try {
    const { resource } = await syncSnapshots.item(id, userId).read<SyncSnapshotDocument>();
    return resource ?? null;
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
  const { resources } = await iterator.fetchAll();
  return resources ?? [];
}

export async function getSyncMetaDocument(
  config: ApiConfig,
  userId: string
): Promise<SyncMetaDocument | null> {
  const { syncSnapshots } = getContainers(config);
  const id = syncMetaId(userId);

  try {
    const { resource } = await syncSnapshots.item(id, userId).read<SyncMetaDocument>();
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

function compareIsoDate(a: string, b: string): string {
  return a >= b ? a : b;
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

  const presets: unknown[] = [];
  const salesByPreset: Record<string, unknown[]> = {};
  let maxVersion = 0;
  let latestUpdatedAt = "1970-01-01T00:00:00.000Z";

  for (const document of presetDocuments) {
    presets.push(document.preset);
    salesByPreset[document.presetId] = Array.isArray(document.sales) ? document.sales : [];
    maxVersion = Math.max(maxVersion, document.version || 0);
    if (typeof document.updatedAt === "string") {
      latestUpdatedAt = compareIsoDate(latestUpdatedAt, document.updatedAt);
    }
  }

  if (metaDocument) {
    maxVersion = Math.max(maxVersion, metaDocument.version || 0);
    if (typeof metaDocument.updatedAt === "string") {
      latestUpdatedAt = compareIsoDate(latestUpdatedAt, metaDocument.updatedAt);
    }
  }

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
  const states: SyncPresetState[] = [];

  for (const preset of presets) {
    if (typeof preset !== "object" || preset === null || Array.isArray(preset)) {
      continue;
    }
    const presetIdRaw = (preset as { id?: unknown }).id;
    if (typeof presetIdRaw !== "string" && typeof presetIdRaw !== "number") {
      continue;
    }

    const presetId = String(presetIdRaw);
    states.push({
      presetId,
      preset,
      sales: Array.isArray(salesByPreset[presetId]) ? salesByPreset[presetId] : []
    });
  }

  return states;
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

    await syncSnapshots.items.upsert<SyncPresetDocument>(document);
    upsertedCount += 1;
  }

  let deletedCount = 0;
  for (const presetId of diff.deletePresetIds) {
    const id = syncPresetId(input.userId, presetId);
    try {
      await syncSnapshots.item(id, input.userId).delete();
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
    await syncSnapshots.items.upsert<SyncMetaDocument>(metaDocument);
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
  const { resource } = await syncSnapshots.items.upsert<SyncSnapshotDocument>({
    ...snapshot,
    id: syncSnapshotId(snapshot.userId)
  });

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
    await syncSnapshots.item(id, userId).delete();
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
      await syncSnapshots.item(document.id, userId).delete();
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }

  const deletions = [
    syncSnapshots.item(syncMetaId(userId), userId).delete(),
    syncSnapshots.item(syncSnapshotId(userId), userId).delete()
  ];

  for (const deletion of deletions) {
    try {
      await deletion;
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }
}
