import assert from "node:assert/strict";
import test from "node:test";
import { extractPurchaseTokenFromResult } from "../src/app-core/utils/playBilling.ts";

test("extractPurchaseTokenFromResult reads token from object payload", () => {
  const result = extractPurchaseTokenFromResult({
    itemId: "pro_access",
    purchaseToken: "token-123"
  });

  assert.equal(result.itemId, "pro_access");
  assert.equal(result.purchaseToken, "token-123");
});

test("extractPurchaseTokenFromResult selects preferred item from purchase arrays", () => {
  const result = extractPurchaseTokenFromResult(
    [
      { itemId: "starter", purchaseToken: "token-a" },
      { itemId: "pro_access", purchaseToken: "token-b" }
    ],
    "pro_access"
  );

  assert.equal(result.itemId, "pro_access");
  assert.equal(result.purchaseToken, "token-b");
});

test("extractPurchaseTokenFromResult returns null token when missing", () => {
  const result = extractPurchaseTokenFromResult({ itemId: "pro_access" });

  assert.equal(result.itemId, null);
  assert.equal(result.purchaseToken, null);
});

test("extractPurchaseTokenFromResult parses stringified JSON payload", () => {
  const result = extractPurchaseTokenFromResult(
    "{\"productId\":\"pro_access\",\"purchaseToken\":\"token-json\"}",
    "pro_access"
  );

  assert.equal(result.itemId, "pro_access");
  assert.equal(result.purchaseToken, "token-json");
});

test("extractPurchaseTokenFromResult parses nested purchaseData JSON", () => {
  const result = extractPurchaseTokenFromResult({
    details: {
      purchaseData: "{\"sku\":\"pro_access\",\"token\":\"token-nested\"}"
    }
  }, "pro_access");

  assert.equal(result.itemId, "pro_access");
  assert.equal(result.purchaseToken, "token-nested");
});
