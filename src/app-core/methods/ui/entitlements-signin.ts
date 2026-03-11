import {
  initGoogleAutoLoginFlow,
  openVerifyPurchaseModalFlow,
  promptGoogleSignInFlow
} from "./entitlements-signin-service.ts";
import { type UiEntitlementMethodSubset } from "./entitlements-shared.ts";

export const uiEntitlementSignInMethods: UiEntitlementMethodSubset<
  "initGoogleAutoLogin" | "promptGoogleSignIn" | "openVerifyPurchaseModal"
> = {
  initGoogleAutoLogin(): void {
    initGoogleAutoLoginFlow(this);
  },

  promptGoogleSignIn(): void {
    promptGoogleSignInFlow(this);
  },

  openVerifyPurchaseModal(): void {
    openVerifyPurchaseModalFlow(this);
  }
};
