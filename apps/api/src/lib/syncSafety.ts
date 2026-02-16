import { HttpError } from "./auth";
import type { SyncSnapshotDocument } from "../types";

function hasAnySalesData(salesByPreset: Record<string, unknown[]>): boolean {
  return Object.values(salesByPreset).some((sales) => Array.isArray(sales) && sales.length > 0);
}

export function isEmptySyncPayload(presets: unknown[], salesByPreset: Record<string, unknown[]>): boolean {
  return presets.length === 0 && !hasAnySalesData(salesByPreset);
}

export function hasSnapshotData(snapshot: SyncSnapshotDocument | null): boolean {
  if (!snapshot) return false;
  return snapshot.presets.length > 0 || hasAnySalesData(snapshot.salesByPreset);
}

export function assertSafeSyncPush(
  existingSnapshot: SyncSnapshotDocument | null,
  incomingPresets: unknown[],
  incomingSalesByPreset: Record<string, unknown[]>,
  allowEmptyOverwrite: boolean
): void {
  const existingHasData = hasSnapshotData(existingSnapshot);
  const incomingIsEmpty = isEmptySyncPayload(incomingPresets, incomingSalesByPreset);

  if (existingHasData && incomingIsEmpty && !allowEmptyOverwrite) {
    throw new HttpError(
      409,
      "Blocked empty sync payload to prevent overwriting existing cloud data. Pull first, then retry."
    );
  }
}

