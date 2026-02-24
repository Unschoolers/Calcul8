import {
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
    const googleIdToken = (localStorage.getItem(GOOGLE_TOKEN_KEY) || "").trim();

    const cached = readEntitlementCache();
    const ttlMs = getEntitlementTtlMs();
    const shouldUseCache = !!cached && (
      !googleIdToken ||
      (!forceRefresh && Date.now() - cached.cachedAt < ttlMs)
    );
    if (shouldUseCache && cached) {
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

    if (!googleIdToken) {
      console.info("[whatfees] Entitlement sync skipped: Google sign-in token is missing.");
      return;
    }

    try {
      const response = await fetchWithRetry(`${base}/entitlements/me`, {
        headers: {
          Authorization: `Bearer ${googleIdToken}`
        }
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
