import type { AuthSessionContext } from "../../../context/auth.ts";
import type {
  EntitlementStatusContext,
  TargetProfitAccessContext
} from "../../../context/entitlements.ts";
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
import {
  bootstrapServerSessionStatus,
  type ServerSessionBootstrapResult
} from "../auth/auth-session.ts";

interface ParsedEntitlementPayload {
  userId: string | null;
  hasProAccess: boolean;
  updatedAt: string | null;
}

type EntitlementStatusDeps = {
  resolveApiBaseUrl: () => string;
  getGoogleIdToken: () => string;
  hasAuthSignal: () => boolean;
  readEntitlementCache: typeof readEntitlementCache;
  getEntitlementTtlMs: typeof getEntitlementTtlMs;
  fetchWithRetry: typeof fetchWithRetry;
  bootstrapServerSession: (
    app: AuthSessionContext,
    baseUrl: string
  ) => Promise<boolean | ServerSessionBootstrapResult>;
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

export function applyCachedEntitlement(app: TargetProfitAccessContext, payload: ParsedEntitlementPayload): void {
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

export function applyFetchedEntitlement(app: TargetProfitAccessContext, payload: ParsedEntitlementPayload): void {
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
  bootstrapServerSession: bootstrapServerSessionStatus,
  hasServerSession: () => hasServerSession(),
  shouldUseCachedEntitlement,
  applyCachedEntitlement,
  parseEntitlementPayload,
  applyFetchedEntitlement,
  handleExpiredAuth,
  isOnline: () => navigator.onLine
};

function markAuthSessionResolved(app: Pick<EntitlementStatusContext, "isAuthSessionResolving">): void {
  app.isAuthSessionResolving = false;
}

function normalizeBootstrapResult(result: boolean | ServerSessionBootstrapResult): ServerSessionBootstrapResult {
  return typeof result === "boolean" ? { ok: result, authExpired: false } : result;
}

export async function syncEntitlementStatus(
  app: EntitlementStatusContext,
  forceRefresh = false,
  deps: Partial<EntitlementStatusDeps> = {}
): Promise<void> {
  const resolvedDeps = { ...defaultDeps, ...deps } satisfies EntitlementStatusDeps;
  try {
    const base = resolvedDeps.resolveApiBaseUrl();
    if (!base) {
      console.info("[whatfees] Entitlement sync skipped: VITE_API_BASE_URL is not set.");
      return;
    }

    const hasAnyAuthSignal = resolvedDeps.hasAuthSignal();
    let hasActiveServerSession = resolvedDeps.hasServerSession();
    let bootstrapAuthExpired = false;
    if (!hasActiveServerSession) {
      const bootstrapResult = normalizeBootstrapResult(
        await resolvedDeps.bootstrapServerSession(app, base)
      );
      hasActiveServerSession = bootstrapResult.ok;
      bootstrapAuthExpired = bootstrapResult.authExpired;
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
      if (bootstrapAuthExpired || (hasAnyAuthSignal && !googleIdToken)) {
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
  } finally {
    markAuthSessionResolved(app);
  }
}

