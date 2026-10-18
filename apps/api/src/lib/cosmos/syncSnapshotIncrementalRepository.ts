import { randomUUID } from "node:crypto";
import type { OperationInput } from "@azure/cosmos";
import type { ApiConfig, SyncMetaDocument, SyncPresetDocument } from "../../types";
import { calculateSyncPresetDiff } from "../syncDiff";
import { getContainers, isConflictError, isPreconditionFailedError, withCosmosRetry } from "./core";
import { syncMetaId, syncPresetSetId } from "./ids";
import {
  buildIncomingPresetStates,
  loadCoherentSyncSnapshotInputs,
  type IncrementalSyncUpsertInput,
  type IncrementalSyncUpsertResult,
  normalizeActiveWheelConfigId,
  normalizePresetSetId,
  selectCurrentSyncPresetDocuments,
  SyncSnapshotConflictError,
  toPresetState
} from "./syncSnapshotRepository.shared";
import { assertSuccessfulCosmosBatch } from "./batchResponse";
import { getSyncMetaDocument } from "./syncSnapshotPresetRepository";

const COSMOS_TRANSACTIONAL_BATCH_OPERATION_LIMIT = 100;
const SYNC_PRESET_RETENTION_MS = 24 * 60 * 60 * 1000;

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
  if (!etag) throw new SyncSnapshotConflictError();
  return {
    operationType: "Replace",
    id: metaDocument.id,
    resourceBody: metaDocument as never,
    ifMatch: etag
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
      const response = await withCosmosRetry(() => syncSnapshots.items.batch(operations, partitionKey));
      assertSuccessfulCosmosBatch(response, operations.length);
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

function readPresetEtag(document: SyncPresetDocument): string {
  return String((document as SyncPresetDocument & { _etag?: unknown })._etag ?? "").trim();
}

function metaPointerSignature(document: SyncMetaDocument | null): string {
  if (!document) return "<null>";
  const etag = readCosmosEtag(document);
  const version = Number(document.version);
  if (!etag || !Number.isSafeInteger(version) || version < 0) return "<invalid>";
  return `${version}\u0000${normalizePresetSetId(document.presetSetId)}\u0000${etag}`;
}

async function markSupersededPresetSet(
  config: ApiConfig,
  userId: string,
  documents: SyncPresetDocument[]
): Promise<void> {
  if (documents.length === 0 || documents.some((document) => !normalizePresetSetId(document.presetSetId))) return;
  const supersededAt = new Date().toISOString();
  const { syncSnapshots } = getContainers(config);
  for (const document of documents) {
    const etag = readPresetEtag(document);
    if (!etag) throw new SyncSnapshotConflictError();
    const marked = { ...document, supersededAt };
    await withCosmosRetry(() => syncSnapshots.item(document.id, userId).replace(
      marked as never,
      etag ? { accessCondition: { type: "IfMatch", condition: etag } } : undefined
    ));
  }
}

export async function cleanupExpiredSupersededPresetSets(config: ApiConfig, userId: string): Promise<void> {
  const { syncSnapshots } = getContainers(config);
  const allPresetDocuments = await (async () => {
    const iterator = syncSnapshots.items.query<SyncPresetDocument>({
      query: "SELECT * FROM c WHERE c.userId = @userId AND c.docType = @docType",
      parameters: [
        { name: "@userId", value: userId },
        { name: "@docType", value: "sync_preset" }
      ]
    }, { partitionKey: userId });
    const { resources } = await withCosmosRetry(() => iterator.fetchAll());
    return resources ?? [];
  })();
  const now = Date.now();
  const eligibleSets = new Set<string>();
  for (const document of allPresetDocuments) {
    const presetSetId = normalizePresetSetId(document.presetSetId);
    const supersededAt = Date.parse(String(document.supersededAt ?? ""));
    if (presetSetId && Number.isFinite(supersededAt) && now - supersededAt >= SYNC_PRESET_RETENTION_MS) {
      eligibleSets.add(presetSetId);
    }
  }

  for (const presetSetId of eligibleSets) {
    const metaBefore = await getSyncMetaDocument(config, userId);
    if (metaBefore && metaPointerSignature(metaBefore) === "<invalid>") continue;
    if (normalizePresetSetId(metaBefore?.presetSetId) === presetSetId) continue;
    const exactSetQuery = syncSnapshots.items.query<SyncPresetDocument>({
      query: "SELECT * FROM c WHERE c.userId = @userId AND c.docType = @docType AND c.presetSetId = @presetSetId",
      parameters: [
        { name: "@userId", value: userId },
        { name: "@docType", value: "sync_preset" },
        { name: "@presetSetId", value: presetSetId }
      ]
    }, { partitionKey: userId });
    const { resources } = await withCosmosRetry(() => exactSetQuery.fetchAll());
    const candidates = (resources ?? []).filter((document) => {
      const supersededAt = Date.parse(String(document.supersededAt ?? ""));
      return normalizePresetSetId(document.presetSetId) === presetSetId
        && Number.isFinite(supersededAt)
        && now - supersededAt >= SYNC_PRESET_RETENTION_MS;
    });
    if (candidates.length === 0) continue;
    const metaAfter = await getSyncMetaDocument(config, userId);
    if (metaAfter && metaPointerSignature(metaAfter) === "<invalid>") continue;
    if (metaPointerSignature(metaBefore) !== metaPointerSignature(metaAfter)
      || normalizePresetSetId(metaAfter?.presetSetId) === presetSetId) continue;

    for (const document of candidates) {
      await withCosmosRetry(() => syncSnapshots.item(document.id, userId).delete());
    }
  }
}

export async function finishSupersessionRetention(
  config: ApiConfig,
  userId: string,
  supersededDocuments: SyncPresetDocument[]
): Promise<void> {
  try {
    await markSupersededPresetSet(config, userId, supersededDocuments);
  } catch (error) {
    console.warn("Unable to mark superseded sync preset documents for retention cleanup.", error);
  }
  try {
    await cleanupExpiredSupersededPresetSets(config, userId);
  } catch (error) {
    console.warn("Unable to clean up expired superseded sync preset documents.", error);
  }
}

export async function upsertSyncSnapshotIncremental(
  config: ApiConfig,
  input: IncrementalSyncUpsertInput
): Promise<IncrementalSyncUpsertResult> {
  const { syncSnapshots } = getContainers(config);
  const { presetDocuments: existingDocuments, metaDocument: existingMetaDocument } =
    await loadCoherentSyncSnapshotInputs(syncSnapshots, input.userId);
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
    if (presetSetChanged) {
      const supersededDocuments = existingPresetSetId
        ? existingDocuments.filter((document) => normalizePresetSetId(document.presetSetId) === existingPresetSetId)
        : [];
      await finishSupersessionRetention(config, input.userId, supersededDocuments);
    }
  }

  return {
    changed,
    upsertedCount,
    deletedCount
  };
}
