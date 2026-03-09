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
  getEntitlementMock,
  upsertEntitlementMock,
  verifyStripeWebhookEventMock
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  getEntitlementMock: vi.fn(),
  upsertEntitlementMock: vi.fn(),
  verifyStripeWebhookEventMock: vi.fn()
}));

vi.mock("../lib/config", () => ({
  getConfig: getConfigMock
}));

vi.mock("../lib/cosmos", () => ({
  getEntitlement: getEntitlementMock,
  upsertEntitlement: upsertEntitlementMock
}));

vi.mock("../lib/stripe", () => ({
  verifyStripeWebhookEvent: verifyStripeWebhookEventMock
}));

import { billingWebhook } from "./billingWebhook";

function createConfig(): ApiConfig {
  return {
    apiEnv: "prod",
    authBypassDev: false,
    migrationsAdminKey: "",
    stripeSecretKey: "sk_live_xxx",
    stripeWebhookSecret: "whsec_live_xxx",
    stripeOneTimePriceId: "price_one_time",
    stripeSuccessUrl: "https://app.whatfees.ca/billing/success?session_id={CHECKOUT_SESSION_ID}",
    stripeCancelUrl: "https://app.whatfees.ca/settings",
    googleClientId: "",
    googlePlayPackageName: "io.whatfees",
    googlePlayProProductIds: ["pro_access"],
    googlePlayServiceAccountEmail: "",
    googlePlayServiceAccountPrivateKey: "",
    allowedOrigins: ["https://app.whatfees.ca"],
    cosmosEndpoint: "https://example.documents.azure.com:443/",
    cosmosKey: "key",
    cosmosDatabaseId: "whatfees",
    entitlementsContainerId: "entitlements",
    syncContainerId: "sync_data",
    migrationRunsContainerId: "migration_runs"
  };
}

function createRequest(rawBody: string, headers: Record<string, string> = {}) {
  const normalized = new Map<string, string>();
  for (const [key, value] of Object.entries(headers)) {
    normalized.set(key.toLowerCase(), value);
  }

  return {
    method: "POST",
    headers: {
      get(name: string) {
        return normalized.get(name.toLowerCase()) ?? null;
      }
    },
    async text() {
      return rawBody;
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
  getEntitlementMock.mockResolvedValue(null);
  upsertEntitlementMock.mockResolvedValue({
    id: "entitlement:user-1",
    userId: "user-1",
    hasProAccess: true,
    purchaseSource: "stripe",
    updatedAt: "2026-01-01T00:00:00.000Z"
  });
});

test("billingWebhook rejects invalid Stripe signature", async () => {
  const request = createRequest("{}", {
    "stripe-signature": "t=1700000000,v1=bad"
  });
  const context = createContext();
  verifyStripeWebhookEventMock.mockImplementation(() => {
    throw new Error("invalid signature");
  });

  const response = await billingWebhook(request as never, context as never);

  assert.equal(response.status, 400);
  assert.equal((response.jsonBody as { error: string }).error, "Invalid Stripe webhook signature.");
  assert.equal(upsertEntitlementMock.mock.calls.length, 0);
});

test("billingWebhook grants entitlement on completed payment checkout", async () => {
  const request = createRequest("{\"id\":\"evt_1\"}", {
    "stripe-signature": "t=1700000000,v1=good"
  });
  const context = createContext();
  verifyStripeWebhookEventMock.mockReturnValue({
    id: "evt_1",
    type: "checkout.session.completed",
    data: {
      object: {
        mode: "payment",
        payment_status: "paid",
        client_reference_id: "user-1"
      }
    }
  });

  const response = await billingWebhook(request as never, context as never);

  assert.equal(response.status, 200);
  assert.equal((response.jsonBody as { handled: boolean }).handled, true);
  assert.equal(upsertEntitlementMock.mock.calls.length, 1);
  assert.equal(upsertEntitlementMock.mock.calls[0]?.[1]?.userId, "user-1");
  assert.equal(upsertEntitlementMock.mock.calls[0]?.[1]?.hasProAccess, true);
  assert.equal(upsertEntitlementMock.mock.calls[0]?.[1]?.purchaseSource, "stripe");
});

test("billingWebhook ignores unrelated events", async () => {
  const request = createRequest("{\"id\":\"evt_2\"}", {
    "stripe-signature": "t=1700000000,v1=good"
  });
  const context = createContext();
  verifyStripeWebhookEventMock.mockReturnValue({
    id: "evt_2",
    type: "payment_intent.created",
    data: {
      object: {
        id: "pi_1"
      }
    }
  });

  const response = await billingWebhook(request as never, context as never);

  assert.equal(response.status, 200);
  assert.equal((response.jsonBody as { handled: boolean }).handled, false);
  assert.equal(upsertEntitlementMock.mock.calls.length, 0);
});
