import { expect, test } from "vitest";
import { isShopifyStockObservation } from "../shared/shopify-stock";

const valid = { shop: "a.myshopify.com", variantId: "gid://shopify/ProductVariant/2", inventoryItemId: "gid://shopify/InventoryItem/3", locationId: "gid://shopify/Location/4", locationName: "Store", available: 12, onHand: 14, committed: 2, observedAt: "2026-09-30T12:00:00.000Z" };
test("accepts only complete, validated Shopify stock observations", () => {
  expect(isShopifyStockObservation(valid)).toBe(true);
  expect(isShopifyStockObservation({ ...valid, available: -1 })).toBe(true);
  expect(isShopifyStockObservation({ ...valid, available: 1.5 })).toBe(false);
  expect(isShopifyStockObservation({ ...valid, inventoryItemId: "foreign" })).toBe(false);
  expect(isShopifyStockObservation({ ...valid, shop: "evil.test" })).toBe(false);
  expect(isShopifyStockObservation({ ...valid, shop: "bad-.myshopify.com" })).toBe(false);
  expect(isShopifyStockObservation({ ...valid, observedAt: "yesterday" })).toBe(false);
});
