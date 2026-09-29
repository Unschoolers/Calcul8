import assert from "node:assert/strict";
import { test } from "vitest";
import { createShopifyAdminClient } from "./adminClient.js";

function response(data: unknown): Response {
  return new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });
}

test("creates a draft sealed-box variant with tracked stock and stable provider IDs", async () => {
  const requests: { query: string; variables: Record<string, any> }[] = [];
  const fetcher = async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)); requests.push(body);
    if (body.query.includes("locations")) return response({ locations: { nodes: [{ id: "gid://shopify/Location/4", isActive: true }] } });
    return response({ productSet: { product: { id: "gid://shopify/Product/1", variants: { nodes: [{ id: "gid://shopify/ProductVariant/2", inventoryItem: { id: "gid://shopify/InventoryItem/3" } }] } }, userErrors: [] } });
  };
  const client = createShopifyAdminClient("example.myshopify.com", async () => "token", fetcher as typeof fetch);
  const result = await client.upsertBoxProduct({ handle: "calcul8-box-42", title: "Booster — sealed box", sku: "BOX-42", price: "100.00", active: false });
  assert.equal(result.variantId, "gid://shopify/ProductVariant/2");
  assert.equal(requests[1]?.variables.input.status, "DRAFT");
  assert.equal(requests[1]?.variables.input.variants[0].inventoryItem.tracked, true);
  assert.equal(requests[1]?.variables.input.variants[0].inventoryPolicy, "DENY");
  assert.deepEqual(requests[1]?.variables.identifier, { handle: "calcul8-box-42" });
});

test("inventory CAS does not raise Shopify stock over an unimported order", async () => {
  const requests: { query: string }[] = [];
  const fetcher = async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)); requests.push(body);
    return response({ inventoryItem: { inventoryLevel: { quantities: [{ quantity: 1 }] } } });
  };
  const client = createShopifyAdminClient("example.myshopify.com", async () => "token", fetcher as typeof fetch);
  await assert.rejects(() => client.setAvailable({ inventoryItemId: "gid://shopify/InventoryItem/3", locationId: "gid://shopify/Location/4", quantity: 2, previousQuantity: 2 }), /unimported sale/);
  assert.equal(requests.length, 1);
});
