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
  createStripeCheckoutSessionMock
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  resolveUserIdMock: vi.fn(),
  createStripeCheckoutSessionMock: vi.fn()
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
  consumeAuthResponseHeaders: vi.fn(() => ({}))
}));

vi.mock("../lib/stripe", () => ({
  createStripeCheckoutSession: createStripeCheckoutSessionMock
}));

import { billingCheckoutSession } from "./billingCheckoutSession";

function createConfig(): ApiConfig {
  return {
    apiEnv: "dev",
    authBypassDev: true,
    migrationsAdminKey: "",
    stripeSecretKey: "sk_test_xxx",
    stripeWebhookSecret: "whsec_xxx",
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

function createRequest(method = "POST", headers: Record<string, string> = {}) {
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
  createStripeCheckoutSessionMock.mockResolvedValue({
    id: "cs_test_123",
    url: "https://checkout.stripe.com/c/pay/cs_test_123"
  });
});

test("billingCheckoutSession creates checkout session for authenticated user", async () => {
  const request = createRequest("POST", { origin: "https://app.whatfees.ca" });
  const context = createContext();

  const response = await billingCheckoutSession(request as never, context as never);

  assert.equal(response.status, 200);
  assert.equal(createStripeCheckoutSessionMock.mock.calls.length, 1);
  assert.equal(createStripeCheckoutSessionMock.mock.calls[0]?.[0]?.clientReferenceId, "user-1");
  assert.equal((response.jsonBody as { ok: boolean }).ok, true);
  assert.equal((response.jsonBody as { checkoutUrl: string }).checkoutUrl, "https://checkout.stripe.com/c/pay/cs_test_123");
});

test("billingCheckoutSession returns 500 when Stripe session creation fails", async () => {
  const request = createRequest("POST", { origin: "https://app.whatfees.ca" });
  const context = createContext();
  createStripeCheckoutSessionMock.mockRejectedValue(new Error("stripe unavailable"));

  const response = await billingCheckoutSession(request as never, context as never);

  assert.equal(response.status, 500);
  assert.equal(context.error.mock.calls.length > 0, true);
});
