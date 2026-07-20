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
  refreshSessionFromRequestMock,
  revokeSessionFromRequestMock,
  clearSessionCookieMock,
  getUserProfileMock,
  revokeAllSessionsForUserMock,
  revokeAllRefreshSessionsForUserMock
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  resolveUserIdMock: vi.fn(),
  refreshSessionFromRequestMock: vi.fn(),
  revokeSessionFromRequestMock: vi.fn(),
  clearSessionCookieMock: vi.fn(),
  getUserProfileMock: vi.fn(),
  revokeAllSessionsForUserMock: vi.fn(),
  revokeAllRefreshSessionsForUserMock: vi.fn()
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
  refreshSessionFromRequest: refreshSessionFromRequestMock,
  revokeSessionFromRequest: revokeSessionFromRequestMock,
  clearSessionCookie: clearSessionCookieMock,
  consumeAuthResponseHeaders: vi.fn(() => ({})),
  consumeAuthResponseCookies: vi.fn(() => [])
}));

vi.mock("../lib/cosmos/sessionRepository", () => ({
  revokeAllSessionsForUser: revokeAllSessionsForUserMock,
  revokeAllRefreshSessionsForUser: revokeAllRefreshSessionsForUserMock
}));

vi.mock("../lib/cosmos/entitlementRepository", () => ({
  getUserProfile: getUserProfileMock
}));

import { authLogout, authLogoutAll, authMe, authRefresh } from "./auth";

beforeEach(() => {
  vi.clearAllMocks();
  getConfigMock.mockReturnValue(createApiConfig());
  resolveUserIdMock.mockResolvedValue("user-1");
  refreshSessionFromRequestMock.mockResolvedValue("user-1");
  revokeSessionFromRequestMock.mockResolvedValue(true);
  clearSessionCookieMock.mockResolvedValue(undefined);
  getUserProfileMock.mockResolvedValue({
    id: "profile:user-1",
    docType: "user_profile",
    userId: "user-1",
    displayName: "Alice Example",
    displayNameSource: "provider",
    photoUrl: "https://images.example.test/alice.jpg",
    updatedAt: "2026-07-20T12:00:00.000Z"
  });
  revokeAllSessionsForUserMock.mockResolvedValue(3);
  revokeAllRefreshSessionsForUserMock.mockResolvedValue(4);
});

test("authMe resolves user and returns payload", async () => {
  const request = createHttpRequest({ method: "GET" });
  const context = createInvocationContext();

  const response = await authMe(request as never, context as never);
  assert.equal(response.status, 200);
  assert.deepEqual(response.jsonBody, {
    ok: true,
    userId: "user-1",
    profile: {
      displayName: "Alice Example",
      photoUrl: "https://images.example.test/alice.jpg"
    }
  });
});

test("authMe keeps a valid session usable when the optional profile lookup fails", async () => {
  const request = createHttpRequest({ method: "GET" });
  const context = createInvocationContext();
  getUserProfileMock.mockRejectedValueOnce(new Error("profile storage unavailable"));

  const response = await authMe(request as never, context as never);

  assert.equal(response.status, 200);
  assert.deepEqual(response.jsonBody, {
    ok: true,
    userId: "user-1",
    profile: null
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

test("authRefresh rotates refresh token and returns user payload", async () => {
  const request = createHttpRequest({ method: "POST" });
  const context = createInvocationContext();

  const response = await authRefresh(request as never, context as never);
  assert.equal(response.status, 200);
  assert.deepEqual(response.jsonBody, {
    ok: true,
    userId: "user-1"
  });
  assert.equal(refreshSessionFromRequestMock.mock.calls.length, 1);
});

test("authLogoutAll revokes all sessions and clears cookie", async () => {
  const request = createHttpRequest({ method: "POST" });
  const context = createInvocationContext();

  const response = await authLogoutAll(request as never, context as never);
  assert.equal(response.status, 200);
  assert.deepEqual(response.jsonBody, {
    ok: true,
    userId: "user-1",
    revokedSessionCount: 3,
    revokedRefreshSessionCount: 4
  });
  assert.equal(clearSessionCookieMock.mock.calls.length, 1);
});
