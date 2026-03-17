import type { HttpRequest } from "@azure/functions";
import type { ApiConfig } from "../../types";
import { upsertUserProfile } from "../cosmos";
import { hasBearerAuthHeader, isUnsafeMethod, parseSessionIdFromCookie, CSRF_HEADER_NAME } from "./cookies";
import { createSessionCsrfToken } from "./csrf";
import { HttpError } from "./errors";
import { googleBearerAuthProvider } from "./providers/google";
import type { BearerAuthIdentity, BearerAuthProvider } from "./providers/types";
import { resolveUserIdFromSession, tryIssueSessionCookie } from "./sessions";

interface ResolveUserIdOptions {
  issueSessionCookie?: boolean;
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

  const bearerIdentity = await resolveUserIdFromBearer(request, config, DEFAULT_BEARER_AUTH_PROVIDERS);
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
    return bearerIdentity.userId;
  }

  throw new HttpError(401, "Authentication is required.");
}
