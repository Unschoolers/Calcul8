import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { reconcileBoxListing, shopifyBoxHandle, type ShopifyListing, type ShopifyListingClient } from "./listingService.js";

function harness() {
  let mapping: ShopifyListing | null = null;
  const store = {
    get: vi.fn(async () => mapping),
    put: vi.fn(async (next: ShopifyListing) => { mapping = next; })
  };
  const client: ShopifyListingClient = {
    upsertBoxProduct: vi.fn(async () => ({ productId: "gid://shopify/Product/1", variantId: "gid://shopify/ProductVariant/2", inventoryItemId: "gid://shopify/InventoryItem/3", locationId: "gid://shopify/Location/4" })),
    activateProduct: vi.fn(async () => {}),
    setAvailable: vi.fn(async () => {})
  };
  return { store, client, mapping: () => mapping };
}

test("publishes only remaining sealed boxes and retains provider IDs across SKU edits", async () => {
  const { store, client, mapping } = harness();
  const base = { scopeKey: "ws:1", shop: "example.myshopify.com", store, client };
  const lot = { id: 42, lotType: "bulk", shopifyEnabled: true, name: "Booster", boxesPurchased: 3, packsPerBox: 10, boxPriceSell: 100, externalSku: "BOX-A" };
  const sales = [{ type: "pack", quantity: 1, packsCount: 1 }];
  assert.deepEqual(await reconcileBoxListing({ ...base, lot, sales }), { status: "published", sealedBoxes: 2 });
  assert.equal(mapping()?.lastQuantity, 2);
  await reconcileBoxListing({ ...base, lot: { ...lot, externalSku: "BOX-B" }, sales });
  assert.equal(vi.mocked(client.upsertBoxProduct).mock.calls[1]?.[0].id, "gid://shopify/Product/1");
  assert.equal(vi.mocked(client.upsertBoxProduct).mock.calls[1]?.[0].sku, "BOX-B");
  assert.equal(shopifyBoxHandle("ws:1", 42), shopifyBoxHandle("ws:1", 42));
});

test("turning off opt-in drafts existing product and sets its stock to zero", async () => {
  const { store, client } = harness();
  const base = { scopeKey: "user:1", shop: "example.myshopify.com", store, client };
  const lot = { id: 1, lotType: "bulk", shopifyEnabled: true, boxesPurchased: 2, packsPerBox: 12, boxPriceSell: 50 };
  await reconcileBoxListing({ ...base, lot, sales: [] });
  assert.deepEqual(await reconcileBoxListing({ ...base, lot: { ...lot, shopifyEnabled: false }, sales: [] }), { status: "paused", sealedBoxes: 0 });
  assert.equal(vi.mocked(client.upsertBoxProduct).mock.calls[1]?.[0].active, false);
  assert.equal(vi.mocked(client.setAvailable).mock.calls[1]?.[0].quantity, 0);
});

test("invalid inventory cannot be published", async () => {
  const { store, client } = harness();
  await assert.rejects(() => reconcileBoxListing({ scopeKey: "u", shop: "example.myshopify.com", store, client,
    lot: { id: 1, shopifyEnabled: true, boxesPurchased: 1, packsPerBox: 10 },
    sales: [{ type: "box", quantity: 2, packsCount: 20 }] }), /Invalid sealed-box inventory/);
  assert.equal(vi.mocked(client.upsertBoxProduct).mock.calls.length, 0);
});
