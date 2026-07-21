import type { AppState } from "../../types/app.ts";
import type { AuthComputedState, AuthMethodState } from "./auth.ts";
import type { BuyerMethodState } from "./buyers.ts";
import type {
  CommerceMethodState,
  LivePricingHydrationContext,
  SalesFreshnessContext
} from "./commerce.ts";
import type {
  EntitlementMethodState,
  EntitlementUiContext,
  StripeCheckoutContext
} from "./entitlements.ts";
import type { GameMethodState } from "./game.ts";
import type { AppVueContext, RuntimeMethodState } from "./runtime.ts";
import type { OnboardingMethodState, PwaMethodState } from "./shell.ts";
import type { SyncMethodState } from "./sync.ts";
import type { WhatnotMethodState } from "./whatnot.ts";
import type { WorkspaceRealtimeContext } from "./workspace.ts";

export type ForegroundSalesContext = SalesFreshnessContext;
export type ForegroundLivePricingContext = LivePricingHydrationContext;

export type AppMountContext = WorkspaceRealtimeContext &
  EntitlementUiContext &
  ForegroundSalesContext &
  ForegroundLivePricingContext &
  Pick<
    AppState,
    | "currentTab"
    | "documentVisibilityListener"
    | "isAuthSessionResolving"
    | "lastSyncedPayloadHash"
    | "lots"
    | "pendingWorkspaceInviteToken"
    | "portfolioDashboardPreset"
    | "portfolioLotFilterIds"
    | "portfolioLotTypeFilter"
    | "whatnotCallbackMessage"
    | "whatnotCallbackStatus"
    | "windowFocusListener"
  > &
  Pick<AuthComputedState, "isGoogleSignedIn"> &
  Pick<AuthMethodState, "initGoogleAutoLogin" | "renderGoogleSignInButton"> &
  Pick<BuyerMethodState, "hydrateBuyerProfiles"> &
  Pick<
    CommerceMethodState,
    | "loadLot"
    | "loadLotsFromStorage"
    | "loadSalesFromStorage"
    | "syncLivePricesFromDefaults"
  > &
  Pick<EntitlementMethodState, "debugLogEntitlement"> &
  Pick<GameMethodState, "loadWheelFromStorage"> &
  Pick<RuntimeMethodState, "getExchangeRate"> &
  OnboardingMethodState &
  PwaMethodState &
  Pick<SyncMethodState, "startCloudSyncScheduler"> &
  Pick<WhatnotMethodState, "refreshWhatnotStatus"> &
  Pick<AppVueContext, "$nextTick" | "$vuetify">;

export type AppUnmountContext = WorkspaceRealtimeContext &
  StripeCheckoutContext &
  Pick<
    AppState,
    | "appInstalledListener"
    | "beforeInstallPromptListener"
    | "documentVisibilityListener"
    | "hasPwaUiHandlersBound"
    | "hasRegisteredServiceWorkerLifecycle"
    | "offlineListener"
    | "onlineListener"
    | "portfolioChart"
    | "salesChart"
    | "serviceWorkerControllerChangeListener"
    | "serviceWorkerLoadListener"
    | "serviceWorkerUpdateIntervalId"
    | "syncStatusResetTimeoutId"
    | "windowFocusListener"
  > &
  Pick<OnboardingMethodState, "stopGuidedOnboarding"> &
  Pick<RuntimeMethodState, "stopOfflineReconnectScheduler"> &
  Pick<SyncMethodState, "stopCloudSyncScheduler">;

export interface AppLifecycleObject {
  mounted(this: AppMountContext): void;
  beforeUnmount(this: AppUnmountContext): void;
}
