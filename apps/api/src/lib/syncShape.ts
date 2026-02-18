import { HttpError } from "./auth";

interface SyncLotsShape {
  lots: unknown[];
  salesByLot: Record<string, unknown[]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isRecordOfArrays(value: unknown): value is Record<string, unknown[]> {
  if (!isRecord(value)) return false;
  return Object.values(value).every((entry) => Array.isArray(entry));
}

function getLotsForParse(payload: Record<string, unknown>): unknown[] {
  const lots = payload.lots;
  if (!isUnknownArray(lots)) {
    throw new HttpError(400, "Field 'lots' must be an array.");
  }
  return lots;
}

function getSalesByLotForParse(payload: Record<string, unknown>): Record<string, unknown[]> {
  const salesByLot = payload.salesByLot;
  if (salesByLot == null) {
    return {};
  }
  if (!isRecordOfArrays(salesByLot)) {
    throw new HttpError(400, "Field 'salesByLot' must be an object of arrays.");
  }
  return salesByLot;
}

export function parseSyncLotsShape(payload: Record<string, unknown>): SyncLotsShape {
  return {
    lots: getLotsForParse(payload),
    salesByLot: getSalesByLotForParse(payload)
  };
}
