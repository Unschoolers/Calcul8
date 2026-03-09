import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import type { ApiConfig } from "../types";

vi.mock("@azure/functions", () => ({
  app: {
    http: vi.fn()
  }
}));

const {
  getConfigMock,
  resolveUserIdMock,
  revokeSessionFromRequestMock,
  clearSessionCookieMock,
  revokeAllSessionsForUserMock
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  resolveUserIdMock: vi.fn(),
  revokeSessionFromRequestMock: vi.fn(),
  clearSessionCookieMock: vi.fn(),
  revokeAllSessionsForUserMock: vi.fn()
}));

vi.mock("../lib/config", () => ({
  getConfig: getConfigMock
}));

vi.mock("../lib/auth", () => ({
  HttpError: class HttpError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  resolveUserId: resolveUserIdMock,
  revokeSessionFromRequest: revokeSessionFromRequestMock,
  clearSessionCookie: clearSessionCookieMock,
  consumeAuthResponseHeaders: vi.fn(() => ({}))
}));

vi.mock("../lib/cosmos", () => ({
  revokeAllSessionsForUser: revokeAllSessionsForUserMock
}));

import { authLogout, authLogoutAll, authMe } from "./auth";

function createConfig(): ApiConfig {
  return {
    apiEnv: "dev",
    authBypassDev: true,
    migrationsAdminKey: "",
    googleClientId: "",
    googlePlayPackageName: "io.whatfees",
    googlePlayProProductIds: ["pro_access"],
    googlePlayServiceAccountEmail: "",
    googlePlayServiceAccountPrivateKey: "",
    allowedOrigins: [],
    cosmosEndpoint: "https://example.documents.azure.com:443/",
    cosmosKey: "key",
    cosmosDatabaseId: "whatfees",
    entitlementsContainerId: "entitlements",
    syncContainerId: "sync_data",
    migrationRunsContainerId: "migration_runs"
  };
}

function createRequest(method = "GET", headers: Record<string, string> = {}) {
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
  };
}

function createContext() {
  return {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getConfigMock.mockReturnValue(createConfig());
  resolveUserIdMock.mockResolvedValue("user-1");
  revokeSessionFromRequestMock.mockResolvedValue(true);
  clearSessionCookieMock.mockResolvedValue(undefined);
  revokeAllSessionsForUserMock.mockResolvedValue(3);
});

test("authMe resolves user and returns payload", async () => {
  const request = createRequest("GET");
  const context = createContext();

  const response = await authMe(request as never, context as never);
  assert.equal(response.status, 200);
  assert.deepEqual(response.jsonBody, {
    ok: true,
    userId: "user-1"
  });
});

test("authLogout clears current session and returns revoked flag", async () => {
  const request = createRequest("POST");
  const context = createContext();
  revokeSessionFromRequestMock.mockResolvedValue(false);

  const response = await authLogout(request as never, context as never);
  assert.equal(response.status, 200);
  assert.deepEqual(response.jsonBody, {
    ok: true,
    revokedCurrentSession: false
  });
});

test("authLogoutAll revokes all sessions and clears cookie", async () => {
  const request = createRequest("POST");
  const context = createContext();

  const response = await authLogoutAll(request as never, context as never);
  assert.equal(response.status, 200);
  assert.deepEqual(response.jsonBody, {
    ok: true,
    userId: "user-1",
    revokedSessionCount: 3
  });
  assert.equal(clearSessionCookieMock.mock.calls.length, 1);
});
