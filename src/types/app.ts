import type { Chart as ChartJS } from "chart.js";

export type AppTab = "config" | "live" | "sales" | "portfolio";
export type LotType = "bulk" | "singles";
export type CostInputMode = "perBox" | "total";
export type PurchaseUiMode = "simple" | "expert";
export type CurrencyCode = "CAD" | "USD";
export type SaleType = "pack" | "box" | "rtyh";
export type ChartViewMode = "pie" | "sparkline";
export type PortfolioChartViewMode = "breakdown" | "trend";
export type SyncStatus = "idle" | "syncing" | "success" | "error";
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
  price: number;
  memo?: string;
  buyerShipping: number;
  date: string;
}

export interface Sale {
  id: number;
  type: SaleType;
  quantity: number;
  packsCount: number;
  price: number;
  priceIsTotal?: boolean;
  memo?: string;
  buyerShipping: number;
  date: string;
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
  speedDialOpen: boolean;
  speedDialOpenSales: boolean;
  snackbar: SnackbarState;
  isOffline: boolean;
  deferredInstallPrompt: BeforeInstallPromptEvent | null;
  showInstallPrompt: boolean;
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
  currentLotId: number | null;
  newLotName: string;
  renameLotName: string;
  newLotType: LotType;
  lastFetchTime: number | null;
  cloudSyncIntervalId: number | null;
  lastSyncedPayloadHash: string | null;
  syncStatus: SyncStatus;
  syncStatusResetTimeoutId: number | null;
  offlineReconnectIntervalId: number | null;
}
