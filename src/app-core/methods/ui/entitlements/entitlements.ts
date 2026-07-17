import type { AppMethodImplementation } from "../../../context-app.ts";
import { uiEntitlementPurchaseMethods } from "./entitlements-purchase.ts";
import { uiEntitlementSignInMethods } from "./entitlements-signin.ts";
import { uiEntitlementStatusMethods } from "./entitlements-status.ts";

export const uiEntitlementMethods = {
  ...uiEntitlementSignInMethods,
  ...uiEntitlementPurchaseMethods,
  ...uiEntitlementStatusMethods
} satisfies AppMethodImplementation;
