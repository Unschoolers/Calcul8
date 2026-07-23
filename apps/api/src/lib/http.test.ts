import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import type { HttpRequest } from "@azure/functions";
import type { ApiConfig } from "../types";

const { consumeAuthResponseCookiesMock, consumeAuthResponseHeadersMock, checkGlobalRateLimitMock, checkDistributedGlobalRateLimitMock, getConfigMock } = vi.hoisted(() => ({
  consumeAuthResponseCookiesMock: vi.fn(() => []),
  consumeAuthResponseHeadersMock: vi.fn(() => ({})),
  checkGlobalRateLimitMock: vi.fn(() => ({
    allowed: true,
    limit: 30,
    remaining: 29,
    windowSeconds: 10,
    retryAfterSeconds: null as number | null
  })),
  checkDistributedGlobalRateLimitMock: vi.fn(async () => ({
    allowed: true,
    limit: 30,
    remaining: 29,
    windowSeconds: 10,
    retryAfterSeconds: null as number | null
  })),
  getConfigMock: vi.fn()
}));

vi.mock("./config", () => ({
  getConfig: getConfigMock
}));

vi.mock("./auth", () => ({
  HttpError: class HttpError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  consumeAuthResponseHeaders: consumeAuthResponseHeadersMock,
  consumeAuthResponseCookies: consumeAuthResponseCookiesMock
}));

vi.mock("./rateLimit", () => ({
  checkGlobalRateLimit: checkGlobalRateLimitMock,
  checkDistributedGlobalRateLimit: checkDistributedGlobalRateLimitMock
}));

import { maybeHandleHttpGuards } from "./http";

function makeConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    apiEnv: "dev",
    authBypassDev: true,
    migrationsAdminKey: "",
    googleClientId: "",
    googlePlayPackageName: "io.whatfees",
    googlePlayProProductIds: ["pro_access"],
    googlePlayServiceAccountEmail: "",
    googlePlayServiceAccountPrivateKey: "",
    allowedOrigins: ["https://example.app"],
    cosmosEndpoint: "https://example.documents.azure.com:443/",
    cosmosKey: "key",
    cosmosDatabaseId: "whatfees",
    migrationCosmosDatabaseId: "whatfees",
    entitlementsContainerId: "entitlements",
    syncContainerId: "sync_data",
    migrationRunsContainerId: "migration_runs",
    ...overrides
  };
}

function makeRequest(method = "GET", headers: Record<string, string> = {}): HttpRequest {
  const normalized = new Map<string, string>();
  for (const [name, value] of Object.entries(headers)) {
    normalized.set(name.toLowerCase(), value);
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

const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  vi.clearAllMocks();
  getConfigMock.mockReturnValue(makeConfig());
  process.env.NODE_ENV = "development";
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

test("returns preflight response before rate limit check", async () => {
  const request = makeRequest("OPTIONS", { origin: "https://example.app" });
  const response = await maybeHandleHttpGuards(request, makeConfig());

  assert.equal(response?.status, 204);
  const headers = response?.headers as Record<string, string>;
  assert.equal(headers["Access-Control-Allow-Origin"], "https://example.app");
  assert.equal(headers["Access-Control-Allow-Credentials"], "true");
  assert.equal(headers["Access-Control-Expose-Headers"], "x-csrf-token");
  assert.equal(headers.Vary, "Origin");
  assert.equal(checkGlobalRateLimitMock.mock.calls.length, 0);
});

test("returns preflight response without CORS headers for disallowed origins", async () => {
  const request = makeRequest("OPTIONS", { origin: "https://hostile.example" });
  const response = await maybeHandleHttpGuards(request, makeConfig());

  assert.equal(response?.status, 204);
  assert.deepEqual(response?.headers, {});
  assert.equal(checkGlobalRateLimitMock.mock.calls.length, 0);
});

test("allows only the configured HTTPS native app origin", async () => {
  const config = makeConfig({ allowedOrigins: ["https://app.whatfees.ca"] });
  const accepted = await maybeHandleHttpGuards(
    makeRequest("OPTIONS", { origin: "https://app.whatfees.ca" }),
    config
  );
  assert.equal(
    (accepted?.headers as Record<string, string>)["Access-Control-Allow-Origin"],
    "https://app.whatfees.ca"
  );

  for (const origin of [
    "capacitor://localhost",
    "http://app.whatfees.ca",
    "https://hostile.example"
  ]) {
    const rejected = await maybeHandleHttpGuards(
      makeRequest("OPTIONS", { origin }),
      config
    );
    assert.deepEqual(rejected?.headers, {});
  }
});

test("allows deliberate dev wildcard preflight origins", async () => {
  const request = makeRequest("OPTIONS", { origin: "https://local-tool.example" });
  const response = await maybeHandleHttpGuards(request, makeConfig({ allowedOrigins: ["*"] }));

  const headers = response?.headers as Record<string, string>;
  assert.equal(response?.status, 204);
  assert.equal(headers["Access-Control-Allow-Origin"], "https://local-tool.example");
  assert.equal(headers["Access-Control-Allow-Credentials"], "true");
});

test("returns null when request passes guards", async () => {
  const request = makeRequest("GET", { origin: "https://example.app" });
  checkGlobalRateLimitMock.mockReturnValue({
    allowed: true,
    limit: 30,
    remaining: 29,
    windowSeconds: 10,
    retryAfterSeconds: null
  });

  const response = await maybeHandleHttpGuards(request, makeConfig());
  assert.equal(response, null);
  assert.equal(checkGlobalRateLimitMock.mock.calls.length, 0);
});

test("checks global rate limits in prod requests", async () => {
  const request = makeRequest("GET", { origin: "https://example.app" });
  checkDistributedGlobalRateLimitMock.mockResolvedValue({
    allowed: true,
    limit: 30,
    remaining: 29,
    windowSeconds: 10,
    retryAfterSeconds: null
  });

  const response = await maybeHandleHttpGuards(request, makeConfig({ apiEnv: "prod" }));

  assert.equal(response, null);
  assert.equal(checkDistributedGlobalRateLimitMock.mock.calls.length, 1);
});

test("returns 429 payload and headers when global limit is exceeded", async () => {
  const request = makeRequest("POST", { origin: "https://example.app" });
  checkDistributedGlobalRateLimitMock.mockResolvedValue({
    allowed: false,
    limit: 30,
    remaining: 0,
    windowSeconds: 10,
    retryAfterSeconds: 4
  });

  const response = await maybeHandleHttpGuards(request, makeConfig({ apiEnv: "prod" }));

  assert.equal(response?.status, 429);
  assert.equal((response?.jsonBody as { error: string }).error, "Too many requests. Please retry shortly.");
  const headers = response?.headers as Record<string, string>;
  assert.equal(headers["Retry-After"], "4");
  assert.equal(headers["X-RateLimit-Limit"], "30");
  assert.equal(headers["X-RateLimit-Remaining"], "0");
  assert.equal(headers["X-RateLimit-Window-Seconds"], "10");
});

test("executeHttpHandler short-circuits guarded requests before running feature code", async () => {
  const httpModule = await import("./http");
  const executeHttpHandler = (httpModule as unknown as {
    executeHttpHandler?: (
      request: HttpRequest,
      context: { error: (...args: unknown[]) => void },
      options: {
        errorLogMessage: string;
        fallbackErrorMessage: string;
        operation: (input: { config: ApiConfig }) => Promise<unknown>;
      }
    ) => Promise<{ status?: number }>;
  }).executeHttpHandler;
  assert.equal(typeof executeHttpHandler, "function");

  const operation = vi.fn();
  const response = await executeHttpHandler!(
    makeRequest("OPTIONS", { origin: "https://example.app" }),
    { error: vi.fn() },
    {
      errorLogMessage: "Feature failed.",
      fallbackErrorMessage: "Feature failed.",
      operation
    }
  );

  assert.equal(response.status, 204);
  assert.equal(operation.mock.calls.length, 0);
});

test("executeHttpHandler delegates feature-specific error translation when configured", async () => {
  const httpModule = await import("./http");
  const executeHttpHandler = (httpModule as unknown as {
    executeHttpHandler: (...args: any[]) => Promise<{ status?: number; jsonBody?: unknown }>;
  }).executeHttpHandler;
  const translatedResponse = { status: 418, jsonBody: { error: "translated" } };
  const featureError = new Error("feature failure");
  const handleError = vi.fn((_error: unknown, _input: { config: ApiConfig }) => translatedResponse);

  const response = await executeHttpHandler(
    makeRequest("GET"),
    { error: vi.fn() },
    {
      errorLogMessage: "Feature failed.",
      fallbackErrorMessage: "Feature failed.",
      operation: async () => { throw featureError; },
      handleError
    }
  );

  assert.equal(response, translatedResponse);
  assert.equal(handleError.mock.calls[0]?.[0], featureError);
  assert.equal(handleError.mock.calls[0]?.[1].config, getConfigMock.mock.results[0]?.value);
});

test("executeHttpHandler runs feature telemetry before its standard error response", async () => {
  const { executeHttpHandler } = await import("./http");
  const featureError = new Error("feature failure");
  const onError = vi.fn();
  const context = { error: vi.fn() };

  const response = await executeHttpHandler(makeRequest("GET"), context, {
    errorLogMessage: "GET /feature failed",
    fallbackErrorMessage: "Feature failed.",
    operation: async () => { throw featureError; },
    onError
  } as never);

  assert.equal(onError.mock.calls[0]?.[0], featureError);
  assert.equal(response.status, 500);
  assert.equal(context.error.mock.calls.length, 1);
});

test("executeHttpHandler supports routes that intentionally have no invocation logger", async () => {
  const { executeHttpHandler } = await import("./http");
  const response = await executeHttpHandler(makeRequest("GET"), null as never, {
    errorLogMessage: "Feature failed.",
    fallbackErrorMessage: "Feature failed.",
    operation: async () => { throw new Error("failure"); }
  });

  assert.equal(response.status, 500);
});
