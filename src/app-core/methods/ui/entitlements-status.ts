import {
  DEBUG_USER_KEY,
  fetchWithRetry,
  getEntitlementTtlMs,
  GOOGLE_TOKEN_KEY,
  handleExpiredAuth,
  PRO_ACCESS_KEY,
  readEntitlementCache,
  resolveApiBaseUrl,
  writeEntitlementCache,
  type EntitlementApiResponse
} from "./shared.ts";
import { applyTargetProfitAccessDefaults, type UiEntitlementMethodSubset } from "./entitlements-shared.ts";

export const uiEntitlementStatusMethods: UiEntitlementMethodSubset<"debugLogEntitlement"> = {
  async debugLogEntitlement(forceRefresh = false): Promise<void> {
    const base = resolveApiBaseUrl();
    if (!base) {
      console.info("[whatfees] Entitlement sync skipped: VITE_API_BASE_URL is not set.");
      return;
    }
    const debugUserId = localStorage.getItem(DEBUG_USER_KEY) || "debug-user";
    const googleIdToken = (localStorage.getItem(GOOGLE_TOKEN_KEY) || "").trim();

    const cached = readEntitlementCache();
    const ttlMs = getEntitlementTtlMs();
    if (!forceRefresh && cached && Date.now() - cached.cachedAt < ttlMs) {
      this.hasProAccess = cached.hasProAccess;
      localStorage.setItem(PRO_ACCESS_KEY, cached.hasProAccess ? "1" : "0");
      applyTargetProfitAccessDefaults(this);
      console.info("[whatfees] Entitlement cache hit", {
        userId: cached.userId,
        hasProAccess: cached.hasProAccess,
        updatedAt: cached.updatedAt
      });
      if (googleIdToken) {
        await this.pullCloudSync();
      }
      return;
    }

    const authHeaders: Record<string, string> = googleIdToken
      ? { Authorization: `Bearer ${googleIdToken}` }
      : { "x-user-id": debugUserId };

    const fallbackHeaders: Record<string, string> = { "x-user-id": debugUserId };

    try {
      let response = await fetchWithRetry(`${base}/entitlements/me`, {
        headers: authHeaders
      });

      if (googleIdToken && response.status === 401) {
        handleExpiredAuth(this);
        response = await fetchWithRetry(`${base}/entitlements/me`, {
          headers: fallbackHeaders
        });
      }

      if (!response.ok) {
        console.warn("[whatfees] Entitlement debug fetch failed", {
          status: response.status,
          statusText: response.statusText
        });
        return;
      }

      const data = (await response.json()) as EntitlementApiResponse;
      const hasProAccess = Boolean(data.hasProAccess);
      const userId = typeof data.userId === "string" ? data.userId : null;
      const updatedAt = typeof data.updatedAt === "string" ? data.updatedAt : null;

      this.hasProAccess = hasProAccess;
      localStorage.setItem(PRO_ACCESS_KEY, hasProAccess ? "1" : "0");
      applyTargetProfitAccessDefaults(this);
      writeEntitlementCache({
        userId,
        hasProAccess,
        updatedAt,
        cachedAt: Date.now()
      });

      console.log("[whatfees] Entitlement sync", {
        userId,
        hasProAccess,
        updatedAt
      });

      if (googleIdToken) {
        await this.pullCloudSync();
      }
    } catch (error) {
      if (!navigator.onLine) {
        this.isOffline = true;
        this.startOfflineReconnectScheduler();
      }
      console.warn("[whatfees] Entitlement sync error", error);
    }
  }
};
