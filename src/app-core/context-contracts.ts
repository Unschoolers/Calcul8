import type {
  AppTab,
  BeforeInstallPromptEvent,
  CostInputMode,
  PortfolioDashboardPreset,
  PortfolioLotTypeFilter,
  PortfolioSalesByUserMetric,
  WorkspaceScopeType
} from "../types/app.ts";
import type { AppComputedState, AppContext } from "./context-app.ts";
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
  portfolioDashboardPreset(this: AppContext, newValue: PortfolioDashboardPreset): void;
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
  wheelPendingInventoryIssues: {
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

export type AppComputedObject = {
  [Key in keyof AppComputedState]: Key extends "lotNameDraft"
    ? StringProxyComputed
    : Key extends "purchaseCostInputValue"
      ? PurchaseCostInputComputed
      : (this: AppContext) => AppComputedState[Key];
};

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





