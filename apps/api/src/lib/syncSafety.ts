import { HttpError } from "./auth";
import type {
  SyncLotDto,
  SyncSalesByLotDto,
  SyncSnapshotDocument,
  SyncWheelConfigDto
} from "../types";

function hasAnySalesData(salesByLot: SyncSalesByLotDto): boolean {
  return Object.values(salesByLot).some((sales) => Array.isArray(sales) && sales.length > 0);
}

function hasAnyWheelConfigData(wheelConfigs: SyncWheelConfigDto[]): boolean {
  return Array.isArray(wheelConfigs) && wheelConfigs.length > 0;
}

export function isEmptySyncPayload(
  lots: SyncLotDto[],
  salesByLot: SyncSalesByLotDto,
  wheelConfigs: SyncWheelConfigDto[] = []
): boolean {
  return lots.length === 0 && !hasAnySalesData(salesByLot) && !hasAnyWheelConfigData(wheelConfigs);
}

export function hasSnapshotData(snapshot: SyncSnapshotDocument | null): boolean {
  if (!snapshot) return false;
  return snapshot.lots.length > 0
    || hasAnySalesData(snapshot.salesByLot)
    || hasAnyWheelConfigData(snapshot.wheelConfigs);
}

export function assertSafeSyncPush(
  existingSnapshot: SyncSnapshotDocument | null,
  incomingLots: SyncLotDto[],
  incomingSalesByLot: SyncSalesByLotDto,
  incomingWheelConfigs: SyncWheelConfigDto[],
  allowEmptyOverwrite: boolean
): void {
  const existingHasData = hasSnapshotData(existingSnapshot);
  const incomingIsEmpty = isEmptySyncPayload(incomingLots, incomingSalesByLot, incomingWheelConfigs);

  if (existingHasData && incomingIsEmpty && !allowEmptyOverwrite) {
    throw new HttpError(
      409,
      "Blocked empty sync payload to prevent overwriting existing cloud data. Pull first, then retry."
    );
  }
}
