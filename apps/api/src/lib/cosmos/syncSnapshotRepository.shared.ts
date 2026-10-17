import type { Container } from "@azure/cosmos";
import type {
  LotLivePricingDocument,
  SaleDocument,
  SyncMetaDocument,
  SyncPresetDocument,
  SyncLotDto,
  SyncSalesByLotDto,
  SyncSystemPricingDefaultsDto,
  SyncWheelConfigDto
} from "../../types";
import { isNotFoundError, withCosmosRetry } from "./core";
import { syncMetaId } from "./ids";
import type { SyncPresetState } from "../syncDiff";

export type SyncScopeEntityDocuments = {
  saleDocuments: SaleDocument[];
  livePricingDocuments: LotLivePricingDocument[];
};

export interface ReplaceSyncScopeEntityDocumentsInput extends SyncScopeEntityDocuments {
  scopeKey: string;
}

export interface IncrementalSyncUpsertInput {
  userId: string;
  lots: SyncLotDto[];
  salesByLot: SyncSalesByLotDto;
  wheelConfigs: SyncWheelConfigDto[];
  activeWheelConfigId: number | null;
  systemPricingDefaults?: SyncSystemPricingDefaultsDto | null;
  expectedVersion?: number;
  version: number;
  updatedAt: string;
}

export interface IncrementalSyncUpsertResult {
  changed: boolean;
  upsertedCount: number;
  deletedCount: number;
}

export class SyncSnapshotConflictError extends Error {
  constructor(message = "Cloud data changed since your last sync. Pull latest data and retry.") {
    super(message);
    this.name = "SyncSnapshotConflictError";
  }
}

export function isSyncSnapshotConflictError(error: unknown): error is SyncSnapshotConflictError {
  return error instanceof SyncSnapshotConflictError
    || (
      typeof error === "object"
      && error !== null
      && (error as { name?: unknown }).name === "SyncSnapshotConflictError"
    );
}

export async function getSyncPresetDocumentsFromContainer(
  container: Container,
  userId: string
): Promise<SyncPresetDocument[]> {
  const querySpec = {
    query: "SELECT * FROM c WHERE c.userId = @userId AND c.docType = @docType",
    parameters: [
      { name: "@userId", value: userId },
      { name: "@docType", value: "sync_preset" }
    ]
  };
  const iterator = container.items.query<SyncPresetDocument>(querySpec, {
    partitionKey: userId
  });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return resources ?? [];
}

export interface CoherentSyncSnapshotInputs {
  metaDocument: SyncMetaDocument | null;
  presetDocuments: SyncPresetDocument[];
}

function readSyncMetaEtag(document: SyncMetaDocument | null): string {
  if (!document || typeof document !== "object") return "";
  return String((document as SyncMetaDocument & { _etag?: unknown })._etag ?? "").trim();
}

function hasSameValidSyncMeta(
  before: SyncMetaDocument | null,
  after: SyncMetaDocument | null
): boolean {
  if (before === null || after === null) return before === null && after === null;
  const beforeVersion = Number(before.version);
  const afterVersion = Number(after.version);
  const beforeGeneration = normalizePresetSetId(before.presetSetId);
  const afterGeneration = normalizePresetSetId(after.presetSetId);
  const beforeEtag = readSyncMetaEtag(before);
  const afterEtag = readSyncMetaEtag(after);
  return Number.isSafeInteger(beforeVersion)
    && beforeVersion >= 0
    && Number.isSafeInteger(afterVersion)
    && afterVersion >= 0
    && beforeVersion === afterVersion
    && beforeGeneration === afterGeneration
    && Boolean(beforeEtag)
    && beforeEtag === afterEtag;
}

async function getSyncPresetDocumentsForGeneration(
  container: Container,
  userId: string,
  presetSetId: string
): Promise<SyncPresetDocument[]> {
  const querySpec = presetSetId
    ? {
      query: "SELECT * FROM c WHERE c.userId = @userId AND c.docType = @docType AND c.presetSetId = @presetSetId",
      parameters: [
        { name: "@userId", value: userId },
        { name: "@docType", value: "sync_preset" },
        { name: "@presetSetId", value: presetSetId }
      ]
    }
    : {
      query: "SELECT * FROM c WHERE c.userId = @userId AND c.docType = @docType AND (NOT IS_DEFINED(c.presetSetId) OR IS_NULL(c.presetSetId) OR c.presetSetId = '')",
      parameters: [
        { name: "@userId", value: userId },
        { name: "@docType", value: "sync_preset" }
      ]
    };
  const iterator = container.items.query<SyncPresetDocument>(querySpec, { partitionKey: userId });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return resources ?? [];
}

/** Read the metadata pointer, its exact preset set, then verify the pointer stayed stable. */
export async function loadCoherentSyncSnapshotInputs(
  container: Container,
  userId: string
): Promise<CoherentSyncSnapshotInputs> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const metaBefore = await getSyncMetaDocumentFromContainer(container, userId);
    const presetDocuments = await getSyncPresetDocumentsForGeneration(
      container,
      userId,
      normalizePresetSetId(metaBefore?.presetSetId)
    );
    const metaAfter = await getSyncMetaDocumentFromContainer(container, userId);
    if (hasSameValidSyncMeta(metaBefore, metaAfter)) {
      return { metaDocument: metaAfter, presetDocuments };
    }
  }
  throw new SyncSnapshotConflictError();
}

export async function getSyncMetaDocumentFromContainer(
  container: Container,
  userId: string
): Promise<SyncMetaDocument | null> {
  const id = syncMetaId(userId);

  try {
    const { resource } = await withCosmosRetry(() => container.item(id, userId).read<SyncMetaDocument>());
    return resource ?? null;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export function toPresetState(document: SyncPresetDocument): SyncPresetState {
  return {
    presetId: document.presetId,
    preset: document.preset,
    sales: document.sales
  };
}

export function normalizeActiveWheelConfigId(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.floor(parsed);
}

export function normalizePresetSetId(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

export function selectCurrentSyncPresetDocuments(
  documents: SyncPresetDocument[],
  metaDocument: SyncMetaDocument | null
): SyncPresetDocument[] {
  const currentPresetSetId = normalizePresetSetId(metaDocument?.presetSetId);
  if (currentPresetSetId) {
    return documents.filter((document) => normalizePresetSetId(document.presetSetId) === currentPresetSetId);
  }
  return documents.filter((document) => !normalizePresetSetId(document.presetSetId));
}

export function buildIncomingPresetStates(
  lots: SyncLotDto[],
  salesByLot: SyncSalesByLotDto
): SyncPresetState[] {
  return lots.flatMap((lot): SyncPresetState[] => {
    const presetId = String(lot.id);
    return [{
      presetId,
      preset: lot,
      sales: Array.isArray(salesByLot[presetId]) ? salesByLot[presetId] : []
    }];
  });
}
