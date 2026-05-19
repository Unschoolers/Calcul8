import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import type { EntitlementDocument, PlayPurchaseDocument } from "../../types";
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
  listStripeEntitlementFactsForUserMock,
  upsertEntitlementMock,
  hasValidProPurchaseMock,
  maybeHandleHttpGuardsMock,
  jsonResponseMock,
  errorResponseMock
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  resolveUserIdMock: vi.fn(),
  getEntitlementMock: vi.fn(),
  listPlayPurchasesForUserMock: vi.fn(),
  listStripeEntitlementFactsForUserMock: vi.fn(),
  upsertEntitlementMock: vi.fn(),
  hasValidProPurchaseMock: vi.fn(),
  maybeHandleHttpGuardsMock: vi.fn(),
  jsonResponseMock: vi.fn((request: unknown, config: unknown, status: number, body: unknown) => ({
    status,
    jsonBody: body
  })),
  errorResponseMock: vi.fn((request: unknown, config: unknown, error: unknown, message: string) => ({
    status: (error as { status?: number })?.status ?? 500,
    jsonBody: { error: message }
  }))
}));

vi.mock("../lib/config", () => ({
  getConfig: getConfigMock
}));

vi.mock("../lib/auth", () => ({
  resolveUserId: resolveUserIdMock
}));

vi.mock("../lib/cosmos/entitlementRepository", () => ({
  getEntitlement: getEntitlementMock,
  listPlayPurchasesForUser: listPlayPurchasesForUserMock,
  listStripeEntitlementFactsForUser: listStripeEntitlementFactsForUserMock,
  upsertEntitlement: upsertEntitlementMock
}));

vi.mock("../lib/http", () => ({
  maybeHandleHttpGuards: maybeHandleHttpGuardsMock,
  jsonResponse: jsonResponseMock,
  errorResponse: errorResponseMock
}));

vi.mock("../lib/playEntitlements", () => ({
  hasValidProPurchase: hasValidProPurchaseMock
}));

import { entitlementsMe } from "./entitlementsMe";

beforeEach(() => {
  vi.clearAllMocks();
  getConfigMock.mockReturnValue(createApiConfig());
  maybeHandleHttpGuardsMock.mockReturnValue(null);
  resolveUserIdMock.mockResolvedValue("user-1");
  getEntitlementMock.mockResolvedValue(null);
  listPlayPurchasesForUserMock.mockResolvedValue([]);
  listStripeEntitlementFactsForUserMock.mockResolvedValue([]);
  hasValidProPurchaseMock.mockReturnValue(false);
});

test("entitlementsMe creates a baseline entitlement when none exists", async () => {
  const createdEntitlement: EntitlementDocument = {
    id: "user:user-1",
    userId: "user-1",
    hasProAccess: false,
    updatedAt: "2026-03-18T00:00:00.000Z"
  };
  upsertEntitlementMock.mockResolvedValue(createdEntitlement);

  const response = await entitlementsMe(
    createHttpRequest({ method: "GET" }) as never,
    createInvocationContext() as never
  );

  assert.equal(response.status, 200);
  assert.equal(upsertEntitlementMock.mock.calls.length, 1);
  assert.equal(upsertEntitlementMock.mock.calls[0]?.[1]?.userId, "user-1");
  assert.equal(upsertEntitlementMock.mock.calls[0]?.[1]?.hasProAccess, false);
  assert.deepEqual(response.jsonBody, {
    userId: "user-1",
    hasProAccess: false,
    updatedAt: "2026-03-18T00:00:00.000Z",
    purchaseSource: null
  });
});

test("entitlementsMe derives access from active Stripe entitlement facts", async () => {
  const existingEntitlement: EntitlementDocument = {
    id: "user:user-1",
    userId: "user-1",
    hasProAccess: false,
    updatedAt: "2026-03-17T00:00:00.000Z"
  };
  const healedEntitlement: EntitlementDocument = {
    ...existingEntitlement,
    hasProAccess: true,
    purchaseSource: "stripe",
    updatedAt: "2026-03-18T00:00:00.000Z"
  };

  getEntitlementMock.mockResolvedValue(existingEntitlement);
  listStripeEntitlementFactsForUserMock.mockResolvedValue([
    {
      id: "stripe_entitlement:user-1:subscription:sub_1",
      docType: "stripe_entitlement_fact",
      userId: "user-1",
      stripeObjectId: "sub_1",
      stripeObjectType: "subscription",
      active: true,
      sourceEventId: "evt_active",
      sourceEventType: "customer.subscription.updated",
      status: "active",
      createdAt: "2026-03-17T00:00:00.000Z",
      updatedAt: "2026-03-18T00:00:00.000Z"
    }
  ]);
  upsertEntitlementMock.mockResolvedValue(healedEntitlement);

  const response = await entitlementsMe(
    createHttpRequest({ method: "GET" }) as never,
    createInvocationContext() as never
  );

  assert.equal(response.status, 200);
  assert.equal(upsertEntitlementMock.mock.calls.length, 1);
  assert.equal(upsertEntitlementMock.mock.calls[0]?.[1]?.hasProAccess, true);
  assert.equal(upsertEntitlementMock.mock.calls[0]?.[1]?.purchaseSource, "stripe");
  assert.deepEqual(response.jsonBody, {
    userId: "user-1",
    hasProAccess: true,
    updatedAt: "2026-03-18T00:00:00.000Z",
    purchaseSource: "stripe"
  });
});

test("entitlementsMe self-heals pro access when a valid Play purchase exists", async () => {
  const existingEntitlement: EntitlementDocument = {
    id: "user:user-1",
    userId: "user-1",
    hasProAccess: false,
    updatedAt: "2026-03-17T00:00:00.000Z"
  };
  const purchases: PlayPurchaseDocument[] = [
    {
      id: "play_purchase:hash-1",
      docType: "play_purchase",
      userId: "user-1",
      provider: "google_play",
      productId: "pro_access",
      purchaseTokenHash: "hash-1",
      purchaseState: "PURCHASED",
      acknowledged: true,
      createdAt: "2026-03-17T00:00:00.000Z",
      updatedAt: "2026-03-17T00:00:00.000Z"
    }
  ];
  const healedEntitlement: EntitlementDocument = {
    ...existingEntitlement,
    hasProAccess: true,
    purchaseSource: "google_play",
    updatedAt: "2026-03-18T00:00:00.000Z"
  };

  getEntitlementMock.mockResolvedValue(existingEntitlement);
  listPlayPurchasesForUserMock.mockResolvedValue(purchases);
  hasValidProPurchaseMock.mockReturnValue(true);
  upsertEntitlementMock.mockResolvedValue(healedEntitlement);

  const response = await entitlementsMe(
    createHttpRequest({ method: "GET" }) as never,
    createInvocationContext() as never
  );

  assert.equal(response.status, 200);
  assert.equal(listPlayPurchasesForUserMock.mock.calls.length, 1);
  assert.equal(upsertEntitlementMock.mock.calls.length, 1);
  assert.equal(upsertEntitlementMock.mock.calls[0]?.[1]?.hasProAccess, true);
  assert.equal(upsertEntitlementMock.mock.calls[0]?.[1]?.purchaseSource, "google_play");
  assert.deepEqual(response.jsonBody, {
    userId: "user-1",
    hasProAccess: true,
    updatedAt: "2026-03-18T00:00:00.000Z",
    purchaseSource: "google_play"
  });
});
