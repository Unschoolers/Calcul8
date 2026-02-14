import type {
  AppState,
  AppTab,
  BeforeInstallPromptEvent,
  CostInputMode,
  Preset,
  PresetSetup,
  Sale,
  SaleType,
  SalesStatus,
  UiColor
} from "../types/app.ts";

export interface AppComputedState {
  isDark: boolean;
  hasPresetSelected: boolean;
  canUsePaidActions: boolean;
  presetItems: Array<{ title: string; value: number | null }>;
  totalPacks: number;
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
  loadPresetsFromStorage(): void;
  savePresetsToStorage(): void;
  getCurrentSetup(): PresetSetup;
  autoSaveSetup(): void;
  syncLivePricesFromDefaults(): void;
  resetLivePrices(): void;
  createNewPreset(): void;
  loadPreset(): void;
  deleteCurrentPreset(): void;
  exportPresets(): void;
  exportSales(): void;
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
  saveSale(): void;
  editSale(sale: Sale): void;
  deleteSale(id: number): void;
  cancelSale(): void;
  initSalesChart(): void;
  toggleChartView(): void;
  calculateSaleProfit(sale: Sale): number;
  getSaleColor(type: SaleType): string;
  getSaleIcon(type: SaleType): string;
  formatDate(dateStr: string): string;
  initGoogleAutoLogin(): void;
  openVerifyPurchaseModal(): void;
  verifyPlayPurchase(): Promise<void>;
  setupPwaUiHandlers(): void;
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
  };
  $vuetify: {
    theme: {
      global: {
        name: string;
      };
    };
  };
}

export type AppContext = AppState & AppComputedState & AppMethodState & AppVueContext;

export interface AppWatchObject {
  currentTab(this: AppContext, newTab: AppTab): void;
  currentPresetId(this: AppContext, newVal: number | null): void;
  chartView(this: AppContext): void;
  sales: {
    handler(this: AppContext): void;
    deep: true;
  };
}

export type PurchaseCostInputComputed = {
  get(this: AppContext): number;
  set(this: AppContext, newValue: number | string): void;
};

export interface AppComputedObject {
  isDark(this: AppContext): boolean;
  hasPresetSelected(this: AppContext): boolean;
  canUsePaidActions(this: AppContext): boolean;
  presetItems(this: AppContext): Array<{ title: string; value: number | null }>;
  totalPacks(this: AppContext): number;
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
