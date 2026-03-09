import {
  fetchWithRetry,
  getEntitlementTtlMs,
  GOOGLE_TOKEN_KEY,
  handleExpiredAuth,
  readEntitlementCache,
  resolveApiBaseUrl,
  type EntitlementApiResponse
} from "./shared.ts";
import { type UiEntitlementMethodSubset } from "./entitlements-shared.ts";
import {
  applyCachedEntitlement,
  applyFetchedEntitlement,
  parseEntitlementPayload,
  shouldUseCachedEntitlement
} from "./entitlements-status-service.ts";

export const uiEntitlementStatusMethods: UiEntitlementMethodSubset<"debugLogEntitlement"> = {
  async debugLogEntitlement(forceRefresh = false): Promise<void> {
    const base = resolveApiBaseUrl();
    if (!base) {
      console.info("[whatfees] Entitlement sync skipped: VITE_API_BASE_URL is not set.");
      return;
    }
    const googleIdToken = (localStorage.getItem(GOOGLE_TOKEN_KEY) || "").trim();

    const cached = readEntitlementCache();
    const ttlMs = getEntitlementTtlMs();
    const shouldUseCache = !!cached && shouldUseCachedEntitlement({
      cachedAt: cached.cachedAt,
      googleIdToken,
      forceRefresh,
      ttlMs
    });
    if (shouldUseCache && cached) {
      applyCachedEntitlement(this, {
        userId: cached.userId,
        hasProAccess: cached.hasProAccess,
        updatedAt: cached.updatedAt
      });
      console.info("[whatfees] Entitlement cache hit", {
        userId: cached.userId,
        hasProAccess: cached.hasProAccess,
        updatedAt: cached.updatedAt
      });
      await this.pullCloudSync();
      return;
    }

    try {
      const headers: Record<string, string> = {};
      if (googleIdToken) {
        headers.Authorization = `Bearer ${googleIdToken}`;
      }
      const response = await fetchWithRetry(`${base}/entitlements/me`, {
        headers
      });

      if (response.status === 401) {
        handleExpiredAuth(this);
        this.notify("Your sign-in expired. Please sign in again.", "warning");
        return;
      }

      if (!response.ok) {
        console.warn("[whatfees] Entitlement debug fetch failed", {
          status: response.status,
          statusText: response.statusText
        });
        return;
      }

      const data = (await response.json()) as EntitlementApiResponse;
      const entitlementPayload = parseEntitlementPayload(data);
      applyFetchedEntitlement(this, entitlementPayload);

      console.log("[whatfees] Entitlement sync", {
        userId: entitlementPayload.userId,
        hasProAccess: entitlementPayload.hasProAccess,
        updatedAt: entitlementPayload.updatedAt
      });

      await this.pullCloudSync();
    } catch (error) {
      if (!navigator.onLine) {
        this.isOffline = true;
        this.startOfflineReconnectScheduler();
      }
      console.warn("[whatfees] Entitlement sync error", error);
    }
  }
};
