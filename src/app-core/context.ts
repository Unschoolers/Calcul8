import type {
  AppState,
  AppTab,
  BeforeInstallPromptEvent,
  CostInputMode,
  LiveSinglesSelectionMode,
  LiveSinglesSelectionSource,
  Lot,
  LotType,
  LotPerformanceSummary,
  LotSetup,
  PortfolioLotTypeFilter,
  PortfolioTotals,
  Sale,
  SaleType,
  SinglesCatalogSource,
  SinglesPurchaseEntry,
  SinglesSaleCardOption,
  SalesStatus,
  UiColor
} from "../types/app.ts";

export interface AppComputedState {
  isDark: boolean;
  isGoogleSignedIn: boolean;
  googleProfileName: string;
  googleProfileEmail: string;
  googleProfilePicture: string;
  lotNameDraft: string;
  currentLotType: LotType;
  currentLotCatalogSource: SinglesCatalogSource;
  hasLotSelected: boolean;
  isLiveTabDisabled: boolean;
  canUsePaidActions: boolean;
  lotItems: Array<{
    title: string;
    value: number;
    subtitle: string;
    lotType: LotType;
    groupLabel?: string | null;
  }>;
  visibleLotItems: Array<{
    title: string;
    value: number;
    subtitle: string;
    lotType: LotType;
    groupLabel?: string | null;
  }>;
  portfolioLotFilterItems: Array<{
    title: string;
    value: number;
    subtitle: string;
    lotType: LotType;
    groupLabel?: string | null;
  }>;
  portfolioSelectedLotIds: number[];
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
  portfolioForecastScenarios: Array<{
    id: "item" | "box" | "rtyh";
    label: string;
    unitLabel: "item" | "box" | "spot";
    units: number;
    unitPrice: number;
    estimatedNetRemaining: number;
    forecastRevenue: number;
    forecastProfit: number;
    forecastMarginPercent: number | null;
  }>;
  averagePortfolioForecastScenario: {
    label: string;
    modeCount: number;
    forecastRevenue: number;
    forecastProfit: number;
    forecastMarginPercent: number | null;
  } | null;
  bestPortfolioForecastScenario: {
    id: "item" | "box" | "rtyh";
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
  allLotPerformance: Array<
    LotPerformanceSummary & {
      lotId: number;
      lotName: string;
      lotType: "Bulk" | "Singles";
      forecastProfitAverage: number | null;
      forecastRevenueAverage: number | null;
      forecastScenarioCount: number;
    }
  >;
  portfolioTotals: PortfolioTotals;
  hasPortfolioData: boolean;
}

export interface AppMethodState {
  toggleTheme(): void;
  notify(message: string, color?: UiColor): void;
  askConfirmation(
    payload: { title: string; text: string; color?: UiColor },
    action: () => void
  ): void;
  runConfirmAction(): void;
  cancelConfirmAction(): void;
  getSalesStorageKey(lotId: number): string;
  loadSalesForLotId(lotId: number): Sale[];
  netFromGross(grossRevenue: number, buyerShippingPerOrder?: number, orderCount?: number): number;
  getExchangeRate(): Promise<void>;
  loadLotsFromStorage(): void;
  saveLotsToStorage(): void;
  getCurrentSetup(): LotSetup;
  autoSaveSetup(): void;
  syncLivePricesFromDefaults(): void;
  resetLivePrices(): void;
  applyLivePricesToDefaults(): void;
  setLiveSinglesSelection(
    ids: number[],
    opts?: { source?: LiveSinglesSelectionSource; mode?: LiveSinglesSelectionMode }
  ): void;
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
  setCurrentLotCatalogSource(source: SinglesCatalogSource): void;
  openRenameLotModal(): void;
  renameCurrentLot(): void;
  loadLot(): void;
  deleteCurrentLot(): void;
  canUseAdminLotSyncTools(): boolean;
  importLotsFromUserId(): Promise<void>;
  exportSales(): void;
  exportPortfolioReport(): void;
  openPortfolioReportModal(): void;
  copyPortfolioReportTable(): Promise<void>;
  calculateProfit(units: number, pricePerUnit: number): number;
  formatCurrency(value: number | null | undefined, decimals?: number): string;
  safeFixed(value: number, decimals?: number): string;
  recalculateDefaultPrices(opts?: { closeModal?: boolean }): void;
  calculateOptimalPrices(): void;
  onPurchaseConfigChange(): void;
  calculatePriceForUnits(units: number, targetNetRevenue: number): number;
  loadSalesFromStorage(): void;
  saveSalesToStorage(): void;
  openAddSaleModal(saleType?: SaleType): void;
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
  initPortfolioChart(): void;
  toggleChartView(): void;
  togglePortfolioChartView(): void;
  accessProFeature(target: "autoCalculate" | "portfolioReport" | "salesTracking" | "expertMode"): Promise<void>;
  requestPurchaseUiMode(mode: "simple" | "expert"): Promise<void>;
  calculateSaleProfit(sale: Sale): number;
  getSaleColor(type: SaleType): string;
  getSaleIcon(type: SaleType): string;
  formatDate(dateStr: string): string;
  initGoogleAutoLogin(): void;
  promptGoogleSignIn(): void;
  openVerifyPurchaseModal(): void;
  startProPurchase(): Promise<void>;
  verifyProPurchase(): Promise<void>;
  closeStripeCheckoutModal(): Promise<void>;
  startPlayPurchase(): Promise<void>;
  verifyPlayPurchase(): Promise<void>;
  pullCloudSync(): Promise<void>;
  pushCloudSync(force?: boolean): Promise<void>;
  startCloudSyncScheduler(): void;
  stopCloudSyncScheduler(): void;
  setupPwaUiHandlers(): void;
  startOfflineReconnectScheduler(): void;
  stopOfflineReconnectScheduler(): void;
  promptInstall(): Promise<void>;
  debugLogEntitlement(forceRefresh?: boolean): Promise<void>;
  unregisterServiceWorkersForDev(): Promise<void>;
  registerServiceWorker(): void;
}

export interface AppVueContext {
  $nextTick(callback: () => void): Promise<void>;
  $refs: {
    salesChart?: HTMLCanvasElement;
    salesTrendChart?: HTMLCanvasElement;
    portfolioChart?: HTMLCanvasElement;
  };
  $vuetify: {
    theme: {
      change(name: "unionArenaDark" | "unionArenaLight"): void;
      global: {
        name: string;
      };
    };
  };
}

export type AppContext = AppState & AppComputedState & AppMethodState & AppVueContext;

export interface AppWatchObject {
  currentTab(this: AppContext, newTab: AppTab): void;
  purchaseUiMode(this: AppContext, newMode: "simple" | "expert"): void;
  currentLotId(this: AppContext, newVal: number | null): void;
  chartView(this: AppContext): void;
  portfolioChartView(this: AppContext): void;
  portfolioLotTypeFilter(this: AppContext, newValue: PortfolioLotTypeFilter): void;
  portfolioLotFilterIds: {
    handler(this: AppContext): void;
    deep: true;
  };
  sales: {
    handler(this: AppContext): void;
    deep: true;
  };
}

export type PurchaseCostInputComputed = {
  get(this: AppContext): number;
  set(this: AppContext, newValue: number | string): void;
};

export type NullableNumberProxyComputed = {
  get(this: AppContext): number | null;
  set(this: AppContext, newValue: number | string | null): void;
};

export type BooleanProxyComputed = {
  get(this: AppContext): boolean;
  set(this: AppContext, newValue: boolean): void;
};

export type StringProxyComputed = {
  get(this: AppContext): string;
  set(this: AppContext, newValue: string): void;
};

export type NumberArrayProxyComputed = {
  get(this: AppContext): number[];
  set(this: AppContext, newValue: number[]): void;
};

export interface AppComputedObject {
  isDark(this: AppContext): boolean;
  isGoogleSignedIn(this: AppContext): boolean;
  googleProfileName(this: AppContext): string;
  googleProfileEmail(this: AppContext): string;
  googleProfilePicture(this: AppContext): string;
  lotNameDraft: StringProxyComputed;
  currentLotType(this: AppContext): LotType;
  currentLotCatalogSource(this: AppContext): SinglesCatalogSource;
  hasLotSelected(this: AppContext): boolean;
  isLiveTabDisabled(this: AppContext): boolean;
  canUsePaidActions(this: AppContext): boolean;
  lotItems(this: AppContext): Array<{
    title: string;
    value: number;
    subtitle: string;
    lotType: LotType;
    groupLabel?: string | null;
  }>;
  visibleLotItems(this: AppContext): Array<{
    title: string;
    value: number;
    subtitle: string;
    lotType: LotType;
    groupLabel?: string | null;
  }>;
  portfolioLotFilterItems(this: AppContext): Array<{
    title: string;
    value: number;
    subtitle: string;
    lotType: LotType;
    groupLabel?: string | null;
  }>;
  portfolioSelectedLotIds(this: AppContext): number[];
  singlesPurchaseTotalQuantity(this: AppContext): number;
  singlesPurchaseTotalCost(this: AppContext): number;
  singlesPurchaseTotalMarketValue(this: AppContext): number;
  singlesSoldCountByPurchaseId(this: AppContext): Record<number, number>;
  singlesTrackedSoldCount(this: AppContext): number;
  singlesTrackedTotalCount(this: AppContext): number;
  singlesUnlinkedSoldCount(this: AppContext): number;
  effectiveLiveSinglesIds(this: AppContext): number[];
  effectiveLiveSinglesEntries(this: AppContext): SinglesPurchaseEntry[];
  singlesSaleCardOptions(this: AppContext): SinglesSaleCardOption[];
  selectedSinglesSaleMaxQuantity(this: AppContext): number | null;
  saleEditorLineProfitPreviews(this: AppContext): Array<{
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
  saleEditorProfitPreview(this: AppContext): {
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
  totalPacks(this: AppContext): number;
  totalSpots(this: AppContext): number;
  boxPriceCostCAD(this: AppContext): number;
  purchaseShippingCostCAD(this: AppContext): number;
  purchaseCostInputLabel(this: AppContext): string;
  purchaseCostInputValue: PurchaseCostInputComputed;
  totalCaseCost(this: AppContext): number;
  conversionInfo(this: AppContext): string;
  soldPacksCount(this: AppContext): number;
  totalRevenue(this: AppContext): number;
  salesProgress(this: AppContext): number;
  targetNetRevenue(this: AppContext): number;
  remainingNetRevenueForTarget(this: AppContext): number;
  remainingPacksCount(this: AppContext): number;
  remainingBoxesEquivalent(this: AppContext): number;
  remainingSpotsEquivalent(this: AppContext): number;
  requiredPackPriceFromNow(this: AppContext): number | null;
  requiredBoxPriceFromNow(this: AppContext): number | null;
  requiredSpotPriceFromNow(this: AppContext): number | null;
  liveForecastScenarios(this: AppContext): Array<{
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
  bestLiveForecastScenario(this: AppContext): {
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
  portfolioForecastScenarios(this: AppContext): Array<{
    id: "item" | "box" | "rtyh";
    label: string;
    unitLabel: "item" | "box" | "spot";
    units: number;
    unitPrice: number;
    estimatedNetRemaining: number;
    forecastRevenue: number;
    forecastProfit: number;
    forecastMarginPercent: number | null;
  }>;
  averagePortfolioForecastScenario(this: AppContext): {
    label: string;
    modeCount: number;
    forecastRevenue: number;
    forecastProfit: number;
    forecastMarginPercent: number | null;
  } | null;
  bestPortfolioForecastScenario(this: AppContext): {
    id: "item" | "box" | "rtyh";
    label: string;
    unitLabel: "item" | "box" | "spot";
    units: number;
    unitPrice: number;
    estimatedNetRemaining: number;
    forecastRevenue: number;
    forecastProfit: number;
    forecastMarginPercent: number | null;
  } | null;
  salesStatus(this: AppContext): SalesStatus;
  sortedSales(this: AppContext): Sale[];
  sparklineData(this: AppContext): number[];
  sparklineGradient(this: AppContext): string[];
  allLotPerformance(this: AppContext): Array<
    LotPerformanceSummary & {
      lotId: number;
      lotName: string;
      lotType: "Bulk" | "Singles";
      forecastProfitAverage: number | null;
      forecastRevenueAverage: number | null;
      forecastScenarioCount: number;
    }
  >;
  portfolioTotals(this: AppContext): PortfolioTotals;
  hasPortfolioData(this: AppContext): boolean;
}

export interface AppLifecycleObject {
  mounted(this: AppContext): void;
  beforeUnmount(this: AppContext): void;
}

export type ThemeName = "unionArenaDark" | "unionArenaLight";

export interface PromptResult {
  outcome: "accepted" | "dismissed";
  platform: string;
}

export type BeforeInstallPromptHandler = (event: BeforeInstallPromptEvent) => void;

export interface ChangeCostModePayload {
  costInputMode: CostInputMode;
}




