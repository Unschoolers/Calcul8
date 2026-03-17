import type { HttpRequest } from "@azure/functions";
import type { ApiConfig } from "../../types";

const AUTH_RESPONSE_HEADERS_KEY = "__whatfeesAuthHeaders";
const DEFAULT_SESSION_COOKIE_NAME = "whatfees_session";
export const CSRF_HEADER_NAME = "x-csrf-token";

function isCookieSecure(config: ApiConfig): boolean {
  return config.apiEnv === "prod";
}

function getCookieSameSite(config: ApiConfig): "Lax" | "None" {
  return config.apiEnv === "prod" ? "None" : "Lax";
}

export function getSessionCookieName(config: ApiConfig): string {
  return String(config.sessionCookieName || DEFAULT_SESSION_COOKIE_NAME).trim() || DEFAULT_SESSION_COOKIE_NAME;
}

function buildSessionCookie(sessionId: string, config: ApiConfig): string {
  const cookieName = getSessionCookieName(config);
  const sameSite = getCookieSameSite(config);
  const secureAttr = isCookieSecure(config) ? "; Secure" : "";
  const maxAge = getSessionIdleTtlSeconds(config);
  const encodedSessionId = encodeURIComponent(sessionId);

  return `${cookieName}=${encodedSessionId}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=${sameSite}${secureAttr}`;
}

function buildClearedSessionCookie(config: ApiConfig): string {
  const cookieName = getSessionCookieName(config);
  const sameSite = getCookieSameSite(config);
  const secureAttr = isCookieSecure(config) ? "; Secure" : "";
  return `${cookieName}=; Max-Age=0; Path=/; HttpOnly; SameSite=${sameSite}${secureAttr}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

function normalizePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  if (normalized <= 0) return fallback;
  return normalized;
}

const DEFAULT_SESSION_IDLE_TTL_SECONDS = 7 * 24 * 60 * 60;

function getSessionIdleTtlSeconds(config: ApiConfig): number {
  return normalizePositiveInt(config.sessionIdleTtlSeconds, DEFAULT_SESSION_IDLE_TTL_SECONDS);
}

export function isUnsafeMethod(method: string | null | undefined): boolean {
  const normalized = String(method || "GET").trim().toUpperCase();
  return normalized !== "GET" && normalized !== "HEAD" && normalized !== "OPTIONS";
}

export function hasBearerAuthHeader(request: HttpRequest): boolean {
  const authHeader = String(request.headers.get("authorization") || "");
  return authHeader.toLowerCase().startsWith("bearer ");
}

export function parseCookieHeader(rawCookieHeader: string): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!rawCookieHeader) return cookies;

  for (const segment of rawCookieHeader.split(";")) {
    const [name, ...valueParts] = segment.split("=");
    const key = String(name || "").trim();
    if (!key) continue;
    const rawValue = valueParts.join("=").trim();
    cookies.set(key, rawValue);
  }

  return cookies;
}

export function parseSessionIdFromCookie(request: HttpRequest, config: ApiConfig): string | null {
  const cookies = parseCookieHeader(String(request.headers.get("cookie") || ""));
  const raw = cookies.get(getSessionCookieName(config));
  if (!raw) return null;

  const decoded = decodeURIComponent(raw).trim();
  if (!decoded) return null;
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(decoded)) {
    return null;
  }
  return decoded;
}

export function setAuthResponseHeader(request: HttpRequest, name: string, value: string): void {
  const mutable = request as HttpRequest & { [AUTH_RESPONSE_HEADERS_KEY]?: Record<string, string> };
  mutable[AUTH_RESPONSE_HEADERS_KEY] = {
    ...(mutable[AUTH_RESPONSE_HEADERS_KEY] ?? {}),
    [name]: value
  };
}

export function setSessionCookie(request: HttpRequest, sessionId: string, config: ApiConfig): void {
  setAuthResponseHeader(request, "Set-Cookie", buildSessionCookie(sessionId, config));
}

export function clearSessionCookieOnResponse(request: HttpRequest, config: ApiConfig): void {
  setAuthResponseHeader(request, "Set-Cookie", buildClearedSessionCookie(config));
}

export function consumeAuthResponseHeaders(request: HttpRequest): Record<string, string> {
  const mutable = request as HttpRequest & { [AUTH_RESPONSE_HEADERS_KEY]?: Record<string, string> };
  const headers = mutable[AUTH_RESPONSE_HEADERS_KEY] ?? {};
  delete mutable[AUTH_RESPONSE_HEADERS_KEY];
  return headers;
}
