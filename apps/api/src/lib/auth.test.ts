import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import type { HttpRequest } from "@azure/functions";
import type { ApiConfig, SessionDocument } from "../types";

const {
  createSessionMock,
  getSessionMock,
  touchSessionMock,
  deleteSessionMock
} = vi.hoisted(() => ({
  createSessionMock: vi.fn(),
  getSessionMock: vi.fn(),
  touchSessionMock: vi.fn(),
  deleteSessionMock: vi.fn()
}));

vi.mock("./cosmos", () => ({
  createSession: createSessionMock,
  getSession: getSessionMock,
  touchSession: touchSessionMock,
  deleteSession: deleteSessionMock
}));

import {
  createSessionCsrfToken,
  HttpError,
  consumeAuthResponseHeaders,
  resolveUserId
} from "./auth";

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
    entitlementsContainerId: "entitlements",
    syncContainerId: "sync_data",
    migrationRunsContainerId: "migration_runs",
    sessionsContainerId: "sessions",
    sessionCookieName: "whatfees_session",
    sessionIdleTtlSeconds: 1000,
    sessionAbsoluteTtlSeconds: 3000,
    sessionTouchIntervalSeconds: 60,
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

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue(null);
  touchSessionMock.mockResolvedValue(undefined);
  deleteSessionMock.mockResolvedValue(undefined);
  createSessionMock.mockImplementation(async (_config: ApiConfig, input: SessionDocument) => input);
});

test("rejects unauthenticated request", async () => {
  const request = makeRequest();

  await assert.rejects(
    () => resolveUserId(request, makeConfig()),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 401);
      assert.equal(error.message, "Authentication is required.");
      return true;
    }
  );
});

test("valid bearer token resolves user and issues session cookie", async () => {
  const request = makeRequest({ authorization: "Bearer token-abc" });

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
    const userId = await resolveUserId(request, makeConfig());
    assert.equal(userId, "google-user-42");
    assert.equal(createSessionMock.mock.calls.length, 1);

    const authHeaders = consumeAuthResponseHeaders(request);
    const setCookie = authHeaders["Set-Cookie"] ?? "";
    assert.match(setCookie, /^whatfees_session=/);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("valid session cookie authenticates and touches stale sessions", async () => {
  const request = makeRequest({ cookie: "whatfees_session=session-1" });
  getSessionMock.mockResolvedValue(buildSession());

  const userId = await resolveUserId(request, makeConfig());
  assert.equal(userId, "session-user");
  assert.equal(touchSessionMock.mock.calls.length, 1);
  assert.equal(createSessionMock.mock.calls.length, 0);

  const authHeaders = consumeAuthResponseHeaders(request);
  assert.match(String(authHeaders["Set-Cookie"]), /^whatfees_session=session-1/);
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
});

test("expired session is cleared and bearer fallback is used", async () => {
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
  globalThis.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        aud: "test-client.apps.googleusercontent.com",
        sub: "google-user-99"
      })
    }) as Response) as typeof fetch;

  try {
    const userId = await resolveUserId(request, makeConfig());
    assert.equal(userId, "google-user-99");
    assert.equal(deleteSessionMock.mock.calls.length, 1);
    assert.equal(createSessionMock.mock.calls.length, 1);

    const setCookie = consumeAuthResponseHeaders(request)["Set-Cookie"] ?? "";
    assert.match(setCookie, /^whatfees_session=/);
    assert.doesNotMatch(setCookie, /^whatfees_session=;/);
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
      () => resolveUserId(request, makeConfig()),
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
  getSessionMock.mockResolvedValue(buildSession());

  await assert.rejects(
    () => resolveUserId(request, makeConfig()),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 403);
      assert.equal(error.message, "Invalid CSRF token.");
      return true;
    }
  );
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
