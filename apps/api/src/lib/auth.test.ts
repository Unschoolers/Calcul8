import assert from "node:assert/strict";
import test from "node:test";
import type { HttpRequest } from "@azure/functions";
import { HttpError, resolveUserId } from "./auth";
import type { ApiConfig } from "../types";

function makeConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    apiEnv: "dev",
    authBypassDev: true,
    googleClientId: "test-client.apps.googleusercontent.com",
    allowedOrigins: [],
    cosmosEndpoint: "https://example.documents.azure.com:443/",
    cosmosKey: "fake-key",
    cosmosDatabaseId: "calcul8tr_dev",
    entitlementsContainerId: "entitlements",
    syncContainerId: "sync_data",
    ...overrides
  };
}

function makeRequest(headers: Record<string, string> = {}): HttpRequest {
  const normalized = new Map<string, string>();
  for (const [key, value] of Object.entries(headers)) {
    normalized.set(key.toLowerCase(), value);
  }

  return {
    headers: {
      get(name: string) {
        return normalized.get(name.toLowerCase()) ?? null;
      }
    }
  } as unknown as HttpRequest;
}

test("prod rejects x-user-id header without bearer token", async () => {
  const config = makeConfig({
    apiEnv: "prod",
    authBypassDev: false
  });
  const request = makeRequest({ "x-user-id": "qa-user" });

  await assert.rejects(
    () => resolveUserId(request, config),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 401);
      assert.equal(error.message, "Authentication is required.");
      return true;
    }
  );
});

test("dev bypass accepts x-user-id when enabled", async () => {
  const config = makeConfig({
    apiEnv: "dev",
    authBypassDev: true
  });
  const request = makeRequest({ "x-user-id": "qa-user" });

  const userId = await resolveUserId(request, config);
  assert.equal(userId, "qa-user");
});

test("dev bypass requires x-user-id when enabled and no bearer is present", async () => {
  const config = makeConfig({
    apiEnv: "dev",
    authBypassDev: true
  });
  const request = makeRequest();

  await assert.rejects(
    () => resolveUserId(request, config),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 401);
      assert.equal(
        error.message,
        "Missing x-user-id. In dev mode, send x-user-id header until Google auth is wired."
      );
      return true;
    }
  );
});

test("bearer token with wrong audience is rejected", async () => {
  const config = makeConfig({
    apiEnv: "prod",
    authBypassDev: false,
    googleClientId: "expected-client.apps.googleusercontent.com"
  });
  const request = makeRequest({ authorization: "Bearer token-123" });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        aud: "other-client.apps.googleusercontent.com",
        sub: "google-user-1"
      })
    }) as Response) as typeof fetch;

  try {
    await assert.rejects(
      () => resolveUserId(request, config),
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

test("bearer token is rejected when Google tokeninfo is not OK", async () => {
  const config = makeConfig({
    apiEnv: "prod",
    authBypassDev: false
  });
  const request = makeRequest({ authorization: "Bearer token-invalid" });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      ok: false
    }) as Response) as typeof fetch;

  try {
    await assert.rejects(
      () => resolveUserId(request, config),
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

test("valid bearer token resolves userId from Google sub", async () => {
  const config = makeConfig({
    apiEnv: "prod",
    authBypassDev: false,
    googleClientId: "expected-client.apps.googleusercontent.com"
  });
  const request = makeRequest({ authorization: "Bearer token-abc" });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        aud: "expected-client.apps.googleusercontent.com",
        sub: "google-user-42"
      })
    }) as Response) as typeof fetch;

  try {
    const userId = await resolveUserId(request, config);
    assert.equal(userId, "google-user-42");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
