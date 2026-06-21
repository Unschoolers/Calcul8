import type { Cookie, HttpRequest } from "@azure/functions";
import type { ApiConfig } from "../../types";

const AUTH_RESPONSE_HEADERS_KEY = "__whatfeesAuthHeaders";
const AUTH_RESPONSE_COOKIES_KEY = "__whatfeesAuthCookies";
const DEFAULT_SESSION_COOKIE_NAME = "whatfees_session";
const DEFAULT_REFRESH_COOKIE_NAME = "whatfees_refresh";
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

export function getRefreshCookieName(config: ApiConfig): string {
  return String(config.refreshCookieName || DEFAULT_REFRESH_COOKIE_NAME).trim() || DEFAULT_REFRESH_COOKIE_NAME;
}

function normalizePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  if (normalized <= 0) return fallback;
  return normalized;
}

const DEFAULT_SESSION_IDLE_TTL_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_REFRESH_TOKEN_TTL_SECONDS = 60 * 24 * 60 * 60;

function getSessionIdleTtlSeconds(config: ApiConfig): number {
  return normalizePositiveInt(config.sessionIdleTtlSeconds, DEFAULT_SESSION_IDLE_TTL_SECONDS);
}

function getRefreshTokenTtlSeconds(config: ApiConfig): number {
  return normalizePositiveInt(config.refreshTokenTtlSeconds, DEFAULT_REFRESH_TOKEN_TTL_SECONDS);
}

function buildAuthCookie(name: string, value: string, maxAge: number, config: ApiConfig): Cookie {
  return {
    name,
    value,
    maxAge,
    path: "/",
    httpOnly: true,
    sameSite: getCookieSameSite(config),
    secure: isCookieSecure(config)
  };
}

function buildClearedAuthCookie(name: string, config: ApiConfig): Cookie {
  return {
    name,
    value: "",
    maxAge: 0,
    path: "/",
    httpOnly: true,
    sameSite: getCookieSameSite(config),
    secure: isCookieSecure(config),
    expires: new Date(0)
  };
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

export interface RefreshCookieValue {
  refreshSessionId: string;
  secret: string;
}

export function parseRefreshTokenFromCookie(request: HttpRequest, config: ApiConfig): RefreshCookieValue | null {
  const cookies = parseCookieHeader(String(request.headers.get("cookie") || ""));
  const raw = cookies.get(getRefreshCookieName(config));
  if (!raw) return null;

  const decoded = decodeURIComponent(raw).trim();
  const [refreshSessionId, secret, ...extra] = decoded.split(".");
  if (extra.length > 0) return null;
  if (!refreshSessionId || !secret) return null;
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(refreshSessionId)) return null;
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret)) return null;
  return {
    refreshSessionId,
    secret
  };
}

export function setAuthResponseHeader(request: HttpRequest, name: string, value: string): void {
  const mutable = request as HttpRequest & { [AUTH_RESPONSE_HEADERS_KEY]?: Record<string, string> };
  mutable[AUTH_RESPONSE_HEADERS_KEY] = {
    ...(mutable[AUTH_RESPONSE_HEADERS_KEY] ?? {}),
    [name]: value
  };
}

export function setAuthResponseCookie(request: HttpRequest, cookie: Cookie): void {
  const mutable = request as HttpRequest & { [AUTH_RESPONSE_COOKIES_KEY]?: Cookie[] };
  mutable[AUTH_RESPONSE_COOKIES_KEY] = [
    ...(mutable[AUTH_RESPONSE_COOKIES_KEY] ?? []),
    cookie
  ];
}

export function setSessionCookie(request: HttpRequest, sessionId: string, config: ApiConfig): void {
  setAuthResponseCookie(
    request,
    buildAuthCookie(getSessionCookieName(config), sessionId, getSessionIdleTtlSeconds(config), config)
  );
}

export function clearSessionCookieOnResponse(request: HttpRequest, config: ApiConfig): void {
  setAuthResponseCookie(request, buildClearedAuthCookie(getSessionCookieName(config), config));
}

export function setRefreshCookie(request: HttpRequest, value: string, config: ApiConfig): void {
  setAuthResponseCookie(
    request,
    buildAuthCookie(getRefreshCookieName(config), value, getRefreshTokenTtlSeconds(config), config)
  );
}

export function clearRefreshCookieOnResponse(request: HttpRequest, config: ApiConfig): void {
  setAuthResponseCookie(request, buildClearedAuthCookie(getRefreshCookieName(config), config));
}

export function consumeAuthResponseHeaders(request: HttpRequest): Record<string, string> {
  const mutable = request as HttpRequest & { [AUTH_RESPONSE_HEADERS_KEY]?: Record<string, string> };
  const headers = mutable[AUTH_RESPONSE_HEADERS_KEY] ?? {};
  delete mutable[AUTH_RESPONSE_HEADERS_KEY];
  return headers;
}

export function consumeAuthResponseCookies(request: HttpRequest): Cookie[] {
  const mutable = request as HttpRequest & { [AUTH_RESPONSE_COOKIES_KEY]?: Cookie[] };
  const cookies = mutable[AUTH_RESPONSE_COOKIES_KEY] ?? [];
  delete mutable[AUTH_RESPONSE_COOKIES_KEY];
  return cookies;
}
