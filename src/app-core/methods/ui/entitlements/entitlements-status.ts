import type {
  EntitlementMethodState,
  EntitlementStatusContext
} from "../../../context/entitlements.ts";
import type { FeatureMethodImplementation } from "../../../context/runtime.ts";
import {
  syncEntitlementStatus
} from "./entitlements-status-service.ts";

export const uiEntitlementStatusMethods = {
  async debugLogEntitlement(forceRefresh = false): Promise<void> {
    await syncEntitlementStatus(this, forceRefresh);
  }
} satisfies FeatureMethodImplementation<
  EntitlementStatusContext,
  Pick<EntitlementMethodState, "debugLogEntitlement">
>;
