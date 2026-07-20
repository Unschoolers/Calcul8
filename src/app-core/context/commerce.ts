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
import type { RuntimeMethodState } from "./runtime.ts";
import type { ScopedApiContext } from "./api.ts";

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
  updatePurchaseCostInput(value: unknown): void;
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
  onSinglesSaleLineQuantityChange(lineIndex: number, value?: unknown): void;
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
