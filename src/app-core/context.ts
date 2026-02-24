import type {
  AppState,
  AppTab,
  BeforeInstallPromptEvent,
  CostInputMode,
  Lot,
  LotType,
  LotPerformanceSummary,
  LotSetup,
  PortfolioTotals,
  Sale,
  SaleType,
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
  hasLotSelected: boolean;
  isLiveTabDisabled: boolean;
  canUsePaidActions: boolean;
  lotItems: Array<{ title: string; value: number | null }>;
  portfolioLotFilterItems: Array<{ title: string; value: number }>;
  portfolioSelectedLotIds: number[];
  singlesPurchaseTotalQuantity: number;
  singlesPurchaseTotalCost: number;
  singlesPurchaseTotalMarketValue: number;
  singlesSoldCountByPurchaseId: Record<number, number>;
  singlesTrackedSoldCount: number;
  singlesTrackedTotalCount: number;
  singlesUnlinkedSoldCount: number;
  singlesSaleCardOptions: SinglesSaleCardOption[];
  selectedSinglesSaleMaxQuantity: number | null;
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
  salesStatus: SalesStatus;
  sortedSales: Sale[];
  sparklineData: number[];
  sparklineGradient: string[];
  allLotPerformance: Array<LotPerformanceSummary & { lotId: number; lotName: string; lotType: "Bulk" | "Singles" }>;
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
  addSinglesPurchaseRow(): void;
  removeSinglesPurchaseRow(rowId: number): void;
  clearSinglesPurchases(): void;
  onSinglesPurchaseRowsChange(): void;
  importSinglesPurchasesCsv(): void;
  confirmSinglesPurchasesCsvImport(): void;
  cancelSinglesPurchasesCsvImport(): void;
  createNewLot(): void;
  openRenameLotModal(): void;
  renameCurrentLot(): void;
  loadLot(): void;
  deleteCurrentLot(): void;
  exportLots(): void;
  exportSales(): void;
  exportPortfolioReport(): void;
  openPortfolioReportModal(): void;
  copyPortfolioReportTable(): Promise<void>;
  importLots(): void;
  handleFileImport(event: Event): void;
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
  saveSale(): void;
  editSale(sale: Sale): void;
  deleteSale(id: number): void;
  cancelSale(): void;
  initSalesChart(): void;
  initPortfolioChart(): void;
  toggleChartView(): void;
  togglePortfolioChartView(): void;
  calculateSaleProfit(sale: Sale): number;
  getSaleColor(type: SaleType): string;
  getSaleIcon(type: SaleType): string;
  formatDate(dateStr: string): string;
  initGoogleAutoLogin(): void;
  promptGoogleSignIn(): void;
  openVerifyPurchaseModal(): void;
  startProPurchase(): Promise<void>;
  verifyProPurchase(): Promise<void>;
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
    fileInput?: HTMLInputElement;
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
  hasLotSelected(this: AppContext): boolean;
  isLiveTabDisabled(this: AppContext): boolean;
  canUsePaidActions(this: AppContext): boolean;
  lotItems(this: AppContext): Array<{ title: string; value: number | null }>;
  portfolioLotFilterItems(this: AppContext): Array<{ title: string; value: number }>;
  portfolioSelectedLotIds(this: AppContext): number[];
  singlesPurchaseTotalQuantity(this: AppContext): number;
  singlesPurchaseTotalCost(this: AppContext): number;
  singlesPurchaseTotalMarketValue(this: AppContext): number;
  singlesSoldCountByPurchaseId(this: AppContext): Record<number, number>;
  singlesTrackedSoldCount(this: AppContext): number;
  singlesTrackedTotalCount(this: AppContext): number;
  singlesUnlinkedSoldCount(this: AppContext): number;
  singlesSaleCardOptions(this: AppContext): SinglesSaleCardOption[];
  selectedSinglesSaleMaxQuantity(this: AppContext): number | null;
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
  salesStatus(this: AppContext): SalesStatus;
  sortedSales(this: AppContext): Sale[];
  sparklineData(this: AppContext): number[];
  sparklineGradient(this: AppContext): string[];
  allLotPerformance(this: AppContext): Array<LotPerformanceSummary & { lotId: number; lotName: string; lotType: "Bulk" | "Singles" }>;
  portfolioTotals(this: AppContext): PortfolioTotals;
  hasPortfolioData(this: AppContext): boolean;
}

export interface AppLifecycleObject {
  mounted(this: AppContext): void;
  beforeUnmount(this: AppContext): void;
}

export type ThemeName = "unionArenaDark" | "unionArenaLight";

export interface AppImportBundle {
  version: number;
  exportedAt: string;
  lastLotId: number | null;
  lots: Array<Lot & { sales?: Sale[] }>;
}

export interface PromptResult {
  outcome: "accepted" | "dismissed";
  platform: string;
}

export type BeforeInstallPromptHandler = (event: BeforeInstallPromptEvent) => void;

export interface ChangeCostModePayload {
  costInputMode: CostInputMode;
}
