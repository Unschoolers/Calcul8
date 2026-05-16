import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, test, vi } from "vitest";
import { createApiConfig } from "../test-support/function-test-helpers";
import type { ApiConfig } from "../types";

const { fetchWithRetryMock } = vi.hoisted(() => ({
  fetchWithRetryMock: vi.fn()
}));

vi.mock("./retry", () => ({
  fetchWithRetry: fetchWithRetryMock
}));

const privateKeyPem = generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey
  .export({ type: "pkcs8", format: "pem" }) as string;

function createGooglePlayConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return createApiConfig({
    googlePlayServiceAccountEmail: "whatfees-play@example.iam.gserviceaccount.com",
    googlePlayServiceAccountPrivateKey: privateKeyPem,
    ...overrides
  });
}

function createJsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload)
  } as Response;
}

function createTextResponse(body: string, status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(body),
    text: async () => body
  } as Response;
}

function queueAccessToken(accessToken = "google-access-token"): void {
  fetchWithRetryMock.mockResolvedValueOnce(createJsonResponse({
    access_token: accessToken,
    expires_in: 3600
  }));
}

async function importGooglePlay() {
  return import("./googlePlay");
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-16T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

test("verifyPlayProductPurchase rejects missing service account configuration before network calls", async () => {
  const { verifyPlayProductPurchase } = await importGooglePlay();

  await assert.rejects(
    () => verifyPlayProductPurchase(
      createApiConfig({
        googlePlayServiceAccountEmail: "",
        googlePlayServiceAccountPrivateKey: ""
      }),
      {
        packageName: "io.whatfees",
        purchaseToken: "purchase-token",
        allowedProductIds: ["pro_access"]
      }
    ),
    (error: { status?: number; message?: string }) =>
      error.status === 500 && error.message === "Google Play verification is not configured."
  );
  assert.equal(fetchWithRetryMock.mock.calls.length, 0);
});

test("verifyPlayProductPurchase surfaces token exchange failures and invalid token payloads", async () => {
  const { verifyPlayProductPurchase } = await importGooglePlay();
  const input = {
    packageName: "io.whatfees",
    purchaseToken: "purchase-token",
    allowedProductIds: ["pro_access"]
  };

  fetchWithRetryMock.mockResolvedValueOnce(createTextResponse("upstream unavailable", 503));
  await assert.rejects(
    () => verifyPlayProductPurchase(createGooglePlayConfig(), input),
    (error: { status?: number; message?: string }) =>
      error.status === 502 && error.message === "Failed to obtain Google Play access token."
  );

  fetchWithRetryMock.mockResolvedValueOnce(createJsonResponse({
    access_token: "",
    expires_in: 3600
  }));
  await assert.rejects(
    () => verifyPlayProductPurchase(createGooglePlayConfig(), input),
    (error: { status?: number; message?: string }) =>
      error.status === 502 && error.message === "Google Play access token response is invalid."
  );
});

test("verifyPlayProductPurchase returns valid product data and reuses a fresh cached access token", async () => {
  const { verifyPlayProductPurchase } = await importGooglePlay();
  queueAccessToken("cached-access-token");
  fetchWithRetryMock
    .mockResolvedValueOnce(createJsonResponse({
      productLineItem: [{
        productOfferDetails: {
          productId: "pro_access"
        }
      }],
      purchaseStateContext: {
        purchaseState: "PURCHASED"
      },
      acknowledgementState: "ACKNOWLEDGED",
      orderId: "GPA.1234-5678-9012-34567",
      purchaseCompletionTime: "2026-05-01T00:00:00.000Z"
    }))
    .mockResolvedValueOnce(createJsonResponse({
      productLineItem: [{
        productId: "pro_access_plus"
      }],
      purchaseStateContext: {
        purchaseState: "PURCHASED"
      },
      acknowledgementState: "PENDING"
    }));

  const first = await verifyPlayProductPurchase(createGooglePlayConfig(), {
    packageName: "io.whatfees",
    purchaseToken: "purchase-token",
    allowedProductIds: [" pro_access "]
  });
  const second = await verifyPlayProductPurchase(createGooglePlayConfig(), {
    packageName: "io.whatfees",
    purchaseToken: "purchase-token-two",
    allowedProductIds: []
  });

  assert.deepEqual(first, {
    isValid: true,
    productId: "pro_access",
    productIds: ["pro_access"],
    orderId: "GPA.1234-5678-9012-34567",
    purchaseState: 0,
    acknowledgementState: 1,
    consumptionState: null,
    purchaseTimeMillis: "1777593600000"
  });
  assert.equal(second.isValid, true);
  assert.equal(second.productId, "pro_access_plus");
  assert.equal(fetchWithRetryMock.mock.calls.length, 3);
  assert.equal(fetchWithRetryMock.mock.calls[0]?.[0], "https://oauth2.googleapis.com/token");
  assert.match(
    String(fetchWithRetryMock.mock.calls[1]?.[0]),
    /applications\/io\.whatfees\/purchases\/productsv2\/tokens\/purchase-token$/
  );
  assert.equal(
    (fetchWithRetryMock.mock.calls[2]?.[1] as { headers?: Record<string, string> }).headers?.Authorization,
    "Bearer cached-access-token"
  );
});

test("verifyPlayProductPurchase treats 404 and disallowed products as invalid purchases", async () => {
  const { verifyPlayProductPurchase } = await importGooglePlay();

  queueAccessToken();
  fetchWithRetryMock.mockResolvedValueOnce(createTextResponse("", 404));
  const missingPurchase = await verifyPlayProductPurchase(createGooglePlayConfig(), {
    packageName: "io.whatfees",
    purchaseToken: "missing-token",
    allowedProductIds: ["pro_access"]
  });
  assert.equal(missingPurchase.isValid, false);
  assert.equal(missingPurchase.productId, null);
  assert.deepEqual(missingPurchase.productIds, []);

  fetchWithRetryMock.mockResolvedValueOnce(createJsonResponse({
    productLineItem: [{
      productId: "other_product"
    }],
    purchaseStateContext: {
      purchaseState: "PURCHASED"
    }
  }));
  const disallowedPurchase = await verifyPlayProductPurchase(createGooglePlayConfig(), {
    packageName: "io.whatfees",
    purchaseToken: "other-product-token",
    allowedProductIds: ["pro_access"]
  });
  assert.equal(disallowedPurchase.isValid, false);
  assert.equal(disallowedPurchase.productId, null);
  assert.deepEqual(disallowedPurchase.productIds, ["other_product"]);
});

test("verifyPlayProductPurchase includes sanitized Google API error details", async () => {
  const { verifyPlayProductPurchase } = await importGooglePlay();
  queueAccessToken();
  fetchWithRetryMock.mockResolvedValueOnce(createJsonResponse({
    error: {
      message: "Purchase token is invalid.",
      status: "PERMISSION_DENIED",
      errors: [{
        reason: "invalidPurchaseToken"
      }]
    }
  }, 403));

  await assert.rejects(
    () => verifyPlayProductPurchase(createGooglePlayConfig(), {
      packageName: "io.whatfees",
      purchaseToken: "bad-token",
      allowedProductIds: ["pro_access"]
    }),
    (error: { status?: number; message?: string }) =>
      error.status === 502
      && error.message === "Google Play purchase verification failed (HTTP 403): Purchase token is invalid. | invalidPurchaseToken | PERMISSION_DENIED"
  );
});

test("acknowledgePlayProductPurchase accepts ok and already-acknowledged responses then rejects failures", async () => {
  const { acknowledgePlayProductPurchase } = await importGooglePlay();
  queueAccessToken("ack-access-token");
  fetchWithRetryMock
    .mockResolvedValueOnce(createTextResponse("", 200))
    .mockResolvedValueOnce(createTextResponse("", 409))
    .mockResolvedValueOnce(createTextResponse("nope", 500));

  const config = createGooglePlayConfig();
  const input = {
    packageName: "io.whatfees",
    productId: "pro_access",
    purchaseToken: "purchase-token"
  };

  await acknowledgePlayProductPurchase(config, input);
  await acknowledgePlayProductPurchase(config, input);
  await assert.rejects(
    () => acknowledgePlayProductPurchase(config, input),
    (error: { status?: number; message?: string }) =>
      error.status === 502 && error.message === "Google Play purchase acknowledgement failed."
  );

  assert.equal(fetchWithRetryMock.mock.calls.length, 4);
  assert.match(
    String(fetchWithRetryMock.mock.calls[1]?.[0]),
    /purchases\/products\/pro_access\/tokens\/purchase-token:acknowledge$/
  );
  assert.equal(
    (fetchWithRetryMock.mock.calls[1]?.[1] as { headers?: Record<string, string> }).headers?.Authorization,
    "Bearer ack-access-token"
  );
});
