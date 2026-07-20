import type { AppState } from "../../types/app.ts";

export interface AuthComputedState {
  isGoogleSignedIn: boolean;
  googleProfileUserId: string;
  googleProfileName: string;
  googleProfileEmail: string;
  googleProfilePicture: string;
}

export type AuthProfileContext = Pick<AppState, "googleAuthEpoch">;

export type AuthProfileComputedObject = {
  isGoogleSignedIn(this: AuthProfileContext): AuthComputedState["isGoogleSignedIn"];
  googleProfileUserId(this: AuthProfileContext): AuthComputedState["googleProfileUserId"];
  googleProfileName(this: AuthProfileContext): AuthComputedState["googleProfileName"];
  googleProfileEmail(this: AuthProfileContext): AuthComputedState["googleProfileEmail"];
  googleProfilePicture(this: AuthProfileContext): AuthComputedState["googleProfilePicture"];
};

export interface AuthMethodState {
  accessProFeature(target: "autoCalculate" | "portfolioReport" | "salesTracking" | "expertMode"): Promise<void>;
  requestPurchaseUiMode(mode: "simple" | "expert"): Promise<void>;
  initGoogleAutoLogin(): void;
  renderGoogleSignInButton(): void;
  promptGoogleSignIn(): void;
  openVerifyPurchaseModal(): void;
  startProPurchase(): Promise<void>;
  verifyProPurchase(): Promise<void>;
  closeStripeCheckoutModal(): Promise<void>;
  startPlayPurchase(): Promise<void>;
  verifyPlayPurchase(): Promise<void>;
  debugLogEntitlement(forceRefresh?: boolean): Promise<void>;
  logoutCurrentSession(): Promise<void>;
  clearPersonalAccountData(): Promise<void>;
}
