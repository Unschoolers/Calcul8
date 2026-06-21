import type { AppContext } from "../../../context-app.ts";
import {
  applyEntitlementState,
  type EntitlementApiResponse,
  fetchWithRetry,
  getEntitlementTtlMs,
  handleExpiredAuth,
  readEntitlementCache,
  resolveApiBaseUrl
} from "../common/shared.ts";
import {
  buildAuthenticatedHeaders,
  getStoredGoogleIdToken,
  hasAuthSignal,
  hasServerSession
} from "../../../auth/index.ts";
import { type TargetProfitAccessApp } from "./entitlements-shared.ts";
import { bootstrapServerSession } from "../auth/auth-session.ts";

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
  hasAuthSignal: () => boolean;
  readEntitlementCache: typeof readEntitlementCache;
  getEntitlementTtlMs: typeof getEntitlementTtlMs;
  fetchWithRetry: typeof fetchWithRetry;
  bootstrapServerSession: (app: Pick<EntitlementStatusApp, "googleAuthEpoch">, baseUrl: string) => Promise<boolean>;
  hasServerSession: () => boolean;
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
  applyEntitlementState(app, payload, {
    persistSessionUserId: false,
    writeCache: false
  });
}

export function parseEntitlementPayload(data: EntitlementApiResponse): ParsedEntitlementPayload {
  return {
    userId: typeof data.userId === "string" ? data.userId : null,
    hasProAccess: Boolean(data.hasProAccess),
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null
  };
}

export function applyFetchedEntitlement(app: EntitlementMutationApp, payload: ParsedEntitlementPayload): void {
  applyEntitlementState(app, payload, {
    cacheAt: Date.now(),
    persistSessionUserId: true,
    writeCache: true
  });
}

const defaultDeps: EntitlementStatusDeps = {
  resolveApiBaseUrl,
  getGoogleIdToken: () => getStoredGoogleIdToken(),
  hasAuthSignal: () => hasAuthSignal(),
  readEntitlementCache,
  getEntitlementTtlMs,
  fetchWithRetry,
  bootstrapServerSession,
  hasServerSession: () => hasServerSession(),
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

  const hasAnyAuthSignal = resolvedDeps.hasAuthSignal();
  let hasActiveServerSession = resolvedDeps.hasServerSession();
  if (!hasActiveServerSession) {
    hasActiveServerSession = await resolvedDeps.bootstrapServerSession(app, base);
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
    if (!hasActiveServerSession) {
      console.info("[whatfees] Entitlement sync skipped: no active auth session.");
      return;
    }
    console.info("[whatfees] Entitlement cache hit", {
      userId: cached.userId,
      hasProAccess: cached.hasProAccess,
      updatedAt: cached.updatedAt
    });
    await app.pullCloudSync();
    return;
  }

  if (!hasActiveServerSession) {
    if (hasAnyAuthSignal) {
      resolvedDeps.handleExpiredAuth(app);
      app.notify("Your sign-in expired. Please sign in again.", "warning");
      return;
    }
    console.info("[whatfees] Entitlement sync skipped: no active auth session.");
    return;
  }

  try {
    const requestUrl = `${base}/entitlements/me`;
    const response = await resolvedDeps.fetchWithRetry(requestUrl, {
      headers: buildAuthenticatedHeaders("session-preferred", {}, requestUrl)
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

