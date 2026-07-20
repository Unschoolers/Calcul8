import type {
  EntitlementMethodState,
  ProFeatureAccessContext
} from "../../../context/entitlements.ts";
import type { FeatureMethodImplementation } from "../../../context/runtime.ts";

export const uiEntitlementAccessMethods = {
  async accessProFeature(target): Promise<void> {
    if (!this.hasProAccess) {
      await this.startProPurchase();
      return;
    }

    if (target === "autoCalculate") {
      this.showProfitCalculator = true;
      return;
    }

    if (target === "portfolioReport") {
      this.openPortfolioReportModal();
      return;
    }

    if (target === "salesTracking") {
      this.speedDialOpenSales = true;
      return;
    }

    this.purchaseUiMode = "expert";
  },

  async requestPurchaseUiMode(mode): Promise<void> {
    if (mode === "simple" || this.hasProAccess) {
      this.purchaseUiMode = mode;
      return;
    }
    await this.accessProFeature("expertMode");
  }
} satisfies FeatureMethodImplementation<
  ProFeatureAccessContext,
  Pick<EntitlementMethodState, "accessProFeature" | "requestPurchaseUiMode">
>;
