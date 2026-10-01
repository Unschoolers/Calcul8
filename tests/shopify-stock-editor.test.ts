import { beforeEach, expect, test, vi } from "vitest";
import { configLotEditMethods } from "../src/app-core/methods/config-lot-edit.ts";

const { apiCall } = vi.hoisted(() => ({ apiCall: vi.fn() }));
vi.mock("../src/app-core/methods/ui/common/api-client.ts", () => ({ fetchAuthenticatedApiResponse: apiCall }));
const observation = {
  shop: "store.myshopify.com", variantId: "gid://shopify/ProductVariant/2", inventoryItemId: "gid://shopify/InventoryItem/3",
  locationId: "gid://shopify/Location/4", locationName: "Main", available: 12, onHand: 13, committed: 1,
  observedAt: "2026-09-30T20:00:00.000Z"
};
function context() {
  return {
    activeScopeType: "personal", activeWorkspaceId: null as string | null, googleAuthEpoch: 4, boxesPurchased: 10,
    shopifyEditRequestRevision: 1,
    currentLotId: 41, showRenameLotModal: true, shopifyConnectionStatus: "connected", shopifyConnectionShop: observation.shop,
    shopifyEditSessionAuthEpoch: 4, shopifyEditSessionScope: "{}", shopifyEditSessionLotId: 41,
    shopifyEditListing: { ...observation, mode: "linked", productId: "gid://shopify/Product/1", lastQuantity: 10 },
    t: (key: string) => key
  };
}
const load = (ctx: ReturnType<typeof context>) =>
  (configLotEditMethods as unknown as { loadShopifyLinkedStock(this: unknown): Promise<unknown> }).loadShopifyLinkedStock.call(ctx);
beforeEach(() => { apiCall.mockReset(); });

test("stock observation uses scoped lot identity and does not modify the lot or listing baseline", async () => {
  const ctx = context();
  apiCall.mockResolvedValue(new Response(JSON.stringify({ observation }), { status: 200 }));
  expect(await load(ctx)).toEqual(observation);
  expect(JSON.parse(apiCall.mock.calls[0]![2].body)).toEqual({ lotId: 41 });
  expect(apiCall.mock.calls[0]![1]).toBe("/integrations/shopify/products/stock");
  expect(ctx.shopifyEditListing.lastQuantity).toBe(10);
  expect(ctx.boxesPurchased).toBe(10);
});

test.each(["provider", "scope", "auth", "dialog"])("stock observations arriving after %s changes are rejected", async (change) => {
  const ctx = context();
  let finish!: (response: Response) => void;
  apiCall.mockReturnValue(new Promise<Response>(resolve => { finish = resolve; }));
  const pending = load(ctx);
  if (change === "provider") ctx.shopifyConnectionShop = "other.myshopify.com";
  if (change === "scope") { ctx.activeScopeType = "workspace"; ctx.activeWorkspaceId = "team"; }
  if (change === "auth") ctx.googleAuthEpoch += 1;
  if (change === "dialog") ctx.showRenameLotModal = false;
  finish(new Response(JSON.stringify({ observation }), { status: 200 }));
  await expect(pending).rejects.toThrow("configShopifyStockStaleRequest");
  await expect(pending).rejects.toMatchObject({ code: null, recovery: "refresh", messageKey: "configShopifyStockStaleRequest" });
});

test("stock responses with a mismatched location or invalid quantity are rejected", async () => {
  const ctx = context();
  apiCall.mockResolvedValueOnce(new Response(JSON.stringify({ observation: { ...observation, locationId: "gid://shopify/Location/99" } }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ observation: { ...observation, available: "12" } }), { status: 200 }));
  await expect(load(ctx)).rejects.toThrow("configShopifyStockRefreshError");
  await expect(load(ctx)).rejects.toThrow("configShopifyStockRefreshError");
});
