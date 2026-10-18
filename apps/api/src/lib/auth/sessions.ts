import { createHash, timingSafeEqual, randomBytes } from "node:crypto";
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
type DeleteSessionIfUnchangedFn = typeof cosmos.deleteSessionIfUnchanged;
type CreateRefreshSessionFn = typeof cosmos.createRefreshSession;
type GetRefreshSessionFn = typeof cosmos.getRefreshSession;
type RotateRefreshSessionFn = typeof cosmos.rotateRefreshSession;
type LinkSessionToRefreshFamilyFn = typeof cosmos.linkSessionToRefreshFamily;
type FindRefreshSessionForSessionFn = typeof cosmos.findRefreshSessionForSession;
type RevokeRefreshSessionFamilyFn = typeof cosmos.revokeRefreshSessionFamily;
type ClearRefreshSessionAssociationsFn = typeof cosmos.clearRefreshSessionAssociations;
type ListSessionsForRefreshFamilyFn = typeof cosmos.listSessionsForRefreshFamily;

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
  options: { issueRefreshCookie?: boolean; deferResponseAuth?: boolean; refreshFamilyId?: string } = {}
): Promise<string | null> {
  const createSessionFn = getCosmosFn<CreateSessionFn>("createSession");
  if (!createSessionFn) return null;

  const nowMs = Date.now();
  // Each bearer bootstrap gets its own access row and refresh family. Sharing a
  // deterministic access id lets concurrent requests overwrite one another's
  // family association, so only a presented valid session cookie reuses a row.
  const sessionId = randomBytes(24).toString("hex");
  const initialRefreshToken = options.issueRefreshCookie === false ? null : createRefreshTokenParts();
  const refreshFamilyId = options.refreshFamilyId;
  const session: SessionDocument = {
    id: sessionId,
    docType: "session",
    userId,
    createdAt: new Date(nowMs).toISOString(),
    lastSeenAt: new Date(nowMs).toISOString(),
    idleExpiresAt: new Date(nowMs + (getSessionIdleTtlSeconds(config) * 1000)).toISOString(),
    absoluteExpiresAt: new Date(nowMs + (getSessionAbsoluteTtlSeconds(config) * 1000)).toISOString(),
    ...(refreshFamilyId ? { refreshFamilyId } : {})
  };

  try {
    await createSessionFn(config, session);
    if (options.deferResponseAuth !== true) {
      setSessionCookie(request, sessionId, config);
      setAuthResponseHeader(request, CSRF_HEADER_NAME, createSessionCsrfToken(sessionId, config));
    }
    if (options.issueRefreshCookie !== false) {
      if (initialRefreshToken) {
        await tryIssueRefreshCookie(request, config, userId, sessionId, nowMs, initialRefreshToken);
      }
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
  nowMs: number,
  token: ReturnType<typeof createRefreshTokenParts>
): Promise<string | null> {
  const createRefreshSessionFn = getCosmosFn<CreateRefreshSessionFn>("createRefreshSession");
  if (!createRefreshSessionFn) return null;

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
    const linkSessionFn = getCosmosFn<LinkSessionToRefreshFamilyFn>("linkSessionToRefreshFamily");
    if (!linkSessionFn) return null;
    await linkSessionFn(config, { sessionId, refreshFamilyId: token.refreshSessionId, userId });
    setRefreshCookie(request, token.cookieValue, config);
    return token.refreshSessionId;
  } catch {
    return null;
  }
}

export async function clearSessionCookie(request: HttpRequest, config: ApiConfig): Promise<void> {
  clearSessionCookieOnResponse(request, config);
  clearRefreshCookieOnResponse(request, config);
}

export async function revokeSessionFromRequest(
  request: HttpRequest,
  config: ApiConfig,
  verifiedUserId?: string | null
): Promise<boolean> {
  const sessionId = parseSessionIdFromCookie(request, config);
  const refreshCookie = parseRefreshTokenFromCookie(request, config);
  const getRefreshSessionFn = getCosmosFn<GetRefreshSessionFn>("getRefreshSession");
  const getSessionFn = getCosmosFn<GetSessionFn>("getSession");
  const linkSessionFn = getCosmosFn<LinkSessionToRefreshFamilyFn>("linkSessionToRefreshFamily");
  const findRefreshForSessionFn = getCosmosFn<FindRefreshSessionForSessionFn>("findRefreshSessionForSession");
  const revokeFamilyFn = getCosmosFn<RevokeRefreshSessionFamilyFn>("revokeRefreshSessionFamily");
  const clearAssociationsFn = getCosmosFn<ClearRefreshSessionAssociationsFn>("clearRefreshSessionAssociations");
  const listFamilySessionsFn = getCosmosFn<ListSessionsForRefreshFamilyFn>("listSessionsForRefreshFamily");
  const deleteSessionFn = getCosmosFn<DeleteSessionFn>("deleteSession");
  const deleteSessionIfUnchangedFn = getCosmosFn<DeleteSessionIfUnchangedFn>("deleteSessionIfUnchanged");
  const clearClientCookies = () => {
    clearSessionCookieOnResponse(request, config);
    clearRefreshCookieOnResponse(request, config);
  };

  if (refreshCookie && (!getRefreshSessionFn || !revokeFamilyFn)) {
    throw new Error("Refresh session revocation is not configured.");
  }
  if (refreshCookie && getRefreshSessionFn && revokeFamilyFn) {
    const current = await getRefreshSessionFn(config, refreshCookie.refreshSessionId);
    if (current) {
      const hash = hashRefreshTokenSecret(refreshCookie.secret);
      const revoked = await revokeFamilyFn(config, {
        refreshSessionId: current.id,
        expectedTokenHashes: [hash],
        ...(verifiedUserId ? { userId: sanitizeUserId(verifiedUserId) } : {})
      });
      if (revoked) {
        await deleteFamilySessionsAndClear(config, revoked, deleteSessionFn, clearAssociationsFn, listFamilySessionsFn);
        clearClientCookies();
        return true;
      }
    }
  }

  if (!sessionId || !verifiedUserId) {
    clearClientCookies();
    return false;
  }
  if (!getSessionFn || !revokeFamilyFn || !clearAssociationsFn || !deleteSessionFn || !listFamilySessionsFn || !deleteSessionIfUnchangedFn) {
    throw new Error("Session revocation is not configured.");
  }
  const accessSession = await getSessionFn(config, sessionId);
  if (!accessSession || sanitizeUserId(accessSession.userId || "") !== sanitizeUserId(verifiedUserId)) {
    clearClientCookies();
    return false;
  }
  let familyId = String(accessSession.refreshFamilyId || "").trim();
  if (!familyId && (!findRefreshForSessionFn || !linkSessionFn)) {
    throw new Error("Refresh family lookup is not configured.");
  }
  for (let attempt = 0; attempt < 3 && !familyId; attempt += 1) {
    const legacyFamily = await findRefreshForSessionFn!(config, sessionId);
    if (legacyFamily) {
      if (sanitizeUserId(legacyFamily.userId || "") !== sanitizeUserId(verifiedUserId)) {
        throw new Error("Legacy refresh family belongs to another user.");
      }
      await linkSessionFn!(config, { sessionId, refreshFamilyId: legacyFamily.id, userId: sanitizeUserId(verifiedUserId) });
      familyId = legacyFamily.id;
      break;
    }

    // A refresh may backfill this row immediately after the query. Delete
    // only this observed ETag; a concurrent backfill turns this into a retry.
    const reread = await getSessionFn(config, sessionId);
    if (!reread) continue;
    if (sanitizeUserId(reread.userId || "") !== sanitizeUserId(verifiedUserId)) {
      clearClientCookies();
      return false;
    }
    familyId = String(reread.refreshFamilyId || "").trim();
    if (familyId) break;
    const etag = String((reread as SessionDocument & { _etag?: unknown })._etag ?? "").trim();
    if (!etag) throw new Error("Access session is missing an ETag.");
    const deleteResult = await deleteSessionIfUnchangedFn!(config, { sessionId, etag });
    if (deleteResult === "deleted") {
      clearClientCookies();
      return true;
    }
  }
  if (!familyId) {
    throw new Error("Session changed repeatedly while resolving its refresh family.");
  }
  const revokedFamily = await revokeFamilyFn(config, { refreshSessionId: familyId, userId: sanitizeUserId(verifiedUserId) });
  if (!revokedFamily) throw new Error("Failed to revoke server session.");
  await deleteFamilySessionsAndClear(config, revokedFamily, deleteSessionFn, clearAssociationsFn, listFamilySessionsFn);
  clearClientCookies();
  return true;
}

async function deleteFamilySessionsAndClear(
  config: ApiConfig,
  family: RefreshSessionDocument,
  deleteSessionFn: DeleteSessionFn | null,
  clearAssociationsFn: ClearRefreshSessionAssociationsFn | null,
  listFamilySessionsFn: ListSessionsForRefreshFamilyFn | null
): Promise<void> {
  const getSessionFn = getCosmosFn<GetSessionFn>("getSession");
  if (!deleteSessionFn || !clearAssociationsFn || !listFamilySessionsFn || !getSessionFn) {
    throw new Error("Session cleanup is not configured.");
  }
  const linkedSessions = await listFamilySessionsFn(config, family.id, family.userId);
  const sessionIds = new Set([
    ...linkedSessions.map((session) => session.id),
    family.previousSessionId,
    family.sessionId
  ].filter((value): value is string => Boolean(value)));
  for (const id of sessionIds) {
    const accessSession = await getSessionFn(config, id);
    if (accessSession && sanitizeUserId(accessSession.userId || "") !== sanitizeUserId(family.userId)) {
      throw new Error("Refresh family is associated with an access session owned by another user.");
    }
    await deleteSessionFn(config, id);
  }
  await clearAssociationsFn(config, family.id);
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
  const oldSessionId = String(refreshSession.sessionId || "").trim();
  if (oldSessionId) {
    const getSessionFn = getCosmosFn<GetSessionFn>("getSession");
    if (!getSessionFn) throw new Error("Refresh family access-session lookup is not configured.");
    const oldAccessSession = await getSessionFn(config, oldSessionId);
    if (oldAccessSession) {
      const linkSessionFn = getCosmosFn<LinkSessionToRefreshFamilyFn>("linkSessionToRefreshFamily");
      if (!linkSessionFn) throw new Error("Refresh family linking is not configured.");
      await linkSessionFn(config, {
        sessionId: oldSessionId,
        refreshFamilyId: refreshCookie.refreshSessionId,
        userId
      });
    }
  }
  const sessionId = await tryIssueSessionCookie(request, config, userId, {
    issueRefreshCookie: false,
    deferResponseAuth: true,
    refreshFamilyId: refreshCookie.refreshSessionId
  });
  if (!sessionId) {
    throw new Error("Failed to create refreshed session.");
  }

  const nextToken = {
    ...createRefreshTokenParts(),
    refreshSessionId: refreshCookie.refreshSessionId
  };
  nextToken.cookieValue = `${refreshCookie.refreshSessionId}.${nextToken.secret}`;

  try {
    await rotateRefreshSessionFn(config, {
      refreshSessionId: refreshCookie.refreshSessionId,
      expectedTokenHash: refreshSession.tokenHash,
      tokenHash: nextToken.tokenHash,
      sessionId,
      lastUsedAt: new Date(nowMs).toISOString()
    });
  } catch (error) {
    const deleteSessionFn = getCosmosFn<DeleteSessionFn>("deleteSession");
    try {
      await deleteSessionFn?.(config, sessionId);
    } catch {
      // The session id was never returned to the client; cleanup can be retried separately.
    }
    clearSessionCookieOnResponse(request, config);
    clearRefreshCookieOnResponse(request, config);
    if (error instanceof Error && error.name === "RefreshSessionConflictError") {
      throw new HttpError(401, "Refresh token is invalid or expired.");
    }
    throw new Error("Failed to rotate refresh token.", { cause: error });
  }
  setSessionCookie(request, sessionId, config);
  setAuthResponseHeader(request, CSRF_HEADER_NAME, createSessionCsrfToken(sessionId, config));
  setRefreshCookie(request, nextToken.cookieValue, config);
  return userId;
}
