import assert from "node:assert/strict";
import test from "node:test";
import { getProductIdsFromProductsV2Response, normalizeProductsV2PurchasePayload } from "./googlePlay";

test("getProductIdsFromProductsV2Response extracts ids from line items", () => {
  const payload = {
    productLineItem: [
      {
        productOfferDetails: {
          productId: "pro_access"
        }
      },
      {
        productId: "pro_access_plus"
      }
    ]
  };

  const productIds = getProductIdsFromProductsV2Response(payload);
  assert.deepEqual(productIds.sort(), ["pro_access", "pro_access_plus"]);
});

test("normalizeProductsV2PurchasePayload maps purchased and acknowledged states", () => {
  const payload = {
    productLineItem: [
      {
        productOfferDetails: {
          productId: "pro_access"
        }
      }
    ],
    purchaseStateContext: {
      purchaseState: "PURCHASED"
    },
    acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
    orderId: "GPA.1234-5678-9012-34567",
    purchaseCompletionTime: "2026-02-17T00:00:00Z"
  };

  const normalized = normalizeProductsV2PurchasePayload(payload);
  assert.equal(normalized.isValid, true);
  assert.equal(normalized.purchaseState, 0);
  assert.equal(normalized.acknowledgementState, 1);
  assert.equal(normalized.orderId, "GPA.1234-5678-9012-34567");
  assert.equal(normalized.purchaseTimeMillis, "1771286400000");
  assert.deepEqual(normalized.productIds, ["pro_access"]);
});

test("normalizeProductsV2PurchasePayload marks pending purchase as not valid", () => {
  const payload = {
    productLineItem: [
      {
        productOfferDetails: {
          productId: "pro_access"
        }
      }
    ],
    purchaseStateContext: {
      purchaseState: "PENDING"
    },
    acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING"
  };

  const normalized = normalizeProductsV2PurchasePayload(payload);
  assert.equal(normalized.isValid, false);
  assert.equal(normalized.purchaseState, 2);
  assert.equal(normalized.acknowledgementState, 0);
});

test("normalizeProductsV2PurchasePayload maps cancelled state", () => {
  const payload = {
    productLineItem: [
      {
        productOfferDetails: {
          productId: "pro_access"
        }
      }
    ],
    purchaseStateContext: {
      purchaseState: "CANCELLED"
    },
    acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING"
  };

  const normalized = normalizeProductsV2PurchasePayload(payload);
  assert.equal(normalized.isValid, false);
  assert.equal(normalized.purchaseState, 1);
  assert.equal(normalized.acknowledgementState, 0);
});

test("normalizeProductsV2PurchasePayload handles unknown purchase state safely", () => {
  const payload = {
    productLineItem: [
      {
        productOfferDetails: {
          productId: "pro_access"
        }
      }
    ],
    purchaseStateContext: {
      purchaseState: "UNSPECIFIED_STATE"
    },
    acknowledgementState: "UNKNOWN"
  };

  const normalized = normalizeProductsV2PurchasePayload(payload);
  assert.equal(normalized.isValid, false);
  assert.equal(normalized.purchaseState, null);
  assert.equal(normalized.acknowledgementState, null);
});
