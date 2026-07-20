import type { AuthMethodState } from "../../../context/auth.ts";
import type {
  EntitlementMethodState,
  EntitlementSignInContext
} from "../../../context/entitlements.ts";
import type { FeatureMethodImplementation } from "../../../context/runtime.ts";
import {
  initGoogleAutoLoginFlow,
  openVerifyPurchaseModalFlow,
  promptGoogleSignInFlow,
  renderGoogleSignInButtonFlow
} from "./entitlements-signin-service.ts";

export const uiEntitlementSignInMethods = {
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
} satisfies FeatureMethodImplementation<
  EntitlementSignInContext,
  Pick<AuthMethodState, "initGoogleAutoLogin" | "renderGoogleSignInButton" | "promptGoogleSignIn"> &
    Pick<EntitlementMethodState, "openVerifyPurchaseModal">
>;
