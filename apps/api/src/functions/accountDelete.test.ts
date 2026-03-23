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
  deleteEntitlementMock,
  deleteUserProfileMock,
  deletePlayPurchasesForUserMock,
  deleteAllSyncDataMock,
  revokeAllSessionsForUserMock
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  resolveUserIdMock: vi.fn(),
  clearSessionCookieMock: vi.fn(),
  deleteEntitlementMock: vi.fn(),
  deleteUserProfileMock: vi.fn(),
  deletePlayPurchasesForUserMock: vi.fn(),
  deleteAllSyncDataMock: vi.fn(),
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
  consumeAuthResponseHeaders: vi.fn(() => ({})),
  resolveUserId: resolveUserIdMock,
  clearSessionCookie: clearSessionCookieMock
}));

vi.mock("../lib/cosmos/entitlementRepository", () => ({
  deleteEntitlement: deleteEntitlementMock,
  deleteUserProfile: deleteUserProfileMock,
  deletePlayPurchasesForUser: deletePlayPurchasesForUserMock
}));

vi.mock("../lib/cosmos/syncSnapshotRepository", () => ({
  deleteAllSyncData: deleteAllSyncDataMock
}));

vi.mock("../lib/cosmos/sessionRepository", () => ({
  revokeAllSessionsForUser: revokeAllSessionsForUserMock
}));

import { accountDelete } from "./accountDelete";

beforeEach(() => {
  vi.clearAllMocks();
  getConfigMock.mockReturnValue(createApiConfig());
  resolveUserIdMock.mockResolvedValue("user-1");
  clearSessionCookieMock.mockResolvedValue(undefined);
  deleteEntitlementMock.mockResolvedValue(undefined);
  deleteUserProfileMock.mockResolvedValue(undefined);
  deletePlayPurchasesForUserMock.mockResolvedValue(undefined);
  deleteAllSyncDataMock.mockResolvedValue(undefined);
  revokeAllSessionsForUserMock.mockResolvedValue(2);
});

test("accountDelete clears personal account data, revokes sessions, and clears the cookie", async () => {
  const request = createHttpRequest({ method: "POST" });
  const context = createInvocationContext();

  const response = await accountDelete(request as never, context as never);

  assert.equal(deleteEntitlementMock.mock.calls[0]?.[1], "user-1");
  assert.equal(deleteUserProfileMock.mock.calls[0]?.[1], "user-1");
  assert.equal(deletePlayPurchasesForUserMock.mock.calls[0]?.[1], "user-1");
  assert.equal(deleteAllSyncDataMock.mock.calls[0]?.[1], "user-1");
  assert.equal(revokeAllSessionsForUserMock.mock.calls[0]?.[1], "user-1");
  assert.equal(clearSessionCookieMock.mock.calls.length, 1);
  assert.equal(response.status, 200);
  assert.equal((response.jsonBody as { ok?: boolean; userId?: string }).ok, true);
  assert.equal((response.jsonBody as { ok?: boolean; userId?: string }).userId, "user-1");
});
