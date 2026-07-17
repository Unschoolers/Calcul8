import type { AppMethodImplementation } from "../../../context-app.ts";
import {
  syncEntitlementStatus
} from "./entitlements-status-service.ts";

export const uiEntitlementStatusMethods = {
  async debugLogEntitlement(forceRefresh = false): Promise<void> {
    await syncEntitlementStatus(this, forceRefresh);
  }
} satisfies AppMethodImplementation;
