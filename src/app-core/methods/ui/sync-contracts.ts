export type SyncEntityRecord = Record<string, unknown>;
export type SyncLotDto = SyncEntityRecord & { id: number };
export type SyncSaleDto = SyncEntityRecord;
export type SyncWheelConfigDto = SyncEntityRecord;
export type SyncSalesByLotDto = Record<string, SyncSaleDto[]>;

export interface SyncSnapshotDto {
  lots: SyncLotDto[];
  salesByLot: SyncSalesByLotDto;
  wheelConfigs: SyncWheelConfigDto[];
  activeWheelConfigId: number | null;
  version: number;
  updatedAt?: string | null;
}

export interface SyncPayloadDto {
  lots: SyncLotDto[];
  salesByLot: SyncSalesByLotDto;
  wheelConfigs: SyncWheelConfigDto[];
  activeWheelConfigId: number | null;
  activeLotId?: number;
  clientVersion?: number;
  allowEmptyOverwrite?: boolean;
  workspaceId?: string;
}

export interface ParsedSyncSnapshotDto {
  snapshot: SyncSnapshotDto;
  hasRequiredCollections: boolean;
}

export function isSyncEntityRecord(value: unknown): value is SyncEntityRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeEntityId(value: unknown): number | null {
  const id = Math.floor(Number(value));
  return Number.isFinite(id) ? id : null;
}

export function normalizeOptionalSyncId(value: unknown): number | null {
  if (value == null) return null;
  const id = normalizeEntityId(value);
  return id == null || id === 0 ? null : id;
}

export function toSyncLotDtos(value: unknown): SyncLotDto[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isSyncEntityRecord(entry)) return [];
    const id = normalizeEntityId(entry.id);
    if (id == null) return [];
    return [{ ...entry, id }];
  });
}

export function toSyncSaleDtos(value: unknown): SyncSaleDto[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isSyncEntityRecord)
    .map((entry) => ({ ...entry }));
}

export function toSyncSalesByLotDto(value: unknown): SyncSalesByLotDto {
  if (!isSyncEntityRecord(value)) return {};
  const salesByLot: SyncSalesByLotDto = {};
  for (const [lotId, sales] of Object.entries(value)) {
    if (!Array.isArray(sales)) continue;
    salesByLot[lotId] = toSyncSaleDtos(sales);
  }
  return salesByLot;
}

export function toSyncWheelConfigDtos(value: unknown): SyncWheelConfigDto[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isSyncEntityRecord)
    .map((entry) => ({ ...entry }));
}

function hasValidSalesByLotCollection(value: unknown): boolean {
  return isSyncEntityRecord(value)
    && Object.values(value).every((sales) => Array.isArray(sales) && sales.every(isSyncEntityRecord));
}

function hasValidWheelConfigCollection(value: unknown): boolean {
  return Array.isArray(value) && value.every(isSyncEntityRecord);
}

export function parseSyncSnapshotDto(value: unknown): ParsedSyncSnapshotDto {
  const rawSnapshot = isSyncEntityRecord(value) ? value : {};
  const rawVersion = Number(rawSnapshot.version ?? 0);
  const snapshot: SyncSnapshotDto = {
    lots: toSyncLotDtos(rawSnapshot.lots),
    salesByLot: toSyncSalesByLotDto(rawSnapshot.salesByLot),
    wheelConfigs: toSyncWheelConfigDtos(rawSnapshot.wheelConfigs),
    activeWheelConfigId: normalizeOptionalSyncId(rawSnapshot.activeWheelConfigId),
    version: Number.isFinite(rawVersion) ? rawVersion : 0,
    updatedAt: typeof rawSnapshot.updatedAt === "string" || rawSnapshot.updatedAt === null
      ? rawSnapshot.updatedAt
      : undefined
  };

  return {
    snapshot,
    hasRequiredCollections: hasValidSalesByLotCollection(rawSnapshot.salesByLot)
      && hasValidWheelConfigCollection(rawSnapshot.wheelConfigs)
  };
}
