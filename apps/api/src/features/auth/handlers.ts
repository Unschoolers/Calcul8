import { type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import {
  clearSessionCookie,
  HttpError,
  refreshSessionFromRequest,
  resolveUserId,
  revokeSessionFromRequest
} from "../../lib/auth";
import { revokeAllRefreshSessionsForUser, revokeAllSessionsForUser } from "../../lib/cosmos/sessionRepository";
import { getUserProfile } from "../../lib/cosmos/entitlementRepository";
import { executeHttpHandler, jsonResponse } from "../../lib/http";
import { logApiTelemetry } from "../../lib/telemetry";
import type { ApiConfig } from "../../types";

function logAuthRouteFailure(
  request: HttpRequest,
  context: InvocationContext,
  config: ApiConfig,
  route: string,
  error: unknown
): void {
  if (error instanceof HttpError && (error.status === 401 || error.status === 403 || error.status === 409)) {
    logApiTelemetry({
      logger: context,
      level: "warn",
      request,
      config,
      route,
      workspaceScope: "unknown",
      outcome: `http_${error.status}`
    });
    return;
  }
}

export async function authMe(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, {
    errorLogMessage: "GET /auth/me failed",
    fallbackErrorMessage: "Failed to resolve auth session.",
    operation: async ({ config }) => {
    const userId = await resolveUserId(request, config, {
      allowBearerAuth: true,
      telemetry: {
        logger: context,
        route: "auth_me",
        workspaceScope: "unknown"
      }
    });
    // Display identity is optional. A transient profile read must not invalidate
    // an otherwise healthy authenticated session.
    const storedProfile = await getUserProfile(config, userId).catch(() => {
      logApiTelemetry({
        logger: context,
        level: "warn",
        request,
        config,
        route: "auth_me",
        workspaceScope: "unknown",
        outcome: "profile_lookup_failed"
      });
      return null;
    });
    return jsonResponse(request, config, 200, {
      ok: true,
      userId,
      profile: storedProfile
        ? {
            displayName: storedProfile.displayName,
            photoUrl: storedProfile.photoUrl
          }
        : null
    });
    },
    onError: (error, { config }) => logAuthRouteFailure(request, context, config, "auth_me", error)
  });
}

export async function authLogout(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, {
    errorLogMessage: "POST /auth/logout failed",
    fallbackErrorMessage: "Failed to logout.",
    operation: async ({ config }) => {
    // Keep this endpoint idempotent: missing auth still clears cookie client-side.
    try {
      await resolveUserId(request, config, {
        issueSessionCookie: false,
        telemetry: {
          logger: context,
          route: "auth_logout",
          workspaceScope: "unknown"
        }
      });
    } catch {
      // Ignore and continue to cookie/session cleanup.
    }
    const revokedCurrentSession = await revokeSessionFromRequest(request, config);

    return jsonResponse(request, config, 200, {
      ok: true,
      revokedCurrentSession
    });
    },
    onError: (error, { config }) => logAuthRouteFailure(request, context, config, "auth_logout", error)
  });
}

export async function authRefresh(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, {
    errorLogMessage: "POST /auth/refresh failed",
    fallbackErrorMessage: "Failed to refresh auth session.",
    operation: async ({ config }) => {
    const userId = await refreshSessionFromRequest(request, config);
    logApiTelemetry({
      logger: context,
      level: "info",
      request,
      config,
      route: "auth_refresh",
      workspaceScope: "unknown",
      outcome: "session_refreshed"
    });
    return jsonResponse(request, config, 200, {
      ok: true,
      userId
    });
    },
    onError: (error, { config }) => logAuthRouteFailure(request, context, config, "auth_refresh", error)
  });
}

export async function authLogoutAll(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, {
    errorLogMessage: "POST /auth/logout-all failed",
    fallbackErrorMessage: "Failed to logout all sessions.",
    operation: async ({ config }) => {
    const userId = await resolveUserId(request, config, {
      issueSessionCookie: false,
      telemetry: {
        logger: context,
        route: "auth_logout_all",
        workspaceScope: "unknown"
      }
    });
    const revokedSessionCount = await revokeAllSessionsForUser(config, userId);
    const revokedRefreshSessionCount = await revokeAllRefreshSessionsForUser(config, userId);
    await clearSessionCookie(request, config);

    return jsonResponse(request, config, 200, {
      ok: true,
      userId,
      revokedSessionCount,
      revokedRefreshSessionCount
    });
    },
    onError: (error, { config }) => logAuthRouteFailure(request, context, config, "auth_logout_all", error)
  });
}
