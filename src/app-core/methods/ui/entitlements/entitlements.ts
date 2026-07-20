import type { AuthMethodState } from "../../../context/auth.ts";
import type {
  EntitlementMethodState,
  EntitlementUiContext
} from "../../../context/entitlements.ts";
import type { FeatureMethodImplementation } from "../../../context/runtime.ts";
import { uiEntitlementAccessMethods } from "./entitlements-access.ts";
import { uiEntitlementPurchaseMethods } from "./entitlements-purchase.ts";
import { uiEntitlementSignInMethods } from "./entitlements-signin.ts";
import { uiEntitlementStatusMethods } from "./entitlements-status.ts";

export const uiEntitlementMethods = {
  ...uiEntitlementAccessMethods,
  ...uiEntitlementSignInMethods,
  ...uiEntitlementPurchaseMethods,
  ...uiEntitlementStatusMethods
} satisfies FeatureMethodImplementation<
  EntitlementUiContext,
  Pick<AuthMethodState, "initGoogleAutoLogin" | "renderGoogleSignInButton" | "promptGoogleSignIn"> &
    Pick<
      EntitlementMethodState,
      | "accessProFeature"
      | "requestPurchaseUiMode"
      | "openVerifyPurchaseModal"
      | "startProPurchase"
      | "verifyProPurchase"
      | "closeStripeCheckoutModal"
      | "startPlayPurchase"
      | "verifyPlayPurchase"
      | "debugLogEntitlement"
    >
>;
