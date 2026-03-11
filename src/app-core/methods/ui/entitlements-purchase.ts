import {
  closeStripeCheckoutFlow,
  startPlayPurchaseFlow,
  startProPurchaseFlow,
  verifyPlayPurchaseFlow,
  verifyProPurchaseFlow
} from "./entitlements-purchase-service.ts";
import { type UiEntitlementMethodSubset } from "./entitlements-shared.ts";

export const uiEntitlementPurchaseMethods: UiEntitlementMethodSubset<
  "startProPurchase" | "verifyProPurchase" | "closeStripeCheckoutModal" | "startPlayPurchase" | "verifyPlayPurchase"
> = {
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
};
