import type { AppContext, AppMethodState } from "../context.ts";
import { uiBaseMethods } from "./ui/base.ts";
import { uiEntitlementMethods } from "./ui/entitlements.ts";
import { uiSyncMethods } from "./ui/sync.ts";

export const uiMethods: ThisType<AppContext> & Pick<
  AppMethodState,
  | "toggleTheme"
  | "notify"
  | "askConfirmation"
  | "runConfirmAction"
  | "cancelConfirmAction"
  | "formatCurrency"
  | "safeFixed"
  | "toggleChartView"
  | "togglePortfolioChartView"
  | "togglePortfolioReportLot"
  | "accessProFeature"
  | "requestPurchaseUiMode"
  | "calculateSaleProfit"
  | "getSaleColor"
  | "getSaleIcon"
  | "formatDate"
  | "initGoogleAutoLogin"
  | "promptGoogleSignIn"
  | "openVerifyPurchaseModal"
  | "startProPurchase"
  | "verifyProPurchase"
  | "closeStripeCheckoutModal"
  | "startPlayPurchase"
  | "verifyPlayPurchase"
  | "pullCloudSync"
  | "startCloudSyncScheduler"
  | "stopCloudSyncScheduler"
  | "pushCloudSync"
  | "debugLogEntitlement"
> = {
  ...uiBaseMethods,
  ...uiEntitlementMethods,
  ...uiSyncMethods
};
