import { CosmosClient, type Container } from "@azure/cosmos";
import type { ApiConfig, EntitlementDocument, SyncSnapshotDocument } from "../types";

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
