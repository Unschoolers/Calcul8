import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test, vi } from "vitest";
import { parseShopifyOrder, verifyShopifyWebhook } from "./orderWebhook.js";

test("validates Shopify HMAC over exact raw bytes", () => {
  const raw = Buffer.from('{"id":42,"line_items":[]}');
  const signature = createHmac("sha256", "secret").update(raw).digest("base64");
  assert.equal(verifyShopifyWebhook(raw, signature, "secret"), true);
  assert.equal(verifyShopifyWebhook(Buffer.from('{"id":42, "line_items":[]}'), signature, "secret"), false);
  assert.equal(verifyShopifyWebhook(raw, "invalid", "secret"), false);
});

test("parses numeric order and variant identities without trusting payload scope or SKU", () => {
  const order = parseShopifyOrder({ id: 91, processed_at: "2026-09-29T12:00:00Z", scopeKey: "attacker",
    line_items: [{ id: 14, variant_id: 22, quantity: 2, sku: "attacker" },
      { id: 15, variant_id: null, quantity: 1 }] });
  assert.deepEqual(order.lines, [{ id: "14", variantId: "gid://shopify/ProductVariant/22", quantity: 2 }]);
  assert.equal(order.paidAt, "2026-09-29T12:00:00.000Z");
  assert.throws(() => parseShopifyOrder({ id: 91, line_items: [{ id: 14, variant_id: 22, quantity: -2 }] }));
});
