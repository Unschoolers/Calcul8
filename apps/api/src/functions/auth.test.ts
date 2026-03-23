import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { createApiConfig, createHttpRequest, createInvocationContext } from "../test-support/function-test-helpers";

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

vi.mock("../lib/cosmos/sessionRepository", () => ({
  revokeAllSessionsForUser: revokeAllSessionsForUserMock
}));

import { authLogout, authLogoutAll, authMe } from "./auth";

beforeEach(() => {
  vi.clearAllMocks();
  getConfigMock.mockReturnValue(createApiConfig());
  resolveUserIdMock.mockResolvedValue("user-1");
  revokeSessionFromRequestMock.mockResolvedValue(true);
  clearSessionCookieMock.mockResolvedValue(undefined);
  revokeAllSessionsForUserMock.mockResolvedValue(3);
});

test("authMe resolves user and returns payload", async () => {
  const request = createHttpRequest({ method: "GET" });
  const context = createInvocationContext();

  const response = await authMe(request as never, context as never);
  assert.equal(response.status, 200);
  assert.deepEqual(response.jsonBody, {
    ok: true,
    userId: "user-1"
  });
});

test("authLogout clears current session and returns revoked flag", async () => {
  const request = createHttpRequest({ method: "POST" });
  const context = createInvocationContext();
  revokeSessionFromRequestMock.mockResolvedValue(false);

  const response = await authLogout(request as never, context as never);
  assert.equal(response.status, 200);
  assert.deepEqual(response.jsonBody, {
    ok: true,
    revokedCurrentSession: false
  });
});

test("authLogoutAll revokes all sessions and clears cookie", async () => {
  const request = createHttpRequest({ method: "POST" });
  const context = createInvocationContext();

  const response = await authLogoutAll(request as never, context as never);
  assert.equal(response.status, 200);
  assert.deepEqual(response.jsonBody, {
    ok: true,
    userId: "user-1",
    revokedSessionCount: 3
  });
  assert.equal(clearSessionCookieMock.mock.calls.length, 1);
});
