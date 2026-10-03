import { expect, test, vi } from "vitest";
import { updateShopifyProductDetails } from "./productDetailsService";
import type { ShopifyOperation } from "./operationTypes";
import type { ShopifyListing } from "./listingService";
import type { ProductDetailsMutation } from "../../shared/shopify-product-manager";
import { ShopifyErrorCode } from "../../shared/shopify-errors";

const listing: ShopifyListing = { scopeKey: "u", shop: "a.myshopify.com", lotId: 7, mode: "linked", productId: "gid://shopify/Product/1", variantId: "gid://shopify/ProductVariant/2", inventoryItemId: "gid://shopify/InventoryItem/3", locationId: "gid://shopify/Location/4", version: "v1", lastQuantity: 9, updatedAt: "now" };
function harness() {
  let title = "Original", price = "10.00", mapping = { ...listing };
  const records = new Map<string, ShopifyOperation>();
  const operations = {
    get: async (_scope: string, _lot: number, id: string) => records.get(id) ?? null,
    list: async () => [...records.values()],
    put: vi.fn(async (record: ShopifyOperation) => { const saved = { ...structuredClone(record), version: `${Number(records.get(record.operationId)?.version ?? 0) + 1}` }; records.set(record.operationId, saved); return saved; })
  };
  const client = {
    getVariant: vi.fn(async () => ({ productId: listing.productId, variantId: listing.variantId, inventoryItemId: listing.inventoryItemId, title, price, variantTitle: "Booster box", sku: "SKU", locations: [{ id: listing.locationId, name: "Main", available: 9 }] })),
    getShopCurrency: vi.fn(async () => "CAD"),
    updateProductTitle: vi.fn(async (_id: string, value: string, guard?: () => Promise<void>) => { await guard?.(); title = value; }),
    updateVariantPrice: vi.fn(async (_pid: string, _id: string, value: string, guard?: () => Promise<void>) => { await guard?.(); price = value; })
  };
  const request: ProductDetailsMutation = { lotId: 7, operationId: "details-1", expectedVersion: "v1", generation: 2, currency: "CAD", expected: { title: "Original", price: "10.00" }, draft: { title: "Custom", price: "20.00" } };
  const input = { scopeKey: "u", shop: listing.shop, generation: 2, store: { get: async () => mapping }, operations, client, assertCurrent: vi.fn(async () => {}), request };
  return { input, client, operations, records, setTitle: (value: string) => title = value, setPrice: (value: string) => price = value, setMapping: (value: ShopifyListing) => mapping = value };
}

test("explicit details change only title and selected price, and exact replay issues no second write", async () => {
  const h = harness();
  expect((await updateShopifyProductDetails(h.input)).outcome).toEqual({ title: "confirmed", price: "confirmed" });
  const replay = await updateShopifyProductDetails(h.input);
  expect(replay.listing).toMatchObject({ productTitle: "Custom", price: "20.00", currency: "CAD", lastQuantity: 9, sku: "SKU" });
  expect(h.client.updateProductTitle).toHaveBeenCalledTimes(1);
  expect(h.client.updateVariantPrice).toHaveBeenCalledTimes(1);
  expect(h.operations.put.mock.invocationCallOrder[0]).toBeLessThan(h.client.updateProductTitle.mock.invocationCallOrder[0]!);
  await expect(updateShopifyProductDetails({ ...h.input, request: { ...h.input.request, draft: { title: "Other", price: "20.00" } } })).rejects.toThrow(/operation|input/i);
});

test("title-only and price-only changes do not send unchanged fields", async () => {
  const h = harness();
  await updateShopifyProductDetails({ ...h.input, request: { ...h.input.request, draft: { title: "Original", price: "20.00" } } });
  expect(h.client.updateProductTitle).not.toHaveBeenCalled();
  expect(h.client.updateVariantPrice).toHaveBeenCalledTimes(1);
  const title = harness();
  await updateShopifyProductDetails({ ...title.input, request: { ...title.input.request, draft: { title: "Custom", price: "10.00" } } });
  expect(title.client.updateVariantPrice).not.toHaveBeenCalled();
});

test("external edits, managed mappings, invalid inputs and stale connection prevent all writes", async () => {
  for (const request of [{ ...harness().input.request, draft: { title: " ", price: "20.00" } }, { ...harness().input.request, draft: { title: "x".repeat(256), price: "20.00" } }, { ...harness().input.request, draft: { title: "Custom", price: "0.00" } }, { ...harness().input.request, draft: { title: "Custom", price: "1.001" } }, { ...harness().input.request, currency: "USD" }, { ...harness().input.request, generation: 3 }]) {
    const h = harness(); await expect(updateShopifyProductDetails({ ...h.input, request })).rejects.toThrow(); expect(h.client.updateProductTitle).not.toHaveBeenCalled();
  }
  const external = harness(); external.setTitle("Edited elsewhere");
  await expect(updateShopifyProductDetails(external.input)).rejects.toThrow(/changed/i);
  const managed = harness(); managed.setMapping({ ...listing, mode: "managed" });
  await expect(updateShopifyProductDetails(managed.input)).rejects.toThrow(/transfer/i);
  expect(managed.client.updateProductTitle).not.toHaveBeenCalled();
});

test("partial outcomes remain explicit and an exact retry repairs only the missing field", async () => {
  const h = harness(); h.client.updateVariantPrice.mockRejectedValueOnce(new Error("provider rejected"));
  expect((await updateShopifyProductDetails(h.input)).outcome).toEqual({ title: "confirmed", price: "pending" });
  expect((await updateShopifyProductDetails(h.input)).outcome).toEqual({ title: "confirmed", price: "confirmed" });
  expect(h.client.updateProductTitle).toHaveBeenCalledTimes(1);
  expect(h.client.updateVariantPrice).toHaveBeenCalledTimes(2);
});

test("a lost response is resolved by readback; an unavailable read stays unknown and blocks a different operation", async () => {
  const recovered = harness();
  recovered.client.updateProductTitle.mockImplementationOnce(async () => { recovered.setTitle("Custom"); throw new Error("lost response"); });
  expect((await updateShopifyProductDetails(recovered.input)).outcome).toEqual({ title: "confirmed", price: "confirmed" });
  const unknown = harness();
  unknown.client.updateProductTitle.mockImplementationOnce(async () => { unknown.client.getVariant.mockRejectedValue(new Error("offline")); throw new Error("lost response"); });
  expect((await updateShopifyProductDetails(unknown.input)).outcome).toEqual({ title: "unknown", price: "pending" });
  await expect(updateShopifyProductDetails({ ...unknown.input, request: { ...unknown.input.request, operationId: "different" } })).rejects.toThrow(/resolve|recover/i);
  expect(unknown.client.updateVariantPrice).not.toHaveBeenCalled();
});

test("provider identity mismatch and a binding switch before a provider call cannot edit the old product", async () => {
  const h = harness(); h.client.getVariant.mockResolvedValueOnce({ ...(await h.client.getVariant()), productId: "gid://shopify/Product/99" });
  await expect(updateShopifyProductDetails(h.input)).rejects.toThrow(/identity/i);
  const switched = harness(); switched.input.assertCurrent.mockImplementation(async () => { switched.setMapping({ ...listing, lifecycle: "unlinked", version: "v2" }); });
  await expect(updateShopifyProductDetails(switched.input)).rejects.toThrow(/changed/i);
  expect(switched.client.updateProductTitle).not.toHaveBeenCalled();
});

test("external change to an unattempted field preserves confirmed progress and permits a fresh operation", async () => {
  const h = harness();
  h.client.updateProductTitle.mockImplementationOnce(async () => { h.setTitle("Custom"); h.setPrice("15.00"); });
  await expect(updateShopifyProductDetails(h.input)).rejects.toThrow(/changed elsewhere/i);
  expect(h.records.get("details-1")).toMatchObject({ outcome: { title: "confirmed", price: "pending" }, terminalConflict: true });
  expect(h.client.updateVariantPrice).not.toHaveBeenCalled();
  await expect(updateShopifyProductDetails(h.input)).rejects.toThrow(/changed elsewhere/i);
  const fresh = { ...h.input.request, operationId: "details-2", expected: { title: "Custom", price: "15.00" } };
  expect((await updateShopifyProductDetails({ ...h.input, request: fresh })).outcome.price).toBe("confirmed");
  expect(h.client.updateProductTitle).toHaveBeenCalledTimes(1);
});

test("a third provider value terminalizes an ambiguous write and requires a refreshed baseline", async () => {
  const h = harness();
  h.client.updateProductTitle.mockImplementationOnce(async () => { h.setTitle("External"); throw new Error("lost response"); });
  await expect(updateShopifyProductDetails(h.input)).rejects.toMatchObject({ code: ShopifyErrorCode.DETAILS_CHANGED });
  expect(h.records.get("details-1")).toMatchObject({ outcome: { title: "unknown", price: "pending" }, terminalConflict: true });
  await expect(updateShopifyProductDetails(h.input)).rejects.toMatchObject({ code: ShopifyErrorCode.DETAILS_CHANGED });

  const stale = { ...h.input.request, operationId: "details-2", draft: { title: "New title", price: "10.00" } };
  await expect(updateShopifyProductDetails({ ...h.input, request: stale })).rejects.toMatchObject({ code: ShopifyErrorCode.DETAILS_CHANGED });
  expect(h.client.updateProductTitle).toHaveBeenCalledTimes(1);

  const refreshed = { ...stale, operationId: "details-3", expected: { title: "External", price: "10.00" } };
  expect((await updateShopifyProductDetails({ ...h.input, request: refreshed })).outcome).toEqual({ title: "confirmed", price: "confirmed" });
  expect(h.records.get("details-1")).toMatchObject({ outcome: { title: "unknown", price: "pending" }, terminalConflict: true });
  expect(h.client.updateProductTitle).toHaveBeenCalledTimes(2);
  expect(h.client.updateVariantPrice).not.toHaveBeenCalled();
});
