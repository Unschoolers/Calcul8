import type { AppContext } from "../../context.ts";
import type { GoogleIdentityApi } from "../../utils/googleAutoLogin.ts";
import {
  getLegacyStorageKeys,
  readStorageWithLegacy,
  removeStorageWithLegacy,
  STORAGE_KEYS
} from "../../storageKeys.ts";

interface GoogleAccountsApi {
  id: GoogleIdentityApi;
}

interface GoogleGlobalApi {
  accounts: GoogleAccountsApi;
}

export interface EntitlementApiResponse {
  userId?: string;
  hasProAccess?: boolean;
  updatedAt?: string | null;
}

interface VerifyPlayPurchaseApiResponse {
  ok?: boolean;
  pending?: boolean;
  message?: string;
  error?: string;
  userId?: string;
  hasProAccess?: boolean;
  updatedAt?: string | null;
}

export type PurchaseProvider = "auto" | "play" | "stripe";

interface EntitlementCachePayload {
  userId: string | null;
  hasProAccess: boolean;
  updatedAt: string | null;
  cachedAt: number;
}

export interface VerifyPlayPurchaseRequest {
  baseUrl: string;
  googleIdToken: string;
  purchaseToken: string;
  productId?: string;
  packageName?: string;
  idempotencyKey?: string;
}

interface SubmitPurchaseVerificationRequest {
  provider: PurchaseProvider;
  baseUrl: string;
  googleIdToken: string;
  body: Record<string, string>;
}

interface FetchRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
}

declare global {
  interface Window {
    google?: GoogleGlobalApi;
  }
}

const LEGACY_KEYS = getLegacyStorageKeys();

export const ENTITLEMENT_CACHE_KEY = STORAGE_KEYS.ENTITLEMENT_CACHE;
export const PRO_ACCESS_KEY = STORAGE_KEYS.PRO_ACCESS;
export const GOOGLE_TOKEN_KEY = STORAGE_KEYS.GOOGLE_ID_TOKEN;
export const GOOGLE_PROFILE_CACHE_KEY = STORAGE_KEYS.GOOGLE_PROFILE_CACHE;
export const DEBUG_USER_KEY = STORAGE_KEYS.DEBUG_USER_ID;
export const SYNC_CLIENT_VERSION_KEY = STORAGE_KEYS.SYNC_CLIENT_VERSION;
export const CLOUD_SYNC_INTERVAL_MS = 2 * 1000;
export const SYNC_STATUS_RESET_MS = 2500;
export const GOOGLE_INIT_RETRY_COUNT = 20;
export const GOOGLE_INIT_RETRY_DELAY_MS = 250;

const API_MAX_RETRY_ATTEMPTS = 3;
const API_BASE_RETRY_DELAY_MS = 500;
const API_FETCH_TIMEOUT_MS = 12_000;

export function resolvePurchaseProvider(): PurchaseProvider {
  const raw = String(import.meta.env.VITE_PURCHASE_PROVIDER || "auto")
    .trim()
    .toLowerCase();
  if (raw === "auto") return "auto";
  return raw === "stripe" ? "stripe" : "play";
}

export function getSupportedPurchaseProviders(): PurchaseProvider[] {
  return ["play"];
}

export function resolveApiBaseUrl(): string {
  const configuredApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || "";
  if (configuredApiBase) {
    const normalized = configuredApiBase.replace(/\/+$/, "");
    localStorage.setItem(STORAGE_KEYS.API_BASE_URL, normalized);
    return normalized;
  }
  return "";
}

export function getEntitlementTtlMs(): number {
  const raw = (import.meta.env.VITE_ENTITLEMENT_TTL_MINUTES as string | undefined)?.trim() || "";
  const minutes = Number(raw);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return 6 * 60 * 60 * 1000;
  }
  return minutes * 60 * 1000;
}

export function readEntitlementCache(): { userId: string | null; hasProAccess: boolean; updatedAt: string | null; cachedAt: number } | null {
  const raw = readStorageWithLegacy(ENTITLEMENT_CACHE_KEY, LEGACY_KEYS.ENTITLEMENT_CACHE);
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
  removeStorageWithLegacy(ENTITLEMENT_CACHE_KEY, LEGACY_KEYS.ENTITLEMENT_CACHE);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function buildPurchaseIdempotencyKey(
  provider: string,
  purchaseToken: string,
  productId: string
): Promise<string> {
  const seed = `${provider}:${purchaseToken}:${productId}`;
  const cryptoApi = window.crypto;
  if (cryptoApi?.subtle && typeof TextEncoder !== "undefined") {
    const encoded = new TextEncoder().encode(seed);
    const digest = await cryptoApi.subtle.digest("SHA-256", encoded);
    const hex = bytesToHex(new Uint8Array(digest));
    return `${provider}_${hex.slice(0, 48)}`;
  }

  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(index);
    hash |= 0;
  }
  return `${provider}_${Math.abs(hash).toString(16)}_${seed.length}`;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  return error instanceof TypeError;
}

function parseRetryAfterMs(headers: Headers): number | null {
  const retryAfter = headers.get("retry-after");
  if (!retryAfter) return null;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const dateMs = Date.parse(retryAfter);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return null;
}

export async function fetchWithRetry(
  input: string,
  init: RequestInit,
  {
    maxAttempts = API_MAX_RETRY_ATTEMPTS,
    baseDelayMs = API_BASE_RETRY_DELAY_MS,
    timeoutMs = API_FETCH_TIMEOUT_MS
  }: FetchRetryOptions = {}
): Promise<Response> {
  let attempt = 0;

  while (true) {
    attempt += 1;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal
      });

      if (!isRetryableStatus(response.status) || attempt >= maxAttempts) {
        return response;
      }

      const retryAfterMs = parseRetryAfterMs(response.headers);
      const exponentialDelayMs = baseDelayMs * Math.pow(2, attempt - 1);
      const jitterMs = Math.round(Math.random() * 200);
      await sleep(retryAfterMs ?? exponentialDelayMs + jitterMs);
    } catch (error) {
      if (!isRetryableError(error) || attempt >= maxAttempts) {
        throw error;
      }
      const exponentialDelayMs = baseDelayMs * Math.pow(2, attempt - 1);
      const jitterMs = Math.round(Math.random() * 200);
      await sleep(exponentialDelayMs + jitterMs);
    } finally {
      window.clearTimeout(timeoutId);
    }
  }
}

export function handleExpiredAuth(app: AppContext): void {
  removeStorageWithLegacy(GOOGLE_TOKEN_KEY, LEGACY_KEYS.GOOGLE_ID_TOKEN);
  removeStorageWithLegacy(GOOGLE_PROFILE_CACHE_KEY, LEGACY_KEYS.GOOGLE_PROFILE_CACHE);
  clearEntitlementCache();
  removeStorageWithLegacy(PRO_ACCESS_KEY, LEGACY_KEYS.PRO_ACCESS);
  app.hasProAccess = false;
  if (app.hasLotSelected && Number(app.targetProfitPercent) !== 0) {
    app.targetProfitPercent = 0;
    app.autoSaveSetup();
  }
  app.initGoogleAutoLogin();
}

async function postPurchaseVerification(
  request: SubmitPurchaseVerificationRequest
): Promise<Response> {
  const { provider, baseUrl, googleIdToken, body } = request;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${googleIdToken}`
  };

  const genericRoute = `${baseUrl}/entitlements/verify/${provider}`;
  return fetchWithRetry(genericRoute, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}

export async function submitPlayPurchaseVerification(
  app: AppContext,
  payload: VerifyPlayPurchaseRequest
): Promise<boolean> {
  const productId = (payload.productId ?? "").trim();
  const packageName = (payload.packageName ?? "").trim();
  const idempotencyKey = (payload.idempotencyKey ?? "").trim() || await buildPurchaseIdempotencyKey(
    "play",
    payload.purchaseToken,
    productId
  );

  const body: Record<string, string> = {
    purchaseToken: payload.purchaseToken,
    idempotencyKey
  };

  if (productId) body.productId = productId;
  if (packageName) body.packageName = packageName;

  const response = await postPurchaseVerification({
    provider: "play",
    baseUrl: payload.baseUrl,
    googleIdToken: payload.googleIdToken,
    body
  });

  if (response.status === 401) {
    handleExpiredAuth(app);
    app.notify("Your sign-in expired. Please sign in again.", "warning");
    return false;
  }

  if (response.status === 202) {
    let message = "Purchase is pending. Complete payment and check again shortly.";
    try {
      const body = (await response.json()) as VerifyPlayPurchaseApiResponse;
      if (typeof body.message === "string" && body.message.trim()) {
        message = body.message.trim();
      }
    } catch {
      // Keep fallback when response payload isn't JSON.
    }
    app.notify(message, "info");
    window.setTimeout(() => {
      void app.debugLogEntitlement(true);
    }, 10_000);
    return false;
  }

  if (!response.ok) {
    let message = `Purchase verification failed (${response.status}).`;
    try {
      const errorBody = (await response.json()) as VerifyPlayPurchaseApiResponse;
      if (typeof errorBody.message === "string" && errorBody.message.trim()) {
        message = errorBody.message.trim();
      } else if (typeof errorBody.error === "string" && errorBody.error.trim()) {
        message = errorBody.error.trim();
      }
    } catch {
      // Keep fallback message when response body is not JSON.
    }
    app.notify(message, "error");
    return false;
  }

  let verifiedPayload: VerifyPlayPurchaseApiResponse | null = null;
  try {
    verifiedPayload = (await response.json()) as VerifyPlayPurchaseApiResponse;
  } catch {
    verifiedPayload = null;
  }

  const hasProAccess =
    typeof verifiedPayload?.hasProAccess === "boolean" ? verifiedPayload.hasProAccess : true;
  const userId = typeof verifiedPayload?.userId === "string" ? verifiedPayload.userId : null;
  const updatedAt = typeof verifiedPayload?.updatedAt === "string" ? verifiedPayload.updatedAt : null;

  app.hasProAccess = hasProAccess;
  localStorage.setItem(PRO_ACCESS_KEY, hasProAccess ? "1" : "0");
  writeEntitlementCache({
    userId,
    hasProAccess,
    updatedAt,
    cachedAt: Date.now()
  });

  // Keep server as source-of-truth, but don't block immediate UI unlock on this extra fetch.
  void app.debugLogEntitlement(true).catch((error: unknown) => {
    console.warn("[whatfees] Post-purchase entitlement refresh failed", error);
  });
  return true;
}
