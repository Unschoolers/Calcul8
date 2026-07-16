import type { ApiConfig, SyncMetaDocument, SyncPresetDocument } from "../../types";
import {
  getContainers,
  getExternalSyncContainer,
  isNotFoundError,
  type ExternalSyncSourceConfig,
  withCosmosRetry
} from "./core";
import {
  getSyncMetaDocumentFromContainer,
  getSyncPresetDocumentsFromContainer
} from "./syncSnapshotRepository.shared";

export async function getSyncPresetDocuments(
  config: ApiConfig,
  userId: string
): Promise<SyncPresetDocument[]> {
  const { syncSnapshots } = getContainers(config);
  return getSyncPresetDocumentsFromContainer(syncSnapshots, userId);
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

export async function deleteAllSyncData(
  config: ApiConfig,
  userId: string
): Promise<void> {
  const { syncSnapshots } = getContainers(config);

  // Personal data spans configuration, sales/pricing entities, Whatnot
  // workflow records, and fairness proofs. Enumerating the partition keeps
  // erasure complete as new personal document types are introduced.
  const iterator = syncSnapshots.items.query<{ id?: string }>({
    query: "SELECT c.id FROM c WHERE c.userId = @userId",
    parameters: [{ name: "@userId", value: userId }]
  }, { partitionKey: userId });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  for (const document of resources ?? []) {
    const id = String(document.id ?? "").trim();
    if (!id) continue;
    try {
      await withCosmosRetry(() => syncSnapshots.item(id, userId).delete());
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }
}
