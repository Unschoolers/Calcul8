import type { AppMethodImplementation } from "../../../context-app.ts";
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
} satisfies AppMethodImplementation;
