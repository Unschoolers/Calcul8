import type {
  AppState,
  LotPerformanceSummary,
  PortfolioSalesByUserChartData,
  PortfolioSalesByUserDrilldownRow,
  PortfolioTotals
} from "../../types/app.ts";
import type {
  CommerceMethodState,
  LotConfigurationContext,
  LotIoContext,
  LotStorageContext,
  PricingWorkflowContext,
  SalesEntityContext
} from "./commerce.ts";
import type {
  AppVueContext,
  FeatureComputedObject,
  FeatureMethodImplementation,
  RuntimeMethodState
} from "./runtime.ts";

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

export type PortfolioReportContext = Pick<
  AppState,
  "portfolioReportExpandedLotIds" | "sales" | "showPortfolioReportModal" | "currentLotId"
> &
  Pick<PortfolioComputedState, "allLotPerformance" | "hasPortfolioData" | "portfolioTotals"> &
  Pick<PortfolioMethodState, "openPortfolioReportModal"> &
  Pick<RuntimeMethodState, "formatCurrency" | "notify"> &
  Pick<CommerceMethodState, "formatDate">;

export type PortfolioChartContext = PortfolioContext &
  Pick<
    AppState,
    | "portfolioChart"
    | "portfolioChartView"
    | "portfolioSalesByUserChart"
    | "portfolioSalesByUserMetric"
    | "preferredLanguage"
  > &
  Pick<CommerceMethodState, "formatDate"> &
  Pick<RuntimeMethodState, "formatCurrency"> &
  Pick<AppVueContext, "$refs" | "$vuetify">;

export type ConfigIoMethodImplementation = FeatureMethodImplementation<
  LotIoContext & PortfolioReportContext,
  Pick<CommerceMethodState,
    "canUseAdminLotSyncTools" | "importLotsFromUserId" | "exportSales"
  > & Pick<PortfolioMethodState,
    | "exportPortfolioReport"
    | "openPortfolioReportModal"
    | "copyPortfolioReportTable"
    | "savePortfolioReportTable"
  >
>;

export type ConfigurationMethodContext = LotStorageContext &
  PricingWorkflowContext &
  LotConfigurationContext &
  LotIoContext &
  PortfolioReportContext;

type ConfigurationCommerceMethods = Pick<CommerceMethodState,
  | "getSalesStorageKey"
  | "getSalesCacheEntry"
  | "loadSalesForLotId"
  | "netFromGross"
  | "loadLotsFromStorage"
  | "saveLotsToStorage"
  | "loadSystemPricingDefaultsFromStorage"
  | "saveSystemPricingDefaultsToStorage"
  | "setLiveSinglesSelection"
  | "addLiveSinglesSelection"
  | "removeLiveSinglesSelection"
  | "clearLiveSinglesSelection"
  | "applyLiveSinglesSuggestedPricing"
  | "resetLiveSinglesPricing"
  | "getCurrentSetup"
  | "autoSaveSetup"
  | "syncLivePricesFromDefaults"
  | "resetLivePrices"
  | "applyLivePricesToDefaults"
  | "addSinglesPurchaseRow"
  | "removeSinglesPurchaseRow"
  | "clearSinglesPurchases"
  | "onSinglesPurchaseRowsChange"
  | "importSinglesPurchasesCsv"
  | "confirmSinglesPurchasesCsvImport"
  | "cancelSinglesPurchasesCsvImport"
  | "createNewLot"
  | "selectLot"
  | "setCurrentLotCatalogSource"
  | "openRenameLotModal"
  | "renameCurrentLot"
  | "loadLot"
  | "deleteCurrentLot"
  | "canUseAdminLotSyncTools"
  | "importLotsFromUserId"
  | "exportSales"
  | "calculateProfit"
  | "recalculateDefaultPrices"
  | "calculateOptimalPrices"
  | "setFeeProfilePreset"
  | "setSystemFeeProfilePreset"
  | "onSystemPricingDefaultsChange"
  | "setCurrentLotSystemPricingDefaultsMode"
  | "updatePurchaseCostInput"
  | "onPurchaseConfigChange"
  | "calculatePriceForUnits"
>;

type ConfigurationPortfolioMethods = Pick<PortfolioMethodState,
  | "exportPortfolioReport"
  | "openPortfolioReportModal"
  | "copyPortfolioReportTable"
  | "savePortfolioReportTable"
>;

export type ConfigurationMethodImplementation = FeatureMethodImplementation<
  ConfigurationMethodContext,
  ConfigurationCommerceMethods & ConfigurationPortfolioMethods & Pick<RuntimeMethodState, "getExchangeRate">
>;
