import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { beforeEach, test, vi } from "vitest";
import type { HttpRequest } from "@azure/functions";
import type { ApiConfig, SessionDocument } from "../types";

const {
  createSessionMock,
  getSessionMock,
  touchSessionMock,
  deleteSessionMock,
  createRefreshSessionMock,
  getRefreshSessionMock,
  rotateRefreshSessionMock,
  revokeRefreshSessionForSessionMock,
  upsertUserProfileMock
} = vi.hoisted(() => ({
  createSessionMock: vi.fn(),
  getSessionMock: vi.fn(),
  touchSessionMock: vi.fn(),
  deleteSessionMock: vi.fn(),
  createRefreshSessionMock: vi.fn(),
  getRefreshSessionMock: vi.fn(),
  rotateRefreshSessionMock: vi.fn(),
  revokeRefreshSessionForSessionMock: vi.fn(),
  upsertUserProfileMock: vi.fn()
}));

vi.mock("./cosmos", () => ({
  createSession: createSessionMock,
  getSession: getSessionMock,
  touchSession: touchSessionMock,
  deleteSession: deleteSessionMock,
  createRefreshSession: createRefreshSessionMock,
  getRefreshSession: getRefreshSessionMock,
  rotateRefreshSession: rotateRefreshSessionMock,
  revokeRefreshSessionForSession: revokeRefreshSessionForSessionMock
}));

vi.mock("./cosmos/entitlementRepository", () => ({
  upsertUserProfile: upsertUserProfileMock
}));

import {
  createSessionCsrfToken,
  HttpError,
  consumeAuthResponseCookies,
  consumeAuthResponseHeaders,
  refreshSessionFromRequest,
  revokeSessionFromRequest,
  resolveUserId
} from "./auth";

interface TestRefreshSessionDocument {
  id: string;
  docType: "refresh_session";
  userId: string;
  tokenHash: string;
  sessionId: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  revokedAt?: string | null;
}

const REFRESH_SECRET_OLD = "secret-old-secret-old-secret-old-12345";

function makeConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    apiEnv: "dev",
    authBypassDev: true,
    migrationsAdminKey: "",
    googleClientId: "test-client.apps.googleusercontent.com",
    googlePlayPackageName: "io.whatfees",
    googlePlayProProductIds: ["pro_access"],
    googlePlayServiceAccountEmail: "service@example.iam.gserviceaccount.com",
    googlePlayServiceAccountPrivateKey: "test-private-key-placeholder",
    allowedOrigins: [],
    cosmosEndpoint: "https://example.documents.azure.com:443/",
    cosmosKey: "fake-key",
    cosmosDatabaseId: "whatfees_dev",
    migrationCosmosDatabaseId: "whatfees_dev",
    entitlementsContainerId: "entitlements",
    syncContainerId: "sync_data",
    migrationRunsContainerId: "migration_runs",
    sessionsContainerId: "sessions",
    sessionCookieName: "whatfees_session",
    refreshCookieName: "whatfees_refresh",
    sessionIdleTtlSeconds: 1000,
    sessionAbsoluteTtlSeconds: 3000,
    sessionTouchIntervalSeconds: 60,
    refreshTokenTtlSeconds: 60 * 24 * 60 * 60,
    ...overrides
  };
}

function makeRequest(headers: Record<string, string> = {}, method = "GET"): HttpRequest {
  const normalized = new Map<string, string>();
  for (const [key, value] of Object.entries(headers)) {
    normalized.set(key.toLowerCase(), value);
  }

  return {
    method,
    headers: {
      get(name: string) {
        return normalized.get(name.toLowerCase()) ?? null;
      }
    }
  } as unknown as HttpRequest;
}

function buildSession(overrides: Partial<SessionDocument> = {}): SessionDocument {
  const now = Date.now();
  return {
    id: "session-1",
    docType: "session",
    userId: "session-user",
    createdAt: new Date(now - 120_000).toISOString(),
    lastSeenAt: new Date(now - 120_000).toISOString(),
    idleExpiresAt: new Date(now + 600_000).toISOString(),
    absoluteExpiresAt: new Date(now + 1_200_000).toISOString(),
    ...overrides
  };
}

function hashRefreshSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function buildRefreshSession(overrides: Partial<TestRefreshSessionDocument> = {}): TestRefreshSessionDocument {
  const now = Date.now();
  return {
    id: "refresh-1",
    docType: "refresh_session",
    userId: "refresh-user",
    tokenHash: hashRefreshSecret(REFRESH_SECRET_OLD),
    sessionId: "session-old",
    createdAt: new Date(now - 120_000).toISOString(),
    lastUsedAt: new Date(now - 120_000).toISOString(),
    expiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
    revokedAt: null,
    ...overrides
  };
}

type TestResponseCookie = ReturnType<typeof consumeAuthResponseCookies>[number];

function findLastCookie(cookies: TestResponseCookie[], name: string): TestResponseCookie | null {
  return cookies.filter((cookie) => cookie.name === name).at(-1) ?? null;
}

function createTelemetryLogger() {
  return {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue(null);
  touchSessionMock.mockResolvedValue(undefined);
  deleteSessionMock.mockResolvedValue(undefined);
  createSessionMock.mockImplementation(async (_config: ApiConfig, input: SessionDocument) => input);
  createRefreshSessionMock.mockImplementation(async (_config: ApiConfig, input: unknown) => input);
  getRefreshSessionMock.mockResolvedValue(null);
  rotateRefreshSessionMock.mockResolvedValue(undefined);
  revokeRefreshSessionForSessionMock.mockResolvedValue(undefined);
  upsertUserProfileMock.mockResolvedValue(undefined);
});

test("rejects unauthenticated request", async () => {
  const request = makeRequest();
  const telemetry = createTelemetryLogger();

  await assert.rejects(
    () => resolveUserId(request, makeConfig(), {
      telemetry: {
        logger: telemetry,
        route: "auth_me",
        workspaceScope: "unknown"
      }
    }),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 401);
      assert.equal(error.message, "Authentication is required.");
      return true;
    }
  );
  assert.equal(telemetry.warn.mock.calls.length, 1);
  assert.deepEqual(telemetry.warn.mock.calls[0]?.[1], {
    category: "auth",
    route: "auth_me",
    ua_family: "unknown",
    has_session_cookie: "false",
    has_bearer_header: "false",
    has_csrf_header: "false",
    workspace_scope: "unknown",
    auth_method: "none",
    auth_result: "401",
    outcome: "authentication_required"
  });
});

test("valid bearer token resolves user and issues session cookie", async () => {
  const request = makeRequest({ authorization: "Bearer token-abc" });
  const telemetry = createTelemetryLogger();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        aud: "test-client.apps.googleusercontent.com",
        sub: "google-user-42",
        name: "Alice Test",
        picture: "https://example.test/avatar.png"
      })
    }) as Response) as typeof fetch;

  try {
    const userId = await resolveUserId(request, makeConfig(), {
      allowBearerAuth: true,
      telemetry: {
        logger: telemetry,
        route: "auth_me",
        workspaceScope: "personal"
      }
    });
    assert.equal(userId, "google-user-42");
    assert.equal(createSessionMock.mock.calls.length, 1);
    assert.equal(upsertUserProfileMock.mock.calls.length, 1);
    assert.deepEqual(upsertUserProfileMock.mock.calls[0]?.[1], {
      userId: "google-user-42",
      displayName: "Alice Test",
      displayNameSource: "provider",
      photoUrl: "https://example.test/avatar.png"
    });

    const authHeaders = consumeAuthResponseHeaders(request);
    const authCookies = consumeAuthResponseCookies(request);
    const sessionCookie = authCookies.find((cookie) => cookie.name === "whatfees_session");
    const refreshCookie = authCookies.find((cookie) => cookie.name === "whatfees_refresh");
    assert.ok(sessionCookie);
    assert.equal(sessionCookie.httpOnly, true);
    assert.equal(sessionCookie.sameSite, "Lax");
    assert.ok(refreshCookie);
    assert.equal(refreshCookie.httpOnly, true);
    assert.equal(refreshCookie.sameSite, "Lax");
    assert.match(String(refreshCookie.value), /^[A-Za-z0-9_-]{16,128}\.[A-Za-z0-9_-]{32,256}$/);
    assert.equal(createRefreshSessionMock.mock.calls.length, 1);
    const createdRefreshSession = createRefreshSessionMock.mock.calls[0]?.[1] as TestRefreshSessionDocument;
    assert.equal(createdRefreshSession.userId, "google-user-42");
    assert.equal(createdRefreshSession.sessionId, sessionCookie.value);
    assert.notEqual(createdRefreshSession.tokenHash, refreshCookie.value.split(".")[1]);
    assert.equal(telemetry.info.mock.calls.length, 1);
    assert.deepEqual(telemetry.info.mock.calls[0]?.[1], {
      category: "auth",
      route: "auth_me",
      ua_family: "unknown",
      has_session_cookie: "false",
      has_bearer_header: "true",
      has_csrf_header: "false",
      workspace_scope: "personal",
      auth_method: "bearer",
      auth_result: "success",
      outcome: "bearer_authenticated"
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("valid bearer token is rejected unless bearer auth is explicitly allowed", async () => {
  const request = makeRequest({ authorization: "Bearer token-abc" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async () =>
    ({
      ok: true,
      json: async () => ({
        aud: "test-client.apps.googleusercontent.com",
        sub: "google-user-42"
      })
    }) as Response
  ) as typeof fetch;

  try {
    await assert.rejects(
      () => resolveUserId(request, makeConfig()),
      (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.equal(error.status, 401);
        assert.equal(error.message, "Authentication is required.");
        return true;
      }
    );
    assert.equal((globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length, 0);
    assert.equal(createSessionMock.mock.calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("repeated bearer bootstrap requests reuse the same session id for the same token", async () => {
  const requestA = makeRequest({ authorization: "Bearer token-abc" });
  const requestB = makeRequest({ authorization: "Bearer token-abc" });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        aud: "test-client.apps.googleusercontent.com",
        sub: "google-user-42"
      })
    }) as Response) as typeof fetch;

  try {
    const userA = await resolveUserId(requestA, makeConfig(), { allowBearerAuth: true });
    const userB = await resolveUserId(requestB, makeConfig(), { allowBearerAuth: true });

    assert.equal(userA, "google-user-42");
    assert.equal(userB, "google-user-42");
    assert.equal(createSessionMock.mock.calls.length, 2);

    const firstSession = createSessionMock.mock.calls[0]?.[1] as SessionDocument;
    const secondSession = createSessionMock.mock.calls[1]?.[1] as SessionDocument;
    assert.equal(firstSession.userId, "google-user-42");
    assert.equal(secondSession.userId, "google-user-42");
    assert.equal(firstSession.id, secondSession.id);

    const cookiesA = consumeAuthResponseCookies(requestA);
    const cookiesB = consumeAuthResponseCookies(requestB);
    assert.equal(findLastCookie(cookiesA, "whatfees_session")?.value, findLastCookie(cookiesB, "whatfees_session")?.value);
    assert.notEqual(findLastCookie(cookiesA, "whatfees_refresh")?.value ?? "", "");
    assert.notEqual(findLastCookie(cookiesB, "whatfees_refresh")?.value ?? "", "");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("valid session cookie authenticates and touches stale sessions", async () => {
  const request = makeRequest({ cookie: "whatfees_session=session-1" });
  const telemetry = createTelemetryLogger();
  getSessionMock.mockResolvedValue(buildSession());

  const userId = await resolveUserId(request, makeConfig(), {
    telemetry: {
      logger: telemetry,
      route: "sync_pull",
      workspaceScope: "workspace"
    }
  });
  assert.equal(userId, "session-user");
  assert.equal(touchSessionMock.mock.calls.length, 1);
  assert.equal(createSessionMock.mock.calls.length, 0);

  const authHeaders = consumeAuthResponseHeaders(request);
  const authCookies = consumeAuthResponseCookies(request);
  const touchedSessionCookie = authCookies.find((cookie) => cookie.name === "whatfees_session");
  assert.equal(touchedSessionCookie?.value, "session-1");
  assert.equal(telemetry.info.mock.calls.length, 1);
  assert.equal(telemetry.info.mock.calls[0]?.[1]?.auth_method, "session");
  assert.equal(telemetry.info.mock.calls[0]?.[1]?.auth_result, "success");
});

test("valid session cookie skips touch when touch interval is not reached", async () => {
  const now = Date.now();
  const request = makeRequest({ cookie: "whatfees_session=session-1" });
  getSessionMock.mockResolvedValue(
    buildSession({
      lastSeenAt: new Date(now - 10_000).toISOString()
    })
  );

  const userId = await resolveUserId(
    request,
    makeConfig({
      sessionTouchIntervalSeconds: 30
    })
  );
  assert.equal(userId, "session-user");
  assert.equal(touchSessionMock.mock.calls.length, 0);

  const authHeaders = consumeAuthResponseHeaders(request);
  assert.equal(authHeaders["Set-Cookie"], undefined);
  assert.equal(consumeAuthResponseCookies(request).length, 0);
});

test("expired session is cleared without falling back to bearer auth", async () => {
  const request = makeRequest({
    cookie: "whatfees_session=expired-1",
    authorization: "Bearer token-abc"
  });
  getSessionMock.mockResolvedValue(
    buildSession({
      id: "expired-1",
      idleExpiresAt: new Date(Date.now() - 5_000).toISOString()
    })
  );

  const originalFetch = globalThis.fetch;
  const fetchMock = vi.fn(async () =>
    ({
      ok: true,
      json: async () => ({
        aud: "test-client.apps.googleusercontent.com",
        sub: "google-user-99"
      })
    }) as Response);
  globalThis.fetch = fetchMock as typeof fetch;

  try {
    await assert.rejects(
      () => resolveUserId(request, makeConfig()),
      (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.equal(error.status, 401);
        assert.equal(error.message, "Authentication is required.");
        return true;
      }
    );
    assert.equal(deleteSessionMock.mock.calls.length, 1);
    assert.equal(createSessionMock.mock.calls.length, 0);
    assert.equal(fetchMock.mock.calls.length, 0);

    const authCookies = consumeAuthResponseCookies(request);
    const sessionCookie = findLastCookie(authCookies, "whatfees_session");
    assert.ok(sessionCookie);
    assert.equal(sessionCookie.value, "");
    assert.equal(sessionCookie.maxAge, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("session auth takes precedence over invalid bearer token", async () => {
  const request = makeRequest({
    cookie: "whatfees_session=session-1",
    authorization: "Bearer broken-token"
  });
  getSessionMock.mockResolvedValue(buildSession());

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      ok: false
    }) as Response) as typeof fetch;

  try {
    const userId = await resolveUserId(request, makeConfig());
    assert.equal(userId, "session-user");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("invalid bearer token is rejected when no valid session exists", async () => {
  const request = makeRequest({ authorization: "Bearer token-invalid" });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      ok: false
    }) as Response) as typeof fetch;

  try {
    await assert.rejects(
      () => resolveUserId(request, makeConfig(), { allowBearerAuth: true }),
      (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.equal(error.status, 401);
        assert.equal(error.message, "Invalid Google ID token.");
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("unsafe request with session auth rejects when csrf token is missing", async () => {
  const request = makeRequest({ cookie: "whatfees_session=session-1" }, "POST");
  const telemetry = createTelemetryLogger();
  getSessionMock.mockResolvedValue(buildSession());

  await assert.rejects(
    () => resolveUserId(request, makeConfig(), {
      telemetry: {
        logger: telemetry,
        route: "sync_push",
        workspaceScope: "personal"
      }
    }),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 403);
      assert.equal(error.message, "Invalid CSRF token.");
      return true;
    }
  );
  assert.equal(telemetry.warn.mock.calls.length, 1);
  assert.equal(telemetry.warn.mock.calls[0]?.[1]?.auth_result, "403");
  assert.equal(telemetry.warn.mock.calls[0]?.[1]?.outcome, "invalid_csrf");
});

test("unsafe request with session auth accepts matching csrf token", async () => {
  const config = makeConfig();
  const csrfToken = createSessionCsrfToken("session-1", config);
  const request = makeRequest({
    cookie: "whatfees_session=session-1",
    "x-csrf-token": csrfToken
  }, "POST");
  getSessionMock.mockResolvedValue(buildSession());

  const userId = await resolveUserId(request, config);
  assert.equal(userId, "session-user");
});

test("refresh token cookie rotates and issues a new session cookie without bearer auth", async () => {
  const request = makeRequest({
    cookie: `whatfees_refresh=refresh-1.${REFRESH_SECRET_OLD}`
  }, "POST");
  getRefreshSessionMock.mockResolvedValue(buildRefreshSession());

  const userId = await refreshSessionFromRequest(request, makeConfig());

  assert.equal(userId, "refresh-user");
  assert.equal(createSessionMock.mock.calls.length, 1);
  const createdSession = createSessionMock.mock.calls[0]?.[1] as SessionDocument;
  assert.equal(createdSession.userId, "refresh-user");
  assert.equal(rotateRefreshSessionMock.mock.calls.length, 1);
  const rotation = rotateRefreshSessionMock.mock.calls[0]?.[1] as {
    refreshSessionId: string;
    expectedTokenHash: string;
    tokenHash: string;
    sessionId: string;
  };
  assert.equal(rotation.refreshSessionId, "refresh-1");
  assert.equal(rotation.expectedTokenHash, hashRefreshSecret(REFRESH_SECRET_OLD));
  assert.equal(rotation.sessionId, createdSession.id);
  assert.notEqual(rotation.tokenHash, hashRefreshSecret(REFRESH_SECRET_OLD));

  const cookies = consumeAuthResponseCookies(request);
  assert.ok(cookies.find((cookie) => cookie.name === "whatfees_session" && cookie.value === createdSession.id));
  assert.ok(cookies.find((cookie) => cookie.name === "whatfees_refresh" && cookie.value.startsWith("refresh-1.")));
});

test("refresh token rotation failure removes the unissued session and clears auth cookies", async () => {
  const request = makeRequest({
    cookie: `whatfees_refresh=refresh-1.${REFRESH_SECRET_OLD}`
  }, "POST");
  getRefreshSessionMock.mockResolvedValue(buildRefreshSession());
  rotateRefreshSessionMock.mockRejectedValue(
    Object.assign(new Error("Refresh token was already rotated."), {
      name: "RefreshSessionConflictError"
    })
  );

  await assert.rejects(
    () => refreshSessionFromRequest(request, makeConfig()),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 401);
      assert.equal(error.message, "Refresh token is invalid or expired.");
      return true;
    }
  );

  const createdSession = createSessionMock.mock.calls[0]?.[1] as SessionDocument;
  assert.deepEqual(deleteSessionMock.mock.calls[0]?.slice(1), [createdSession.id]);
  const cookies = consumeAuthResponseCookies(request);
  assert.equal(findLastCookie(cookies, "whatfees_session")?.maxAge, 0);
  assert.equal(findLastCookie(cookies, "whatfees_refresh")?.maxAge, 0);
});

test("refresh token rejects missing cookies as expired auth and clears refresh cookie", async () => {
  const request = makeRequest({}, "POST");

  await assert.rejects(
    () => refreshSessionFromRequest(request, makeConfig()),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 401);
      assert.equal(error.message, "Refresh token is invalid or expired.");
      return true;
    }
  );

  const clearedRefreshCookie = consumeAuthResponseCookies(request).find((cookie) => cookie.name === "whatfees_refresh");
  assert.equal(clearedRefreshCookie?.value, "");
  assert.equal(clearedRefreshCookie?.maxAge, 0);
});

test("refresh token rejects replayed or revoked cookies and clears refresh cookie", async () => {
  const request = makeRequest({
    cookie: `whatfees_refresh=refresh-1.${REFRESH_SECRET_OLD}`
  }, "POST");
  getRefreshSessionMock.mockResolvedValue(buildRefreshSession({
    tokenHash: hashRefreshSecret("different-secret")
  }));

  await assert.rejects(
    () => refreshSessionFromRequest(request, makeConfig()),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 401);
      assert.equal(error.message, "Refresh token is invalid or expired.");
      return true;
    }
  );

  const clearedRefreshCookie = consumeAuthResponseCookies(request).find((cookie) => cookie.name === "whatfees_refresh");
  assert.equal(clearedRefreshCookie?.value, "");
  assert.equal(clearedRefreshCookie?.maxAge, 0);
});

test("logout revokes the refresh token tied to the current session", async () => {
  const request = makeRequest({
    cookie: `whatfees_session=session-1; whatfees_refresh=refresh-1.${REFRESH_SECRET_OLD}`
  }, "POST");

  const revoked = await revokeSessionFromRequest(request, makeConfig());

  assert.equal(revoked, true);
  assert.equal(deleteSessionMock.mock.calls.length, 1);
  assert.deepEqual(revokeRefreshSessionForSessionMock.mock.calls[0]?.slice(1), ["session-1"]);
  const cookies = consumeAuthResponseCookies(request);
  assert.ok(cookies.find((cookie) => cookie.name === "whatfees_session" && cookie.maxAge === 0));
  assert.ok(cookies.find((cookie) => cookie.name === "whatfees_refresh" && cookie.maxAge === 0));
});

test("logout fails when server-side session revocation cannot be confirmed", async () => {
  const request = makeRequest({
    cookie: `whatfees_session=session-1; whatfees_refresh=refresh-1.${REFRESH_SECRET_OLD}`
  }, "POST");
  deleteSessionMock.mockRejectedValue(new Error("Cosmos unavailable"));

  await assert.rejects(
    () => revokeSessionFromRequest(request, makeConfig()),
    /Failed to revoke server session/
  );

  assert.equal(revokeRefreshSessionForSessionMock.mock.calls.length, 1);
  const cookies = consumeAuthResponseCookies(request);
  assert.equal(findLastCookie(cookies, "whatfees_session")?.maxAge, 0);
  assert.equal(findLastCookie(cookies, "whatfees_refresh")?.maxAge, 0);
});
