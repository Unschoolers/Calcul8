import { expect, test } from "vitest";
import { shopifyAdminProductUrl } from "../src/domain/shopify-admin-url.ts";

test("builds a Shopify admin product URL only from canonical shop and product identifiers", () => {
  expect(shopifyAdminProductUrl("Store-A.myshopify.com", "gid://shopify/Product/123")).toBe("https://store-a.myshopify.com/admin/products/123");
  expect(shopifyAdminProductUrl("https://evil.example", "gid://shopify/Product/123")).toBeNull();
  expect(shopifyAdminProductUrl("store.myshopify.com.evil.example", "gid://shopify/Product/123")).toBeNull();
  expect(shopifyAdminProductUrl("store.myshopify.com", "https://evil.example")).toBeNull();
});
