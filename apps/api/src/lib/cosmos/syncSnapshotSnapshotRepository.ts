import type { Container } from "@azure/cosmos";
import type { ApiConfig, SyncSnapshotDocument } from "../../types";
import {
  EPOCH_DATE_ISO,
  getContainers,
  getExternalSyncContainer,
  type ExternalSyncSourceConfig
} from "./core";
import { syncSnapshotId } from "./ids";
import {
  getSyncMetaDocumentFromContainer,
  getSyncPresetDocumentsFromContainer,
  normalizeActiveWheelConfigId
} from "./syncSnapshotRepository.shared";

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