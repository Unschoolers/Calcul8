import type { ApiConfig, SyncMetaDocument, SyncPresetDocument } from "../../types";
import {
  getContainers,
  getExternalSyncContainer,
  isNotFoundError,
  type ExternalSyncSourceConfig,
  withCosmosRetry
} from "./core";
import { syncMetaId, syncSnapshotId } from "./ids";
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