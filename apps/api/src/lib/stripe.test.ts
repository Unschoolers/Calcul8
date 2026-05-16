import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { beforeEach, test, vi } from "vitest";

const { fetchWithRetryMock } = vi.hoisted(() => ({
  fetchWithRetryMock: vi.fn()
}));

vi.mock("./retry", () => ({
  fetchWithRetry: fetchWithRetryMock
}));

import {
  createStripeCheckoutSession,
  verifyStripeWebhookEvent
} from "./stripe";

function createJsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  });
}

function createStripeSignature(rawBody: string, secret = "whsec_test", timestamp = 1_777_000_000): string {
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchWithRetryMock.mockResolvedValue(createJsonResponse({
    id: "cs_test_123",
    url: "https://checkout.stripe.com/c/pay/cs_test_123",
    mode: "payment",
    payment_status: "unpaid",
    client_reference_id: "user-1",
    metadata: {
      provider: "stripe"
    }
  }));
});

test("createStripeCheckoutSession creates hosted sessions with trimmed metadata", async () => {
  const session = await createStripeCheckoutSession({
    secretKey: " sk_test_123 ",
    priceId: " price_123 ",
    successUrl: " https://app.example.test/success ",
    cancelUrl: " https://app.example.test/cancel ",
    clientReferenceId: " user-1 ",
    metadata: {
      provider: " stripe ",
      empty: " ",
      " spaced ": "value"
    }
  });

  assert.equal(session.id, "cs_test_123");
  assert.equal(session.url, "https://checkout.stripe.com/c/pay/cs_test_123");
  assert.equal(fetchWithRetryMock.mock.calls.length, 1);
  assert.equal(fetchWithRetryMock.mock.calls[0]?.[0], "https://api.stripe.com/v1/checkout/sessions");
  assert.deepEqual(fetchWithRetryMock.mock.calls[0]?.[2], {
    maxAttempts: 3,
    timeoutMs: 10_000
  });

  const init = fetchWithRetryMock.mock.calls[0]?.[1] as RequestInit;
  assert.equal((init.headers as Record<string, string>).Authorization, "Bearer sk_test_123");
  const params = new URLSearchParams(String(init.body));
  assert.equal(params.get("mode"), "payment");
  assert.equal(params.get("success_url"), "https://app.example.test/success");
  assert.equal(params.get("cancel_url"), "https://app.example.test/cancel");
  assert.equal(params.get("return_url"), null);
  assert.equal(params.get("line_items[0][price]"), "price_123");
  assert.equal(params.get("client_reference_id"), "user-1");
  assert.equal(params.get("metadata[provider]"), "stripe");
  assert.equal(params.get("metadata[spaced]"), "value");
  assert.equal(params.get("metadata[empty]"), null);
});

test("createStripeCheckoutSession creates embedded sessions with a return URL and client secret", async () => {
  fetchWithRetryMock.mockResolvedValue(createJsonResponse({
    id: "cs_test_embedded",
    url: "",
    client_secret: "cs_secret_123"
  }));

  const session = await createStripeCheckoutSession({
    secretKey: "sk_test_123",
    priceId: "price_123",
    successUrl: "https://app.example.test/return",
    cancelUrl: "",
    clientReferenceId: "user-1",
    uiMode: "embedded"
  });

  const params = new URLSearchParams(String((fetchWithRetryMock.mock.calls[0]?.[1] as RequestInit).body));
  assert.equal(params.get("ui_mode"), "embedded");
  assert.equal(params.get("return_url"), "https://app.example.test/return");
  assert.equal(params.get("success_url"), null);
  assert.equal(params.get("cancel_url"), null);
  assert.equal(session.client_secret, "cs_secret_123");
});

test("createStripeCheckoutSession rejects missing configuration and incomplete Stripe responses", async () => {
  await assert.rejects(
    () => createStripeCheckoutSession({
      secretKey: "",
      priceId: "price_123",
      successUrl: "https://app.example.test/success",
      cancelUrl: "https://app.example.test/cancel",
      clientReferenceId: "user-1"
    }),
    /Missing Stripe secret key\./
  );

  await assert.rejects(
    () => createStripeCheckoutSession({
      secretKey: "sk_test_123",
      priceId: "",
      successUrl: "https://app.example.test/success",
      cancelUrl: "https://app.example.test/cancel",
      clientReferenceId: "user-1"
    }),
    /Missing Stripe one-time price id\./
  );

  await assert.rejects(
    () => createStripeCheckoutSession({
      secretKey: "sk_test_123",
      priceId: "price_123",
      successUrl: "",
      cancelUrl: "https://app.example.test/cancel",
      clientReferenceId: "user-1"
    }),
    /Missing Stripe checkout redirect URLs\./
  );

  await assert.rejects(
    () => createStripeCheckoutSession({
      secretKey: "sk_test_123",
      priceId: "price_123",
      successUrl: "https://app.example.test/success",
      cancelUrl: "https://app.example.test/cancel",
      clientReferenceId: ""
    }),
    /Missing Stripe client reference id\./
  );

  fetchWithRetryMock.mockResolvedValue(createJsonResponse({
    id: "cs_missing_url"
  }));
  await assert.rejects(
    () => createStripeCheckoutSession({
      secretKey: "sk_test_123",
      priceId: "price_123",
      successUrl: "https://app.example.test/success",
      cancelUrl: "https://app.example.test/cancel",
      clientReferenceId: "user-1"
    }),
    /Stripe hosted checkout session did not return url\./
  );

  fetchWithRetryMock.mockResolvedValue(createJsonResponse({
    id: "cs_missing_secret"
  }));
  await assert.rejects(
    () => createStripeCheckoutSession({
      secretKey: "sk_test_123",
      priceId: "price_123",
      successUrl: "https://app.example.test/return",
      cancelUrl: "",
      clientReferenceId: "user-1",
      uiMode: "embedded"
    }),
    /Stripe embedded checkout session did not return client_secret\./
  );
});

test("createStripeCheckoutSession includes Stripe response details when creation fails", async () => {
  fetchWithRetryMock.mockResolvedValue(new Response("rate limited", { status: 429 }));

  await assert.rejects(
    () => createStripeCheckoutSession({
      secretKey: "sk_test_123",
      priceId: "price_123",
      successUrl: "https://app.example.test/success",
      cancelUrl: "https://app.example.test/cancel",
      clientReferenceId: "user-1"
    }),
    /Stripe checkout session creation failed \(429\): rate limited/
  );
});

test("verifyStripeWebhookEvent accepts valid signatures and returns the event object", () => {
  const rawBody = JSON.stringify({
    id: "evt_123",
    type: "checkout.session.completed",
    data: {
      object: {
        client_reference_id: "user-1"
      }
    }
  });
  const timestamp = 1_777_000_000;
  const signatureHeader = `t=${timestamp},v1=bad,${createStripeSignature(rawBody, "whsec_test", timestamp)}`;

  const event = verifyStripeWebhookEvent(
    rawBody,
    signatureHeader,
    " whsec_test ",
    timestamp * 1000
  );

  assert.equal(event.id, "evt_123");
  assert.equal(event.type, "checkout.session.completed");
  assert.equal(event.data.object.client_reference_id, "user-1");
});

test("verifyStripeWebhookEvent rejects invalid signatures and stale timestamps", () => {
  const rawBody = JSON.stringify({
    id: "evt_123",
    type: "checkout.session.completed",
    data: {
      object: {}
    }
  });
  const signatureHeader = createStripeSignature(rawBody);

  assert.throws(
    () => verifyStripeWebhookEvent(rawBody, signatureHeader, ""),
    /Missing Stripe webhook secret\./
  );
  assert.throws(
    () => verifyStripeWebhookEvent(rawBody, "t=bad,v1=sig", "whsec_test"),
    /Invalid Stripe signature header format\./
  );
  assert.throws(
    () => verifyStripeWebhookEvent(rawBody, signatureHeader, "whsec_test", 1_777_000_301_000),
    /Stripe signature timestamp is outside accepted tolerance\./
  );
  assert.throws(
    () => verifyStripeWebhookEvent(rawBody, createStripeSignature(rawBody, "other_secret"), "whsec_test", 1_777_000_000_000),
    /Stripe webhook signature verification failed\./
  );
});

test("verifyStripeWebhookEvent rejects malformed webhook bodies", () => {
  const timestamp = 1_777_000_000;

  assert.throws(
    () => verifyStripeWebhookEvent(
      "{",
      createStripeSignature("{", "whsec_test", timestamp),
      "whsec_test",
      timestamp * 1000
    ),
    /Stripe webhook body is not valid JSON\./
  );
  assert.throws(
    () => verifyStripeWebhookEvent(
      "null",
      createStripeSignature("null", "whsec_test", timestamp),
      "whsec_test",
      timestamp * 1000
    ),
    /Stripe webhook payload must be an object\./
  );

  const missingFieldsBody = JSON.stringify({
    id: "evt_123",
    type: "",
    data: {
      object: {}
    }
  });
  assert.throws(
    () => verifyStripeWebhookEvent(
      missingFieldsBody,
      createStripeSignature(missingFieldsBody, "whsec_test", timestamp),
      "whsec_test",
      timestamp * 1000
    ),
    /Stripe webhook payload is missing required event fields\./
  );
});
