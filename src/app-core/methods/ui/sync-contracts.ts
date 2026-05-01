export type SyncEntityRecord = Record<string, unknown>;
export type SyncLotDto = SyncEntityRecord & { id: number };
export type SyncSaleType = "pack" | "box" | "rtyh" | "wheel";
export type SyncTierDeductionType = "packs" | "singles" | "none";

export interface SyncSaleLineDto {
  singlesPurchaseEntryId?: number;
  quantity: number;
  price: number;
}

export interface SyncSaleDto {
  id: number;
  type?: SyncSaleType;
  quantity?: number;
  packsCount?: number;
  singlesPurchaseEntryId?: number;
  singlesItems?: SyncSaleLineDto[];
  price?: number;
  priceIsTotal?: boolean;
  customer?: string;
  memo?: string;
  buyerShipping?: number;
  date?: string;
  version?: number;
  updatedAt?: string;
  updatedBy?: string;
  mutationId?: string;
  linkedWheelId?: number;
  winningTierId?: string;
  costOfWinningTier?: number;
  netRevenue?: number;
}

export interface SyncWheelTierDto {
  id: string;
  label?: string;
  color?: string;
  chancePercent?: number;
  slots?: number;
  costPerTier?: number;
  packsCount?: number;
  deductionType?: SyncTierDeductionType;
  sets?: string[];
  boundLotId?: number;
  boundSinglesId?: number;
  isChase?: boolean;
  celebrationEmoji?: string;
}

export interface SyncWheelConfigDto {
  id: number;
  name?: string;
  spinPrice?: number;
  targetMargin?: number;
  gameType?: "wheel" | "grid";
  outcomeCount?: number;
  gridCellCount?: number;
  tiers?: SyncWheelTierDto[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SyncLivePricingDto {
  livePackPrice: number;
  liveBoxPriceSell: number;
  liveSpotPrice: number;
  version?: number;
  updatedAt?: string;
  updatedBy?: string;
  mutationId?: string;
}

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

function normalizeEntityId(value: unknown): number | null {
  const id = Math.floor(Number(value));
  return Number.isFinite(id) ? id : null;
}

function normalizeNonNegativeNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function normalizeNonNegativeInteger(value: unknown): number | undefined {
  const parsed = normalizeNonNegativeNumber(value);
  return parsed == null ? undefined : Math.floor(parsed);
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
    .map((entry) => normalizeSyncSaleDto(entry))
    .filter((entry): entry is SyncSaleDto => entry != null);
}

export function toSyncSalesByLotDto(value: unknown): SyncSalesByLotDto {
  if (!isSyncEntityRecord(value)) return {};
  const salesByLot: SyncSalesByLotDto = {};
  for (const [lotId, sales] of Object.entries(value)) {
    if (normalizeOptionalSyncId(lotId) == null) continue;
    if (!Array.isArray(sales)) continue;
    salesByLot[lotId] = toSyncSaleDtos(sales);
  }
  return salesByLot;
}

function normalizeSyncSaleLineDto(value: unknown): SyncSaleLineDto | null {
  if (!isSyncEntityRecord(value)) return null;
  const quantity = normalizeNonNegativeInteger(value.quantity);
  if (quantity == null || quantity <= 0) return null;
  const line: SyncSaleLineDto = {
    quantity,
    price: normalizeNonNegativeNumber(value.price) ?? 0
  };
  const singlesPurchaseEntryId = normalizeOptionalSyncId(value.singlesPurchaseEntryId);
  if (singlesPurchaseEntryId != null) {
    line.singlesPurchaseEntryId = singlesPurchaseEntryId;
  }
  return line;
}

function normalizeSyncSaleType(value: unknown): SyncSaleType | undefined {
  return value === "box" || value === "rtyh" || value === "wheel" || value === "pack"
    ? value
    : undefined;
}

export function normalizeSyncSaleDto(value: unknown): SyncSaleDto | null {
  if (!isSyncEntityRecord(value)) return null;
  const id = normalizeOptionalSyncId(value.id);
  if (id == null) return null;

  const sale: SyncSaleDto = { id };
  const type = normalizeSyncSaleType(value.type);
  if (type) sale.type = type;
  const quantity = normalizeNonNegativeInteger(value.quantity);
  if (quantity != null) sale.quantity = quantity;
  const packsCount = normalizeNonNegativeInteger(value.packsCount);
  if (packsCount != null) sale.packsCount = packsCount;
  const singlesPurchaseEntryId = normalizeOptionalSyncId(value.singlesPurchaseEntryId);
  if (singlesPurchaseEntryId != null) sale.singlesPurchaseEntryId = singlesPurchaseEntryId;
  if (Array.isArray(value.singlesItems)) {
    const singlesItems = value.singlesItems
      .map((entry) => normalizeSyncSaleLineDto(entry))
      .filter((entry): entry is SyncSaleLineDto => entry != null);
    if (singlesItems.length > 0) sale.singlesItems = singlesItems;
  }
  const price = normalizeNonNegativeNumber(value.price);
  if (price != null) sale.price = price;
  if (value.priceIsTotal === true) sale.priceIsTotal = true;
  const customer = cleanString(value.customer);
  if (customer) sale.customer = customer;
  const memo = cleanString(value.memo);
  if (memo) sale.memo = memo;
  const buyerShipping = normalizeNonNegativeNumber(value.buyerShipping);
  if (buyerShipping != null) sale.buyerShipping = buyerShipping;
  const date = cleanString(value.date);
  if (date) sale.date = date;
  const version = normalizeNonNegativeInteger(value.version);
  if (version != null) sale.version = version;
  const updatedAt = cleanString(value.updatedAt);
  if (updatedAt) sale.updatedAt = updatedAt;
  const updatedBy = cleanString(value.updatedBy);
  if (updatedBy) sale.updatedBy = updatedBy;
  const mutationId = cleanString(value.mutationId);
  if (mutationId) sale.mutationId = mutationId;
  const linkedWheelId = normalizeOptionalSyncId(value.linkedWheelId);
  if (linkedWheelId != null) sale.linkedWheelId = linkedWheelId;
  const winningTierId = cleanString(value.winningTierId);
  if (winningTierId) sale.winningTierId = winningTierId;
  const costOfWinningTier = normalizeNonNegativeNumber(value.costOfWinningTier);
  if (costOfWinningTier != null) sale.costOfWinningTier = costOfWinningTier;
  const netRevenue = normalizeNonNegativeNumber(value.netRevenue);
  if (netRevenue != null) sale.netRevenue = netRevenue;
  return sale;
}

export function toSyncWheelConfigDtos(value: unknown): SyncWheelConfigDto[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeSyncWheelConfigDto(entry))
    .filter((entry): entry is SyncWheelConfigDto => entry != null);
}

function normalizeTierDeductionType(value: unknown): SyncTierDeductionType | undefined {
  return value === "singles" || value === "none" || value === "packs" ? value : undefined;
}

function normalizeSyncWheelTierDto(value: unknown): SyncWheelTierDto | null {
  if (!isSyncEntityRecord(value)) return null;
  const id = cleanString(value.id);
  if (!id) return null;
  const tier: SyncWheelTierDto = { id };
  const label = cleanString(value.label);
  if (label) tier.label = label;
  const color = cleanString(value.color);
  if (color) tier.color = color;
  const chancePercent = normalizeNonNegativeNumber(value.chancePercent);
  if (chancePercent != null) tier.chancePercent = chancePercent;
  const slots = normalizeNonNegativeInteger(value.slots);
  if (slots != null) tier.slots = slots;
  const costPerTier = normalizeNonNegativeNumber(value.costPerTier);
  if (costPerTier != null) tier.costPerTier = costPerTier;
  const packsCount = normalizeNonNegativeInteger(value.packsCount);
  if (packsCount != null) tier.packsCount = packsCount;
  const deductionType = normalizeTierDeductionType(value.deductionType);
  if (deductionType) tier.deductionType = deductionType;
  const sets = cleanStringArray(value.sets);
  if (sets) tier.sets = sets;
  const boundLotId = normalizeOptionalSyncId(value.boundLotId);
  if (boundLotId != null) tier.boundLotId = boundLotId;
  const boundSinglesId = normalizeOptionalSyncId(value.boundSinglesId);
  if (boundSinglesId != null) tier.boundSinglesId = boundSinglesId;
  if (value.isChase === true) tier.isChase = true;
  const celebrationEmoji = cleanString(value.celebrationEmoji);
  if (celebrationEmoji) tier.celebrationEmoji = celebrationEmoji;
  return tier;
}

export function normalizeSyncWheelConfigDto(value: unknown): SyncWheelConfigDto | null {
  if (!isSyncEntityRecord(value)) return null;
  const id = normalizeOptionalSyncId(value.id);
  if (id == null) return null;
  if (value.tiers != null && !Array.isArray(value.tiers)) return null;

  const config: SyncWheelConfigDto = { id };
  const name = cleanString(value.name);
  if (name) config.name = name;
  const spinPrice = normalizeNonNegativeNumber(value.spinPrice);
  if (spinPrice != null) config.spinPrice = spinPrice;
  const targetMargin = normalizeNonNegativeNumber(value.targetMargin);
  if (targetMargin != null) config.targetMargin = targetMargin;
  if (value.gameType === "grid" || value.gameType === "wheel") {
    config.gameType = value.gameType;
  }
  const outcomeCount = normalizeNonNegativeInteger(value.outcomeCount);
  if (outcomeCount != null) config.outcomeCount = outcomeCount;
  const gridCellCount = normalizeNonNegativeInteger(value.gridCellCount);
  if (gridCellCount != null) config.gridCellCount = gridCellCount;
  if (Array.isArray(value.tiers)) {
    config.tiers = value.tiers
      .map((entry) => normalizeSyncWheelTierDto(entry))
      .filter((entry): entry is SyncWheelTierDto => entry != null);
  }
  const createdAt = cleanString(value.createdAt);
  if (createdAt) config.createdAt = createdAt;
  const updatedAt = cleanString(value.updatedAt);
  if (updatedAt) config.updatedAt = updatedAt;
  return config;
}

export function normalizeSyncLivePricingDto(value: unknown): SyncLivePricingDto | null {
  if (!isSyncEntityRecord(value)) return null;
  const livePackPrice = normalizeNonNegativeNumber(value.livePackPrice);
  const liveBoxPriceSell = normalizeNonNegativeNumber(value.liveBoxPriceSell);
  const liveSpotPrice = normalizeNonNegativeNumber(value.liveSpotPrice);
  if (livePackPrice == null || liveBoxPriceSell == null || liveSpotPrice == null) return null;
  const livePricing: SyncLivePricingDto = {
    livePackPrice,
    liveBoxPriceSell,
    liveSpotPrice
  };
  const version = normalizeNonNegativeInteger(value.version);
  if (version != null) livePricing.version = version;
  const updatedAt = cleanString(value.updatedAt);
  if (updatedAt) livePricing.updatedAt = updatedAt;
  const updatedBy = cleanString(value.updatedBy);
  if (updatedBy) livePricing.updatedBy = updatedBy;
  const mutationId = cleanString(value.mutationId);
  if (mutationId) livePricing.mutationId = mutationId;
  return livePricing;
}

function hasValidSalesByLotCollection(value: unknown): boolean {
  return isSyncEntityRecord(value)
    && Object.entries(value).every(([lotId, sales]) => (
      normalizeOptionalSyncId(lotId) != null
      && Array.isArray(sales)
      && sales.every((entry) => normalizeSyncSaleDto(entry) != null)
    ));
}

function hasValidWheelConfigCollection(value: unknown): boolean {
  return Array.isArray(value) && value.every((entry) => normalizeSyncWheelConfigDto(entry) != null);
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
