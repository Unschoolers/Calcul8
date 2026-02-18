import { HttpError } from "./auth";

interface CanonicalSyncShape {
  presets: unknown[];
  salesByPreset: Record<string, unknown[]>;
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

function getCanonicalPresetsForParse(payload: Record<string, unknown>): unknown[] {
  const lots = payload.lots;
  const presets = payload.presets;
  const source = lots ?? presets;

  if (!isUnknownArray(source)) {
    throw new HttpError(400, "Field 'lots' (or legacy 'presets') must be an array.");
  }

  return source;
}

function getCanonicalSalesForParse(payload: Record<string, unknown>): Record<string, unknown[]> {
  const salesByLot = payload.salesByLot;
  const salesByPreset = payload.salesByPreset;
  const source = salesByLot ?? salesByPreset ?? {};

  if (!isRecordOfArrays(source)) {
    throw new HttpError(400, "Field 'salesByLot' (or legacy 'salesByPreset') must be an object of arrays.");
  }

  return source;
}

export function parseCanonicalSyncShape(payload: Record<string, unknown>): CanonicalSyncShape {
  return {
    presets: getCanonicalPresetsForParse(payload),
    salesByPreset: getCanonicalSalesForParse(payload)
  };
}

function getCanonicalPresetsForExtract(source: Record<string, unknown>): unknown[] | null {
  if (isUnknownArray(source.lots)) return source.lots;
  if (isUnknownArray(source.presets)) return source.presets;
  return null;
}

function getCanonicalSalesForExtract(source: Record<string, unknown>): Record<string, unknown[]> | null {
  if (isRecordOfArrays(source.salesByLot)) return source.salesByLot;
  if (isRecordOfArrays(source.salesByPreset)) return source.salesByPreset;
  if (source.salesByLot == null && source.salesByPreset == null) return {};
  return null;
}

export function extractCanonicalSyncShape(raw: unknown): CanonicalSyncShape | null {
  if (!isRecord(raw)) return null;
  const presets = getCanonicalPresetsForExtract(raw);
  if (!presets) return null;

  const salesByPreset = getCanonicalSalesForExtract(raw);
  if (!salesByPreset) return null;

  return {
    presets,
    salesByPreset
  };
}

export function withDualSyncShape<T extends CanonicalSyncShape>(snapshot: T): T & {
  lots: unknown[];
  salesByLot: Record<string, unknown[]>;
} {
  return {
    ...snapshot,
    lots: snapshot.presets,
    salesByLot: snapshot.salesByPreset
  };
}
