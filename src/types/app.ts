import type { Chart as ChartJS } from "chart.js";

export type AppTab = "config" | "live" | "sales" | "portfolio";
export type LotType = "bulk" | "singles";
export type SinglesCatalogSource = "ua" | "pokemon" | "none";
export type CostInputMode = "perBox" | "total";
export type PurchaseUiMode = "simple" | "expert";
export type CurrencyCode = "CAD" | "USD";
export type SinglesCsvImportMode = "merge" | "sync" | "append";
export type SaleType = "pack" | "box" | "rtyh";
export type ChartViewMode = "pie" | "sparkline";
export type PortfolioChartViewMode = "breakdown" | "trend";
export type SyncStatus = "idle" | "syncing" | "success" | "error";
export type LiveSinglesSelectionSource = "manual" | "external";
export type LiveSinglesSelectionMode = "replace" | "merge";
export type UiColor =
  | "info"
  | "success"
  | "warning"
  | "error"
  | "primary"
  | "secondary"
  | "surface"
  | "grey"
  | string;

export interface SnackbarState {
  show: boolean;
  text: string;
  color: UiColor;
}

export interface NewSaleDraft {
  type: SaleType;
  quantity: number | null;
  packsCount: number | null;
  singlesPurchaseEntryId?: number | null;
  singlesItems?: SinglesSaleDraftLine[];
  price: number | null;
  memo?: string;
  buyerShipping: number;
  date: string;
}

export interface SinglesSaleDraftLine {
  lineId: number;
  singlesPurchaseEntryId: number | null;
  quantity: number | null;
  price: number | null;
}

export interface SinglesSaleLine {
  singlesPurchaseEntryId?: number;
  quantity: number;
  price: number;
}

export interface Sale {
  id: number;
  type: SaleType;
  quantity: number;
  packsCount: number;
  singlesPurchaseEntryId?: number;
  singlesItems?: SinglesSaleLine[];
  price: number;
  priceIsTotal?: boolean;
  memo?: string;
  buyerShipping: number;
  date: string;
}

export interface SinglesSaleCardOption {
  title: string;
  value: number;
  item: string;
  cardNumber: string;
  cost: number;
  marketValue: number;
  quantity: number;
  costBasis: number;
  profitablePrice: number;
  soldCount: number;
}

export interface SinglesPurchaseEntry {
  id: number;
  item: string;
  cardNumber?: string;
  condition?: string;
  language?: string;
  cost: number;
  currency?: CurrencyCode;
  quantity: number;
  marketValue: number;
}

export interface SinglesCsvColumnMapping {
  item: number | null;
  cardNumber: number | null;
  condition: number | null;
  language: number | null;
  cost: number | null;
  quantity: number | null;
  marketValue: number | null;
}

export interface LotSetup {
  boxPriceCost: number;
  boxesPurchased: number;
  packsPerBox: number;
  spotsPerBox?: number;
  costInputMode: CostInputMode;
  currency: CurrencyCode;
  sellingCurrency: CurrencyCode;
  exchangeRate: number;
  purchaseDate: string;
  purchaseShippingCost: number;
  purchaseTaxPercent: number;
  sellingTaxPercent: number;
  sellingShippingPerOrder: number;
  includeTax: boolean;
  spotPrice: number;
  boxPriceSell: number;
  packPrice: number;
  targetProfitPercent: number;
}

export interface Lot extends LotSetup {
  id: number;
  name: string;
  lotType?: LotType;
  singlesCatalogSource?: SinglesCatalogSource;
  singlesPurchases?: SinglesPurchaseEntry[];
  createdAt?: string;
  taxRatePercent?: number;
}

export interface SalesStatus {
  color: UiColor;
  icon: string;
  title: string;
  profit: number;
  revenue: number;
}

export interface LotPerformanceSummary {
  lotId: number;
  lotName: string;
  salesCount: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  marginPercent: number | null;
  soldPacks: number;
  totalPacks: number;
  lastSaleDate: string | null;
}

export interface PortfolioTotals {
  lotCount: number;
  profitableLotCount: number;
  totalSalesCount: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
}

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export interface AppState extends LotSetup {
  hasProAccess: boolean;
  showManualPurchaseVerify: boolean;
  showVerifyPurchaseModal: boolean;
  showPortfolioReportModal: boolean;
  isVerifyingPurchase: boolean;
  purchaseTokenInput: string;
  purchaseProductIdInput: string;
  purchasePackageNameInput: string;
  purchaseUiMode: PurchaseUiMode;
  currentTab: AppTab;
  showNewLotModal: boolean;
  showRenameLotModal: boolean;
  speedDialOpenSales: boolean;
  snackbar: SnackbarState;
  isOffline: boolean;
  deferredInstallPrompt: BeforeInstallPromptEvent | null;
  showInstallPrompt: boolean;
  googleAuthEpoch: number;
  googleAvatarLoadFailed: boolean;
  onlineListener: (() => void) | null;
  offlineListener: (() => void) | null;
  beforeInstallPromptListener: ((event: Event) => void) | null;
  appInstalledListener: (() => void) | null;
  confirmDialog: boolean;
  confirmTitle: string;
  confirmText: string;
  confirmColor: UiColor;
  confirmAction: (() => void) | null;
  liveSinglesManualIds: number[];
  liveSinglesExternalIds: number[];
  liveSpotPrice: number;
  liveBoxPriceSell: number;
  livePackPrice: number;
  showProfitCalculator: boolean;
  sales: Sale[];
  showAddSaleModal: boolean;
  editingSale: Sale | null;
  newSale: NewSaleDraft;
  salesChart: ChartJS<"doughnut", number[], string> | ChartJS<"line", number[], string> | null;
  chartView: ChartViewMode;
  portfolioChart: ChartJS<"doughnut", number[], string> | ChartJS<"line", number[], string> | null;
  portfolioChartView: PortfolioChartViewMode;
  portfolioLotFilterIds: number[];
  lots: Lot[];
  singlesPurchases: SinglesPurchaseEntry[];
  showSinglesCsvMapperModal: boolean;
  singlesCsvImportHeaders: string[];
  singlesCsvImportRows: string[][];
  singlesCsvImportCurrency: CurrencyCode;
  singlesCsvImportMode: SinglesCsvImportMode;
  singlesCsvMapItem: number | null;
  singlesCsvMapCardNumber: number | null;
  singlesCsvMapCondition: number | null;
  singlesCsvMapLanguage: number | null;
  singlesCsvMapCost: number | null;
  singlesCsvMapQuantity: number | null;
  singlesCsvMapMarketValue: number | null;
  currentLotId: number | null;
  newLotName: string;
  renameLotName: string;
  newLotType: LotType;
  newLotCatalogSource: SinglesCatalogSource;
  lastFetchTime: number | null;
  cloudSyncIntervalId: number | null;
  lastSyncedPayloadHash: string | null;
  syncStatus: SyncStatus;
  syncStatusResetTimeoutId: number | null;
  offlineReconnectIntervalId: number | null;
}

