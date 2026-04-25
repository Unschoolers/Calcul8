import { HttpError } from "./auth";
import type {
  SyncEntityRecord,
  SyncLotDto,
  SyncSalesByLotDto,
  SyncSaleDto,
  SyncWheelConfigDto
} from "../types";

export interface SyncLotsShape {
  lots: SyncLotDto[];
  salesByLot: SyncSalesByLotDto;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasEntityId(value: SyncEntityRecord): value is SyncLotDto {
  return typeof value.id === "string" || typeof value.id === "number";
}

function parseRecordArray<TRecord extends SyncEntityRecord>(
  value: unknown,
  fieldName: string
): TRecord[] {
  if (!Array.isArray(value)) {
    throw new HttpError(400, `Field '${fieldName}' must be an array.`);
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new HttpError(400, `Field '${fieldName}[${index}]' must be an object.`);
    }
    return entry as TRecord;
  });
}

function parseLots(value: unknown): SyncLotDto[] {
  const lots = parseRecordArray<SyncEntityRecord>(value, "lots");
  return lots.map((lot, index) => {
    if (!hasEntityId(lot)) {
      throw new HttpError(400, `Field 'lots[${index}].id' must be a string or number.`);
    }
    return lot;
  });
}

function getSalesByLotForParse(payload: Record<string, unknown>): SyncSalesByLotDto {
  const salesByLot = payload.salesByLot;
  if (salesByLot == null) {
    return {};
  }
  if (!isRecord(salesByLot)) {
    throw new HttpError(400, "Field 'salesByLot' must be an object of arrays.");
  }

  return Object.fromEntries(
    Object.entries(salesByLot).map(([lotId, sales]) => [
      lotId,
      parseRecordArray<SyncSaleDto>(sales, `salesByLot.${lotId}`)
    ])
  );
}

export function parseSyncWheelConfigs(value: unknown): SyncWheelConfigDto[] {
  if (value == null) return [];
  return parseRecordArray<SyncWheelConfigDto>(value, "wheelConfigs");
}

export function parseSyncLotsShape(payload: Record<string, unknown>): SyncLotsShape {
  return {
    lots: parseLots(payload.lots),
    salesByLot: getSalesByLotForParse(payload)
  };
}
