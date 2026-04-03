import type {
  AppTab,
  BeforeInstallPromptEvent,
  CostInputMode,
  LotPerformanceSummary,
  LotType,
  PortfolioLotTypeFilter,
  PortfolioSalesByUserChartData,
  PortfolioSalesByUserMetric,
  PortfolioTotals,
  Sale,
  SalesStatus,
  SinglesCatalogSource,
  SinglesPurchaseEntry,
  SinglesSaleCardOption,
  WorkspaceMember,
  WorkspaceScopeType,
  WorkspaceSummary
} from "../types/app.ts";
import type { AppContext } from "./context-app.ts";
export interface AppWatchObject {
  activeScopeType(this: AppContext, newValue: WorkspaceScopeType): void;
  activeWorkspaceId(this: AppContext, newValue: string | null): void;
  preferredLanguage(this: AppContext, newValue: string): void;
  currentTab(this: AppContext, newTab: AppTab): void;
  purchaseUiMode(this: AppContext, newMode: "simple" | "expert"): void;
  boxesPurchased(this: AppContext, newValue: number, oldValue: number): void;
  googleAuthEpoch(this: AppContext): void;
  currentLotId(this: AppContext, newVal: number | null): void;
  chartView(this: AppContext): void;
  portfolioChartView(this: AppContext): void;
  portfolioSalesByUserMetric(this: AppContext, newValue: PortfolioSalesByUserMetric): void;
  portfolioLotTypeFilter(this: AppContext, newValue: PortfolioLotTypeFilter): void;
  portfolioLotFilterIds: {
    handler(this: AppContext): void;
    deep: true;
  };
  sales: {
    handler(this: AppContext): void;
    deep: true;
  };
  wheelConfigs: {
    handler(this: AppContext): void;
    deep: true;
  };
  wheelTotalSpins(this: AppContext): void;
  wheelSpinCounts: {
    handler(this: AppContext): void;
    deep: true;
  };
  activeWheelConfigId(this: AppContext): void;
  wheelSkippedDeductions: {
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
  isWorkspaceScopeActive(this: AppContext): boolean;
  currentWorkspaceSummary(this: AppContext): WorkspaceSummary | null;
  currentWorkspaceName(this: AppContext): string;
  scopeChipClass(this: AppContext): string;
  scopeChipIcon(this: AppContext): string;
  scopeChipLabel(this: AppContext): string;
  isCurrentWorkspaceOwner(this: AppContext): boolean;
  activeWorkspaceVisibleMembers(this: AppContext): WorkspaceMember[];
  activeWorkspaceOverflowMemberCount(this: AppContext): number;
  accountSyncBadgeVisible(this: AppContext): boolean;
  accountSyncBadgeClass(this: AppContext): string;
  accountSyncIcon(this: AppContext): string;
  accountSyncIconSize(this: AppContext): number;
  accountSyncIconClass(this: AppContext): string;
  workspaceRealtimeTitle(this: AppContext): string;
  workspaceRealtimeSubtitle(this: AppContext): string;
  workspaceRealtimeIcon(this: AppContext): string;
  syncStatusTitle(this: AppContext): string;
  syncStatusSubtitle(this: AppContext): string;
  syncStatusIcon(this: AppContext): string;
  whatnotConnectionTitle(this: AppContext): string;
  whatnotConnectionSubtitle(this: AppContext): string;
  whatnotConnectionIcon(this: AppContext): string;
  whatnotConnectActionTitle(this: AppContext): string;
  whatnotSyncActionTitle(this: AppContext): string;
  pendingWorkspaceInviteTargetName(this: AppContext): string;
  authGateTitle(this: AppContext): string;
  authGateSubtitle(this: AppContext): string;
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
    isComplete: boolean;
    symbolIcon: string;
    completionIcon: string | null;
    groupLabel?: string | null;
  }>;
  visibleLotItems(this: AppContext): Array<{
    title: string;
    value: number;
    subtitle: string;
    lotType: LotType;
    isComplete: boolean;
    symbolIcon: string;
    completionIcon: string | null;
    groupLabel?: string | null;
  }>;
  portfolioLotFilterItems(this: AppContext): Array<{
    title: string;
    value: number;
    subtitle: string;
    lotType: LotType;
    isComplete: boolean;
    symbolIcon: string;
    completionIcon: string | null;
    groupLabel?: string | null;
  }>;
  portfolioSelectedLotIds(this: AppContext): number[];
  portfolioSalesByUserChartData(this: AppContext): PortfolioSalesByUserChartData;
  hasPortfolioSalesByUserData(this: AppContext): boolean;
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





