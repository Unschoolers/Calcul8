import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { clearSessionCookie, resolveUserId, revokeSessionFromRequest } from "../lib/auth";
import { getConfig } from "../lib/config";
import { revokeAllSessionsForUser } from "../lib/cosmos";
import { errorResponse, jsonResponse, maybeHandleHttpGuards } from "../lib/http";

export async function authMe(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const config = getConfig();
  const guardResponse = maybeHandleHttpGuards(request, config);
  if (guardResponse) return guardResponse;

  try {
    const userId = await resolveUserId(request, config);
    return jsonResponse(request, config, 200, {
      ok: true,
      userId
    });
  } catch (error) {
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
      await resolveUserId(request, config, { issueSessionCookie: false });
    } catch {
      // Ignore and continue to cookie/session cleanup.
    }
    const revokedCurrentSession = await revokeSessionFromRequest(request, config);

    return jsonResponse(request, config, 200, {
      ok: true,
      revokedCurrentSession
    });
  } catch (error) {
    context.error("POST /auth/logout failed", error);
    return errorResponse(request, config, error, "Failed to logout.");
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
    const userId = await resolveUserId(request, config, { issueSessionCookie: false });
    const revokedSessionCount = await revokeAllSessionsForUser(config, userId);
    await clearSessionCookie(request, config);

    return jsonResponse(request, config, 200, {
      ok: true,
      userId,
      revokedSessionCount
    });
  } catch (error) {
    context.error("POST /auth/logout-all failed", error);
    return errorResponse(request, config, error, "Failed to logout all sessions.");
  }
}

app.http("authMe", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "auth/me",
  handler: authMe
});

app.http("authLogout", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "auth/logout",
  handler: authLogout
});

app.http("authLogoutAll", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "auth/logout-all",
  handler: authLogoutAll
});
