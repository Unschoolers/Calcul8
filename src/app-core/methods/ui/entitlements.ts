import { uiEntitlementPurchaseMethods } from "./entitlements-purchase.ts";
import { type UiEntitlementMethodSubset } from "./entitlements-shared.ts";
import { uiEntitlementSignInMethods } from "./entitlements-signin.ts";
import { uiEntitlementStatusMethods } from "./entitlements-status.ts";

export const uiEntitlementMethods: UiEntitlementMethodSubset<
  | "initGoogleAutoLogin"
  | "promptGoogleSignIn"
  | "openVerifyPurchaseModal"
  | "startProPurchase"
  | "verifyProPurchase"
  | "startPlayPurchase"
  | "verifyPlayPurchase"
  | "debugLogEntitlement"
> = {
  ...uiEntitlementSignInMethods,
  ...uiEntitlementPurchaseMethods,
  ...uiEntitlementStatusMethods
};
