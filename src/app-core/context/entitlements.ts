import type { AppState } from "../../types/app.ts";
import type { AuthSessionContext } from "./auth.ts";
import type { CommerceComputedState, CommerceMethodState } from "./commerce.ts";
import type { PortfolioMethodState } from "./portfolio.ts";
import type {
  AppVueContext,
  RuntimeComputedState,
  RuntimeMethodState
} from "./runtime.ts";
import type { SyncMethodState } from "./sync.ts";

export interface EntitlementMethodState {
  accessProFeature(target: "autoCalculate" | "portfolioReport" | "salesTracking" | "expertMode"): Promise<void>;
  requestPurchaseUiMode(mode: "simple" | "expert"): Promise<void>;
  openVerifyPurchaseModal(): void;
  startProPurchase(): Promise<void>;
  verifyProPurchase(): Promise<void>;
  closeStripeCheckoutModal(): Promise<void>;
  startPlayPurchase(): Promise<void>;
  verifyPlayPurchase(): Promise<void>;
  debugLogEntitlement(forceRefresh?: boolean): Promise<void>;
}

export type EntitlementMutationContext = Pick<AppState, "hasProAccess">;

export type AuthEntitlementSessionContext = AuthSessionContext &
  EntitlementMutationContext;

export type TargetProfitAccessContext = Pick<
  AppState,
  "hasProAccess" | "targetProfitPercent"
> &
  Pick<CommerceComputedState, "hasLotSelected"> &
  Pick<CommerceMethodState, "autoSaveSetup">;

export type EntitlementStateContext = EntitlementMutationContext &
  Partial<TargetProfitAccessContext>;

export type EntitlementSignInContext = Pick<
  AppState,
  | "hasProAccess"
  | "isAuthSessionResolving"
  | "preferredLanguage"
  | "showGoogleSignInFallback"
  | "showNativeGoogleSignInAction"
  | "showManualPurchaseVerify"
  | "showVerifyPurchaseModal"
  | "googleAuthEpoch"
  | "googleAvatarLoadFailed"
  | "targetProfitPercent"
> &
  Pick<RuntimeComputedState, "isDark"> &
  Pick<CommerceComputedState, "hasLotSelected"> &
  Pick<CommerceMethodState, "autoSaveSetup"> &
  Pick<RuntimeMethodState, "notify"> &
  Pick<EntitlementMethodState, "debugLogEntitlement">;

export type VerifyPurchaseModalContext = Pick<
  AppState,
  "showManualPurchaseVerify" | "showVerifyPurchaseModal"
> & Pick<RuntimeMethodState, "notify">;

export type ProFeatureAccessContext = Pick<
  AppState,
  | "hasProAccess"
  | "purchaseUiMode"
  | "showProfitCalculator"
  | "speedDialOpenSales"
> &
  Pick<EntitlementMethodState, "accessProFeature" | "startProPurchase"> &
  Pick<PortfolioMethodState, "openPortfolioReportModal">;

export type EntitlementStatusContext = Pick<
  AppState,
  "googleAuthEpoch" | "hasProAccess" | "isAuthSessionResolving" | "isOffline"
> &
  TargetProfitAccessContext &
  Pick<RuntimeMethodState, "notify" | "startOfflineReconnectScheduler"> &
  Pick<SyncMethodState, "pullCloudSync">;

export type PurchaseVerificationContext = AuthEntitlementSessionContext &
  Pick<RuntimeMethodState, "notify"> &
  Pick<EntitlementMethodState, "debugLogEntitlement">;

export type PlayPurchaseContext = Pick<
  AppState,
  | "isVerifyingPurchase"
  | "hasProAccess"
  | "googleAuthEpoch"
  | "purchaseTokenInput"
  | "purchaseProductIdInput"
  | "purchasePackageNameInput"
  | "showVerifyPurchaseModal"
> &
  Pick<RuntimeMethodState, "notify"> &
  Pick<EntitlementMethodState, "debugLogEntitlement">;

export type StripeVerificationContext = EntitlementMutationContext &
  Pick<RuntimeMethodState, "notify"> &
  Pick<EntitlementMethodState, "debugLogEntitlement">;

export type StripeCheckoutContext = Pick<
  AppState,
  "showStripeCheckoutModal" | "stripeCheckoutClientSecret"
> & Pick<RuntimeMethodState, "notify">;

export type StripePurchaseContext = StripeVerificationContext &
  StripeCheckoutContext &
  Pick<AppState, "isVerifyingPurchase" | "googleAuthEpoch"> &
  Pick<AppVueContext, "$nextTick">;

export type PurchaseRoutingContext = PlayPurchaseContext &
  StripePurchaseContext &
  StripeVerificationContext;

/** Composition context for the identity bootstrap and entitlement UI method group. */
export type EntitlementUiContext = EntitlementSignInContext &
  EntitlementStatusContext &
  PurchaseRoutingContext &
  ProFeatureAccessContext;
