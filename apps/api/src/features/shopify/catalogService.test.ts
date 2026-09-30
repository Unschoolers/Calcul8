import { expect, test, vi } from "vitest";
import { linkExistingVariant } from "./catalogService";
import type { ShopifyListing } from "./listingService";

const candidate = { productId: "gid://shopify/Product/1", variantId: "gid://shopify/ProductVariant/2", title: "Bleach", variantTitle: "Box", sku: "BL", price: "100", inventoryItemId: "gid://shopify/InventoryItem/3", locations: [{ id: "gid://shopify/Location/4", name: "Store", available: 17 }] };
function harness(listings: ShopifyListing[] = []) {
  const put = vi.fn(async (listing: ShopifyListing) => listing);
  const store = { get: vi.fn(async () => listings.find(x => x.lotId === 42) ?? null), list: vi.fn(async () => listings), put };
  const client = { getVariant: vi.fn(async () => candidate) };
  return { store, client, input: { scopeKey: "u", shop: "a.myshopify.com", lotId: 42, variantId: candidate.variantId, locationId: candidate.locations[0].id, store, client } };
}
test("links exact provider IDs and current stock without any Shopify mutation", async () => {
  const { input } = harness();
  const result = await linkExistingVariant(input);
  expect(result).toMatchObject({ mode: "linked", lotId: 42, productId: candidate.productId, variantId: candidate.variantId, inventoryItemId: candidate.inventoryItemId, locationId: candidate.locations[0].id, lastQuantity: 17 });
});
test("rejects variants unavailable in the connected shop and foreign inventory locations", async () => {
  const { input, client, store } = harness();
  await expect(linkExistingVariant({ ...input, locationId: "gid://shopify/Location/999" })).rejects.toThrow(/location/i);
  client.getVariant.mockResolvedValueOnce(null as never);
  await expect(linkExistingVariant(input)).rejects.toThrow(/variant/i);
  expect(store.put).not.toHaveBeenCalled();
});
test("prevents one variant from being linked to multiple lots and preserves managed mappings", async () => {
  const listing = { ...candidate, scopeKey: "u", lotId: 7, shop: "a.myshopify.com", locationId: candidate.locations[0].id, lastQuantity: 17, updatedAt: "now" };
  const { input } = harness([listing]);
  await expect(linkExistingVariant(input)).rejects.toThrow(/another lot/i);
  const managed = harness([{ ...listing, lotId: 42 }]);
  await expect(linkExistingVariant(managed.input)).rejects.toThrow(/managed/i);
});
test("repeating a link preserves the mapping version and cannot silently switch variants", async () => {
  const listing: ShopifyListing = { scopeKey: "u", lotId: 42, shop: "a.myshopify.com", mode: "linked", productId: candidate.productId, variantId: candidate.variantId, inventoryItemId: candidate.inventoryItemId, locationId: candidate.locations[0].id, lastQuantity: 17, updatedAt: "now", version: "etag" };
  const { input } = harness([listing]);
  expect(await linkExistingVariant(input)).toMatchObject({ version: "etag" });
  await expect(linkExistingVariant({ ...input, variantId: "gid://shopify/ProductVariant/99" })).rejects.toThrow(/already linked/i);
});
