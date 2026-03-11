import {
  syncEntitlementStatus
} from "./entitlements-status-service.ts";
import { type UiEntitlementMethodSubset } from "./entitlements-shared.ts";

export const uiEntitlementStatusMethods: UiEntitlementMethodSubset<"debugLogEntitlement"> = {
  async debugLogEntitlement(forceRefresh = false): Promise<void> {
    await syncEntitlementStatus(this, forceRefresh);
  }
};
