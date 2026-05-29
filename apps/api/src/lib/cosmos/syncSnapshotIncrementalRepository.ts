import type { ApiConfig, SyncMetaDocument, SyncPresetDocument } from "../../types";
import { calculateSyncPresetDiff } from "../syncDiff";
import { getContainers, isNotFoundError, withCosmosRetry } from "./core";
import { syncMetaId, syncPresetId } from "./ids";
import {
  buildIncomingPresetStates,
  type IncrementalSyncUpsertInput,
  type IncrementalSyncUpsertResult,
  normalizeActiveWheelConfigId,
  toPresetState
} from "./syncSnapshotRepository.shared";
import {
  getSyncMetaDocument,
  getSyncPresetDocuments
} from "./syncSnapshotPresetRepository";

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

  const incomingById = new Map<string, typeof incomingStates[number]>();
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
  const hasIncomingSystemPricingDefaults = input.systemPricingDefaults !== undefined;
  const existingSystemPricingDefaults = existingMetaDocument?.systemPricingDefaults ?? null;
  const nextSystemPricingDefaults = hasIncomingSystemPricingDefaults
    ? input.systemPricingDefaults ?? null
    : existingSystemPricingDefaults;
  const existingWheelConfigs = Array.isArray(existingMetaDocument?.wheelConfigs) ? existingMetaDocument.wheelConfigs : [];
  const existingActiveWheelConfigId = normalizeActiveWheelConfigId(existingMetaDocument?.activeWheelConfigId);
  const wheelConfigChanged =
    JSON.stringify(existingWheelConfigs) !== JSON.stringify(nextWheelConfigs)
    || existingActiveWheelConfigId !== nextActiveWheelConfigId;
  const systemPricingDefaultsChanged =
    hasIncomingSystemPricingDefaults
    && JSON.stringify(existingSystemPricingDefaults) !== JSON.stringify(nextSystemPricingDefaults);
  const changed = upsertedCount > 0 || deletedCount > 0 || wheelConfigChanged || systemPricingDefaultsChanged;

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
    if (nextSystemPricingDefaults) {
      metaDocument.systemPricingDefaults = nextSystemPricingDefaults;
    }
    await withCosmosRetry(() => syncSnapshots.items.upsert<SyncMetaDocument>(metaDocument));
  }

  return {
    changed,
    upsertedCount,
    deletedCount
  };
}
