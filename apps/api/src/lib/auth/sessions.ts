import { createHash, createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import type { HttpRequest } from "@azure/functions";
import type { ApiConfig, RefreshSessionDocument, SessionDocument } from "../../types";
import * as cosmos from "../cosmos";
import { createSessionCsrfToken } from "./csrf";
import { HttpError } from "./errors";
import {
  clearRefreshCookieOnResponse,
  clearSessionCookieOnResponse,
  CSRF_HEADER_NAME,
  parseRefreshTokenFromCookie,
  parseSessionIdFromCookie,
  setAuthResponseHeader,
  setRefreshCookie,
  setSessionCookie
} from "./cookies";

type CreateSessionFn = typeof cosmos.createSession;
type GetSessionFn = typeof cosmos.getSession;
type TouchSessionFn = typeof cosmos.touchSession;
type DeleteSessionFn = typeof cosmos.deleteSession;
type CreateRefreshSessionFn = typeof cosmos.createRefreshSession;
type GetRefreshSessionFn = typeof cosmos.getRefreshSession;
type RotateRefreshSessionFn = typeof cosmos.rotateRefreshSession;
type RevokeRefreshSessionForSessionFn = typeof cosmos.revokeRefreshSessionForSession;

const DEFAULT_SESSION_IDLE_TTL_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_SESSION_ABSOLUTE_TTL_SECONDS = 30 * 24 * 60 * 60;
const DEFAULT_SESSION_TOUCH_INTERVAL_SECONDS = 15 * 60;
const DEFAULT_REFRESH_TOKEN_TTL_SECONDS = 60 * 24 * 60 * 60;

function getCosmosFn<T extends (...args: never[]) => unknown>(name: string): T | null {
  try {
    const value = (cosmos as unknown as Record<string, unknown>)[name];
    return typeof value === "function" ? (value as T) : null;
  } catch {
    return null;
  }
}

function sanitizeUserId(rawUserId: string): string {
  return rawUserId.replace(/[^A-Za-z0-9._:@-]/g, "").trim();
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

function getRefreshTokenTtlSeconds(config: ApiConfig): number {
  return normalizePositiveInt(config.refreshTokenTtlSeconds, DEFAULT_REFRESH_TOKEN_TTL_SECONDS);
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

function isRefreshSessionExpired(refreshSession: RefreshSessionDocument, nowMs: number): boolean {
  const expiresAtMs = parseIsoDateMs(refreshSession.expiresAt);
  if (!Number.isFinite(expiresAtMs)) return true;
  return nowMs >= expiresAtMs;
}

function hashRefreshTokenSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function timingSafeEqualStrings(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function createRefreshTokenParts(): { refreshSessionId: string; secret: string; cookieValue: string; tokenHash: string } {
  const refreshSessionId = randomBytes(18).toString("base64url");
  const secret = randomBytes(32).toString("base64url");
  return {
    refreshSessionId,
    secret,
    cookieValue: `${refreshSessionId}.${secret}`,
    tokenHash: hashRefreshTokenSecret(secret)
  };
}

function isRefreshSessionUsable(
  refreshSession: RefreshSessionDocument | null,
  secret: string,
  nowMs: number
): refreshSession is RefreshSessionDocument {
  if (!refreshSession) return false;
  if (refreshSession.docType !== "refresh_session") return false;
  if (String(refreshSession.revokedAt || "").trim()) return false;
  const userId = sanitizeUserId(refreshSession.userId || "");
  if (!userId) return false;
  if (isRefreshSessionExpired(refreshSession, nowMs)) return false;
  const expectedHash = String(refreshSession.tokenHash || "").trim();
  const providedHash = hashRefreshTokenSecret(secret);
  if (!expectedHash || !providedHash) return false;
  return timingSafeEqualStrings(expectedHash, providedHash);
}

function shouldTouchSession(session: SessionDocument, nowMs: number, config: ApiConfig): boolean {
  const lastSeenAtMs = parseIsoDateMs(session.lastSeenAt);
  if (!Number.isFinite(lastSeenAtMs)) return true;
  const minElapsedMs = getSessionTouchIntervalSeconds(config) * 1000;
  return nowMs - lastSeenAtMs >= minElapsedMs;
}

export async function resolveUserIdFromSession(request: HttpRequest, config: ApiConfig): Promise<string | null> {
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
      setSessionCookie(request, sessionId, config);
    } catch {
      // Continue using current valid session even if touch write fails.
    }
  }

  setAuthResponseHeader(request, CSRF_HEADER_NAME, createSessionCsrfToken(sessionId, config));
  return userId;
}

export async function tryIssueSessionCookie(
  request: HttpRequest,
  config: ApiConfig,
  userId: string,
  bootstrapToken: string | null = null,
  options: { issueRefreshCookie?: boolean } = {}
): Promise<string | null> {
  const createSessionFn = getCosmosFn<CreateSessionFn>("createSession");
  if (!createSessionFn) return null;

  const nowMs = Date.now();
  const sessionId = bootstrapToken
    ? createDeterministicBootstrapSessionId(config, userId, bootstrapToken)
    : randomBytes(24).toString("hex");
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
    setSessionCookie(request, sessionId, config);
    setAuthResponseHeader(request, CSRF_HEADER_NAME, createSessionCsrfToken(sessionId, config));
    if (options.issueRefreshCookie !== false) {
      await tryIssueRefreshCookie(request, config, userId, sessionId, nowMs);
    }
    return sessionId;
  } catch {
    return null;
  }
}

async function tryIssueRefreshCookie(
  request: HttpRequest,
  config: ApiConfig,
  userId: string,
  sessionId: string,
  nowMs: number
): Promise<string | null> {
  const createRefreshSessionFn = getCosmosFn<CreateRefreshSessionFn>("createRefreshSession");
  if (!createRefreshSessionFn) return null;

  const token = createRefreshTokenParts();
  const refreshSession: RefreshSessionDocument = {
    id: token.refreshSessionId,
    docType: "refresh_session",
    userId,
    tokenHash: token.tokenHash,
    sessionId,
    createdAt: new Date(nowMs).toISOString(),
    lastUsedAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + (getRefreshTokenTtlSeconds(config) * 1000)).toISOString(),
    revokedAt: null
  };

  try {
    await createRefreshSessionFn(config, refreshSession);
    setRefreshCookie(request, token.cookieValue, config);
    return token.refreshSessionId;
  } catch {
    return null;
  }
}

function createDeterministicBootstrapSessionId(
  config: ApiConfig,
  userId: string,
  bootstrapToken: string
): string {
  const secret = String(config.cosmosKey || "").trim() || "whatfees-dev-session-secret";
  return createHmac("sha256", secret)
    .update(`session:${sanitizeUserId(userId)}:${bootstrapToken}`)
    .digest("hex")
    .slice(0, 48);
}

export async function clearSessionCookie(request: HttpRequest, config: ApiConfig): Promise<void> {
  clearSessionCookieOnResponse(request, config);
  clearRefreshCookieOnResponse(request, config);
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

  const revokeRefreshSessionForSessionFn =
    getCosmosFn<RevokeRefreshSessionForSessionFn>("revokeRefreshSessionForSession");
  if (sessionId && revokeRefreshSessionForSessionFn) {
    try {
      await revokeRefreshSessionForSessionFn(config, sessionId);
    } catch {
      // Cookie cleanup below still ensures this browser stops using the token.
    }
  }

  clearSessionCookieOnResponse(request, config);
  clearRefreshCookieOnResponse(request, config);
  return !!sessionId;
}

export async function refreshSessionFromRequest(request: HttpRequest, config: ApiConfig): Promise<string> {
  const refreshCookie = parseRefreshTokenFromCookie(request, config);
  const getRefreshSessionFn = getCosmosFn<GetRefreshSessionFn>("getRefreshSession");
  const rotateRefreshSessionFn = getCosmosFn<RotateRefreshSessionFn>("rotateRefreshSession");
  if (!refreshCookie) {
    clearRefreshCookieOnResponse(request, config);
    throw new HttpError(401, "Refresh token is invalid or expired.");
  }
  if (!getRefreshSessionFn || !rotateRefreshSessionFn) {
    clearRefreshCookieOnResponse(request, config);
    throw new Error("Refresh token support is not configured.");
  }

  let refreshSession: RefreshSessionDocument | null = null;
  try {
    refreshSession = await getRefreshSessionFn(config, refreshCookie.refreshSessionId);
  } catch {
    clearRefreshCookieOnResponse(request, config);
    throw new Error("Failed to load refresh session.");
  }

  const nowMs = Date.now();
  if (!isRefreshSessionUsable(refreshSession, refreshCookie.secret, nowMs)) {
    clearRefreshCookieOnResponse(request, config);
    throw new HttpError(401, "Refresh token is invalid or expired.");
  }

  const userId = sanitizeUserId(refreshSession.userId);
  const sessionId = await tryIssueSessionCookie(request, config, userId, null, {
    issueRefreshCookie: false
  });
  if (!sessionId) {
    throw new Error("Failed to create refreshed session.");
  }

  const nextToken = {
    ...createRefreshTokenParts(),
    refreshSessionId: refreshCookie.refreshSessionId
  };
  nextToken.cookieValue = `${refreshCookie.refreshSessionId}.${nextToken.secret}`;

  await rotateRefreshSessionFn(config, {
    refreshSessionId: refreshCookie.refreshSessionId,
    tokenHash: nextToken.tokenHash,
    sessionId,
    lastUsedAt: new Date(nowMs).toISOString()
  });
  setRefreshCookie(request, nextToken.cookieValue, config);
  return userId;
}
