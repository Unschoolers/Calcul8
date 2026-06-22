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
  consumeAuthResponseHeaders: vi.fn(() => ({})),
  consumeAuthResponseCookies: vi.fn(() => [])
}));

vi.mock("../lib/stripe", () => ({
  createStripeCheckoutSession: createStripeCheckoutSessionMock
}));

import { billingCheckoutSession } from "./billingCheckoutSession";

beforeEach(() => {
  vi.clearAllMocks();
  getConfigMock.mockReturnValue(createApiConfig({
    stripeSecretKey: "sk_test_xxx",
    stripeWebhookSecret: "whsec_xxx",
    stripeOneTimePriceId: "price_one_time",
    stripeSuccessUrl: "https://app.whatfees.ca/billing/success?session_id={CHECKOUT_SESSION_ID}",
    stripeCancelUrl: "https://app.whatfees.ca/settings",
    allowedOrigins: ["https://app.whatfees.ca"]
  }));
  resolveUserIdMock.mockResolvedValue("user-1");
  createStripeCheckoutSessionMock.mockResolvedValue({
    id: "cs_test_123",
    url: "https://checkout.stripe.com/c/pay/cs_test_123"
  });
});

test("billingCheckoutSession creates checkout session for authenticated user", async () => {
  const request = createHttpRequest({
    method: "POST",
    headers: { origin: "https://app.whatfees.ca" },
    body: {}
  });
  const context = createInvocationContext();

  const response = await billingCheckoutSession(request as never, context as never);

  assert.equal(response.status, 200);
  assert.equal(createStripeCheckoutSessionMock.mock.calls.length, 1);
  assert.equal(createStripeCheckoutSessionMock.mock.calls[0]?.[0]?.clientReferenceId, "user-1");
  assert.equal((response.jsonBody as { ok: boolean }).ok, true);
  assert.equal((response.jsonBody as { checkoutUrl: string }).checkoutUrl, "https://checkout.stripe.com/c/pay/cs_test_123");
});

test("billingCheckoutSession supports embedded checkout mode and returns client secret", async () => {
  const request = {
    ...createHttpRequest({
      method: "POST",
      headers: { origin: "https://app.whatfees.ca" },
      body: {}
    }),
    async json() {
      return {
        uiMode: "embedded"
      };
    }
  };
  const context = createInvocationContext();

  createStripeCheckoutSessionMock.mockResolvedValue({
    id: "cs_test_embedded_123",
    client_secret: "cs_test_embedded_secret_123"
  });

  const response = await billingCheckoutSession(request as never, context as never);

  assert.equal(response.status, 200);
  assert.equal(createStripeCheckoutSessionMock.mock.calls.length, 1);
  assert.equal(createStripeCheckoutSessionMock.mock.calls[0]?.[0]?.uiMode, "embedded");
  assert.equal((response.jsonBody as { sessionId: string }).sessionId, "cs_test_embedded_123");
  assert.equal((response.jsonBody as { clientSecret: string }).clientSecret, "cs_test_embedded_secret_123");
});

test("billingCheckoutSession returns 500 when Stripe session creation fails", async () => {
  const request = createHttpRequest({
    method: "POST",
    headers: { origin: "https://app.whatfees.ca" },
    body: {}
  });
  const context = createInvocationContext();
  createStripeCheckoutSessionMock.mockRejectedValue(new Error("stripe unavailable"));

  const response = await billingCheckoutSession(request as never, context as never);

  assert.equal(response.status, 500);
  assert.equal(context.error.mock.calls.length > 0, true);
});
