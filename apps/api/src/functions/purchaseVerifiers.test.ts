import assert from "node:assert/strict";
import { test, vi } from "vitest";

const { verifyPlayEntitlementRequestMock } = vi.hoisted(() => ({
  verifyPlayEntitlementRequestMock: vi.fn()
}));

vi.mock("./entitlementsVerifyPlay", () => ({
  verifyPlayEntitlementRequest: verifyPlayEntitlementRequestMock
}));

import {
  getSupportedPurchaseProviders,
  resolvePurchaseVerifier
} from "./purchaseVerifiers";

test("resolvePurchaseVerifier returns the play verifier case-insensitively", () => {
  const verifier = resolvePurchaseVerifier("  PlAy  ");
  assert.equal(verifier, verifyPlayEntitlementRequestMock);
});

test("resolvePurchaseVerifier returns null for unsupported providers", () => {
  assert.equal(resolvePurchaseVerifier("stripe"), null);
});

test("getSupportedPurchaseProviders lists available providers", () => {
  assert.deepEqual(getSupportedPurchaseProviders(), ["play"]);
});
