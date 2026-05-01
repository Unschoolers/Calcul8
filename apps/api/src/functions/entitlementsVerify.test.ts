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
  resolvePurchaseVerifierMock,
  getSupportedPurchaseProvidersMock,
  maybeHandleHttpGuardsMock,
  jsonResponseMock,
  errorResponseMock
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  resolvePurchaseVerifierMock: vi.fn(),
  getSupportedPurchaseProvidersMock: vi.fn(),
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

vi.mock("../lib/http", () => ({
  maybeHandleHttpGuards: maybeHandleHttpGuardsMock,
  jsonResponse: jsonResponseMock,
  errorResponse: errorResponseMock
}));

vi.mock("../features/entitlements/purchaseVerifiers", () => ({
  resolvePurchaseVerifier: resolvePurchaseVerifierMock,
  getSupportedPurchaseProviders: getSupportedPurchaseProvidersMock
}));

import { entitlementsVerify } from "./entitlementsVerify";

beforeEach(() => {
  vi.clearAllMocks();
  getConfigMock.mockReturnValue(createApiConfig());
  maybeHandleHttpGuardsMock.mockReturnValue(null);
  getSupportedPurchaseProvidersMock.mockReturnValue(["play", "stripe"]);
});

test("entitlementsVerify delegates to the resolved provider verifier", async () => {
  const verifierMock = vi.fn().mockResolvedValue({
    status: 202,
    jsonBody: { ok: true }
  });
  resolvePurchaseVerifierMock.mockReturnValue(verifierMock);

  const request = createHttpRequest({ method: "POST", params: { provider: "PLAY" } });
  const context = createInvocationContext();
  const response = await entitlementsVerify(request as never, context as never);

  assert.equal(response.status, 202);
  assert.equal(verifierMock.mock.calls.length, 1);
  assert.equal(verifierMock.mock.calls[0]?.[3], "/entitlements/verify/{provider}");
});

test("entitlementsVerify returns a 501 response for unsupported providers", async () => {
  resolvePurchaseVerifierMock.mockReturnValue(null);

  const response = await entitlementsVerify(
    createHttpRequest({ method: "POST", params: { provider: "unknown" } }) as never,
    createInvocationContext() as never
  );

  assert.equal(response.status, 501);
  assert.deepEqual(response.jsonBody, {
    error: "Purchase provider 'unknown' is not supported.",
    supportedProviders: ["play", "stripe"]
  });
});
