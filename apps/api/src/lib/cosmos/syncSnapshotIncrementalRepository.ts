import { randomUUID } from "node:crypto";
import type { OperationInput } from "@azure/cosmos";
import type { ApiConfig, SyncMetaDocument, SyncPresetDocument } from "../../types";
import { calculateSyncPresetDiff } from "../syncDiff";
import { getContainers, isConflictError, isPreconditionFailedError, withCosmosRetry } from "./core";
import { syncMetaId, syncPresetSetId } from "./ids";
import {
  buildIncomingPresetStates,
  type IncrementalSyncUpsertInput,
  type IncrementalSyncUpsertResult,
  normalizeActiveWheelConfigId,
  normalizePresetSetId,
  selectCurrentSyncPresetDocuments,
  SyncSnapshotConflictError,
  toPresetState
} from "./syncSnapshotRepository.shared";
import {
  getSyncMetaDocument,
  getSyncPresetDocuments
} from "./syncSnapshotPresetRepository";

const COSMOS_TRANSACTIONAL_BATCH_OPERATION_LIMIT = 100;

function readCosmosEtag(document: unknown): string {
  if (!document || typeof document !== "object") return "";
  return String((document as { _etag?: unknown })._etag ?? "").trim();
}

function getExistingSnapshotVersion(
  existingMetaDocument: SyncMetaDocument | null,
  currentDocuments: SyncPresetDocument[]
): number {
  if (existingMetaDocument) {
    return Number(existingMetaDocument.version) || 0;
  }
  return Math.max(
    0,
    ...currentDocuments.map((document) => Number(document.version) || 0)
  );
}

function assertExpectedVersion(
  existingVersion: number,
  expectedVersion: number | undefined
): void {
  if (expectedVersion == null) return;
  if (existingVersion !== expectedVersion) {
    throw new SyncSnapshotConflictError();
  }
}

function buildMetaDocument(
  input: IncrementalSyncUpsertInput,
  existingMetaDocument: SyncMetaDocument | null,
  nextWheelConfigs: IncrementalSyncUpsertInput["wheelConfigs"],
  nextActiveWheelConfigId: number | null,
  nextSystemPricingDefaults: IncrementalSyncUpsertInput["systemPricingDefaults"] | null,
  presetSetId: string
): SyncMetaDocument {
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
  if (presetSetId) {
    metaDocument.presetSetId = presetSetId;
  }
  if (nextSystemPricingDefaults) {
    metaDocument.systemPricingDefaults = nextSystemPricingDefaults;
  }
  return metaDocument;
}

function buildMetaOperation(
  existingMetaDocument: SyncMetaDocument | null,
  metaDocument: SyncMetaDocument
): OperationInput {
  if (!existingMetaDocument) {
    return {
      operationType: "Create",
      resourceBody: metaDocument as never
    };
  }

  const etag = readCosmosEtag(existingMetaDocument);
  return {
    operationType: "Replace",
    id: metaDocument.id,
    resourceBody: metaDocument as never,
    ...(etag ? { ifMatch: etag } : {})
  };
}

function createPresetSetId(version: number): string {
  return `v${Math.max(0, Math.floor(version))}:${randomUUID()}`;
}

function buildPresetSetOperations(
  input: IncrementalSyncUpsertInput,
  incomingStates: ReturnType<typeof buildIncomingPresetStates>,
  presetSetId: string
): OperationInput[] {
  return incomingStates.map((state): OperationInput => {
    const document: SyncPresetDocument = {
      id: syncPresetSetId(input.userId, presetSetId, state.presetId),
      docType: "sync_preset",
      userId: input.userId,
      presetId: state.presetId,
      presetSetId,
      preset: state.preset,
      sales: state.sales,
      version: input.version,
      updatedAt: input.updatedAt
    };

    return {
      operationType: "Upsert",
      resourceBody: document as never
    };
  });
}

async function executeFallbackOperations(
  config: ApiConfig,
  partitionKey: string,
  operations: OperationInput[]
): Promise<void> {
  const { syncSnapshots } = getContainers(config);
  for (const operation of operations) {
    switch (operation.operationType) {
      case "Create":
        await withCosmosRetry(() => syncSnapshots.items.create(operation.resourceBody as never));
        break;
      case "Replace": {
        const options = operation.ifMatch
          ? {
            accessCondition: {
              type: "IfMatch" as const,
              condition: operation.ifMatch
            }
          }
          : undefined;
        await withCosmosRetry(() =>
          syncSnapshots.item(operation.id, partitionKey).replace(operation.resourceBody as never, options)
        );
        break;
      }
      case "Upsert":
        await withCosmosRetry(() => syncSnapshots.items.upsert(operation.resourceBody as never));
        break;
      case "Delete":
        await withCosmosRetry(() => syncSnapshots.item(operation.id, partitionKey).delete());
        break;
      default:
        throw new Error(`Unsupported sync batch operation '${String(operation.operationType)}'.`);
    }
  }
}

async function executeSyncSnapshotOperations(
  config: ApiConfig,
  partitionKey: string,
  operations: OperationInput[]
): Promise<void> {
  const { syncSnapshots } = getContainers(config);

  try {
    if (operations.length <= COSMOS_TRANSACTIONAL_BATCH_OPERATION_LIMIT) {
      await withCosmosRetry(() => syncSnapshots.items.batch(operations, partitionKey));
      return;
    }

    // Transactional batches are capped by Cosmos. Large writes stage versioned
    // preset documents first; readers ignore them until the final meta CAS points
    // at that preset set, so a failed swap leaves the previous snapshot visible.
    await executeFallbackOperations(config, partitionKey, operations);
  } catch (error) {
    if (isPreconditionFailedError(error) || isConflictError(error)) {
      throw new SyncSnapshotConflictError();
    }
    throw error;
  }
}

export async function upsertSyncSnapshotIncremental(
  config: ApiConfig,
  input: IncrementalSyncUpsertInput
): Promise<IncrementalSyncUpsertResult> {
  const existingDocuments = await getSyncPresetDocuments(config, input.userId);
  const existingMetaDocument = await getSyncMetaDocument(config, input.userId);
  const currentDocuments = selectCurrentSyncPresetDocuments(existingDocuments, existingMetaDocument);
  const existingStates = currentDocuments.map(toPresetState);
  const incomingStates = buildIncomingPresetStates(input.lots, input.salesByLot);
  const diff = calculateSyncPresetDiff(existingStates, incomingStates);
  const existingVersion = getExistingSnapshotVersion(existingMetaDocument, currentDocuments);

  assertExpectedVersion(existingVersion, input.expectedVersion);

  const incomingById = new Map<string, typeof incomingStates[number]>();
  for (const state of incomingStates) {
    incomingById.set(state.presetId, state);
  }

  let upsertedCount = 0;
  for (const presetId of diff.upsertPresetIds) {
    if (!incomingById.has(presetId)) continue;
    upsertedCount += 1;
  }

  const deletedCount = diff.deletePresetIds.length;

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
  const metaMissingForSnapshotData =
    !existingMetaDocument
    && (
      currentDocuments.length > 0
      || incomingStates.length > 0
      || nextWheelConfigs.length > 0
      || Boolean(nextSystemPricingDefaults)
    );
  const changed =
    upsertedCount > 0
    || deletedCount > 0
    || wheelConfigChanged
    || systemPricingDefaultsChanged
    || metaMissingForSnapshotData;

  if (changed) {
    const existingPresetSetId = normalizePresetSetId(existingMetaDocument?.presetSetId);
    const presetSetChanged = upsertedCount > 0 || deletedCount > 0 || metaMissingForSnapshotData;
    const nextPresetSetId = presetSetChanged ? createPresetSetId(input.version) : existingPresetSetId;
    const operations = presetSetChanged
      ? buildPresetSetOperations(input, incomingStates, nextPresetSetId)
      : [];
    const metaDocument = buildMetaDocument(
      input,
      existingMetaDocument,
      nextWheelConfigs,
      nextActiveWheelConfigId,
      nextSystemPricingDefaults,
      nextPresetSetId
    );
    operations.push(buildMetaOperation(existingMetaDocument, metaDocument));
    await executeSyncSnapshotOperations(config, input.userId, operations);
  }

  return {
    changed,
    upsertedCount,
    deletedCount
  };
}
