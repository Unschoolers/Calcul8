export type SyncEntityRecord = Record<string, unknown>;
export type SyncCurrencyCode = "CAD" | "USD";
export type SyncLotType = "bulk" | "singles";
export type SyncSinglesCatalogSource = "ua" | "pokemon" | "none";
export type SyncWhatnotVertical = "sports" | "tcg" | "fashion" | "other_collectibles" | "coins" | "other";
export type SyncCostInputMode = "perBox" | "total";
export type SyncFeeProfilePreset = "whatnot" | "none";
export type SyncAdditionalFeeAppliesTo = "sale_only" | "sale_plus_shipping";

export interface SyncSystemPricingDefaultsDto {
  sellingCurrency?: SyncCurrencyCode;
  sellingTaxPercent?: number;
  sellingShippingPerOrder?: number;
  targetProfitPercent?: number;
  spotsPerBox?: number;
  feeProfilePreset?: SyncFeeProfilePreset;
  platformFeePercent?: number;
  additionalFeePercent?: number;
  fixedFeePerOrder?: number;
  additionalFeeAppliesTo?: SyncAdditionalFeeAppliesTo;
}

export interface SyncSinglesPurchaseDto {
  id: number;
  item: string;
  cardNumber?: string;
  externalSku?: string;
  image?: string;
  condition?: string;
  language?: string;
  cost?: number;
  currency?: SyncCurrencyCode;
  quantity?: number;
  marketValue?: number;
  marketValueCurrency?: SyncCurrencyCode;
}

export interface SyncLotDto {
  id: number;
  image?: string;
  name?: string;
  lotType?: SyncLotType;
  singlesCatalogSource?: SyncSinglesCatalogSource;
  whatnotVertical?: SyncWhatnotVertical;
  singlesPurchases?: SyncSinglesPurchaseDto[];
  externalSku?: string;
  purchaseDate?: string;
  createdAt?: string;
  boxPriceCost?: number;
  boxesPurchased?: number;
  packsPerBox?: number;
  spotsPerBox?: number;
  purchaseShippingCost?: number;
  purchaseTaxPercent?: number;
  sellingTaxPercent?: number;
  sellingShippingPerOrder?: number;
  spotPrice?: number;
  boxPriceSell?: number;
  packPrice?: number;
  targetProfitPercent?: number;
  platformFeePercent?: number;
  additionalFeePercent?: number;
  fixedFeePerOrder?: number;
  exchangeRate?: number;
  currency?: SyncCurrencyCode;
  sellingCurrency?: SyncCurrencyCode;
  costInputMode?: SyncCostInputMode;
  feeProfilePreset?: SyncFeeProfilePreset;
  additionalFeeAppliesTo?: SyncAdditionalFeeAppliesTo;
  includeTax?: boolean;
  usesSystemPricingDefaults?: boolean;
  isComplete?: boolean;
  shopifyEnabled?: boolean;
}
export type SyncSaleType = "pack" | "box" | "rtyh" | "wheel";
export type SyncTierDeductionType = "packs" | "singles" | "none";

export interface SyncSaleLineDto {
  singlesPurchaseEntryId?: number;
  quantity: number;
  price: number;
}

export interface SyncSaleExternalTransactionRefDto {
  provider: string;
  accountId?: string;
  ledgerTransactionId: string;
  orderId: string;
  orderItemId: string;
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
  createdAt?: string;
  version?: number;
  updatedAt?: string;
  updatedBy?: string;
  mutationId?: string;
  externalProvider?: string;
  wasWhatnotSale?: boolean;
  externalAccountId?: string;
  externalSaleId?: string;
  externalOrderId?: string;
  externalOrderItemId?: string;
  externalTransactionRefs?: SyncSaleExternalTransactionRefDto[];
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
  boundLotIds?: number[];
  boundSinglesId?: number;
  isChase?: boolean;
  celebrationEmoji?: string;
}

export interface SyncBracketBattlePrizeDto {
  id: string;
  sourceType: "manual" | "lot" | "singles";
  sourceKey: string;
  label: string;
  lotId: number | null;
  singlesPurchaseEntryId: number | null;
  quantity: number | null;
  cost?: number | null;
  value?: number | null;
}

export interface SyncBracketBattleConfigDto {
  participantCount: 4 | 8;
  participants: string[];
  prizes: SyncBracketBattlePrizeDto[];
}

export interface SyncWheelConfigDto {
  id: number;
  name?: string;
  spinPrice?: number;
  targetMargin?: number;
  gameType?: "wheel" | "grid" | "bracket";
  outcomeCount?: number;
  gridCellCount?: number;
  bracketBattle?: SyncBracketBattleConfigDto;
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
  systemPricingDefaults?: SyncSystemPricingDefaultsDto | null;
  version: number;
  updatedAt?: string | null;
}

export interface SyncPayloadDto {
  lots: SyncLotDto[];
  salesByLot: SyncSalesByLotDto;
  wheelConfigs: SyncWheelConfigDto[];
  activeWheelConfigId: number | null;
  systemPricingDefaults?: SyncSystemPricingDefaultsDto | null;
  activeLotId?: number;
  clientVersion?: number;
  allowEmptyOverwrite?: boolean;
  workspaceId?: string;
}

export interface ParsedSyncSnapshotDto {
  snapshot: SyncSnapshotDto;
  hasRequiredCollections: boolean;
}

export interface SyncMetadataDto {
  version: number;
  updatedAt?: string;
  activeWheelConfigId: number | null;
  salesMode?: "snapshot" | "entity";
  livePricingMode?: "lot_defaults" | "entity";
}

export interface SyncGameFairnessEntryDto {
  spinNumber: number;
  label: string;
  color: string;
  hash: string;
  seed: string;
  clientSeed?: string;
  verificationUrl?: string;
  algorithm?: string;
  timestamp: number;
}

export interface SyncGameTallyEntryDto {
  tierId: string;
  label: string;
  color: string;
  count: number;
}

export interface SyncGameGridRevealDto {
  cellIndex: number;
  slotIndex: number;
  label: string;
  color: string;
  tier: string;
  spinNumber: number;
  timestamp: number;
}

export interface SyncInventoryIssueDto {
  pendingSale?: SyncSaleDto;
  pendingSaleLotId?: number;
  slotName: string;
  slotColor: string;
  slotCost: number;
  slotTier: string;
  slotPacksCount: number;
  slotDeductionType: SyncTierDeductionType;
  slotIndex: number;
  selectedLotId: number | null;
  spinNumber: number;
  slotSinglesId: number | null;
  candidateLotIds?: number[];
  requiresLotSelection?: boolean;
}

export interface SyncGameSessionDto {
  wheelConfigs: SyncWheelConfigDto[];
  activeWheelConfigId: number | null;
  wheelTotalSpins: number;
  wheelSpinCounts: number[];
  wheelSessionNetRevenue: number | null;
  wheelSessionCostAdjustment: number;
  wheelFairnessHistory: SyncGameFairnessEntryDto[];
  wheelChaseTallyHistory: SyncGameTallyEntryDto[];
  wheelGridLayoutSeed: string;
  wheelPreviewGridLayoutSeed: string;
  wheelGridReveals: SyncGameGridRevealDto[];
  wheelPreviewGridReveals: SyncGameGridRevealDto[];
  wheelCurrentAngle: number;
  wheelLastResult: string;
  wheelLastResultColor: string;
  wheelSessionUpdatedAt: number;
  wheelPendingInventoryIssues: SyncInventoryIssueDto[];
  wheelSkippedDeductions: SyncInventoryIssueDto[];
}

function isSyncEntityRecord(value: unknown): value is SyncEntityRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown) {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim();
  return cleaned || undefined;
}

function cleanStringArray(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const cleaned = value
    .map((entry) => cleanString(entry))
    .filter((entry) => entry != null);
  return cleaned.length > 0 ? cleaned : [];
}

function normalizeEntityId(value: unknown) {
  const id = Math.floor(Number(value));
  return Number.isFinite(id) ? id : null;
}

function normalizeNonNegativeNumber(value: unknown) {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function normalizeNonNegativeInteger(value: unknown) {
  const parsed = normalizeNonNegativeNumber(value);
  return parsed == null ? undefined : Math.floor(parsed);
}

function normalizeBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeCurrencyCode(value: unknown) {
  return value === "CAD" || value === "USD" ? value : undefined;
}

function normalizeLotType(value: unknown) {
  return value === "bulk" || value === "singles" ? value : undefined;
}

function normalizeSinglesCatalogSource(value: unknown) {
  return value === "ua" || value === "pokemon" || value === "none" ? value : undefined;
}

function normalizeWhatnotVertical(value: unknown) {
  return value === "sports" || value === "tcg" || value === "fashion" || value === "other_collectibles"
    || value === "coins" || value === "other" ? value : undefined;
}

function normalizeCostInputMode(value: unknown) {
  return value === "perBox" || value === "total" ? value : undefined;
}

function normalizeFeeProfilePreset(value: unknown) {
  return value === "whatnot" || value === "none" ? value : undefined;
}

function normalizeAdditionalFeeAppliesTo(value: unknown) {
  return value === "sale_only" || value === "sale_plus_shipping" ? value : undefined;
}

function normalizeSyncSystemPricingDefaultsDto(value: unknown): SyncSystemPricingDefaultsDto | null {
  if (!isSyncEntityRecord(value)) return null;
  const defaults: SyncSystemPricingDefaultsDto = {};
  const sellingCurrency = normalizeCurrencyCode(value.sellingCurrency);
  if (sellingCurrency) defaults.sellingCurrency = sellingCurrency;
  const sellingTaxPercent = normalizeNonNegativeNumber(value.sellingTaxPercent);
  if (sellingTaxPercent != null) defaults.sellingTaxPercent = sellingTaxPercent;
  const sellingShippingPerOrder = normalizeNonNegativeNumber(value.sellingShippingPerOrder);
  if (sellingShippingPerOrder != null) defaults.sellingShippingPerOrder = sellingShippingPerOrder;
  const targetProfitPercent = normalizeNonNegativeNumber(value.targetProfitPercent);
  if (targetProfitPercent != null) defaults.targetProfitPercent = targetProfitPercent;
  const spotsPerBox = normalizeNonNegativeInteger(value.spotsPerBox);
  if (spotsPerBox != null && spotsPerBox > 0) defaults.spotsPerBox = spotsPerBox;
  const feeProfilePreset = normalizeFeeProfilePreset(value.feeProfilePreset);
  if (feeProfilePreset) defaults.feeProfilePreset = feeProfilePreset;
  const platformFeePercent = normalizeNonNegativeNumber(value.platformFeePercent);
  if (platformFeePercent != null) defaults.platformFeePercent = platformFeePercent;
  const additionalFeePercent = normalizeNonNegativeNumber(value.additionalFeePercent);
  if (additionalFeePercent != null) defaults.additionalFeePercent = additionalFeePercent;
  const fixedFeePerOrder = normalizeNonNegativeNumber(value.fixedFeePerOrder);
  if (fixedFeePerOrder != null) defaults.fixedFeePerOrder = fixedFeePerOrder;
  const additionalFeeAppliesTo = normalizeAdditionalFeeAppliesTo(value.additionalFeeAppliesTo);
  if (additionalFeeAppliesTo) defaults.additionalFeeAppliesTo = additionalFeeAppliesTo;
  return Object.keys(defaults).length > 0 ? defaults : null;
}

function normalizeOptionalSyncId(value: unknown): number | null {
  if (value == null) return null;
  const id = normalizeEntityId(value);
  return id == null || id === 0 ? null : id;
}

function normalizeSyncIdArray(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set();
  const ids = [];
  for (const entry of value) {
    const id = normalizeOptionalSyncId(entry);
    if (id == null || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function normalizeSyncSinglesPurchaseDto(value: unknown): SyncSinglesPurchaseDto | null {
  if (!isSyncEntityRecord(value)) return null;
  const id = normalizeOptionalSyncId(value.id);
  if (id == null) return null;
  const item = cleanString(value.item);
  if (!item) return null;

  const entry: SyncSinglesPurchaseDto = { id, item };
  const cardNumber = cleanString(value.cardNumber);
  if (cardNumber) entry.cardNumber = cardNumber;
  const externalSku = cleanString(value.externalSku);
  if (externalSku) entry.externalSku = externalSku;
  const image = cleanString(value.image);
  if (image) entry.image = image;
  const condition = cleanString(value.condition);
  if (condition) entry.condition = condition;
  const language = cleanString(value.language);
  if (language) entry.language = language;
  const cost = normalizeNonNegativeNumber(value.cost);
  if (cost != null) entry.cost = cost;
  const currency = normalizeCurrencyCode(value.currency);
  if (currency) entry.currency = currency;
  const quantity = normalizeNonNegativeInteger(value.quantity);
  if (quantity != null) entry.quantity = quantity;
  const marketValue = normalizeNonNegativeNumber(value.marketValue);
  if (marketValue != null) entry.marketValue = marketValue;
  const marketValueCurrency = normalizeCurrencyCode(value.marketValueCurrency);
  if (marketValueCurrency) entry.marketValueCurrency = marketValueCurrency;
  return entry;
}

function toSyncSinglesPurchaseDtos(value: unknown): SyncSinglesPurchaseDto[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeSyncSinglesPurchaseDto(entry))
    .filter((entry) => entry != null);
}

/** Only bounded raster data URLs are persisted for lot uploads. */
function normalizeSyncLotImage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const image = value.trim();
  if (!image || image.length > 213400) return undefined;
  const match = /^data:image\/(jpeg|png|webp);base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)$/.exec(image);
  if (!match || !match[2]) return undefined;
  const payload = match[2];
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return payload.length * 3 / 4 - padding <= 160000 ? image : undefined;
}

function normalizeSyncLotDto(value: unknown): SyncLotDto | null {
  if (!isSyncEntityRecord(value)) return null;
  const id = normalizeEntityId(value.id);
  if (id == null) return null;

  const lot: SyncLotDto = { id };
  const image = normalizeSyncLotImage(value.image);
  if (image) lot.image = image;
  const name = cleanString(value.name);
  if (name) lot.name = name;
  const lotType = normalizeLotType(value.lotType);
  if (lotType) lot.lotType = lotType;
  const singlesCatalogSource = normalizeSinglesCatalogSource(value.singlesCatalogSource);
  if (singlesCatalogSource) lot.singlesCatalogSource = singlesCatalogSource;
  const whatnotVertical = normalizeWhatnotVertical(value.whatnotVertical);
  if (whatnotVertical) lot.whatnotVertical = whatnotVertical;
  const singlesPurchases = toSyncSinglesPurchaseDtos(value.singlesPurchases);
  if (singlesPurchases.length > 0) lot.singlesPurchases = singlesPurchases;
  const stringFields = ["externalSku", "purchaseDate", "createdAt"] as const;
  for (const field of stringFields) {
    const cleaned = cleanString(value[field]);
    if (cleaned) lot[field] = cleaned;
  }
  const numberFields = [
    "boxPriceCost",
    "boxesPurchased",
    "packsPerBox",
    "spotsPerBox",
    "purchaseShippingCost",
    "purchaseTaxPercent",
    "sellingTaxPercent",
    "sellingShippingPerOrder",
    "spotPrice",
    "boxPriceSell",
    "packPrice",
    "targetProfitPercent",
    "platformFeePercent",
    "additionalFeePercent",
    "fixedFeePerOrder",
    "exchangeRate"
  ] as const;
  for (const field of numberFields) {
    const parsed = normalizeNonNegativeNumber(value[field]);
    if (parsed != null) lot[field] = parsed;
  }
  const currency = normalizeCurrencyCode(value.currency);
  if (currency) lot.currency = currency;
  const sellingCurrency = normalizeCurrencyCode(value.sellingCurrency);
  if (sellingCurrency) lot.sellingCurrency = sellingCurrency;
  const costInputMode = normalizeCostInputMode(value.costInputMode);
  if (costInputMode) lot.costInputMode = costInputMode;
  const feeProfilePreset = normalizeFeeProfilePreset(value.feeProfilePreset);
  if (feeProfilePreset) lot.feeProfilePreset = feeProfilePreset;
  const additionalFeeAppliesTo = normalizeAdditionalFeeAppliesTo(value.additionalFeeAppliesTo);
  if (additionalFeeAppliesTo) lot.additionalFeeAppliesTo = additionalFeeAppliesTo;
  const includeTax = normalizeBoolean(value.includeTax);
  if (includeTax != null) lot.includeTax = includeTax;
  const usesSystemPricingDefaults = normalizeBoolean(value.usesSystemPricingDefaults);
  if (usesSystemPricingDefaults != null) lot.usesSystemPricingDefaults = usesSystemPricingDefaults;
  const isComplete = normalizeBoolean(value.isComplete);
  if (isComplete != null) lot.isComplete = isComplete;
  const shopifyEnabled = normalizeBoolean(value.shopifyEnabled);
  if (shopifyEnabled != null) lot.shopifyEnabled = shopifyEnabled;
  return lot;
}

function toSyncLotDtos(value: unknown): SyncLotDto[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeSyncLotDto(entry))
    .filter((entry) => entry != null);
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

function normalizeSyncSaleExternalTransactionRefDto(value: unknown): SyncSaleExternalTransactionRefDto | null {
  if (!isSyncEntityRecord(value)) return null;
  const provider = cleanString(value.provider);
  const ledgerTransactionId = cleanString(value.ledgerTransactionId);
  const orderId = cleanString(value.orderId);
  const orderItemId = cleanString(value.orderItemId);
  if (!provider || !ledgerTransactionId || !orderId || !orderItemId) {
    return null;
  }

  const ref: SyncSaleExternalTransactionRefDto = {
    provider,
    ledgerTransactionId,
    orderId,
    orderItemId
  };
  const accountId = cleanString(value.accountId);
  if (accountId) ref.accountId = accountId;
  return ref;
}

function normalizeSyncSaleType(value: unknown) {
  return value === "box" || value === "rtyh" || value === "wheel" || value === "pack"
    ? value
    : undefined;
}

function normalizeSyncSaleDto(value: unknown): SyncSaleDto | null {
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
      .filter((entry) => entry != null);
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
  const createdAt = cleanString(value.createdAt);
  if (createdAt) sale.createdAt = createdAt;
  const version = normalizeNonNegativeInteger(value.version);
  if (version != null) sale.version = version;
  const updatedAt = cleanString(value.updatedAt);
  if (updatedAt) sale.updatedAt = updatedAt;
  const updatedBy = cleanString(value.updatedBy);
  if (updatedBy) sale.updatedBy = updatedBy;
  const mutationId = cleanString(value.mutationId);
  if (mutationId) sale.mutationId = mutationId;
  const externalProvider = cleanString(value.externalProvider);
  if (externalProvider) sale.externalProvider = externalProvider;
  if (typeof value.wasWhatnotSale === "boolean") sale.wasWhatnotSale = value.wasWhatnotSale;
  const externalAccountId = cleanString(value.externalAccountId);
  if (externalAccountId) sale.externalAccountId = externalAccountId;
  const externalSaleId = cleanString(value.externalSaleId);
  if (externalSaleId) sale.externalSaleId = externalSaleId;
  const externalOrderId = cleanString(value.externalOrderId);
  if (externalOrderId) sale.externalOrderId = externalOrderId;
  const externalOrderItemId = cleanString(value.externalOrderItemId);
  if (externalOrderItemId) sale.externalOrderItemId = externalOrderItemId;
  if (Array.isArray(value.externalTransactionRefs)) {
    const externalTransactionRefs = value.externalTransactionRefs
      .map((entry) => normalizeSyncSaleExternalTransactionRefDto(entry))
      .filter((entry) => entry != null);
    if (externalTransactionRefs.length > 0) sale.externalTransactionRefs = externalTransactionRefs;
  }
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

function toSyncSaleDtos(value: unknown): SyncSaleDto[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeSyncSaleDto(entry))
    .filter((entry) => entry != null);
}

function toSyncSalesByLotDto(value: unknown): SyncSalesByLotDto {
  if (!isSyncEntityRecord(value)) return {};
  const salesByLot: SyncSalesByLotDto = {};
  for (const [lotId, sales] of Object.entries(value)) {
    const normalizedLotId = normalizeOptionalSyncId(lotId);
    if (normalizedLotId == null) continue;
    if (!Array.isArray(sales)) continue;
    salesByLot[String(normalizedLotId)] = toSyncSaleDtos(sales);
  }
  return salesByLot;
}

function normalizeTierDeductionType(value: unknown) {
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
  const boundLotIds = normalizeSyncIdArray(value.boundLotIds);
  if (boundLotIds) {
    tier.boundLotIds = boundLotIds.length > 0 ? boundLotIds : (boundLotId != null ? [boundLotId] : []);
  } else if (boundLotId != null) {
    tier.boundLotIds = [boundLotId];
  }
  const boundSinglesId = normalizeOptionalSyncId(value.boundSinglesId);
  if (boundSinglesId != null) tier.boundSinglesId = boundSinglesId;
  if (value.isChase === true) tier.isChase = true;
  const celebrationEmoji = cleanString(value.celebrationEmoji);
  if (celebrationEmoji) tier.celebrationEmoji = celebrationEmoji;
  return tier;
}

function normalizeBracketParticipantCount(value: unknown) {
  return Number(value) === 8 ? 8 : 4;
}

function getBracketMatchCount(participantCount: number) {
  return participantCount === 8 ? 7 : 3;
}

function normalizeSyncBracketBattlePrizeDto(value: unknown, index: number): SyncBracketBattlePrizeDto {
  const raw = isSyncEntityRecord(value) ? value : {};
  const sourceType = raw.sourceType === "lot" || raw.sourceType === "singles" ? raw.sourceType : "manual";
  const prize: SyncBracketBattlePrizeDto = {
    id: cleanString(raw.id) || `bracket-prize-${index + 1}`,
    sourceType,
    sourceKey: sourceType === "manual" ? "" : (cleanString(raw.sourceKey) || ""),
    label: cleanString(raw.label) || `Match ${index + 1} prize`,
    lotId: sourceType === "manual" ? null : normalizeOptionalSyncId(raw.lotId),
    singlesPurchaseEntryId: sourceType === "singles" ? normalizeOptionalSyncId(raw.singlesPurchaseEntryId) : null,
    quantity: normalizeNonNegativeInteger(raw.quantity) || 1,
    cost: normalizeNonNegativeNumber(raw.cost),
    value: normalizeNonNegativeNumber(raw.value)
  };
  return prize;
}

function normalizeSyncBracketBattleConfigDto(value: unknown): SyncBracketBattleConfigDto {
  const raw = isSyncEntityRecord(value) ? value : {};
  const participantCount = normalizeBracketParticipantCount(raw.participantCount);
  const rawParticipants = Array.isArray(raw.participants) ? raw.participants : [];
  const rawPrizes = Array.isArray(raw.prizes) ? raw.prizes : [];
  const matchCount = getBracketMatchCount(participantCount);
  return {
    participantCount,
    participants: Array.from({ length: participantCount }, (_unused, index) => cleanString(rawParticipants[index]) || ""),
    prizes: Array.from({ length: matchCount }, (_unused, index) => normalizeSyncBracketBattlePrizeDto(rawPrizes[index], index))
  };
}

function normalizeSyncWheelConfigDto(value: unknown): SyncWheelConfigDto | null {
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
  if (value.gameType === "grid" || value.gameType === "wheel" || value.gameType === "bracket") {
    config.gameType = value.gameType;
  }
  const outcomeCount = normalizeNonNegativeInteger(value.outcomeCount);
  if (outcomeCount != null) config.outcomeCount = outcomeCount;
  const gridCellCount = normalizeNonNegativeInteger(value.gridCellCount);
  if (gridCellCount != null) config.gridCellCount = gridCellCount;
  if (Array.isArray(value.tiers)) {
    config.tiers = value.tiers
      .map((entry) => normalizeSyncWheelTierDto(entry))
      .filter((entry) => entry != null);
  }
  if (config.gameType === "bracket") {
    config.bracketBattle = normalizeSyncBracketBattleConfigDto(value.bracketBattle);
    config.tiers = [];
  }
  const createdAt = cleanString(value.createdAt);
  if (createdAt) config.createdAt = createdAt;
  const updatedAt = cleanString(value.updatedAt);
  if (updatedAt) config.updatedAt = updatedAt;
  return config;
}

function toSyncWheelConfigDtos(value: unknown): SyncWheelConfigDto[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeSyncWheelConfigDto(entry))
    .filter((entry) => entry != null);
}

function normalizeSyncLivePricingDto(value: unknown): SyncLivePricingDto | null {
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

function normalizeSyncMetadataDto(value: unknown): SyncMetadataDto | null {
  if (!isSyncEntityRecord(value)) return null;
  const rawVersion = Number(value.version ?? 0);
  const metadata: SyncMetadataDto = {
    version: Number.isFinite(rawVersion) ? rawVersion : 0,
    activeWheelConfigId: normalizeOptionalSyncId(value.activeWheelConfigId)
  };
  const updatedAt = cleanString(value.updatedAt);
  if (updatedAt) metadata.updatedAt = updatedAt;
  if (value.salesMode === "snapshot" || value.salesMode === "entity") {
    metadata.salesMode = value.salesMode;
  }
  if (value.livePricingMode === "lot_defaults" || value.livePricingMode === "entity") {
    metadata.livePricingMode = value.livePricingMode;
  }
  return metadata;
}

function normalizeLimitedString(value: unknown, maxLength: number) {
  const cleaned = cleanString(value);
  return cleaned ? cleaned.slice(0, maxLength) : "";
}

function normalizeNonNegativeFloor(value: unknown, fallback: number = 0) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeFiniteNumber(value: unknown, fallback: number = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSyncGameFairnessEntryDto(value: unknown) {
  if (!isSyncEntityRecord(value)) return null;
  return {
    spinNumber: normalizeNonNegativeFloor(value.spinNumber),
    label: normalizeLimitedString(value.label, 160),
    color: normalizeLimitedString(value.color, 40),
    hash: normalizeLimitedString(value.hash, 256),
    seed: normalizeLimitedString(value.seed, 256),
    clientSeed: normalizeLimitedString(value.clientSeed, 256) || undefined,
    verificationUrl: normalizeLimitedString(value.verificationUrl, 512) || undefined,
    algorithm: normalizeLimitedString(value.algorithm, 80) || undefined,
    timestamp: normalizeNonNegativeFloor(value.timestamp)
  };
}

function normalizeSyncGameTallyEntryDto(value: unknown) {
  if (!isSyncEntityRecord(value)) return null;
  const tierId = normalizeLimitedString(value.tierId, 120);
  if (!tierId) return null;
  return {
    tierId,
    label: normalizeLimitedString(value.label, 160),
    color: normalizeLimitedString(value.color, 40),
    count: normalizeNonNegativeFloor(value.count)
  };
}

function normalizeSyncGameGridRevealDto(value: unknown) {
  if (!isSyncEntityRecord(value)) return null;
  const label = normalizeLimitedString(value.label, 160);
  const tier = normalizeLimitedString(value.tier, 120);
  return {
    cellIndex: normalizeNonNegativeFloor(value.cellIndex),
    slotIndex: normalizeNonNegativeFloor(value.slotIndex),
    label,
    color: normalizeLimitedString(value.color, 40),
    tier,
    spinNumber: normalizeNonNegativeFloor(value.spinNumber),
    timestamp: normalizeNonNegativeFloor(value.timestamp)
  };
}

function normalizeSyncInventoryIssueDto(value: unknown): SyncInventoryIssueDto | null {
  if (!isSyncEntityRecord(value)) return null;
  const issue: SyncInventoryIssueDto = {
    slotName: normalizeLimitedString(value.slotName, 160),
    slotColor: normalizeLimitedString(value.slotColor, 40),
    slotCost: normalizeNonNegativeNumber(value.slotCost) ?? 0,
    slotTier: normalizeLimitedString(value.slotTier, 120),
    slotPacksCount: normalizeNonNegativeInteger(value.slotPacksCount) ?? 0,
    slotDeductionType: normalizeTierDeductionType(value.slotDeductionType) ?? "none",
    slotIndex: normalizeNonNegativeInteger(value.slotIndex) ?? 0,
    selectedLotId: normalizeOptionalSyncId(value.selectedLotId),
    spinNumber: normalizeNonNegativeInteger(value.spinNumber) ?? 0,
    slotSinglesId: normalizeOptionalSyncId(value.slotSinglesId)
  };
  const pendingSale = normalizeSyncSaleDto(value.pendingSale);
  const pendingSaleLotId = normalizeOptionalSyncId(value.pendingSaleLotId);
  if (pendingSale?.type === "wheel" && pendingSaleLotId) {
    issue.pendingSale = pendingSale;
    issue.pendingSaleLotId = pendingSaleLotId;
  }
  const candidateLotIds = normalizeSyncIdArray(value.candidateLotIds);
  if (candidateLotIds && candidateLotIds.length > 0) {
    issue.candidateLotIds = candidateLotIds;
  }
  if (value.requiresLotSelection === true) {
    issue.requiresLotSelection = true;
  }
  return issue;
}

function normalizeSyncGameSessionDto(value: unknown, fallbackUpdatedAt: number = Date.now()): SyncGameSessionDto {
  const raw = isSyncEntityRecord(value) ? value : {};
  const pendingInventoryIssues = Array.isArray(raw.wheelPendingInventoryIssues)
    ? raw.wheelPendingInventoryIssues
      .slice(0, 500)
      .map((entry) => normalizeSyncInventoryIssueDto(entry))
      .filter((entry) => entry != null)
    : [];
  const skippedDeductions = Array.isArray(raw.wheelSkippedDeductions)
    ? raw.wheelSkippedDeductions
      .slice(0, 500)
      .map((entry) => normalizeSyncInventoryIssueDto(entry))
      .filter((entry) => entry != null)
    : [];
  return {
    wheelConfigs: toSyncWheelConfigDtos(raw.wheelConfigs).slice(0, 100),
    activeWheelConfigId: normalizeOptionalSyncId(raw.activeWheelConfigId),
    wheelTotalSpins: normalizeNonNegativeFloor(raw.wheelTotalSpins),
    wheelSpinCounts: Array.isArray(raw.wheelSpinCounts)
      ? raw.wheelSpinCounts.map((entry) => normalizeNonNegativeFloor(entry))
      : [],
    wheelSessionNetRevenue: raw.wheelSessionNetRevenue == null
      ? null
      : normalizeFiniteNumber(raw.wheelSessionNetRevenue, 0),
    wheelSessionCostAdjustment: normalizeFiniteNumber(raw.wheelSessionCostAdjustment, 0),
    wheelFairnessHistory: Array.isArray(raw.wheelFairnessHistory)
      ? raw.wheelFairnessHistory
        .slice(-20)
        .map((entry) => normalizeSyncGameFairnessEntryDto(entry))
        .filter((entry) => entry != null)
      : [],
    wheelChaseTallyHistory: Array.isArray(raw.wheelChaseTallyHistory)
      ? raw.wheelChaseTallyHistory
        .slice(0, 200)
        .map((entry) => normalizeSyncGameTallyEntryDto(entry))
        .filter((entry) => entry != null)
      : [],
    wheelGridLayoutSeed: normalizeLimitedString(raw.wheelGridLayoutSeed, 160),
    wheelPreviewGridLayoutSeed: normalizeLimitedString(raw.wheelPreviewGridLayoutSeed, 160),
    wheelGridReveals: Array.isArray(raw.wheelGridReveals)
      ? raw.wheelGridReveals
        .slice(0, 500)
        .map((entry) => normalizeSyncGameGridRevealDto(entry))
        .filter((entry) => entry != null)
      : [],
    wheelPreviewGridReveals: Array.isArray(raw.wheelPreviewGridReveals)
      ? raw.wheelPreviewGridReveals
        .slice(0, 500)
        .map((entry) => normalizeSyncGameGridRevealDto(entry))
        .filter((entry) => entry != null)
      : [],
    wheelCurrentAngle: normalizeFiniteNumber(raw.wheelCurrentAngle, 0),
    wheelLastResult: normalizeLimitedString(raw.wheelLastResult, 200),
    wheelLastResultColor: normalizeLimitedString(raw.wheelLastResultColor, 80),
    wheelSessionUpdatedAt: normalizeNonNegativeFloor(raw.wheelSessionUpdatedAt, fallbackUpdatedAt),
    wheelPendingInventoryIssues: pendingInventoryIssues.length > 0 ? pendingInventoryIssues : skippedDeductions,
    wheelSkippedDeductions: skippedDeductions
  };
}

function hasValidSalesByLotCollection(value: unknown) {
  return isSyncEntityRecord(value)
    && Object.entries(value).every(([lotId, sales]) => (
      normalizeOptionalSyncId(lotId) != null
      && Array.isArray(sales)
      && sales.every((entry) => normalizeSyncSaleDto(entry) != null)
    ));
}

function hasValidWheelConfigCollection(value: unknown) {
  return Array.isArray(value) && value.every((entry) => normalizeSyncWheelConfigDto(entry) != null);
}

function parseSyncSnapshotDto(value: unknown): ParsedSyncSnapshotDto {
  const rawSnapshot = isSyncEntityRecord(value) ? value : {};
  const rawVersion = Number(rawSnapshot.version ?? 0);
  const snapshot: SyncSnapshotDto = {
    lots: toSyncLotDtos(rawSnapshot.lots),
    salesByLot: toSyncSalesByLotDto(rawSnapshot.salesByLot),
    wheelConfigs: toSyncWheelConfigDtos(rawSnapshot.wheelConfigs),
    activeWheelConfigId: normalizeOptionalSyncId(rawSnapshot.activeWheelConfigId),
    systemPricingDefaults: normalizeSyncSystemPricingDefaultsDto(rawSnapshot.systemPricingDefaults),
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

export {
  isSyncEntityRecord,
  normalizeSyncGameSessionDto,
  normalizeSyncMetadataDto,
  normalizeOptionalSyncId,
  normalizeSyncSystemPricingDefaultsDto,
  normalizeSyncLivePricingDto,
  normalizeSyncLotDto,
  normalizeSyncLotImage,
  normalizeSyncSaleDto,
  normalizeSyncSinglesPurchaseDto,
  normalizeSyncWheelConfigDto,
  parseSyncSnapshotDto,
  toSyncLotDtos,
  toSyncSaleDtos,
  toSyncSinglesPurchaseDtos,
  toSyncSalesByLotDto,
  toSyncWheelConfigDtos
};
