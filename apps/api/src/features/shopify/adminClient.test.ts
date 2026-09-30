import assert from "node:assert/strict";
import { test } from "vitest";
import { createShopifyAdminClient } from "./adminClient.js";

function response(data: unknown): Response {
  return new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });
}

test("sets available stock using the Shopify 2026-07 concurrency input", async () => {
  let available = 0;
  const fetcher = async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    if (body.query.includes("query BoxStock")) return response({ inventoryItem: { inventoryLevel: { quantities: [{ quantity: available }] } } });
    const entry = body.variables.input.quantities[0];
    if ("compareQuantity" in entry || !("changeFromQuantity" in entry)) {
      return new Response(JSON.stringify({ errors: [{ message: "Inventory input requires changeFromQuantity; compareQuantity is not supported." }] }), { status: 200 });
    }
    if (entry.changeFromQuantity !== available) return response({ inventorySetQuantities: { userErrors: [{ code: "CHANGE_FROM_QUANTITY_STALE", message: "stale" }] } });
    available = entry.quantity;
    return response({ inventorySetQuantities: { userErrors: [] } });
  };
  const client = createShopifyAdminClient("example.myshopify.com", async () => "token", fetcher as typeof fetch);
  await client.setAvailable({ inventoryItemId: "gid://shopify/InventoryItem/3", locationId: "gid://shopify/Location/4", quantity: 3, previousQuantity: 0 });
  assert.equal(available, 3);
});

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

test("an older inventory target cannot retry over a newer lower target", async () => {
  let available = 0;
  let releaseOld!: () => void;
  let oldMutationStarted!: () => void;
  const oldMutation = new Promise<void>((resolve) => { releaseOld = resolve; });
  const started = new Promise<void>((resolve) => { oldMutationStarted = resolve; });
  const fetcher = async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    if (body.query.includes("query BoxStock")) return response({ inventoryItem: { inventoryLevel: { quantities: [{ quantity: available }] } } });
    const entry = body.variables.input.quantities[0];
    if (entry.quantity === 5 && entry.changeFromQuantity === 0) { oldMutationStarted(); await oldMutation; }
    if (entry.changeFromQuantity !== available) return response({ inventorySetQuantities: { userErrors: [{ code: "CHANGE_FROM_QUANTITY_STALE", message: "stale" }] } });
    available = entry.quantity;
    return response({ inventorySetQuantities: { userErrors: [] } });
  };
  const client = createShopifyAdminClient("example.myshopify.com", async () => "token", fetcher as typeof fetch);
  const ids = { inventoryItemId: "gid://shopify/InventoryItem/3", locationId: "gid://shopify/Location/4", previousQuantity: 0 };
  const older = client.setAvailable({ ...ids, quantity: 5 }).catch(() => {});
  await started;
  await client.setAvailable({ ...ids, quantity: 3 });
  assert.equal(available, 3);
  releaseOld();
  await older;
  assert.equal(available, 3);
});
