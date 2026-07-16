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
  clearSessionCookieMock,
  deleteAllEntitlementDataForUserMock,
  deleteAllSyncDataMock,
  eraseAccountDataMock,
  revokeAllSessionsForUserMock,
  revokeAllRefreshSessionsForUserMock
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  resolveUserIdMock: vi.fn(),
  clearSessionCookieMock: vi.fn(),
  deleteAllEntitlementDataForUserMock: vi.fn(),
  deleteAllSyncDataMock: vi.fn(),
  eraseAccountDataMock: vi.fn(),
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
  consumeAuthResponseHeaders: vi.fn(() => ({})),
  consumeAuthResponseCookies: vi.fn(() => []),
  resolveUserId: resolveUserIdMock,
  clearSessionCookie: clearSessionCookieMock
}));

vi.mock("../lib/cosmos/entitlementRepository", () => ({
  deleteAllEntitlementDataForUser: deleteAllEntitlementDataForUserMock
}));

vi.mock("../lib/cosmos/syncSnapshotRepository", () => ({
  deleteAllSyncData: deleteAllSyncDataMock
}));

vi.mock("../features/account/accountErasureService", () => ({
  eraseAccountData: eraseAccountDataMock
}));

vi.mock("../lib/cosmos/sessionRepository", () => ({
  revokeAllSessionsForUser: revokeAllSessionsForUserMock,
  revokeAllRefreshSessionsForUser: revokeAllRefreshSessionsForUserMock
}));

import { accountDelete } from "./accountDelete";

beforeEach(() => {
  vi.clearAllMocks();
  getConfigMock.mockReturnValue(createApiConfig());
  resolveUserIdMock.mockResolvedValue("user-1");
  clearSessionCookieMock.mockResolvedValue(undefined);
  deleteAllEntitlementDataForUserMock.mockResolvedValue(undefined);
  deleteAllSyncDataMock.mockResolvedValue(undefined);
  eraseAccountDataMock.mockResolvedValue(undefined);
  revokeAllSessionsForUserMock.mockResolvedValue(2);
  revokeAllRefreshSessionsForUserMock.mockResolvedValue(3);
});

test("accountDelete clears personal account data, revokes sessions and refresh tokens, and clears the cookie", async () => {
  const request = createHttpRequest({ method: "POST" });
  const context = createInvocationContext();

  const response = await accountDelete(request as never, context as never);

  assert.equal(deleteAllEntitlementDataForUserMock.mock.calls[0]?.[1], "user-1");
  assert.equal(deleteAllSyncDataMock.mock.calls[0]?.[1], "user-1");
  assert.equal(eraseAccountDataMock.mock.calls[0]?.[1], "user-1");
  assert.equal(revokeAllSessionsForUserMock.mock.calls[0]?.[1], "user-1");
  assert.equal(revokeAllRefreshSessionsForUserMock.mock.calls[0]?.[1], "user-1");
  assert.equal(clearSessionCookieMock.mock.calls.length, 1);
  assert.equal(response.status, 200);
  assert.equal((response.jsonBody as { ok?: boolean; userId?: string }).ok, true);
  assert.equal((response.jsonBody as { ok?: boolean; userId?: string }).userId, "user-1");
});

test("accountDelete keeps sessions active when erasure fails so the user can retry", async () => {
  const request = createHttpRequest({ method: "POST" });
  const context = createInvocationContext();
  deleteAllSyncDataMock.mockRejectedValueOnce(new Error("Cosmos unavailable"));

  const response = await accountDelete(request as never, context as never);

  assert.equal(response.status, 500);
  assert.equal(revokeAllSessionsForUserMock.mock.calls.length, 0);
  assert.equal(revokeAllRefreshSessionsForUserMock.mock.calls.length, 0);
  assert.equal(clearSessionCookieMock.mock.calls.length, 0);
});
