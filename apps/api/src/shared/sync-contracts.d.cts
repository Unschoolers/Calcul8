// Generated from shared/contracts/sync-contracts.ts. Run npm run shared:generate.
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
declare function isSyncEntityRecord(value: unknown): value is SyncEntityRecord;
declare function normalizeSyncSystemPricingDefaultsDto(value: unknown): SyncSystemPricingDefaultsDto | null;
declare function normalizeOptionalSyncId(value: unknown): number | null;
declare function normalizeSyncSinglesPurchaseDto(value: unknown): SyncSinglesPurchaseDto | null;
declare function toSyncSinglesPurchaseDtos(value: unknown): SyncSinglesPurchaseDto[];
/** Only bounded raster data URLs are persisted for lot uploads. */
declare function normalizeSyncLotImage(value: unknown): string | undefined;
declare function normalizeSyncLotDto(value: unknown): SyncLotDto | null;
declare function toSyncLotDtos(value: unknown): SyncLotDto[];
declare function normalizeSyncSaleDto(value: unknown): SyncSaleDto | null;
declare function toSyncSaleDtos(value: unknown): SyncSaleDto[];
declare function toSyncSalesByLotDto(value: unknown): SyncSalesByLotDto;
declare function normalizeSyncWheelConfigDto(value: unknown): SyncWheelConfigDto | null;
declare function toSyncWheelConfigDtos(value: unknown): SyncWheelConfigDto[];
declare function normalizeSyncLivePricingDto(value: unknown): SyncLivePricingDto | null;
declare function normalizeSyncMetadataDto(value: unknown): SyncMetadataDto | null;
declare function normalizeSyncGameSessionDto(value: unknown, fallbackUpdatedAt?: number): SyncGameSessionDto;
declare function parseSyncSnapshotDto(value: unknown): ParsedSyncSnapshotDto;
export { isSyncEntityRecord, normalizeSyncGameSessionDto, normalizeSyncMetadataDto, normalizeOptionalSyncId, normalizeSyncSystemPricingDefaultsDto, normalizeSyncLivePricingDto, normalizeSyncLotDto, normalizeSyncLotImage, normalizeSyncSaleDto, normalizeSyncSinglesPurchaseDto, normalizeSyncWheelConfigDto, parseSyncSnapshotDto, toSyncLotDtos, toSyncSaleDtos, toSyncSinglesPurchaseDtos, toSyncSalesByLotDto, toSyncWheelConfigDtos };
