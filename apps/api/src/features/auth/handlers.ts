import { type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import {
  clearSessionCookie,
  HttpError,
  refreshSessionFromRequest,
  resolveUserId,
  revokeSessionFromRequest
} from "../../lib/auth";
import { getConfig } from "../../lib/config";
import { revokeAllRefreshSessionsForUser, revokeAllSessionsForUser } from "../../lib/cosmos/sessionRepository";
import { errorResponse, jsonResponse, maybeHandleHttpGuards } from "../../lib/http";
import { logApiTelemetry } from "../../lib/telemetry";

function logAuthRouteFailure(
  request: HttpRequest,
  context: InvocationContext,
  route: string,
  error: unknown
): void {
  const config = getConfig();
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
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const userId = await resolveUserId(request, config, {
      telemetry: {
        logger: context,
        route: "auth_me",
        workspaceScope: "unknown"
      }
    });
    return jsonResponse(request, config, 200, {
      ok: true,
      userId
    });
  } catch (error) {
    logAuthRouteFailure(request, context, "auth_me", error);
    context.error("GET /auth/me failed", error);
    return errorResponse(request, config, error, "Failed to resolve auth session.");
  }
}

export async function authLogout(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
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
  } catch (error) {
    logAuthRouteFailure(request, context, "auth_logout", error);
    context.error("POST /auth/logout failed", error);
    return errorResponse(request, config, error, "Failed to logout.");
  }
}

export async function authRefresh(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
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
  } catch (error) {
    logAuthRouteFailure(request, context, "auth_refresh", error);
    context.error("POST /auth/refresh failed", error);
    return errorResponse(request, config, error, "Failed to refresh auth session.");
  }
}

export async function authLogoutAll(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
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
  } catch (error) {
    logAuthRouteFailure(request, context, "auth_logout_all", error);
    context.error("POST /auth/logout-all failed", error);
    return errorResponse(request, config, error, "Failed to logout all sessions.");
  }
}
