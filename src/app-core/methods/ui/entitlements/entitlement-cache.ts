import {
    GOOGLE_AUTH_PROFILE_CACHE_KEY,
    handleExpiredAuthState
} from "../../../auth/index.ts";
import type { AppContext } from "../../../context-app.ts";
import { removeStorage, STORAGE_KEYS } from "../../../storageKeys.ts";

export interface EntitlementApiResponse {
  userId?: string;
  hasProAccess?: boolean;
  updatedAt?: string | null;
}

interface EntitlementCachePayload {
  userId: string | null;
  hasProAccess: boolean;
  updatedAt: string | null;
  cachedAt: number;
}

export const ENTITLEMENT_CACHE_KEY = STORAGE_KEYS.ENTITLEMENT_CACHE;
export const PRO_ACCESS_KEY = STORAGE_KEYS.PRO_ACCESS;
export const GOOGLE_PROFILE_CACHE_KEY = GOOGLE_AUTH_PROFILE_CACHE_KEY;
export const SYNC_CLIENT_VERSION_KEY = STORAGE_KEYS.SYNC_CLIENT_VERSION;
export const CLOUD_SYNC_INTERVAL_MS = 2 * 1000;
export const SYNC_STATUS_RESET_MS = 2500;
export const GOOGLE_INIT_RETRY_COUNT = 20;
export const GOOGLE_INIT_RETRY_DELAY_MS = 250;

export function getEntitlementTtlMs(): number {
  const raw = (import.meta.env.VITE_ENTITLEMENT_TTL_MINUTES as string | undefined)?.trim() || "";
  const minutes = Number(raw);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return 7 * 24 * 60 * 60 * 1000;
  }
  return minutes * 60 * 1000;
}

export function readEntitlementCache(): { userId: string | null; hasProAccess: boolean; updatedAt: string | null; cachedAt: number } | null {
  const raw = localStorage.getItem(ENTITLEMENT_CACHE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<EntitlementCachePayload>;
    if (typeof parsed.hasProAccess !== "boolean") return null;
    if (!Number.isFinite(parsed.cachedAt)) return null;
    return {
      userId: typeof parsed.userId === "string" ? parsed.userId : null,
      hasProAccess: parsed.hasProAccess,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
      cachedAt: Number(parsed.cachedAt)
    };
  } catch {
    return null;
  }
}

export function writeEntitlementCache(payload: {
  userId: string | null;
  hasProAccess: boolean;
  updatedAt: string | null;
  cachedAt: number;
}): void {
  localStorage.setItem(ENTITLEMENT_CACHE_KEY, JSON.stringify(payload));
}

export function clearEntitlementCache(): void {
  removeStorage(ENTITLEMENT_CACHE_KEY);
}

export type AuthSessionApp = Pick<AppContext, "googleAuthEpoch" | "hasProAccess">;

export function handleExpiredAuth(app: AuthSessionApp): void {
  handleExpiredAuthState(app);
  const cached = readEntitlementCache();
  if (cached) {
    app.hasProAccess = cached.hasProAccess;
    localStorage.setItem(PRO_ACCESS_KEY, cached.hasProAccess ? "1" : "0");
  }
}
