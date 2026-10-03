import { expect, test, vi } from "vitest";
import { createShopifyDraftAttempt } from "./draftCreationService";
import type { ShopifyOperation } from "./operationTypes";
import type { DraftCreateMutation } from "../../shared/shopify-product-manager";
import type { ShopifyListing } from "./listingService";

function harness() {
  let mapping: ShopifyListing | null = null;
  const records = new Map<string, ShopifyOperation>();
  const operations = { get: async (_s: string, _l: number, id: string) => records.get(id) ?? null, list: async () => [...records.values()], put: vi.fn(async (value: ShopifyOperation) => { const saved = { ...structuredClone(value), version: "v" }; records.set(value.operationId, saved); return saved; }) };
  const ids = { productId: "gid://shopify/Product/1", variantId: "gid://shopify/ProductVariant/2", inventoryItemId: "gid://shopify/InventoryItem/3" };
  const client = { findOwnedDraft: vi.fn(async () => null as (typeof ids & { available: number }) | null), createLinkedDraft: vi.fn(async () => ids) };
  const store = { get: async () => mapping, put: vi.fn(async (value: ShopifyListing) => { mapping = { ...value, version: "b2" }; return mapping; }) };
  const request: DraftCreateMutation = { lotId: 7, operationId: "create-1", generation: 2, expectedVersion: null, overrides: { title: "Custom", price: "25.00", locationId: "gid://shopify/Location/4" }, previewToken: "a".repeat(64) };
  const loadPreview = vi.fn(async () => ({ preview: { title: "Custom", variantTitle: "Booster box" as const, price: "25.00", currency: "CAD", quantity: 3, sku: "SKU", locations: [{ id: request.overrides.locationId, name: "Main" }], previewToken: request.previewToken }, handle: "unused", ownershipHash: "unused" }));
  const input = { scopeKey: "u", shop: "a.myshopify.com", generation: 2, request, store, operations, client, loadPreview, assertCurrent: vi.fn(async () => {}) };
  return { input, ids, client, store, operations, records, setMapping: (value: ShopifyListing | null) => mapping = value };
}
test("custom draft claims its exact final payload before one creation and exact replay never seeds stock again", async () => {
  const h = harness();
  const first = await createShopifyDraftAttempt(h.input);
  expect(first.listing).toMatchObject({ mode: "linked", productTitle: "Custom", variantTitle: "Booster box", lastQuantity: 3 });
  expect(h.operations.put.mock.invocationCallOrder[0]).toBeLessThan(h.client.createLinkedDraft.mock.invocationCallOrder[0]!);
  expect(h.operations.put.mock.calls[0]?.[0]).toMatchObject({ request: h.input.request });
  expect(h.client.createLinkedDraft).toHaveBeenCalledWith(expect.objectContaining({ title: "Custom", price: "25.00", quantity: 3, variantTitle: "Booster box" }));
  await createShopifyDraftAttempt(h.input);
  expect(h.client.createLinkedDraft).toHaveBeenCalledTimes(1);
  await expect(createShopifyDraftAttempt({ ...h.input, request: { ...h.input.request, overrides: { ...h.input.request.overrides, price: "99.00" } } })).rejects.toThrow(/input|payload/i);
});
test("mapping failure recovers exact provider IDs and current stock without a second creation", async () => {
  const h = harness(); h.store.put.mockRejectedValueOnce(new Error("mapping failed"));
  await expect(createShopifyDraftAttempt(h.input)).rejects.toThrow(/mapping failed/i);
  h.client.findOwnedDraft.mockResolvedValue({ ...h.ids, available: 1 });
  expect((await createShopifyDraftAttempt(h.input)).listing?.lastQuantity).toBe(1);
  expect(h.client.createLinkedDraft).toHaveBeenCalledTimes(1);
});
test("an ambiguous attempt rejects changed payloads and performs recovery only on an exact retry", async () => {
  const h = harness(); h.client.createLinkedDraft.mockRejectedValueOnce(new Error("response lost"));
  await expect(createShopifyDraftAttempt(h.input)).rejects.toThrow(/unknown|recover/i);
  await expect(createShopifyDraftAttempt({ ...h.input, request: { ...h.input.request, operationId: "create-2", overrides: { ...h.input.request.overrides, title: "Changed" } } })).rejects.toThrow(/recover|resolve/i);
  await expect(createShopifyDraftAttempt(h.input)).rejects.toThrow(/unknown|recover/i);
  expect(h.client.createLinkedDraft).toHaveBeenCalledTimes(1);
  h.client.findOwnedDraft.mockResolvedValue({ ...h.ids, available: 2 });
  expect((await createShopifyDraftAttempt(h.input)).listing?.lastQuantity).toBe(2);
});
test("a newer tombstone blocks old recovery; explicit version-matched setup uses a new handle", async () => {
  const h = harness(); const first = await createShopifyDraftAttempt(h.input);
  const removed = { ...first.listing!, lifecycle: "unlinked" as const, version: "removed", lastMutationId: "unlink" };
  h.setMapping(removed);
  await expect(createShopifyDraftAttempt(h.input)).rejects.toThrow(/changed/i);
  await createShopifyDraftAttempt({ ...h.input, request: { ...h.input.request, operationId: "create-2", expectedVersion: "removed" } });
  expect(h.client.createLinkedDraft.mock.calls[0]?.[0].handle).not.toBe(h.client.createLinkedDraft.mock.calls[1]?.[0].handle);
});
test("stale preview and provider recovery identity mismatch do not seed or attach another product", async () => {
  const h = harness(); h.input.loadPreview.mockResolvedValueOnce({ ...(await h.input.loadPreview()), preview: { ...(await h.input.loadPreview()).preview, previewToken: "b".repeat(64) } });
  await expect(createShopifyDraftAttempt(h.input)).rejects.toThrow(/preview/i);
  expect(h.client.createLinkedDraft).not.toHaveBeenCalled();
  const changed = harness(); changed.store.put.mockRejectedValueOnce(new Error("mapping failed"));
  await expect(createShopifyDraftAttempt(changed.input)).rejects.toThrow();
  changed.client.findOwnedDraft.mockResolvedValue({ ...changed.ids, productId: "gid://shopify/Product/99", available: 2 });
  await expect(createShopifyDraftAttempt(changed.input)).rejects.toThrow(/identity/i);
  expect(changed.store.put).toHaveBeenCalledTimes(1);
});
