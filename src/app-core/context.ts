import type {
  AppState,
  AppTab,
  BeforeInstallPromptEvent,
  CostInputMode,
  PortfolioTotals,
  Preset,
  PresetPerformanceSummary,
  PresetSetup,
  Sale,
  SaleType,
  SalesStatus,
  UiColor
} from "../types/app.ts";

export interface AppComputedState {
  isDark: boolean;
  isGoogleSignedIn: boolean;
  googleProfileName: string;
  googleProfileEmail: string;
  googleProfilePicture: string;
  currentLotId: number | null;
  showNewLotModal: boolean;
  lotNameDraft: string;
  hasPresetSelected: boolean;
  hasLotSelected: boolean;
  canUsePaidActions: boolean;
  presetItems: Array<{ title: string; value: number | null }>;
  lotItems: Array<{ title: string; value: number | null }>;
  portfolioLotFilterIds: number[];
  portfolioLotFilterItems: Array<{ title: string; value: number }>;
  portfolioSelectedLotIds: number[];
  portfolioPresetFilterItems: Array<{ title: string; value: number }>;
  portfolioSelectedPresetIds: number[];
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
  allLotPerformance: Array<PresetPerformanceSummary & { lotId: number; lotName: string }>;
  allPresetPerformance: PresetPerformanceSummary[];
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
  getSalesStorageKey(presetId: number): string;
  loadSalesForPresetId(presetId: number): Sale[];
  netFromGross(grossRevenue: number, buyerShippingPerOrder?: number, orderCount?: number): number;
  getExchangeRate(): Promise<void>;
  loadLotsFromStorage(): void;
  loadPresetsFromStorage(): void;
  saveLotsToStorage(): void;
  savePresetsToStorage(): void;
  getCurrentSetup(): PresetSetup;
  autoSaveSetup(): void;
  syncLivePricesFromDefaults(): void;
  resetLivePrices(): void;
  applyLivePricesToDefaults(): void;
  createNewLot(): void;
  createNewPreset(): void;
  loadLot(): void;
  loadPreset(): void;
  deleteCurrentLot(): void;
  deleteCurrentPreset(): void;
  exportLots(): void;
  exportPresets(): void;
  exportSales(): void;
  exportPortfolioReport(): void;
  openPortfolioReportModal(): void;
  copyPortfolioReportTable(): Promise<void>;
  importLots(): void;
  importPresets(): void;
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
  currentPresetId(this: AppContext, newVal: number | null): void;
  chartView(this: AppContext): void;
  portfolioChartView(this: AppContext): void;
  portfolioPresetFilterIds: {
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
  currentLotId: NullableNumberProxyComputed;
  showNewLotModal: BooleanProxyComputed;
  lotNameDraft: StringProxyComputed;
  hasPresetSelected(this: AppContext): boolean;
  hasLotSelected(this: AppContext): boolean;
  canUsePaidActions(this: AppContext): boolean;
  presetItems(this: AppContext): Array<{ title: string; value: number | null }>;
  lotItems(this: AppContext): Array<{ title: string; value: number | null }>;
  portfolioLotFilterIds: NumberArrayProxyComputed;
  portfolioLotFilterItems(this: AppContext): Array<{ title: string; value: number }>;
  portfolioSelectedLotIds(this: AppContext): number[];
  portfolioPresetFilterItems(this: AppContext): Array<{ title: string; value: number }>;
  portfolioSelectedPresetIds(this: AppContext): number[];
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
  allLotPerformance(this: AppContext): Array<PresetPerformanceSummary & { lotId: number; lotName: string }>;
  allPresetPerformance(this: AppContext): PresetPerformanceSummary[];
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
  lastPresetId: number | null;
  presets: Array<Preset & { sales?: Sale[] }>;
}

export interface PromptResult {
  outcome: "accepted" | "dismissed";
  platform: string;
}

export type BeforeInstallPromptHandler = (event: BeforeInstallPromptEvent) => void;

export interface ChangeCostModePayload {
  costInputMode: CostInputMode;
}
