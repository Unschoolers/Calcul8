import { HttpError } from "./auth";
import {
  normalizeSyncLotDto,
  normalizeSyncSaleDto,
  normalizeSyncWheelConfigDto
} from "../shared/sync-contracts.cjs";
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

function parseSalesByLotKey(value: string): string {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new HttpError(400, `Field 'salesByLot' contains invalid lot id '${value}'.`);
  }
  return String(parsed);
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
    if (typeof lot.id !== "string" && typeof lot.id !== "number") {
      throw new HttpError(400, `Field 'lots[${index}].id' must be a string or number.`);
    }
    const normalizedLot = normalizeSyncLotDto(lot);
    if (!normalizedLot) {
      throw new HttpError(400, `Field 'lots[${index}].id' must be a string or number.`);
    }
    return normalizedLot;
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
    Object.entries(salesByLot).map(([lotId, sales]) => {
      return [
        parseSalesByLotKey(lotId),
        parseSyncSaleDtos(sales, `salesByLot.${lotId}`)
      ];
    })
  );
}

export function parseSyncWheelConfigs(value: unknown): SyncWheelConfigDto[] {
  if (value == null) return [];
  return parseRecordArray<SyncEntityRecord>(value, "wheelConfigs")
    .map((config, index) => parseSyncWheelConfig(config, `wheelConfigs[${index}]`));
}

export function parseSyncLotsShape(payload: Record<string, unknown>): SyncLotsShape {
  return {
    lots: parseLots(payload.lots),
    salesByLot: getSalesByLotForParse(payload)
  };
}

export function parseSyncSale(value: SyncEntityRecord, fieldName: string): SyncSaleDto {
  const sale = normalizeSyncSaleDto(value);
  if (!sale) {
    throw new HttpError(400, `Field '${fieldName}.id' must be a positive integer.`);
  }
  return sale;
}

export function parseSyncSaleDtos(value: unknown, fieldName: string): SyncSaleDto[] {
  return parseRecordArray<SyncEntityRecord>(value, fieldName)
    .map((sale, index) => parseSyncSale(sale, `${fieldName}[${index}]`));
}

export function parseSyncWheelConfig(value: SyncEntityRecord, fieldName: string): SyncWheelConfigDto {
  if (value.tiers != null && !Array.isArray(value.tiers)) {
    throw new HttpError(400, `Field '${fieldName}.tiers' must be an array when provided.`);
  }
  const config = normalizeSyncWheelConfigDto(value);
  if (!config) {
    throw new HttpError(400, `Field '${fieldName}.id' must be a positive integer.`);
  }
  return config;
}
