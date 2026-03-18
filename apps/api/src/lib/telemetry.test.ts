import assert from "node:assert/strict";
import { test } from "vitest";
import type { HttpRequest } from "@azure/functions";
import type { ApiConfig } from "../types";
import { buildTelemetryDimensions, classifyUserAgent } from "./telemetry";

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

test("classifyUserAgent normalizes supported browser families", () => {
  assert.equal(
    classifyUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/122.0.0.0 Mobile/15E148 Safari/604.1"),
    "ios_chrome"
  );
  assert.equal(
    classifyUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"),
    "ios_safari"
  );
  assert.equal(
    classifyUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36"),
    "android_chrome"
  );
  assert.equal(
    classifyUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"),
    "desktop_chrome"
  );
  assert.equal(
    classifyUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15"),
    "desktop_safari"
  );
  assert.equal(
    classifyUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0"),
    "desktop_firefox"
  );
  assert.equal(
    classifyUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0"),
    "desktop_edge"
  );
  assert.equal(classifyUserAgent("something-odd"), "unknown");
});

test("buildTelemetryDimensions uses safe normalized fields only", () => {
  const request = makeRequest({
    cookie: "whatfees_session=session-1; another=value",
    authorization: "Bearer token-abc",
    "x-csrf-token": "csrf-123",
    "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/122.0.0.0 Mobile/15E148 Safari/604.1"
  }, "POST");

  const dimensions = buildTelemetryDimensions({
    category: "auth",
    route: "auth_me",
    request,
    config: makeConfig(),
    authMethod: "bearer",
    authResult: "success",
    workspaceScope: "workspace",
    outcome: "session_fallback_to_bearer"
  });

  assert.deepEqual(dimensions, {
    category: "auth",
    route: "auth_me",
    ua_family: "ios_chrome",
    has_session_cookie: "true",
    has_bearer_header: "true",
    has_csrf_header: "true",
    workspace_scope: "workspace",
    auth_method: "bearer",
    auth_result: "success",
    outcome: "session_fallback_to_bearer"
  });
  assert.equal("authorization" in dimensions, false);
  assert.equal("cookie" in dimensions, false);
  assert.equal("user-agent" in dimensions, false);
});
