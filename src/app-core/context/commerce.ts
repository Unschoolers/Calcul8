import type {
  AppState,
  FeeProfilePreset,
  LiveSinglesSelectionMode,
  LiveSinglesSelectionSource,
  LotSalesCacheEntry,
  LotSetup,
  LotType,
  Sale,
  SalesStatus,
  SaleType,
  SinglesCatalogSource,
  SinglesPurchaseEntry,
  SinglesSaleCardOption,
  SinglesSaleLine
} from "../../types/app.ts";
import type { GameMethodState } from "./game.ts";
import type { PortfolioChartContext, PortfolioMethodState } from "./portfolio.ts";
import type {
  AppVueContext,
  FeatureMethodImplementation,
  RuntimeMethodState
} from "./runtime.ts";
import type { ScopedApiContext } from "./api.ts";
import type { SyncMethodState } from "./sync.ts";
import type { RootWheelSessionStateContext } from "../shared/wheel-root-session-state.ts";

export interface CommerceComputedState {
  lotNameDraft: string;
  canUsePaidActions: boolean;
  currentLotType: LotType;
  currentLotCatalogSource: SinglesCatalogSource;
  currentLotUsesSystemPricingDefaults: boolean;
  hasLotSelected: boolean;
  isLiveTabDisabled: boolean;
  lotItems: Array<{
    title: string;
    value: number;
    subtitle: string;
    lotType: LotType;
    isComplete: boolean;
    symbolIcon: string;
    completionIcon: string | null;
    groupLabel?: string | null;
  }>;
  visibleLotItems: Array<{
    title: string;
    value: number;
    subtitle: string;
    lotType: LotType;
    isComplete: boolean;
    symbolIcon: string;
    completionIcon: string | null;
    groupLabel?: string | null;
  }>;
  singlesPurchaseTotalQuantity: number;
  singlesPurchaseTotalCost: number;
  singlesPurchaseTotalMarketValue: number;
  singlesSoldCountByPurchaseId: Record<number, number>;
  singlesTrackedSoldCount: number;
  singlesTrackedTotalCount: number;
  singlesUnlinkedSoldCount: number;
  effectiveLiveSinglesIds: number[];
  effectiveLiveSinglesEntries: SinglesPurchaseEntry[];
  singlesSaleCardOptions: SinglesSaleCardOption[];
  selectedSinglesSaleMaxQuantity: number | null;
  saleEditorLineProfitPreviews: Array<{
    value: number;
    unitValue: number | null;
    quantity: number;
    percent: number;
    sign: "+" | "-";
    colorClass: string;
    basisLabel: "Market" | "Cost";
    basisValue: number;
    marketBasisValue: number;
    costBasisValue: number;
  } | null>;
  saleEditorProfitPreview: {
    totalPrice: number;
    value: number;
    unitValue: number | null;
    quantity: number;
    percent: number;
    sign: "+" | "-";
    colorClass: string;
    basisLabel: "Market" | "Cost" | "Mixed";
    basisValue: number;
    marketBasisValue: number;
    costBasisValue: number;
  } | null;
  totalPacks: number;
  totalSpots: number;
  boxPriceCostCAD: number;
  purchaseShippingCostCAD: number;
  purchaseCostInputLabel: string;
  purchaseCostInputValue: number;
  totalCaseCost: number;
  conversionInfo: string;
  soldPacksCount: number;
  totalRevenue: number;
  salesProgress: number;
  targetNetRevenue: number;
  remainingNetRevenueForTarget: number;
  remainingPacksCount: number;
  remainingBoxesEquivalent: number;
  remainingSpotsEquivalent: number;
  requiredPackPriceFromNow: number | null;
  requiredBoxPriceFromNow: number | null;
  requiredSpotPriceFromNow: number | null;
  liveForecastScenarios: Array<{
    id: "item" | "box" | "rtyh" | "singles-suggested";
    label: string;
    unitLabel: "item" | "box" | "spot";
    units: number;
    unitPrice: number;
    estimatedNetRemaining: number;
    forecastRevenue: number;
    forecastProfit: number;
    forecastMarginPercent: number | null;
  }>;
  bestLiveForecastScenario: {
    id: "item" | "box" | "rtyh" | "singles-suggested";
    label: string;
    unitLabel: "item" | "box" | "spot";
    units: number;
    unitPrice: number;
    estimatedNetRemaining: number;
    forecastRevenue: number;
    forecastProfit: number;
    forecastMarginPercent: number | null;
  } | null;
  salesStatus: SalesStatus;
  sortedSales: Sale[];
  sparklineData: number[];
  sparklineGradient: string[];
}

export interface CommerceMethodState {
  getSalesStorageKey(lotId: number): string;
  getSalesCacheEntry(lotId: number): LotSalesCacheEntry;
  getAllSalesByLotId(lotIds?: number[] | null): Map<number, Sale[]>;
  loadSalesForLotId(lotId: number): Sale[];
  netFromGross(grossRevenue: number, buyerShippingPerOrder?: number, orderCount?: number): number;
  loadLotsFromStorage(): void;
  saveLotsToStorage(): void;
  loadSystemPricingDefaultsFromStorage(): void;
  saveSystemPricingDefaultsToStorage(): void;
  getCurrentSetup(): LotSetup;
  autoSaveSetup(): void;
  syncLivePricesFromDefaults(): void;
  resetLivePrices(): void;
  applyLivePricesToDefaults(): void;
  setLiveSinglesSelection(ids: number[], opts?: { source?: LiveSinglesSelectionSource; mode?: LiveSinglesSelectionMode }): void;
  addLiveSinglesSelection(id: number, source?: LiveSinglesSelectionSource): void;
  removeLiveSinglesSelection(id: number, source?: LiveSinglesSelectionSource): void;
  clearLiveSinglesSelection(source?: LiveSinglesSelectionSource): void;
  applyLiveSinglesSuggestedPricing(): void;
  resetLiveSinglesPricing(): void;
  addSinglesPurchaseRow(): void;
  removeSinglesPurchaseRow(rowId: number): void;
  clearSinglesPurchases(): void;
  onSinglesPurchaseRowsChange(): void;
  importSinglesPurchasesCsv(): void;
  confirmSinglesPurchasesCsvImport(): void;
  cancelSinglesPurchasesCsvImport(): void;
  createNewLot(): void;
  selectLot(lotId: number | null): void;
  setCurrentLotCatalogSource(source: SinglesCatalogSource): void;
  openRenameLotModal(): void;
  renameCurrentLot(): void;
  loadLot(): void;
  deleteCurrentLot(): void;
  canUseAdminLotSyncTools(): boolean;
  importLotsFromUserId(): Promise<void>;
  exportSales(): void;
  calculateProfit(units: number, pricePerUnit: number): number;
  recalculateDefaultPrices(opts?: { closeModal?: boolean }): void;
  calculateOptimalPrices(): void;
  setFeeProfilePreset(preset: FeeProfilePreset): void;
  setSystemFeeProfilePreset(preset: FeeProfilePreset): void;
  onSystemPricingDefaultsChange(): void;
  setCurrentLotSystemPricingDefaultsMode(useSystemDefaults: boolean): void;
  updatePurchaseCostInput(value: number | string | null): void;
  onPurchaseConfigChange(): void;
  calculatePriceForUnits(units: number, targetNetRevenue: number): number;
  loadSalesFromStorage(): void;
  saveSalesToStorage(): void;
  openAddSaleModal(saleType?: SaleType): void;
  openConvertLiveSinglesSaleModal(lines: SinglesSaleLine[], options?: { buyerShipping?: number; memo?: string; date?: string }): void;
  onNewSaleTypeChange(type: SaleType): void;
  onSinglesSaleCardSelectionChange(value: number | null): void;
  addSinglesSaleLine(): void;
  removeSinglesSaleLine(lineIndex: number): void;
  onSinglesSaleLineCardSelectionChange(lineIndex: number, value: number | null): void;
  onSinglesSaleLineQuantityChange(lineIndex: number, value?: number | string | null): void;
  onSinglesSaleLinePriceChange(): void;
  getSinglesSaleLineMaxQuantity(lineIndex: number): number | null;
  saveSale(): void;
  editSale(sale: Sale): void;
  deleteSale(id: number): void;
  cancelSale(): void;
  initSalesChart(): void;
  toggleChartView(): void;
  calculateSaleProfit(sale: Sale): number;
  getSaleProfitPreview(sale: Sale): import("../../domain/calculations-fees.ts").SaleProfitPreview | null;
  getSaleColor(type: SaleType): string;
  getSaleIcon(type: SaleType): string;
  formatDate(dateStr: string): string;
}

type CommerceState = Pick<
  AppState,
  | "boxesPurchased"
  | "boxPriceCost"
  | "costInputMode"
  | "currency"
  | "currentLotId"
  | "editingSale"
  | "exchangeRate"
  | "feeProfilePreset"
  | "fixedFeePerOrder"
  | "hasProAccess"
  | "includeTax"
  | "liveBoxPriceSell"
  | "livePackPrice"
  | "liveSinglesExternalIds"
  | "liveSinglesManualIds"
  | "liveSpotPrice"
  | "lotSearchQuery"
  | "lots"
  | "newLotName"
  | "newSale"
  | "packsPerBox"
  | "packPrice"
  | "platformFeePercent"
  | "portfolioDashboardPreset"
  | "preferredLanguage"
  | "purchaseShippingCost"
  | "purchaseTaxPercent"
  | "purchaseUiMode"
  | "additionalFeePercent"
  | "additionalFeeAppliesTo"
  | "sales"
  | "sellingCurrency"
  | "sellingShippingPerOrder"
  | "sellingTaxPercent"
  | "showAddSaleModal"
  | "singlesPurchases"
  | "spotPrice"
  | "spotsPerBox"
  | "targetProfitPercent"
>;

export type CommerceContext = CommerceState &
  CommerceComputedState &
  Pick<CommerceMethodState, "calculatePriceForUnits"> &
  Pick<RuntimeMethodState, "formatCurrency">;

type StandardCommerceComputedObject = {
  [Key in Exclude<keyof CommerceComputedState, "lotNameDraft" | "purchaseCostInputValue">]:
    (this: CommerceContext) => CommerceComputedState[Key];
};

export type CommerceComputedObject = StandardCommerceComputedObject & {
  lotNameDraft: {
    get(this: Pick<CommerceContext, "newLotName">): string;
    set(this: Pick<CommerceContext, "newLotName">, newValue: string): void;
  };
  purchaseCostInputValue: {
    get(this: CommerceContext): number;
    set(this: CommerceContext, newValue: number | string): void;
  };
};

export type SinglesComputedState = Pick<
  CommerceComputedState,
  | "currentLotType"
  | "currentLotCatalogSource"
  | "currentLotUsesSystemPricingDefaults"
  | "hasLotSelected"
  | "isLiveTabDisabled"
  | "lotItems"
  | "visibleLotItems"
  | "singlesPurchaseTotalQuantity"
  | "singlesPurchaseTotalCost"
  | "singlesPurchaseTotalMarketValue"
  | "singlesSoldCountByPurchaseId"
  | "effectiveLiveSinglesIds"
  | "effectiveLiveSinglesEntries"
  | "singlesSaleCardOptions"
  | "selectedSinglesSaleMaxQuantity"
  | "saleEditorLineProfitPreviews"
  | "saleEditorProfitPreview"
  | "canUsePaidActions"
>;

export type SinglesComputedObject = {
  [Key in keyof SinglesComputedState]: (this: CommerceContext) => SinglesComputedState[Key];
};

export type SalesEntityContext = ScopedApiContext &
  Pick<CommerceMethodState, "getSalesStorageKey">;

export type LivePricingPayload = Pick<
  AppState,
  "livePackPrice" | "liveBoxPriceSell" | "liveSpotPrice" | "currentLivePricingVersion"
>;

export type LivePricingHydrationContext = ScopedApiContext &
  LivePricingPayload &
  Pick<
    AppState,
    "currentLotId" | "livePricingHydrationStatus" | "livePricingHydratedLotId"
  >;

export type QueuedLivePricingContext = LivePricingHydrationContext;

export type SalesFreshnessContext = SalesEntityContext &
  Pick<AppState, "currentLotId"> &
  Partial<Pick<AppState, "sales" | "salesByLotId">> &
  Pick<CommerceMethodState, "getSalesCacheEntry">;

export type SalesLocalMutationContext = Pick<AppState, "sales" | "editingSale"> &
  Pick<CommerceMethodState, "cancelSale">;

export type SalesAuthoritativePersistenceContext = SalesEntityContext;

export type SalesChartRefreshContext =
  Pick<AppState, "currentLotId" | "currentTab"> &
  Pick<CommerceMethodState, "initSalesChart"> &
  Pick<PortfolioMethodState, "initPortfolioChart"> &
  Pick<AppVueContext, "$nextTick">;

export type SalesPersistenceContext = SalesAuthoritativePersistenceContext &
  SalesLocalMutationContext &
  SalesChartRefreshContext &
  Pick<RuntimeMethodState, "notify" | "askConfirmation">;

export type LotStorageContext = Pick<
  AppState,
  | "activeScopeType"
  | "activeWorkspaceId"
  | "currentLotId"
  | "exchangeRate"
  | "lastFetchTime"
  | "lots"
  | "sales"
  | "salesByLotId"
  | "sellingTaxPercent"
  | "platformFeePercent"
  | "additionalFeePercent"
  | "additionalFeeAppliesTo"
  | "fixedFeePerOrder"
  | "systemPricingDefaults"
> &
  Pick<RuntimeMethodState, "notify"> &
  Pick<CommerceMethodState,
    | "getSalesStorageKey"
    | "getSalesCacheEntry"
    | "loadSystemPricingDefaultsFromStorage"
  >;

export type PricingWorkflowContext = Pick<
  AppState,
  | "activeScopeType"
  | "activeWorkspaceId"
  | "additionalFeeAppliesTo"
  | "additionalFeePercent"
  | "boxesPurchased"
  | "boxPriceSell"
  | "currentLotId"
  | "feeProfilePreset"
  | "fixedFeePerOrder"
  | "isOffline"
  | "lots"
  | "packPrice"
  | "platformFeePercent"
  | "purchaseDate"
  | "purchaseShippingCost"
  | "purchaseTaxPercent"
  | "sellingShippingPerOrder"
  | "sellingTaxPercent"
  | "showProfitCalculator"
  | "spotPrice"
  | "spotsPerBox"
  | "systemPricingDefaults"
  | "targetProfitPercent"
> &
  Pick<CommerceComputedState,
    | "canUsePaidActions"
    | "currentLotType"
    | "purchaseCostInputValue"
    | "totalCaseCost"
    | "totalPacks"
    | "totalSpots"
  > &
  Pick<CommerceMethodState,
    | "applyLiveSinglesSuggestedPricing"
    | "autoSaveSetup"
    | "getCurrentSetup"
    | "onPurchaseConfigChange"
    | "onSystemPricingDefaultsChange"
    | "recalculateDefaultPrices"
    | "saveLotsToStorage"
    | "saveSystemPricingDefaultsToStorage"
    | "syncLivePricesFromDefaults"
  > &
  Pick<RuntimeMethodState, "notify"> &
  Pick<SyncMethodState, "pushCloudSync">;

export type LiveSinglesContext = Pick<
  AppState,
  "liveSinglesExternalIds" | "liveSinglesManualIds"
> &
  Pick<CommerceComputedState, "currentLotType" | "effectiveLiveSinglesIds"> &
  Pick<CommerceMethodState, "setLiveSinglesSelection"> &
  Pick<RuntimeMethodState, "notify"> & {
    $refs?: AppVueContext["$refs"] & {
      liveWindow?: {
        applySinglesAutoPricing?: () => void;
        resetSinglesPricing?: () => void;
      };
    };
  };

export type LotConfigurationContext = Pick<
  AppState,
  | "activeScopeType"
  | "activeWorkspaceId"
  | "additionalFeeAppliesTo"
  | "additionalFeePercent"
  | "boxesPurchased"
  | "boxPriceCost"
  | "boxPriceSell"
  | "costInputMode"
  | "currency"
  | "currentLivePricingVersion"
  | "currentLotId"
  | "currentTab"
  | "exchangeRate"
  | "externalSku"
  | "feeProfilePreset"
  | "fixedFeePerOrder"
  | "hasProAccess"
  | "includeTax"
  | "isHydratingLotConfig"
  | "isOffline"
  | "liveBoxPriceSell"
  | "livePackPrice"
  | "livePricingHydratedLotId"
  | "livePricingHydrationStatus"
  | "liveSpotPrice"
  | "lotHydrationRevision"
  | "lots"
  | "newLotCatalogSource"
  | "newLotName"
  | "newLotType"
  | "packPrice"
  | "packsPerBox"
  | "platformFeePercent"
  | "purchaseDate"
  | "purchaseShippingCost"
  | "purchaseTaxPercent"
  | "purchaseUiMode"
  | "renameLotName"
  | "sellingCurrency"
  | "sellingShippingPerOrder"
  | "sellingTaxPercent"
  | "showNewLotModal"
  | "showRenameLotModal"
  | "showSinglesCsvMapperModal"
  | "singlesCsvImportCurrency"
  | "singlesCsvImportHeaders"
  | "singlesCsvImportMode"
  | "singlesCsvImportRows"
  | "singlesCsvMapCardNumber"
  | "singlesCsvMapCondition"
  | "singlesCsvMapCost"
  | "singlesCsvMapItem"
  | "singlesCsvMapLanguage"
  | "singlesCsvMapMarketValue"
  | "singlesCsvMapQuantity"
  | "singlesPurchases"
  | "spotPrice"
  | "spotsPerBox"
  | "systemPricingDefaults"
  | "targetProfitPercent"
> &
  Pick<CommerceComputedState, "currentLotType"> &
  Pick<CommerceMethodState,
    | "autoSaveSetup"
    | "getCurrentSetup"
    | "getSalesCacheEntry"
    | "getSalesStorageKey"
    | "initSalesChart"
    | "loadLot"
    | "loadSalesForLotId"
    | "loadSalesFromStorage"
    | "onSinglesPurchaseRowsChange"
    | "recalculateDefaultPrices"
    | "resetLiveSinglesPricing"
    | "saveLotsToStorage"
    | "syncLivePricesFromDefaults"
  > &
  Pick<PortfolioMethodState, "initPortfolioChart"> &
  Pick<RuntimeMethodState,
    | "askConfirmation"
    | "handleGuidedOnboardingLotCreated"
    | "notify"
    | "syncGuidedOnboarding"
  > &
  Pick<SyncMethodState, "pushCloudSync"> &
  Pick<AppVueContext, "$nextTick"> &
  ScopedApiContext;

export type LotIoContext = Pick<
  AppState,
  | "activeScopeType"
  | "activeWorkspaceId"
  | "activeWheelConfigId"
  | "adminImportSourceUserId"
  | "adminImportSourceWorkspaceId"
  | "currentLotId"
  | "isAdminImportInProgress"
  | "lots"
  | "sales"
  | "salesByLotId"
  | "salesCacheEpoch"
  | "systemPricingDefaults"
  | "wheelConfigs"
> &
  ScopedApiContext &
  Pick<CommerceMethodState,
    "canUseAdminLotSyncTools" | "getSalesStorageKey" | "loadLot"
  > &
  Pick<SyncMethodState, "pullCloudSync"> &
  Pick<RuntimeMethodState, "notify">;

export type SalesChartContext = Pick<
  AppState,
  | "chartView"
  | "currentTab"
  | "packPrice"
  | "preferredLanguage"
  | "sales"
  | "salesChart"
  | "sellingShippingPerOrder"
  | "sellingTaxPercent"
> &
  Pick<CommerceComputedState,
    "currentLotType" | "soldPacksCount" | "totalCaseCost" | "totalPacks" | "totalRevenue"
  > &
  Pick<CommerceMethodState,
    "calculateSaleProfit" | "formatDate" | "initSalesChart" | "netFromGross"
  > &
  Pick<RuntimeMethodState, "formatCurrency"> &
  Pick<AppVueContext, "$nextTick" | "$refs" | "$vuetify">;

export type SalesMethodContext = SalesChartContext &
  PortfolioChartContext &
  Pick<
  AppState,
  | "activeWheelConfigId"
  | "editingSale"
  | "newSale"
  | "packsPerBox"
  | "salesByLotId"
  | "showAddSaleModal"
  | "singlesPurchases"
  | "targetProfitPercent"
  | "currency"
  | "sellingCurrency"
  | "exchangeRate"
  | "wheelConfigs"
> &
  RootWheelSessionStateContext &
  Pick<CommerceComputedState,
    "canUsePaidActions" | "singlesSoldCountByPurchaseId"
  > &
  Pick<CommerceMethodState,
    | "calculatePriceForUnits"
    | "cancelSale"
  > &
  Pick<RuntimeMethodState, "askConfirmation">;

export type ConfigStorageMethodImplementation = FeatureMethodImplementation<
  LotStorageContext,
  Pick<CommerceMethodState,
    | "getSalesStorageKey"
    | "getSalesCacheEntry"
    | "loadSalesForLotId"
    | "netFromGross"
    | "loadLotsFromStorage"
    | "saveLotsToStorage"
    | "loadSystemPricingDefaultsFromStorage"
    | "saveSystemPricingDefaultsToStorage"
  > & Pick<RuntimeMethodState, "getExchangeRate">
>;

export type ConfigPricingMethodImplementation = FeatureMethodImplementation<
  PricingWorkflowContext,
  Pick<CommerceMethodState,
    | "calculateProfit"
    | "recalculateDefaultPrices"
    | "calculateOptimalPrices"
    | "setFeeProfilePreset"
    | "setSystemFeeProfilePreset"
    | "onSystemPricingDefaultsChange"
    | "setCurrentLotSystemPricingDefaultsMode"
    | "updatePurchaseCostInput"
    | "onPurchaseConfigChange"
    | "calculatePriceForUnits"
  >
>;

export type LiveSinglesMethodImplementation = FeatureMethodImplementation<
  LiveSinglesContext,
  Pick<CommerceMethodState,
    | "setLiveSinglesSelection"
    | "addLiveSinglesSelection"
    | "removeLiveSinglesSelection"
    | "clearLiveSinglesSelection"
    | "applyLiveSinglesSuggestedPricing"
    | "resetLiveSinglesPricing"
  >
>;

export type ConfigLotMethodImplementation = FeatureMethodImplementation<
  LotConfigurationContext,
  Pick<CommerceMethodState,
    | "getCurrentSetup"
    | "autoSaveSetup"
    | "syncLivePricesFromDefaults"
    | "resetLivePrices"
    | "applyLivePricesToDefaults"
    | "addSinglesPurchaseRow"
    | "removeSinglesPurchaseRow"
    | "clearSinglesPurchases"
    | "onSinglesPurchaseRowsChange"
    | "importSinglesPurchasesCsv"
    | "confirmSinglesPurchasesCsvImport"
    | "cancelSinglesPurchasesCsvImport"
    | "createNewLot"
    | "selectLot"
    | "setCurrentLotCatalogSource"
    | "openRenameLotModal"
    | "renameCurrentLot"
    | "loadLot"
    | "deleteCurrentLot"
  >
>;

export type SalesMethodImplementation = FeatureMethodImplementation<
  SalesMethodContext,
  Pick<CommerceMethodState,
    | "loadSalesFromStorage"
    | "getAllSalesByLotId"
    | "saveSalesToStorage"
    | "openAddSaleModal"
    | "openConvertLiveSinglesSaleModal"
    | "onNewSaleTypeChange"
    | "onSinglesSaleCardSelectionChange"
    | "addSinglesSaleLine"
    | "removeSinglesSaleLine"
    | "getSinglesSaleLineMaxQuantity"
    | "onSinglesSaleLineCardSelectionChange"
    | "onSinglesSaleLineQuantityChange"
    | "onSinglesSaleLinePriceChange"
    | "saveSale"
    | "editSale"
    | "deleteSale"
    | "cancelSale"
    | "initSalesChart"
  > &
  Pick<PortfolioMethodState, "initPortfolioChart"> &
  GameMethodState
>;
