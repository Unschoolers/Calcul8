import assert from "node:assert/strict";
import test from "node:test";
import type { PlayPurchaseDocument } from "../types";
import { HttpError } from "./auth";
import {
  assertPurchaseNotLinkedToDifferentUser,
  hashPurchaseToken,
  shouldAcknowledgePurchase
} from "./playEntitlements";

function buildPurchase(userId: string): PlayPurchaseDocument {
  return {
    id: "play_purchase:test",
    docType: "play_purchase",
    userId,
    purchaseTokenHash: "hash",
    packageName: "io.whatfees",
    productId: "pro_access",
    orderId: "order-1",
    purchaseState: 0,
    acknowledgementState: 0,
    consumptionState: 0,
    purchaseTimeMillis: "1700000000000",
    updatedAt: "2026-02-16T00:00:00.000Z"
  };
}

test("hashPurchaseToken is deterministic and non-empty", () => {
  const purchaseRef = "sample-purchase-ref";
  const first = hashPurchaseToken(purchaseRef);
  const second = hashPurchaseToken(purchaseRef);

  assert.equal(first, second);
  assert.equal(first.length, 64);
  assert.match(first, /^[0-9a-f]+$/);
});

test("assertPurchaseNotLinkedToDifferentUser allows same user and null purchase", () => {
  assert.doesNotThrow(() => {
    assertPurchaseNotLinkedToDifferentUser(null, "user-1");
    assertPurchaseNotLinkedToDifferentUser(buildPurchase("user-1"), "user-1");
  });
});

test("assertPurchaseNotLinkedToDifferentUser throws for cross-user token reuse", () => {
  assert.throws(
    () => assertPurchaseNotLinkedToDifferentUser(buildPurchase("user-a"), "user-b"),
    (error: unknown) => error instanceof HttpError && error.status === 409
  );
});

test("shouldAcknowledgePurchase only skips acknowledged purchases", () => {
  assert.equal(shouldAcknowledgePurchase(1), false);
  assert.equal(shouldAcknowledgePurchase(0), true);
  assert.equal(shouldAcknowledgePurchase(null), true);
});
