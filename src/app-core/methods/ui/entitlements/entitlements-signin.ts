import {
  initGoogleAutoLoginFlow,
  openVerifyPurchaseModalFlow,
  promptGoogleSignInFlow,
  renderGoogleSignInButtonFlow
} from "./entitlements-signin-service.ts";
import { type UiEntitlementMethodSubset } from "./entitlements-shared.ts";

export const uiEntitlementSignInMethods: UiEntitlementMethodSubset<
  "initGoogleAutoLogin" | "renderGoogleSignInButton" | "promptGoogleSignIn" | "openVerifyPurchaseModal"
> = {
  initGoogleAutoLogin(): void {
    initGoogleAutoLoginFlow(this);
  },

  renderGoogleSignInButton(): void {
    renderGoogleSignInButtonFlow(this);
  },

  promptGoogleSignIn(): void {
    promptGoogleSignInFlow(this);
  },

  openVerifyPurchaseModal(): void {
    openVerifyPurchaseModalFlow(this);
  }
};
