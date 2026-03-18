import type { HttpRequest } from "@azure/functions";
import type { ApiConfig } from "../../types";
import { upsertUserProfile } from "../cosmos";
import { logAuthTelemetry, type TelemetryLogger, type WorkspaceScope } from "../telemetry";
import { hasBearerAuthHeader, isUnsafeMethod, parseSessionIdFromCookie, CSRF_HEADER_NAME } from "./cookies";
import { createSessionCsrfToken } from "./csrf";
import { HttpError } from "./errors";
import { googleBearerAuthProvider } from "./providers/google";
import type { BearerAuthIdentity, BearerAuthProvider } from "./providers/types";
import { resolveUserIdFromSession, tryIssueSessionCookie } from "./sessions";

interface ResolveUserIdOptions {
  issueSessionCookie?: boolean;
  telemetry?: {
    logger?: TelemetryLogger | null;
    route: string;
    workspaceScope?: WorkspaceScope;
  };
}

const DEFAULT_BEARER_AUTH_PROVIDERS: BearerAuthProvider[] = [
  googleBearerAuthProvider
];

async function resolveUserIdFromBearer(
  request: HttpRequest,
  config: ApiConfig,
  providers: BearerAuthProvider[]
): Promise<BearerAuthIdentity | null> {
  const authHeader = request.headers.get("authorization") || "";
  const isBearer = authHeader.toLowerCase().startsWith("bearer ");
  if (!isBearer) return null;

  const bearerToken = authHeader.slice(7).trim();
  if (!bearerToken) return null;

  for (const provider of providers) {
    const identity = await provider.resolveIdentityFromBearerToken(bearerToken, config);
    if (identity) {
      return identity;
    }
  }

  throw new HttpError(401, "Invalid Google ID token.");
}

export async function resolveUserId(
  request: HttpRequest,
  config: ApiConfig,
  options: ResolveUserIdOptions = {}
): Promise<string> {
  const telemetry = options.telemetry;
  const hasSessionCookie = !!parseSessionIdFromCookie(request, config);
  const sessionUserId = await resolveUserIdFromSession(request, config);
  if (sessionUserId) {
    if (isUnsafeMethod(request.method) && !hasBearerAuthHeader(request)) {
      const sessionId = parseSessionIdFromCookie(request, config);
      const expectedCsrfToken = sessionId ? createSessionCsrfToken(sessionId, config) : "";
      const providedCsrfToken = String(request.headers.get(CSRF_HEADER_NAME) || "").trim();
      if (!providedCsrfToken || !expectedCsrfToken || providedCsrfToken !== expectedCsrfToken) {
        if (telemetry) {
          logAuthTelemetry({
            logger: telemetry.logger,
            level: "warn",
            request,
            config,
            route: telemetry.route,
            workspaceScope: telemetry.workspaceScope,
            authMethod: "session",
            authResult: "403",
            outcome: "invalid_csrf"
          });
        }
        throw new HttpError(403, "Invalid CSRF token.");
      }
    }
    if (telemetry) {
      logAuthTelemetry({
        logger: telemetry.logger,
        request,
        config,
        route: telemetry.route,
        workspaceScope: telemetry.workspaceScope,
        authMethod: "session",
        authResult: "success",
        outcome: "session_authenticated"
      });
    }
    return sessionUserId;
  }

  let bearerIdentity: BearerAuthIdentity | null = null;
  try {
    bearerIdentity = await resolveUserIdFromBearer(request, config, DEFAULT_BEARER_AUTH_PROVIDERS);
  } catch (error) {
    if (telemetry && error instanceof HttpError && error.status === 401) {
      logAuthTelemetry({
        logger: telemetry.logger,
        level: "warn",
        request,
        config,
        route: telemetry.route,
        workspaceScope: telemetry.workspaceScope,
        authMethod: "bearer",
        authResult: "401",
        outcome: hasSessionCookie ? "session_fallback_invalid_bearer" : "invalid_bearer_token"
      });
    }
    throw error;
  }
  if (bearerIdentity) {
    if (bearerIdentity.displayName) {
      try {
        await upsertUserProfile(config, {
          userId: bearerIdentity.userId,
          displayName: bearerIdentity.displayName,
          displayNameSource: "provider",
          photoUrl: bearerIdentity.photoUrl
        });
      } catch {
        // Keep auth resilient even if profile enrichment fails.
      }
    }
    if (options.issueSessionCookie !== false) {
      await tryIssueSessionCookie(request, config, bearerIdentity.userId);
    }
    if (telemetry) {
      logAuthTelemetry({
        logger: telemetry.logger,
        request,
        config,
        route: telemetry.route,
        workspaceScope: telemetry.workspaceScope,
        authMethod: "bearer",
        authResult: "success",
        outcome: hasSessionCookie ? "session_fallback_to_bearer" : "bearer_authenticated"
      });
    }
    return bearerIdentity.userId;
  }

  if (telemetry) {
    logAuthTelemetry({
      logger: telemetry.logger,
      level: "warn",
      request,
      config,
      route: telemetry.route,
      workspaceScope: telemetry.workspaceScope,
      authMethod: "none",
      authResult: "401",
      outcome: hasSessionCookie ? "session_missing_or_expired" : "authentication_required"
    });
  }
  throw new HttpError(401, "Authentication is required.");
}
