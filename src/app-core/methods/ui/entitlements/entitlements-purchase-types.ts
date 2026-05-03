import type { AppContext } from "../../../context-app.ts";
import type {
  StripePurchaseApp,
  StripeVerificationApp
} from "./entitlements-stripe.ts";

export type PurchaseRoutingApp = Pick<AppContext, "notify">
  & PlayPurchaseApp
  & StripePurchaseApp
  & StripeVerificationApp;

export type PlayPurchaseApp = Pick<
  AppContext,
  | "isVerifyingPurchase"
  | "hasProAccess"
  | "googleAuthEpoch"
  | "purchaseTokenInput"
  | "purchaseProductIdInput"
  | "purchasePackageNameInput"
  | "showVerifyPurchaseModal"
  | "notify"
  | "debugLogEntitlement"
>;

export type PurchaseProvider = "auto" | "play" | "stripe" | string;
