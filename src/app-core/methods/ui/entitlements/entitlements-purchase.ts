import type {
  EntitlementMethodState,
  PurchaseRoutingContext
} from "../../../context/entitlements.ts";
import type { FeatureMethodImplementation } from "../../../context/runtime.ts";
import {
  closeStripeCheckoutFlow,
  startPlayPurchaseFlow,
  startProPurchaseFlow,
  verifyPlayPurchaseFlow,
  verifyProPurchaseFlow
} from "./entitlements-purchase-service.ts";

export const uiEntitlementPurchaseMethods = {
  async startProPurchase(): Promise<void> {
    await startProPurchaseFlow(this);
  },

  async verifyProPurchase(): Promise<void> {
    await verifyProPurchaseFlow(this);
  },

  async closeStripeCheckoutModal(): Promise<void> {
    await closeStripeCheckoutFlow(this);
  },

  async startPlayPurchase(): Promise<void> {
    await startPlayPurchaseFlow(this);
  },

  async verifyPlayPurchase(): Promise<void> {
    await verifyPlayPurchaseFlow(this);
  }
} satisfies FeatureMethodImplementation<
  PurchaseRoutingContext,
  Pick<
    EntitlementMethodState,
    | "startProPurchase"
    | "verifyProPurchase"
    | "closeStripeCheckoutModal"
    | "startPlayPurchase"
    | "verifyPlayPurchase"
  >
>;
