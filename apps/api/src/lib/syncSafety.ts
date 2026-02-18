import { HttpError } from "./auth";
import type { SyncSnapshotDocument } from "../types";

function hasAnySalesData(salesByLot: Record<string, unknown[]>): boolean {
  return Object.values(salesByLot).some((sales) => Array.isArray(sales) && sales.length > 0);
}

export function isEmptySyncPayload(lots: unknown[], salesByLot: Record<string, unknown[]>): boolean {
  return lots.length === 0 && !hasAnySalesData(salesByLot);
}

export function hasSnapshotData(snapshot: SyncSnapshotDocument | null): boolean {
  if (!snapshot) return false;
  return snapshot.lots.length > 0 || hasAnySalesData(snapshot.salesByLot);
}

export function assertSafeSyncPush(
  existingSnapshot: SyncSnapshotDocument | null,
  incomingLots: unknown[],
  incomingSalesByLot: Record<string, unknown[]>,
  allowEmptyOverwrite: boolean
): void {
  const existingHasData = hasSnapshotData(existingSnapshot);
  const incomingIsEmpty = isEmptySyncPayload(incomingLots, incomingSalesByLot);

  if (existingHasData && incomingIsEmpty && !allowEmptyOverwrite) {
    throw new HttpError(
      409,
      "Blocked empty sync payload to prevent overwriting existing cloud data. Pull first, then retry."
    );
  }
}
