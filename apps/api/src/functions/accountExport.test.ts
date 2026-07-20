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
  getEntitlementMock,
  listPlayPurchasesForUserMock,
  getEffectiveSyncSnapshotMock,
  listBuyerProfilesForActorMock,
  maybeHandleHttpGuardsMock,
  jsonResponseMock,
  errorResponseMock
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  resolveUserIdMock: vi.fn(),
  getEntitlementMock: vi.fn(),
  listPlayPurchasesForUserMock: vi.fn(),
  getEffectiveSyncSnapshotMock: vi.fn(),
  listBuyerProfilesForActorMock: vi.fn(),
  maybeHandleHttpGuardsMock: vi.fn(),
  jsonResponseMock: vi.fn((request: unknown, config: unknown, status: number, body: unknown) => ({
    status,
    jsonBody: body
  })),
  errorResponseMock: vi.fn((request: unknown, config: unknown, error: unknown, message: string) => ({
    status: 500,
    jsonBody: { error: message }
  }))
}));

vi.mock("../lib/config", () => ({
  getConfig: getConfigMock
}));

vi.mock("../lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/auth")>()),
  resolveUserId: resolveUserIdMock
}));

vi.mock("../lib/cosmos/entitlementRepository", () => ({
  getEntitlement: getEntitlementMock,
  listPlayPurchasesForUser: listPlayPurchasesForUserMock
}));

vi.mock("../lib/cosmos/syncSnapshotRepository", () => ({
  getEffectiveSyncSnapshot: getEffectiveSyncSnapshotMock
}));

vi.mock("../features/buyerProfiles/services", () => ({
  listBuyerProfilesForActor: listBuyerProfilesForActorMock
}));

vi.mock("../lib/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/http")>()),
  maybeHandleHttpGuards: maybeHandleHttpGuardsMock,
  jsonResponse: jsonResponseMock,
  errorResponse: errorResponseMock
}));

import { accountExport } from "./accountExport";

beforeEach(() => {
  vi.clearAllMocks();
  getConfigMock.mockReturnValue(createApiConfig());
  maybeHandleHttpGuardsMock.mockReturnValue(null);
  resolveUserIdMock.mockResolvedValue("user-1");
  getEntitlementMock.mockResolvedValue({ userId: "user-1", hasProAccess: true });
  getEffectiveSyncSnapshotMock.mockResolvedValue({ userId: "user-1", version: 3 });
  listPlayPurchasesForUserMock.mockResolvedValue([{ id: "play-1" }]);
  listBuyerProfilesForActorMock.mockResolvedValue([{
    username: "cardking27",
    preferredName: "Marc",
    tags: ["VIP"],
    createdAt: "2026-07-20T10:00:00.000Z",
    updatedAt: "2026-07-20T11:00:00.000Z",
    version: 2
  }]);
});

test("accountExport returns entitlement, purchases, sync snapshot, and personal buyer profiles", async () => {
  const response = await accountExport(
    createHttpRequest({ method: "POST" }) as never,
    createInvocationContext() as never
  );

  assert.equal(response.status, 200);
  assert.equal(getEntitlementMock.mock.calls[0]?.[1], "user-1");
  assert.equal(getEffectiveSyncSnapshotMock.mock.calls[0]?.[1], "user-1");
  assert.equal(listPlayPurchasesForUserMock.mock.calls[0]?.[1], "user-1");
  assert.equal(listBuyerProfilesForActorMock.mock.calls[0]?.[1], "user-1");
  assert.equal((response.jsonBody as { userId?: string }).userId, "user-1");
  assert.equal(Array.isArray((response.jsonBody as { playPurchases?: unknown[] }).playPurchases), true);
  assert.deepEqual((response.jsonBody as { buyerProfiles?: unknown[] }).buyerProfiles, [{
    username: "cardking27",
    preferredName: "Marc",
    tags: ["VIP"],
    createdAt: "2026-07-20T10:00:00.000Z",
    updatedAt: "2026-07-20T11:00:00.000Z",
    version: 2
  }]);
});

test("accountExport returns an error response when export loading fails", async () => {
  const context = createInvocationContext();
  getEntitlementMock.mockRejectedValue(new Error("boom"));

  const response = await accountExport(createHttpRequest({ method: "POST" }) as never, context as never);

  assert.equal(response.status, 500);
  assert.equal(context.error.mock.calls.length, 1);
  assert.equal((response.jsonBody as { error?: string }).error, "Failed to export account data.");
});
