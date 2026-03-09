import type { AppContext } from "../../context.ts";
import { PRO_ACCESS_KEY, writeEntitlementCache, type EntitlementApiResponse } from "./shared.ts";
import { applyTargetProfitAccessDefaults } from "./entitlements-shared.ts";

interface ParsedEntitlementPayload {
  userId: string | null;
  hasProAccess: boolean;
  updatedAt: string | null;
}

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

export function applyCachedEntitlement(app: AppContext, payload: ParsedEntitlementPayload): void {
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

export function applyFetchedEntitlement(app: AppContext, payload: ParsedEntitlementPayload): void {
  applyCachedEntitlement(app, payload);
  writeEntitlementCache({
    userId: payload.userId,
    hasProAccess: payload.hasProAccess,
    updatedAt: payload.updatedAt,
    cachedAt: Date.now()
  });
}
