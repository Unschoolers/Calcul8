import {
    buildAuthenticatedHeaders,
    getStoredCsrfToken,
    setStoredSessionUserId,
    setStoredCsrfToken
} from "../../../auth/index.ts";
import type { AuthEntitlementSessionContext } from "../../../context/entitlements.ts";
import { STORAGE_KEYS } from "../../../storageKeys.ts";
import { handleExpiredAuth } from "../entitlements/entitlement-cache.ts";

export interface FetchRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
}

const API_MAX_RETRY_ATTEMPTS = 3;
const API_BASE_RETRY_DELAY_MS = 500;
const API_FETCH_TIMEOUT_MS = 12_000;

type ApiBaseStorage = {
  getItem(key: string): string | null;
  setItem?(key: string, value: string): void;
};

function resolveApiBaseStorage(): ApiBaseStorage | null {
  const candidate = (globalThis as { localStorage?: unknown }).localStorage;
  if (!candidate || (typeof candidate !== "object" && typeof candidate !== "function")) return null;

  // Node 25 exposes a placeholder localStorage object that warns when storage
  // methods are read without a configured --localstorage-file. Check method
  // presence before touching them so non-browser tests stay quiet.
  const target = candidate as object;
  if (!("getItem" in target)) return null;

  const storage = candidate as { getItem?: unknown; setItem?: unknown };
  const getItem = storage.getItem;
  if (typeof getItem !== "function") return null;

  const setItem = "setItem" in target ? storage.setItem : undefined;
  return {
    getItem(key: string): string | null {
      const value = (getItem as (this: unknown, key: string) => unknown).call(candidate, key);
      if (value == null) return null;
      return String(value);
    },
    setItem: typeof setItem === "function"
      ? (key: string, value: string): void => {
        (setItem as (this: unknown, key: string, value: string) => void).call(candidate, key, value);
      }
      : undefined
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
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

function isUnsafeMethod(method: string | undefined): boolean {
  const normalized = String(method || "GET").trim().toUpperCase();
  return normalized !== "GET" && normalized !== "HEAD" && normalized !== "OPTIONS";
}

interface RefreshAuthResponse {
  userId?: unknown;
}

let authRefreshPromise: Promise<boolean> | null = null;

function normalizeResponseUserId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function resolveApiBaseUrl(): string {
  const storage = resolveApiBaseStorage();
  const configuredApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || "";
  if (configuredApiBase) {
    const normalized = configuredApiBase.replace(/\/+$/, "");
    storage?.setItem?.(STORAGE_KEYS.API_BASE_URL, normalized);
    return normalized;
  }
  const cachedBase = String(storage?.getItem(STORAGE_KEYS.API_BASE_URL) || "").trim();
  if (cachedBase) return cachedBase.replace(/\/+$/, "");
  return "";
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
    const requestHeaders = new Headers(init.headers ?? {});
    const csrfToken = getStoredCsrfToken();
    if (isUnsafeMethod(init.method) && csrfToken && !requestHeaders.has("x-csrf-token")) {
      requestHeaders.set("x-csrf-token", csrfToken);
    }

    try {
      const response = await fetch(input, {
        ...init,
        headers: requestHeaders,
        credentials: init.credentials ?? "include",
        signal: controller.signal
      });
      const responseCsrfToken = (response.headers.get("x-csrf-token") || "").trim();
      if (responseCsrfToken) {
        setStoredCsrfToken(responseCsrfToken);
      }

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

export async function fetchAuthenticatedApiResponse(
  app: AuthEntitlementSessionContext,
  path: string,
  init: RequestInit,
  options: {
    expireAuthOn401?: boolean;
  } = {}
): Promise<Response> {
  const baseUrl = resolveApiBaseUrl();
  if (!baseUrl) {
    throw new Error("API base URL is not configured.");
  }
  const requestUrl = `${baseUrl}${path}`;

  const buildRequestInit = (): RequestInit => ({
    ...init,
    headers: buildAuthenticatedHeaders(
      "session-preferred",
      init.headers as Record<string, string> | undefined,
      requestUrl
    )
  });

  const response = await fetchWithRetry(requestUrl, buildRequestInit());

  if (response.status === 401 && options.expireAuthOn401 !== false) {
    const refreshed = await refreshAuthSessionSingleFlight(baseUrl);
    if (refreshed) {
      const retryResponse = await fetchWithRetry(requestUrl, buildRequestInit());
      if (retryResponse.status !== 401) {
        return retryResponse;
      }
      handleExpiredAuth(app);
      return retryResponse;
    }

    handleExpiredAuth(app);
  }

  return response;
}

function refreshAuthSessionSingleFlight(baseUrl: string): Promise<boolean> {
  if (authRefreshPromise) return authRefreshPromise;
  authRefreshPromise = tryRefreshAuthSession(baseUrl).finally(() => {
    authRefreshPromise = null;
  });
  return authRefreshPromise;
}

async function tryRefreshAuthSession(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetchWithRetry(`${baseUrl}/auth/refresh`, {
      method: "POST"
    }, {
      maxAttempts: 1
    });
    if (!response.ok) return false;

    let payload: RefreshAuthResponse | null = null;
    try {
      payload = await response.json() as RefreshAuthResponse;
    } catch {
      payload = null;
    }

    const userId = normalizeResponseUserId(payload?.userId);
    if (userId) {
      setStoredSessionUserId(userId);
    }
    return true;
  } catch {
    return false;
  }
}
