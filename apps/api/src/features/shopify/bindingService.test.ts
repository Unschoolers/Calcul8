import { expect, test, vi } from "vitest";
import { mutateShopifyBinding } from "./bindingService";
import type { ShopifyListing } from "./listingService";
import type { BindingMutation } from "../../shared/shopify-product-manager";
import { ShopifyErrorCode } from "../../shared/shopify-errors";

const old: ShopifyListing = { scopeKey: "u", shop: "a.myshopify.com", lotId: 42, mode: "linked", productId: "gid://shopify/Product/1", variantId: "gid://shopify/ProductVariant/2", inventoryItemId: "gid://shopify/InventoryItem/3", locationId: "gid://shopify/Location/4", lastQuantity: 9, updatedAt: "now", version: "v1" };
const candidate = { productId: "gid://shopify/Product/11", variantId: "gid://shopify/ProductVariant/12", inventoryItemId: "gid://shopify/InventoryItem/13", title: "New", variantTitle: "Booster box", sku: "NEW", price: "80.00", locations: [{ id: "gid://shopify/Location/4", name: "Main", available: 6 }, { id: "gid://shopify/Location/5", name: "Other", available: 2 }] };
function harness(initial: ShopifyListing | null = old, others: ShopifyListing[] = []) {
  let current = initial ? { ...initial } : null;
  const store = {
    get: async () => current,
    list: async () => [...others, ...(current ? [current] : [])],
    put: vi.fn(async (value: ShopifyListing) => {
      if ((value.version ?? null) !== (current?.version ?? null)) throw new Error("Version conflict");
      current = { ...value, version: `v${Number(current?.version?.slice(1) ?? 0) + 1}` }; return current;
    })
  };
  const client = { getVariant: vi.fn(async (id: string) => id === old.variantId ? { ...candidate, productId: old.productId, variantId: old.variantId, inventoryItemId: old.inventoryItemId } : candidate) };
  const input = { scopeKey: "u", shop: old.shop, generation: 7, store, client, assertCurrent: vi.fn(async () => {}) };
  const mutation = (action: BindingMutation["action"], extra: Partial<BindingMutation> = {}): BindingMutation => ({ lotId: 42, mutationId: "mutation-0001", expectedVersion: initial?.version ?? null, generation: 7, action, ...extra });
  return { input, mutation, store, client, current: () => current };
}
test("replacement persists provider identity without rewriting the former product", async () => {
  const h = harness();
  const result = await mutateShopifyBinding({ ...h.input, request: h.mutation("replace", { variantId: candidate.variantId, locationId: candidate.locations[0].id }) });
  expect(result).toMatchObject({ variantId: candidate.variantId, productId: candidate.productId, inventoryItemId: candidate.inventoryItemId, lastQuantity: 6, mode: "linked", lifecycle: "active", version: "v2" });
});
test("same-binding setup records an idempotency identity without repeating provider reads", async () => {
  const h = harness();
  const request = h.mutation("link", { variantId: old.variantId, locationId: old.locationId });
  const first = await mutateShopifyBinding({ ...h.input, request });
  expect(first.lastMutationId).toBe(request.mutationId);
  expect(await mutateShopifyBinding({ ...h.input, request })).toEqual(first);
  await expect(mutateShopifyBinding({ ...h.input, request: { ...request, action: "replace", variantId: candidate.variantId } })).rejects.toThrow(/different input/i);
  expect(h.client.getVariant).not.toHaveBeenCalled();
  expect(h.store.put).toHaveBeenCalledTimes(1);
});
test("location-only correction keeps the same variant and observes the selected location", async () => {
  const h = harness();
  const result = await mutateShopifyBinding({ ...h.input, request: h.mutation("location", { locationId: "gid://shopify/Location/5" }) });
  expect(result).toMatchObject({ variantId: old.variantId, locationId: "gid://shopify/Location/5", lastQuantity: 2 });
});
test("location correction rejects a provider identity mismatch", async () => {
  const h = harness();
  h.client.getVariant.mockResolvedValueOnce({ ...candidate, productId: "gid://shopify/Product/999", variantId: old.variantId, inventoryItemId: old.inventoryItemId });
  await expect(mutateShopifyBinding({ ...h.input, request: h.mutation("location", { locationId: "gid://shopify/Location/5" }) })).rejects.toThrow(/identity|changed/i);
  expect(h.store.put).not.toHaveBeenCalled();
});
test("unlink retains a versioned suppression tombstone and repeated work does not write again", async () => {
  const h = harness(); const request = h.mutation("unlink");
  const removed = await mutateShopifyBinding({ ...h.input, request });
  expect(removed).toMatchObject({ lifecycle: "unlinked", variantId: old.variantId, version: "v2" });
  expect(await mutateShopifyBinding({ ...h.input, request })).toEqual(removed);
  expect(h.store.put).toHaveBeenCalledTimes(1);
  expect(h.client.getVariant).not.toHaveBeenCalled();
  await expect(mutateShopifyBinding({ ...h.input, request: { ...request, action: "replace", variantId: candidate.variantId, locationId: "gid://shopify/Location/4" } })).rejects.toThrow(/mutation|operation/i);
});
test("exact mutation replay rechecks the connection after reading its stored result", async () => {
  const h = harness(); const request = h.mutation("unlink");
  await mutateShopifyBinding({ ...h.input, request });
  h.input.assertCurrent.mockReset().mockResolvedValueOnce().mockRejectedValueOnce(new Error("connection changed"));
  await expect(mutateShopifyBinding({ ...h.input, request })).rejects.toThrow(/connection changed/i);
  expect(h.store.put).toHaveBeenCalledTimes(1);
});
test("stale revisions and changed connection generations cannot overwrite a binding", async () => {
  const h = harness();
  await expect(mutateShopifyBinding({ ...h.input, request: h.mutation("unlink", { expectedVersion: "older" }) })).rejects.toThrow(/changed|stale/i);
  await expect(mutateShopifyBinding({ ...h.input, request: h.mutation("unlink", { generation: 6 }) })).rejects.toThrow(/connection/i);
  expect(h.store.put).not.toHaveBeenCalled();
});
test("managed listings require explicit ownership transfer before correction", async () => {
  const h = harness({ ...old, mode: undefined });
  await expect(mutateShopifyBinding({ ...h.input, request: h.mutation("location", { locationId: "gid://shopify/Location/5" }) })).rejects.toThrow(/transfer/i);
  await expect(mutateShopifyBinding({ ...h.input, request: h.mutation("transfer") })).rejects.toThrow(/confirm/i);
  const result = await mutateShopifyBinding({ ...h.input, request: h.mutation("transfer", { confirmTransfer: true }) });
  expect(result.mode).toBe("linked");
  expect(result.variantId).toBe(old.variantId);
});
test("active duplicate ownership blocks replacement but an unlinked variant is reusable", async () => {
  const other = { ...old, lotId: 8, variantId: candidate.variantId };
  const h = harness(old, [other]);
  await expect(mutateShopifyBinding({ ...h.input, request: h.mutation("replace", { variantId: candidate.variantId, locationId: "gid://shopify/Location/4" }) })).rejects.toThrow(/another lot/i);
  const available = harness(old, [{ ...other, lifecycle: "unlinked" }]);
  expect((await mutateShopifyBinding({ ...available.input, request: available.mutation("replace", { variantId: candidate.variantId, locationId: "gid://shopify/Location/4" }) })).variantId).toBe(candidate.variantId);
});
test("explicit setup is the only way to reactivate an unlinked mapping", async () => {
  const h = harness({ ...old, lifecycle: "unlinked" });
  await expect(mutateShopifyBinding({ ...h.input, request: h.mutation("replace", { variantId: candidate.variantId, locationId: "gid://shopify/Location/4" }) })).rejects.toThrow(/link|setup/i);
  const result = await mutateShopifyBinding({ ...h.input, request: h.mutation("link", { variantId: candidate.variantId, locationId: "gid://shopify/Location/4" }) });
  expect(result.lifecycle).toBe("active");
});
test("a version-matched explicit link can set up the current store over a foreign-store mapping", async () => {
  const h = harness({ ...old, shop: "previous.myshopify.com" });
  const result = await mutateShopifyBinding({ ...h.input, request: h.mutation("link", { variantId: candidate.variantId, locationId: "gid://shopify/Location/4" }) });
  expect(result).toMatchObject({ shop: old.shop, variantId: candidate.variantId, lifecycle: "active" });
});
test("foreign-store bindings cannot be corrected as if they belonged to the current connection", async () => {
  const h = harness({ ...old, shop: "previous.myshopify.com" });
  await expect(mutateShopifyBinding({ ...h.input, request: h.mutation("replace", { variantId: candidate.variantId, locationId: "gid://shopify/Location/4" }) })).rejects.toThrow(/store|connection/i);
  expect(h.client.getVariant).not.toHaveBeenCalled();
});
test("unavailable variants, invalid locations, and failed request guards do not persist", async () => {
  const h = harness();
  await expect(mutateShopifyBinding({ ...h.input, request: h.mutation("replace", { variantId: candidate.variantId, locationId: "gid://shopify/Location/999" }) })).rejects.toThrow(/location/i);
  h.client.getVariant.mockResolvedValueOnce(null as never);
  await expect(mutateShopifyBinding({ ...h.input, request: h.mutation("replace", { variantId: candidate.variantId, locationId: "gid://shopify/Location/4" }) })).rejects.toThrow(/variant/i);
  h.input.assertCurrent.mockRejectedValueOnce(new Error("connection changed"));
  await expect(mutateShopifyBinding({ ...h.input, request: h.mutation("unlink") })).rejects.toThrow(/connection/i);
  expect(h.store.put).not.toHaveBeenCalled();
});
test("optimistic conflicts from tombstone and transfer writes retain a refreshable error", async () => {
  const h = harness();
  h.store.put.mockRejectedValueOnce(new Error("Shopify listing changed; retry reconciliation"));
  await expect(mutateShopifyBinding({ ...h.input, request: h.mutation("unlink") })).rejects.toMatchObject({ code: ShopifyErrorCode.BINDING_CHANGED });
  const managed = harness({ ...old, mode: undefined });
  managed.store.put.mockRejectedValueOnce(new Error("Shopify listing changed; retry reconciliation"));
  await expect(mutateShopifyBinding({ ...managed.input, request: managed.mutation("transfer", { confirmTransfer: true }) })).rejects.toMatchObject({ code: ShopifyErrorCode.BINDING_CHANGED });
});
