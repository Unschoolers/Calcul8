import type { AppState } from "../../types/app.ts";
import type { AuthComputedState } from "./auth.ts";
import type { BuyerMethodState } from "./buyers.ts";
import type { CommerceComputedState, CommerceMethodState } from "./commerce.ts";
import type { EntitlementMethodState } from "./entitlements.ts";
import type { PortfolioMethodState } from "./portfolio.ts";
import type {
  AppVueContext,
  FeatureMethodImplementation,
  RuntimeComputedState,
  RuntimeMethodState
} from "./runtime.ts";
import type { SyncMethodState } from "./sync.ts";

export type BaseUiMethodState = Pick<
  RuntimeMethodState,
  | "t"
  | "setPreferredLanguage"
  | "toggleTheme"
  | "notify"
  | "askConfirmation"
  | "runConfirmAction"
  | "cancelConfirmAction"
  | "formatCurrency"
  | "safeFixed"
> &
  Pick<
    CommerceMethodState,
    | "toggleChartView"
    | "calculateSaleProfit"
    | "getSaleProfitPreview"
    | "getSaleColor"
    | "getSaleIcon"
    | "formatDate"
  > &
  Pick<PortfolioMethodState, "togglePortfolioChartView" | "togglePortfolioReportLot">;

export type BaseUiContext = Pick<
  AppState,
  | "additionalFeeAppliesTo"
  | "additionalFeePercent"
  | "chartView"
  | "confirmAction"
  | "confirmColor"
  | "confirmDialog"
  | "confirmText"
  | "confirmTitle"
  | "currency"
  | "exchangeRate"
  | "fixedFeePerOrder"
  | "platformFeePercent"
  | "portfolioChartView"
  | "portfolioReportExpandedLotIds"
  | "preferredLanguage"
  | "sellingCurrency"
  | "sellingTaxPercent"
  | "singlesPurchases"
  | "snackbar"
> &
  Pick<RuntimeComputedState, "isDark"> &
  Pick<CommerceComputedState, "currentLotType" | "totalCaseCost" | "totalPacks"> &
  Pick<RuntimeMethodState, "formatCurrency"> &
  Pick<AppVueContext, "$vuetify">;

export type BaseUiMethodImplementation = FeatureMethodImplementation<
  BaseUiContext,
  BaseUiMethodState
>;

export type OnboardingMethodState = Pick<
  RuntimeMethodState,
  | "syncGuidedOnboarding"
  | "startGuidedOnboarding"
  | "dismissGuidedOnboarding"
  | "stopGuidedOnboarding"
  | "handleGuidedOnboardingLotCreated"
>;

export type OnboardingContext = Pick<
  AppState,
  | "activeScopeType"
  | "currentTab"
  | "guidedOnboardingLotType"
  | "guidedOnboardingStatus"
  | "guidedOnboardingTargetLotId"
  | "lots"
  | "newLotType"
  | "showNewLotModal"
> &
  Pick<AuthComputedState, "isGoogleSignedIn"> &
  Pick<RuntimeMethodState, "t" | "syncGuidedOnboarding" | "dismissGuidedOnboarding"> &
  Pick<AppVueContext, "$nextTick">;

export type OnboardingMethodImplementation = FeatureMethodImplementation<
  OnboardingContext,
  OnboardingMethodState
>;

export type PwaMethodState = Pick<
  RuntimeMethodState,
  | "setupPwaUiHandlers"
  | "startOfflineReconnectScheduler"
  | "stopOfflineReconnectScheduler"
  | "promptInstall"
  | "applyAppUpdate"
  | "dismissAppUpdate"
  | "unregisterServiceWorkersForDev"
  | "registerServiceWorker"
>;

export type PwaContext = Pick<
  AppState,
  | "appInstalledListener"
  | "appUpdateWorker"
  | "beforeInstallPromptListener"
  | "deferredInstallPrompt"
  | "hasPwaUiHandlersBound"
  | "hasRegisteredServiceWorkerLifecycle"
  | "isApplyingAppUpdate"
  | "isOffline"
  | "offlineListener"
  | "offlineReconnectIntervalId"
  | "onlineListener"
  | "serviceWorkerControllerChangeListener"
  | "serviceWorkerLoadListener"
  | "serviceWorkerUpdateIntervalId"
  | "showAppUpdatePrompt"
  | "showInstallPrompt"
> &
  Pick<AuthComputedState, "isGoogleSignedIn"> &
  Pick<BuyerMethodState, "retryPendingBuyerProfiles"> &
  Pick<EntitlementMethodState, "debugLogEntitlement"> &
  Pick<SyncMethodState, "pushCloudSync"> &
  Pick<RuntimeMethodState, "notify" | "startOfflineReconnectScheduler" | "stopOfflineReconnectScheduler">;

export type PwaMethodImplementation = FeatureMethodImplementation<
  PwaContext,
  PwaMethodState
>;
