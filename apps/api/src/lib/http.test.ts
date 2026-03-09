import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import type { HttpRequest } from "@azure/functions";
import type { ApiConfig } from "../types";

const { consumeAuthResponseHeadersMock, checkGlobalRateLimitMock } = vi.hoisted(() => ({
  consumeAuthResponseHeadersMock: vi.fn(() => ({})),
  checkGlobalRateLimitMock: vi.fn(() => ({
    allowed: true,
    limit: 30,
    remaining: 29,
    windowSeconds: 10,
    retryAfterSeconds: null as number | null
  }))
}));

vi.mock("./auth", () => ({
  HttpError: class HttpError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  consumeAuthResponseHeaders: consumeAuthResponseHeadersMock
}));

vi.mock("./rateLimit", () => ({
  checkGlobalRateLimit: checkGlobalRateLimitMock
}));

import { maybeHandleHttpGuards } from "./http";

function makeConfig(): ApiConfig {
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
    entitlementsContainerId: "entitlements",
    syncContainerId: "sync_data",
    migrationRunsContainerId: "migration_runs"
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
  process.env.NODE_ENV = "development";
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

test("returns preflight response before rate limit check", () => {
  const request = makeRequest("OPTIONS", { origin: "https://example.app" });
  const response = maybeHandleHttpGuards(request, makeConfig());

  assert.equal(response?.status, 204);
  assert.equal(checkGlobalRateLimitMock.mock.calls.length, 0);
});

test("returns null when request passes guards", () => {
  const request = makeRequest("GET", { origin: "https://example.app" });
  checkGlobalRateLimitMock.mockReturnValue({
    allowed: true,
    limit: 30,
    remaining: 29,
    windowSeconds: 10,
    retryAfterSeconds: null
  });

  const response = maybeHandleHttpGuards(request, makeConfig());
  assert.equal(response, null);
  assert.equal(checkGlobalRateLimitMock.mock.calls.length, 1);
});

test("returns 429 payload and headers when global limit is exceeded", () => {
  const request = makeRequest("POST", { origin: "https://example.app" });
  checkGlobalRateLimitMock.mockReturnValue({
    allowed: false,
    limit: 30,
    remaining: 0,
    windowSeconds: 10,
    retryAfterSeconds: 4
  });

  const response = maybeHandleHttpGuards(request, makeConfig());

  assert.equal(response?.status, 429);
  assert.equal((response?.jsonBody as { error: string }).error, "Too many requests. Please retry shortly.");
  const headers = response?.headers as Record<string, string>;
  assert.equal(headers["Retry-After"], "4");
  assert.equal(headers["X-RateLimit-Limit"], "30");
  assert.equal(headers["X-RateLimit-Remaining"], "0");
  assert.equal(headers["X-RateLimit-Window-Seconds"], "10");
});
