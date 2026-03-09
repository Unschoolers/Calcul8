import { createHmac, randomBytes } from "node:crypto";
import type { HttpRequest } from "@azure/functions";
import type { ApiConfig, SessionDocument } from "../types";
import * as cosmos from "./cosmos";
import { fetchWithRetry } from "./retry";

const AUTH_RESPONSE_HEADERS_KEY = "__whatfeesAuthHeaders";
const DEFAULT_SESSION_COOKIE_NAME = "whatfees_session";
const DEFAULT_SESSION_IDLE_TTL_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_SESSION_ABSOLUTE_TTL_SECONDS = 30 * 24 * 60 * 60;
const DEFAULT_SESSION_TOUCH_INTERVAL_SECONDS = 15 * 60;
const CSRF_HEADER_NAME = "x-csrf-token";

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface GoogleTokenInfoResponse {
  aud?: string;
  sub?: string;
}

interface ResolveUserIdOptions {
  issueSessionCookie?: boolean;
}

interface SessionAuthResult {
  userId: string;
  sessionId: string;
}

type CreateSessionFn = typeof cosmos.createSession;
type GetSessionFn = typeof cosmos.getSession;
type TouchSessionFn = typeof cosmos.touchSession;
type DeleteSessionFn = typeof cosmos.deleteSession;

function getCosmosFn<T extends (...args: never[]) => unknown>(name: string): T | null {
  try {
    const value = (cosmos as unknown as Record<string, unknown>)[name];
    return typeof value === "function" ? (value as T) : null;
  } catch {
    return null;
  }
}

function sanitizeUserId(rawUserId: string): string {
  // Keep only URL-safe characters to avoid key/path injection in storage IDs.
  return rawUserId.replace(/[^A-Za-z0-9._:@-]/g, "").trim();
}

function getSessionCookieName(config: ApiConfig): string {
  return String(config.sessionCookieName || DEFAULT_SESSION_COOKIE_NAME).trim() || DEFAULT_SESSION_COOKIE_NAME;
}

function normalizePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  if (normalized <= 0) return fallback;
  return normalized;
}

function getSessionIdleTtlSeconds(config: ApiConfig): number {
  return normalizePositiveInt(config.sessionIdleTtlSeconds, DEFAULT_SESSION_IDLE_TTL_SECONDS);
}

function getSessionAbsoluteTtlSeconds(config: ApiConfig): number {
  return normalizePositiveInt(config.sessionAbsoluteTtlSeconds, DEFAULT_SESSION_ABSOLUTE_TTL_SECONDS);
}

function getSessionTouchIntervalSeconds(config: ApiConfig): number {
  return normalizePositiveInt(config.sessionTouchIntervalSeconds, DEFAULT_SESSION_TOUCH_INTERVAL_SECONDS);
}

function isUnsafeMethod(method: string | null | undefined): boolean {
  const normalized = String(method || "GET").trim().toUpperCase();
  return normalized !== "GET" && normalized !== "HEAD" && normalized !== "OPTIONS";
}

function hasBearerAuthHeader(request: HttpRequest): boolean {
  const authHeader = String(request.headers.get("authorization") || "");
  return authHeader.toLowerCase().startsWith("bearer ");
}

export function createSessionCsrfToken(sessionId: string, config: ApiConfig): string {
  const secret = String(config.cosmosKey || "").trim() || "whatfees-dev-csrf-secret";
  return createHmac("sha256", secret)
    .update(`csrf:${sessionId}`)
    .digest("base64url");
}

function isCookieSecure(config: ApiConfig): boolean {
  return config.apiEnv === "prod";
}

function getCookieSameSite(config: ApiConfig): "Lax" | "None" {
  return config.apiEnv === "prod" ? "None" : "Lax";
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

function parseCookieHeader(rawCookieHeader: string): Map<string, string> {
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

function parseSessionIdFromCookie(request: HttpRequest, config: ApiConfig): string | null {
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

function parseIsoDateMs(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return parsed;
}

function isSessionExpired(session: SessionDocument, nowMs: number): boolean {
  const idleExpiresAtMs = parseIsoDateMs(session.idleExpiresAt);
  const absoluteExpiresAtMs = parseIsoDateMs(session.absoluteExpiresAt);
  if (!Number.isFinite(idleExpiresAtMs) || !Number.isFinite(absoluteExpiresAtMs)) return true;
  return nowMs >= idleExpiresAtMs || nowMs >= absoluteExpiresAtMs;
}

function shouldTouchSession(session: SessionDocument, nowMs: number, config: ApiConfig): boolean {
  const lastSeenAtMs = parseIsoDateMs(session.lastSeenAt);
  if (!Number.isFinite(lastSeenAtMs)) return true;
  const minElapsedMs = getSessionTouchIntervalSeconds(config) * 1000;
  return nowMs - lastSeenAtMs >= minElapsedMs;
}

function setAuthResponseHeader(request: HttpRequest, name: string, value: string): void {
  const mutable = request as HttpRequest & { [AUTH_RESPONSE_HEADERS_KEY]?: Record<string, string> };
  mutable[AUTH_RESPONSE_HEADERS_KEY] = {
    ...(mutable[AUTH_RESPONSE_HEADERS_KEY] ?? {}),
    [name]: value
  };
}

function clearSessionCookieOnResponse(request: HttpRequest, config: ApiConfig): void {
  setAuthResponseHeader(request, "Set-Cookie", buildClearedSessionCookie(config));
}

export function consumeAuthResponseHeaders(request: HttpRequest): Record<string, string> {
  const mutable = request as HttpRequest & { [AUTH_RESPONSE_HEADERS_KEY]?: Record<string, string> };
  const headers = mutable[AUTH_RESPONSE_HEADERS_KEY] ?? {};
  delete mutable[AUTH_RESPONSE_HEADERS_KEY];
  return headers;
}

async function verifyGoogleIdToken(idToken: string, config: ApiConfig): Promise<string | null> {
  const response = await fetchWithRetry(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    {
      method: "GET"
    },
    {
      maxAttempts: 3,
      timeoutMs: 8_000
    }
  );
  if (!response.ok) return null;

  const payload = (await response.json()) as GoogleTokenInfoResponse;
  const tokenSub = sanitizeUserId(payload.sub ?? "");
  if (!tokenSub) return null;

  if (config.googleClientId && payload.aud !== config.googleClientId) {
    return null;
  }

  return tokenSub;
}

async function resolveUserIdFromSession(request: HttpRequest, config: ApiConfig): Promise<string | null> {
  const sessionId = parseSessionIdFromCookie(request, config);
  const getSessionFn = getCosmosFn<GetSessionFn>("getSession");
  if (!sessionId || !getSessionFn) {
    return null;
  }

  let session: SessionDocument | null = null;
  try {
    session = await getSessionFn(config, sessionId);
  } catch {
    return null;
  }

  if (!session) {
    clearSessionCookieOnResponse(request, config);
    return null;
  }

  const nowMs = Date.now();
  if (isSessionExpired(session, nowMs)) {
    const deleteSessionFn = getCosmosFn<DeleteSessionFn>("deleteSession");
    try {
      if (deleteSessionFn) {
        await deleteSessionFn(config, sessionId);
      }
    } catch {
      // Keep auth flow resilient and proceed to bearer fallback.
    }
    clearSessionCookieOnResponse(request, config);
    return null;
  }

  const userId = sanitizeUserId(session.userId || "");
  if (!userId) {
    const deleteSessionFn = getCosmosFn<DeleteSessionFn>("deleteSession");
    try {
      if (deleteSessionFn) {
        await deleteSessionFn(config, sessionId);
      }
    } catch {
      // Keep auth flow resilient and proceed to bearer fallback.
    }
    clearSessionCookieOnResponse(request, config);
    return null;
  }

  const touchSessionFn = getCosmosFn<TouchSessionFn>("touchSession");
  if (shouldTouchSession(session, nowMs, config) && touchSessionFn) {
    try {
      const lastSeenAt = new Date(nowMs).toISOString();
      const idleExpiresAt = new Date(nowMs + (getSessionIdleTtlSeconds(config) * 1000)).toISOString();
      await touchSessionFn(config, {
        sessionId,
        lastSeenAt,
        idleExpiresAt
      });
      setAuthResponseHeader(request, "Set-Cookie", buildSessionCookie(sessionId, config));
    } catch {
      // Continue using current valid session even if touch write fails.
    }
  }

  setAuthResponseHeader(request, CSRF_HEADER_NAME, createSessionCsrfToken(sessionId, config));
  return userId;
}

async function resolveUserIdFromBearer(request: HttpRequest, config: ApiConfig): Promise<string | null> {
  const authHeader = request.headers.get("authorization") || "";
  const isBearer = authHeader.toLowerCase().startsWith("bearer ");
  if (!isBearer) return null;

  const idToken = authHeader.slice(7).trim();
  if (!idToken) return null;

  const userId = await verifyGoogleIdToken(idToken, config);
  if (!userId) {
    throw new HttpError(401, "Invalid Google ID token.");
  }
  return userId;
}

async function tryIssueSessionCookie(
  request: HttpRequest,
  config: ApiConfig,
  userId: string
): Promise<string | null> {
  const createSessionFn = getCosmosFn<CreateSessionFn>("createSession");
  if (!createSessionFn) return null;

  const nowMs = Date.now();
  const sessionId = randomBytes(24).toString("hex");
  const session: SessionDocument = {
    id: sessionId,
    docType: "session",
    userId,
    createdAt: new Date(nowMs).toISOString(),
    lastSeenAt: new Date(nowMs).toISOString(),
    idleExpiresAt: new Date(nowMs + (getSessionIdleTtlSeconds(config) * 1000)).toISOString(),
    absoluteExpiresAt: new Date(nowMs + (getSessionAbsoluteTtlSeconds(config) * 1000)).toISOString()
  };

  try {
    await createSessionFn(config, session);
    setAuthResponseHeader(request, "Set-Cookie", buildSessionCookie(sessionId, config));
    setAuthResponseHeader(request, CSRF_HEADER_NAME, createSessionCsrfToken(sessionId, config));
    return sessionId;
  } catch {
    // Keep bearer auth path working even when session persistence fails.
    return null;
  }
}

export async function clearSessionCookie(request: HttpRequest, config: ApiConfig): Promise<void> {
  clearSessionCookieOnResponse(request, config);
}

export async function revokeSessionFromRequest(request: HttpRequest, config: ApiConfig): Promise<boolean> {
  const sessionId = parseSessionIdFromCookie(request, config);
  const deleteSessionFn = getCosmosFn<DeleteSessionFn>("deleteSession");
  if (sessionId && deleteSessionFn) {
    try {
      await deleteSessionFn(config, sessionId);
    } catch {
      // Keep logout idempotent even if the row no longer exists.
    }
  }

  clearSessionCookieOnResponse(request, config);
  return !!sessionId;
}

export async function resolveUserId(
  request: HttpRequest,
  config: ApiConfig,
  options: ResolveUserIdOptions = {}
): Promise<string> {
  const sessionUserId = await resolveUserIdFromSession(request, config);
  if (sessionUserId) {
    if (isUnsafeMethod(request.method) && !hasBearerAuthHeader(request)) {
      const sessionId = parseSessionIdFromCookie(request, config);
      const expectedCsrfToken = sessionId ? createSessionCsrfToken(sessionId, config) : "";
      const providedCsrfToken = String(request.headers.get(CSRF_HEADER_NAME) || "").trim();
      if (!providedCsrfToken || !expectedCsrfToken || providedCsrfToken !== expectedCsrfToken) {
        throw new HttpError(403, "Invalid CSRF token.");
      }
    }
    return sessionUserId;
  }

  const bearerUserId = await resolveUserIdFromBearer(request, config);
  if (bearerUserId) {
    if (options.issueSessionCookie !== false) {
      await tryIssueSessionCookie(request, config, bearerUserId);
    }
    return bearerUserId;
  }

  throw new HttpError(401, "Authentication is required.");
}
