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
  version: number;
  updatedAt: string;
}

export interface IncrementalSyncUpsertResult {
  changed: boolean;
  upsertedCount: number;
  deletedCount: number;
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
