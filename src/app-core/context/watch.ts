import type {
  AppState,
  AppTab,
  PortfolioDashboardPreset,
  PortfolioLotTypeFilter,
  PortfolioSalesByUserMetric,
  WorkspaceScopeType
} from "../../types/app.ts";
import type { AuthComputedState, AuthMethodState } from "./auth.ts";
import type { BuyerMethodState, BuyerProfileCacheContext } from "./buyers.ts";
import type {
  CommerceMethodState,
  LivePricingHydrationContext,
  SalesChartRefreshContext,
  SalesFreshnessContext
} from "./commerce.ts";
import type { PortfolioMethodState, PortfolioSalesHydrationContext } from "./portfolio.ts";
import type { AppVueContext, RuntimeMethodState } from "./runtime.ts";
import type { OnboardingMethodState } from "./shell.ts";
import type { SyncMethodState } from "./sync.ts";
import type {
  WhatnotMethodState,
  WhatnotTransientStateContext
} from "./whatnot.ts";
import type {
  WorkspaceMethodState,
  WorkspaceRealtimeContext
} from "./workspace.ts";
import type { GameMethodState } from "./game.ts";

export type ScopeWatchContext = WorkspaceRealtimeContext &
  WhatnotTransientStateContext &
  Pick<AuthComputedState, "isGoogleSignedIn"> &
  Pick<BuyerMethodState, "hydrateBuyerProfiles"> &
  Pick<WhatnotMethodState, "refreshWhatnotStatus">;

export type LanguageWatchContext = Pick<AppState, "currentTab" | "preferredLanguage"> &
  Pick<AuthComputedState, "isGoogleSignedIn"> &
  Pick<AuthMethodState, "renderGoogleSignInButton"> &
  Pick<CommerceMethodState, "initSalesChart"> &
  Pick<PortfolioMethodState, "initPortfolioChart"> &
  Pick<AppVueContext, "$nextTick">;

export type TabWatchContext = WorkspaceRealtimeContext &
  SalesFreshnessContext &
  SalesChartRefreshContext &
  PortfolioSalesHydrationContext &
  Pick<
    AppState,
    | "portfolioChart"
    | "portfolioSalesByUserChart"
    | "salesChart"
    | "speedDialOpenSales"
  >;

export type TabSalesFreshnessContext = SalesFreshnessContext & Pick<AppState, "currentTab">;

export type CommerceConfigWatchContext = Pick<
  AppState,
  | "boxPriceCost"
  | "costInputMode"
  | "isHydratingLotConfig"
  | "purchaseUiMode"
> & Pick<CommerceMethodState, "onPurchaseConfigChange">;

export type AuthWatchContext = WorkspaceRealtimeContext &
  SalesFreshnessContext &
  LivePricingHydrationContext &
  WhatnotTransientStateContext &
  BuyerProfileCacheContext &
  Pick<
    AppState,
    | "availableWorkspaces"
    | "isAuthSessionResolving"
    | "pendingWorkspaceInviteToken"
    | "showWorkspaceMembersModal"
    | "workspaceMembers"
  > &
  Pick<AuthComputedState, "isGoogleSignedIn"> &
  Pick<AuthMethodState, "renderGoogleSignInButton"> &
  Pick<BuyerMethodState, "hydrateBuyerProfiles" | "retryPendingBuyerProfiles"> &
  Pick<RuntimeMethodState, "notify"> &
  Pick<OnboardingMethodState, "stopGuidedOnboarding" | "syncGuidedOnboarding"> &
  Pick<SyncMethodState, "startCloudSyncScheduler" | "stopCloudSyncScheduler"> &
  Pick<WorkspaceMethodState, "previewPendingWorkspaceInvite" | "refreshWorkspaces"> &
  Pick<WhatnotMethodState, "refreshWhatnotStatus"> &
  Pick<AppVueContext, "$nextTick">;

export type CurrentLotWatchContext = WorkspaceRealtimeContext &
  SalesFreshnessContext &
  LivePricingHydrationContext &
  Pick<AppState, "currentTab" | "salesChart"> &
  Pick<CommerceMethodState, "clearLiveSinglesSelection">;

export type PortfolioWatchContext = Pick<
  AppState,
  | "currentTab"
  | "portfolioChartView"
  | "portfolioDashboardPreset"
  | "portfolioLotFilterIds"
  | "portfolioLotTypeFilter"
  | "portfolioSalesByUserMetric"
> &
  Pick<PortfolioMethodState, "initPortfolioChart"> &
  Pick<AppVueContext, "$nextTick">;

export type SalesWatchContext = Pick<AppState, "currentTab" | "sales"> &
  Pick<CommerceMethodState, "initSalesChart" | "saveSalesToStorage"> &
  Pick<PortfolioMethodState, "initPortfolioChart"> &
  Pick<AppVueContext, "$nextTick">;

export type GameWatchContext = Pick<
  AppState,
  | "activeWheelConfigId"
  | "wheelConfigs"
> & Pick<GameMethodState, "saveWheelConfigsToStorage">;

export interface AppWatchObject {
  activeScopeType(this: ScopeWatchContext, newValue: WorkspaceScopeType): void;
  activeWorkspaceId(this: ScopeWatchContext, newValue: string | null): void;
  preferredLanguage(this: LanguageWatchContext, newValue: string): void;
  currentTab(this: TabWatchContext, newTab: AppTab): void;
  purchaseUiMode(this: CommerceConfigWatchContext, newMode: "simple" | "expert"): void;
  boxesPurchased(this: CommerceConfigWatchContext, newValue: number, oldValue: number): void;
  googleAuthEpoch(this: AuthWatchContext): void;
  currentLotId(this: CurrentLotWatchContext, newVal: number | null): void;
  chartView(this: SalesChartRefreshContext): void;
  portfolioChartView(this: PortfolioWatchContext): void;
  portfolioSalesByUserMetric(this: PortfolioWatchContext, newValue: PortfolioSalesByUserMetric): void;
  portfolioLotTypeFilter(this: PortfolioWatchContext, newValue: PortfolioLotTypeFilter): void;
  portfolioDashboardPreset(this: PortfolioWatchContext, newValue: PortfolioDashboardPreset): void;
  portfolioLotFilterIds: { handler(this: PortfolioWatchContext): void; deep: true };
  sales: { handler(this: SalesWatchContext): void; deep: true };
  wheelConfigs: { handler(this: GameWatchContext): void; deep: true };
}
