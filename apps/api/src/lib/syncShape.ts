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

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim();
  return cleaned || undefined;
}

function cleanStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const cleaned = value
    .map((entry) => cleanString(entry))
    .filter((entry): entry is string => entry != null);
  return cleaned.length > 0 ? cleaned : [];
}

function parseOptionalNonNegativeNumber(value: unknown, fieldName: string): number | undefined {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new HttpError(400, `Field '${fieldName}' must be a non-negative number.`);
  }
  return parsed;
}

function parseOptionalNonNegativeInteger(value: unknown, fieldName: string): number | undefined {
  const parsed = parseOptionalNonNegativeNumber(value, fieldName);
  return parsed == null ? undefined : Math.floor(parsed);
}

function parseOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value == null || value === "") return undefined;
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new HttpError(400, `Field '${fieldName}' must be a positive integer.`);
  }
  return parsed;
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
  return parseRecordArray<SyncEntityRecord>(value, "wheelConfigs")
    .map((config, index) => parseSyncWheelConfig(config, `wheelConfigs[${index}]`));
}

export function parseSyncLotsShape(payload: Record<string, unknown>): SyncLotsShape {
  return {
    lots: parseLots(payload.lots),
    salesByLot: getSalesByLotForParse(payload)
  };
}

function parseSyncWheelTier(value: SyncEntityRecord, fieldName: string): Record<string, unknown> {
  const id = cleanString(value.id);
  if (!id) {
    throw new HttpError(400, `Field '${fieldName}.id' must be a non-empty string.`);
  }
  const tier: Record<string, unknown> = { id };
  const label = cleanString(value.label);
  if (label) tier.label = label;
  const color = cleanString(value.color);
  if (color) tier.color = color;
  const chancePercent = parseOptionalNonNegativeNumber(value.chancePercent, `${fieldName}.chancePercent`);
  if (chancePercent != null) tier.chancePercent = chancePercent;
  const slots = parseOptionalNonNegativeInteger(value.slots, `${fieldName}.slots`);
  if (slots != null) tier.slots = slots;
  const costPerTier = parseOptionalNonNegativeNumber(value.costPerTier, `${fieldName}.costPerTier`);
  if (costPerTier != null) tier.costPerTier = costPerTier;
  const packsCount = parseOptionalNonNegativeInteger(value.packsCount, `${fieldName}.packsCount`);
  if (packsCount != null) tier.packsCount = packsCount;
  if (value.deductionType === "packs" || value.deductionType === "singles" || value.deductionType === "none") {
    tier.deductionType = value.deductionType;
  }
  const sets = cleanStringArray(value.sets);
  if (sets) tier.sets = sets;
  const boundLotId = parseOptionalPositiveInteger(value.boundLotId, `${fieldName}.boundLotId`);
  if (boundLotId != null) tier.boundLotId = boundLotId;
  const boundSinglesId = parseOptionalPositiveInteger(value.boundSinglesId, `${fieldName}.boundSinglesId`);
  if (boundSinglesId != null) tier.boundSinglesId = boundSinglesId;
  if (value.isChase === true) tier.isChase = true;
  const celebrationEmoji = cleanString(value.celebrationEmoji);
  if (celebrationEmoji) tier.celebrationEmoji = celebrationEmoji;
  return tier;
}

function parseSyncWheelConfig(value: SyncEntityRecord, fieldName: string): SyncWheelConfigDto {
  const id = parseOptionalPositiveInteger(value.id, `${fieldName}.id`);
  if (id == null) {
    throw new HttpError(400, `Field '${fieldName}.id' must be a positive integer.`);
  }
  if (value.tiers != null && !Array.isArray(value.tiers)) {
    throw new HttpError(400, `Field '${fieldName}.tiers' must be an array when provided.`);
  }

  const config: SyncEntityRecord = { id };
  const name = cleanString(value.name);
  if (name) config.name = name;
  const spinPrice = parseOptionalNonNegativeNumber(value.spinPrice, `${fieldName}.spinPrice`);
  if (spinPrice != null) config.spinPrice = spinPrice;
  const targetMargin = parseOptionalNonNegativeNumber(value.targetMargin, `${fieldName}.targetMargin`);
  if (targetMargin != null) config.targetMargin = targetMargin;
  if (value.gameType === "wheel" || value.gameType === "grid") {
    config.gameType = value.gameType;
  }
  const outcomeCount = parseOptionalNonNegativeInteger(value.outcomeCount, `${fieldName}.outcomeCount`);
  if (outcomeCount != null) config.outcomeCount = outcomeCount;
  const gridCellCount = parseOptionalNonNegativeInteger(value.gridCellCount, `${fieldName}.gridCellCount`);
  if (gridCellCount != null) config.gridCellCount = gridCellCount;
  if (Array.isArray(value.tiers)) {
    config.tiers = value.tiers.map((entry, tierIndex) => {
      if (!isRecord(entry)) {
        throw new HttpError(400, `Field '${fieldName}.tiers[${tierIndex}]' must be an object.`);
      }
      return parseSyncWheelTier(entry, `${fieldName}.tiers[${tierIndex}]`);
    });
  }
  const createdAt = cleanString(value.createdAt);
  if (createdAt) config.createdAt = createdAt;
  const updatedAt = cleanString(value.updatedAt);
  if (updatedAt) config.updatedAt = updatedAt;
  return config as SyncWheelConfigDto;
}
