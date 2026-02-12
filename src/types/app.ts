import type { Chart as ChartJS } from "chart.js";

export type AppTab = "config" | "live" | "sales";
export type CostInputMode = "perBox" | "total";
export type CurrencyCode = "CAD" | "USD";
export type SaleType = "pack" | "box" | "rtyh";
export type ChartViewMode = "pie" | "sparkline";
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
  quantity: number;
  packsCount: number | null;
  price: number;
  buyerShipping: number;
  date: string;
}

export interface Sale {
  id: number;
  type: SaleType;
  quantity: number;
  packsCount: number;
  price: number;
  buyerShipping: number;
  date: string;
}

export interface PresetSetup {
  boxPriceCost: number;
  boxesPurchased: number;
  packsPerBox: number;
  costInputMode: CostInputMode;
  currency: CurrencyCode;
  exchangeRate: number;
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

export interface Preset extends PresetSetup {
  id: number;
  name: string;
  taxRatePercent?: number;
}

export interface SalesStatus {
  color: UiColor;
  icon: string;
  title: string;
  profit: number;
  revenue: number;
}

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export interface AppState extends PresetSetup {
  currentTab: AppTab;
  showNewPresetModal: boolean;
  speedDialOpen: boolean;
  speedDialOpenSales: boolean;
  snackbar: SnackbarState;
  isOffline: boolean;
  deferredInstallPrompt: BeforeInstallPromptEvent | null;
  showInstallPrompt: boolean;
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
  salesChart: ChartJS<"doughnut", number[], string> | null;
  chartView: ChartViewMode;
  presets: Preset[];
  currentPresetId: number | null;
  newPresetName: string;
  lastFetchTime: number | null;
}
