import type { Container } from "@azure/cosmos";
import type {
  ApiConfig,
  SyncLotDto,
  SyncSaleDto,
  SyncSnapshotDocument,
  SyncWheelConfigDto
} from "../../types";
import {
  EPOCH_DATE_ISO,
  getContainers,
  getExternalSyncContainer,
  type ExternalSyncSourceConfig
} from "./core";
import { syncSnapshotId } from "./ids";
import { parseSyncSale, parseSyncWheelConfig } from "../syncShape";
import {
  getSyncMetaDocumentFromContainer,
  getSyncPresetDocumentsFromContainer,
  normalizeActiveWheelConfigId,
  selectCurrentSyncPresetDocuments
} from "./syncSnapshotRepository.shared";
import { normalizeSyncSystemPricingDefaultsDto } from "../../shared/sync-contracts.cjs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSyncLotDto(value: unknown): value is SyncLotDto {
  return isRecord(value) && (typeof value.id === "string" || typeof value.id === "number");
}

function isSyncSaleDto(value: unknown): value is SyncSaleDto {
  return isRecord(value) && typeof value.id === "number" && Number.isFinite(value.id) && value.id > 0;
}

function isSyncWheelConfigDto(value: unknown): value is SyncWheelConfigDto {
  return isRecord(value) && typeof value.id === "number" && Number.isFinite(value.id) && value.id > 0;
}

function toSyncSaleDtos(value: unknown): SyncSaleDto[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index): SyncSaleDto[] => {
    if (!isRecord(entry)) return [];
    if (isSyncSaleDto(entry)) return [entry];
    try {
      return [parseSyncSale(entry, `sales[${index}]`)];
    } catch {
      return [];
    }
  });
}

function toSyncWheelConfigDtos(value: unknown): SyncWheelConfigDto[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index): SyncWheelConfigDto[] => {
    if (!isRecord(entry)) return [];
    if (isSyncWheelConfigDto(entry)) return [entry];
    try {
      return [parseSyncWheelConfig(entry, `wheelConfigs[${index}]`)];
    } catch {
      return [];
    }
  });
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

  const currentPresetDocuments = selectCurrentSyncPresetDocuments(presetDocuments, metaDocument);
  const wheelConfigs = toSyncWheelConfigDtos(metaDocument?.wheelConfigs);
  const activeWheelConfigId = normalizeActiveWheelConfigId(metaDocument?.activeWheelConfigId);
  const systemPricingDefaults = normalizeSyncSystemPricingDefaultsDto(metaDocument?.systemPricingDefaults);

  if (currentPresetDocuments.length === 0 && wheelConfigs.length === 0 && !systemPricingDefaults) {
    return null;
  }

  const lots = currentPresetDocuments
    .map((document) => document.preset)
    .filter(isSyncLotDto);
  const salesByLot = metaDocument?.salesMode === "entity"
    ? {}
    : Object.fromEntries(
      currentPresetDocuments.filter((document) => isSyncLotDto(document.preset)).map((document) => [
        document.presetId,
        toSyncSaleDtos(document.sales)
      ])
    );

  const maxVersion = Math.max(
    0,
    metaDocument?.version ?? 0,
    ...currentPresetDocuments.map((document) => document.version || 0)
  );
  const latestUpdatedAt = [
    metaDocument?.updatedAt,
    ...currentPresetDocuments.map((document) => document.updatedAt)
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
    ...(systemPricingDefaults ? { systemPricingDefaults } : {}),
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
