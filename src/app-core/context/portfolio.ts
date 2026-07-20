import type {
  AppState,
  LotPerformanceSummary,
  PortfolioSalesByUserChartData,
  PortfolioSalesByUserDrilldownRow,
  PortfolioTotals
} from "../../types/app.ts";
import type { CommerceMethodState, SalesEntityContext } from "./commerce.ts";
import type { AppVueContext, FeatureComputedObject } from "./runtime.ts";

export interface PortfolioComputedState {
  portfolioLotFilterItems: Array<{
    title: string;
    value: number;
    subtitle: string;
    lotType: "bulk" | "singles";
    isComplete: boolean;
    symbolIcon: string;
    completionIcon: string | null;
    groupLabel?: string | null;
  }>;
  portfolioSelectedLotIds: number[];
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
  allLotPerformance: Array<LotPerformanceSummary & {
    lotId: number;
    lotName: string;
    lotType: "Bulk" | "Singles";
    forecastProfitAverage: number | null;
    forecastRevenueAverage: number | null;
    forecastScenarioCount: number;
  }>;
  portfolioSalesByUserChartData: PortfolioSalesByUserChartData;
  portfolioSalesByUserDrilldownRows: PortfolioSalesByUserDrilldownRow[];
  hasPortfolioSalesByUserData: boolean;
  portfolioTotals: PortfolioTotals;
  hasPortfolioData: boolean;
}

export interface PortfolioMethodState {
  exportPortfolioReport(): void;
  openPortfolioReportModal(): void;
  copyPortfolioReportTable(): Promise<void>;
  savePortfolioReportTable(): void;
  initPortfolioChart(): void;
  togglePortfolioChartView(): void;
  togglePortfolioReportLot(lotId: number): void;
}

type PortfolioState = Pick<
  AppState,
  | "activeScopeType"
  | "activeWorkspaceId"
  | "currentLotId"
  | "currentTab"
  | "hasProAccess"
  | "isOffline"
  | "liveBoxPriceSell"
  | "livePackPrice"
  | "liveSpotPrice"
  | "lots"
  | "portfolioDashboardPreset"
  | "portfolioLotFilterIds"
  | "portfolioLotTypeFilter"
  | "portfolioSalesByUserMetric"
  | "preferredLanguage"
  | "sales"
  | "salesByLotId"
  | "salesCacheEpoch"
  | "workspaceMembers"
>;

export type PortfolioContext = PortfolioState &
  PortfolioComputedState &
  Pick<CommerceMethodState, "getAllSalesByLotId" | "getSalesCacheEntry" | "getSalesStorageKey" | "loadSalesForLotId" | "initSalesChart"> &
  PortfolioMethodState &
  Pick<AppVueContext, "$nextTick"> &
  SalesEntityContext;

export type PortfolioComputedObject = FeatureComputedObject<PortfolioComputedState, PortfolioContext>;
