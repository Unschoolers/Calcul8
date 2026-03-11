import type { AppContext } from "../../context.ts";
import {
  PRO_ACCESS_KEY,
  writeEntitlementCache,
  type EntitlementApiResponse,
  fetchWithRetry,
  getEntitlementTtlMs,
  GOOGLE_TOKEN_KEY,
  handleExpiredAuth,
  readEntitlementCache,
  resolveApiBaseUrl
} from "./shared.ts";
import { applyTargetProfitAccessDefaults, type TargetProfitAccessApp } from "./entitlements-shared.ts";

interface ParsedEntitlementPayload {
  userId: string | null;
  hasProAccess: boolean;
  updatedAt: string | null;
}

export type EntitlementMutationApp = Pick<AppContext, "hasProAccess"> & TargetProfitAccessApp;
export type EntitlementStatusApp = Pick<
  AppContext,
  "googleAuthEpoch" | "hasProAccess" | "isOffline" | "pullCloudSync" | "notify" | "startOfflineReconnectScheduler"
> & TargetProfitAccessApp;

type EntitlementStatusDeps = {
  resolveApiBaseUrl: () => string;
  getGoogleIdToken: () => string;
  readEntitlementCache: typeof readEntitlementCache;
  getEntitlementTtlMs: typeof getEntitlementTtlMs;
  fetchWithRetry: typeof fetchWithRetry;
  shouldUseCachedEntitlement: typeof shouldUseCachedEntitlement;
  applyCachedEntitlement: typeof applyCachedEntitlement;
  parseEntitlementPayload: typeof parseEntitlementPayload;
  applyFetchedEntitlement: typeof applyFetchedEntitlement;
  handleExpiredAuth: typeof handleExpiredAuth;
  isOnline: () => boolean;
};

export function shouldUseCachedEntitlement(params: {
  cachedAt: number | null;
  googleIdToken: string;
  forceRefresh: boolean;
  ttlMs: number;
}): boolean {
  if (!Number.isFinite(params.cachedAt)) return false;
  if (params.forceRefresh) return false;
  if (!params.googleIdToken) return true;
  return Date.now() - Number(params.cachedAt) < params.ttlMs;
}

export function applyCachedEntitlement(app: EntitlementMutationApp, payload: ParsedEntitlementPayload): void {
  app.hasProAccess = payload.hasProAccess;
  localStorage.setItem(PRO_ACCESS_KEY, payload.hasProAccess ? "1" : "0");
  applyTargetProfitAccessDefaults(app);
}

export function parseEntitlementPayload(data: EntitlementApiResponse): ParsedEntitlementPayload {
  return {
    userId: typeof data.userId === "string" ? data.userId : null,
    hasProAccess: Boolean(data.hasProAccess),
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null
  };
}

export function applyFetchedEntitlement(app: EntitlementMutationApp, payload: ParsedEntitlementPayload): void {
  applyCachedEntitlement(app, payload);
  writeEntitlementCache({
    userId: payload.userId,
    hasProAccess: payload.hasProAccess,
    updatedAt: payload.updatedAt,
    cachedAt: Date.now()
  });
}

const defaultDeps: EntitlementStatusDeps = {
  resolveApiBaseUrl,
  getGoogleIdToken: () => (localStorage.getItem(GOOGLE_TOKEN_KEY) || "").trim(),
  readEntitlementCache,
  getEntitlementTtlMs,
  fetchWithRetry,
  shouldUseCachedEntitlement,
  applyCachedEntitlement,
  parseEntitlementPayload,
  applyFetchedEntitlement,
  handleExpiredAuth,
  isOnline: () => navigator.onLine
};

export async function syncEntitlementStatus(
  app: EntitlementStatusApp,
  forceRefresh = false,
  deps: Partial<EntitlementStatusDeps> = {}
): Promise<void> {
  const resolvedDeps = { ...defaultDeps, ...deps } satisfies EntitlementStatusDeps;
  const base = resolvedDeps.resolveApiBaseUrl();
  if (!base) {
    console.info("[whatfees] Entitlement sync skipped: VITE_API_BASE_URL is not set.");
    return;
  }
  const googleIdToken = resolvedDeps.getGoogleIdToken();

  const cached = resolvedDeps.readEntitlementCache();
  const ttlMs = resolvedDeps.getEntitlementTtlMs();
  const shouldUseCache = !!cached && resolvedDeps.shouldUseCachedEntitlement({
    cachedAt: cached.cachedAt,
    googleIdToken,
    forceRefresh,
    ttlMs
  });
  if (shouldUseCache && cached) {
    resolvedDeps.applyCachedEntitlement(app, {
      userId: cached.userId,
      hasProAccess: cached.hasProAccess,
      updatedAt: cached.updatedAt
    });
    console.info("[whatfees] Entitlement cache hit", {
      userId: cached.userId,
      hasProAccess: cached.hasProAccess,
      updatedAt: cached.updatedAt
    });
    await app.pullCloudSync();
    return;
  }

  try {
    const headers: Record<string, string> = {};
    if (googleIdToken) {
      headers.Authorization = `Bearer ${googleIdToken}`;
    }
    const response = await resolvedDeps.fetchWithRetry(`${base}/entitlements/me`, {
      headers
    });

    if (response.status === 401) {
      resolvedDeps.handleExpiredAuth(app);
      app.notify("Your sign-in expired. Please sign in again.", "warning");
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
    const entitlementPayload = resolvedDeps.parseEntitlementPayload(data);
    resolvedDeps.applyFetchedEntitlement(app, entitlementPayload);

    console.log("[whatfees] Entitlement sync", {
      userId: entitlementPayload.userId,
      hasProAccess: entitlementPayload.hasProAccess,
      updatedAt: entitlementPayload.updatedAt
    });

    await app.pullCloudSync();
  } catch (error) {
    if (!resolvedDeps.isOnline()) {
      app.isOffline = true;
      app.startOfflineReconnectScheduler();
    }
    console.warn("[whatfees] Entitlement sync error", error);
  }
}
