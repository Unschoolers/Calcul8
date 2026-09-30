import { beforeEach, expect, test, vi } from "vitest";
import type { HttpRequest, InvocationContext } from "@azure/functions";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), scope: vi.fn(), connection: vi.fn(), snapshot: vi.fn(), search: vi.fn(), getVariant: vi.fn(), get: vi.fn(), list: vi.fn(), put: vi.fn(), webhooks: vi.fn() }));
vi.mock("../../lib/auth", async importOriginal => ({ ...await importOriginal<typeof import("../../lib/auth")>(), resolveUserId: mocks.actor }));
vi.mock("../../lib/http", () => ({ executeHttpHandler: async (_request: unknown, _context: unknown, options: { operation: (input: { config: unknown }) => unknown }) => options.operation({ config: {} }), jsonResponse: (_req: unknown, _cfg: unknown, status: number, jsonBody: unknown) => ({ status, jsonBody }) }));
vi.mock("../whatnot/serviceCore", () => ({ resolveWhatnotScope: mocks.scope }));
vi.mock("../../lib/cosmos/shopifyRepository", () => ({ getShopifyConnection: mocks.connection }));
vi.mock("../../lib/cosmos/syncSnapshotRepository", () => ({ getEffectiveSyncSnapshot: mocks.snapshot }));
vi.mock("../../lib/cosmos/shopifyListingRepository", () => ({ createShopifyListingStore: () => ({ get: mocks.get, list: mocks.list, put: mocks.put }) }));
vi.mock("./adminClient", () => ({ createShopifyAdminClient: () => ({ searchVariants: mocks.search, getVariant: mocks.getVariant }) }));
vi.mock("./lotLease", () => ({ withShopifyLotLease: async (_cfg: unknown, _scope: unknown, _id: unknown, work: (guard: () => Promise<void>) => Promise<void>) => { await work(async () => {}); return true; } }));
vi.mock("./webhookSubscription", () => ({ ensureShopifyOrderWebhooks: mocks.webhooks }));
import { shopifyProductSearch, shopifyProductLink, shopifyProductListing } from "./catalogHandlers";
const request = (body: unknown) => ({ json: async () => body }) as HttpRequest;
const context = {} as InvocationContext;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue("actor"); mocks.scope.mockResolvedValue({ partitionKey: "ws:1" });
  mocks.connection.mockResolvedValue({ shop: "a.myshopify.com", updatedAt: "now" });
  mocks.snapshot.mockResolvedValue({ lots: [{ id: 42, lotType: "bulk" }] });
  mocks.get.mockResolvedValue(null); mocks.list.mockResolvedValue([]); mocks.put.mockImplementation(async value => value);
  mocks.search.mockResolvedValue({ variants: [], pageInfo: { hasNextPage: false, endCursor: null } });
  mocks.getVariant.mockResolvedValue({ productId: "gid://shopify/Product/1", variantId: "gid://shopify/ProductVariant/2", title: "Bleach", variantTitle: "Box", sku: "BL", price: "100", inventoryItemId: "gid://shopify/InventoryItem/3", locations: [{ id: "gid://shopify/Location/4", name: "Store", available: 17 }] });
});
test("search resolves actor scope and never accepts a caller-supplied shop", async () => {
  const result = await shopifyProductSearch(request({ query: "Bleach", workspaceId: "team", shop: "evil.myshopify.com" }), context);
  expect(result.status).toBe(200); expect(mocks.scope).toHaveBeenCalledWith({}, "actor", "team", false);
  expect(mocks.search).toHaveBeenCalledWith("Bleach", undefined);
  expect(mocks.put).not.toHaveBeenCalled();
});
test("link requires workspace owner and verifies the lot in that scope", async () => {
  const result = await shopifyProductLink(request({ workspaceId: "team", lotId: 42, variantId: "gid://shopify/ProductVariant/2", locationId: "gid://shopify/Location/4" }), context);
  expect(result.status).toBe(200); expect(mocks.scope).toHaveBeenCalledWith({}, "actor", "team", true);
  expect(mocks.put).toHaveBeenCalledWith(expect.objectContaining({ scopeKey: "ws:1", mode: "linked", lastQuantity: 17 }));
  mocks.snapshot.mockResolvedValue({ lots: [] });
  await expect(shopifyProductLink(request({ lotId: 42, variantId: "gid://shopify/ProductVariant/2", locationId: "gid://shopify/Location/4" }), context)).rejects.toThrow(/lot/i);
});
test("rejects malformed selection and missing connections before provider access", async () => {
  await expect(shopifyProductLink(request({ lotId: 42, variantId: "wrong", locationId: "wrong" }), context)).rejects.toThrow(/variant/i);
  mocks.connection.mockResolvedValue(null);
  await expect(shopifyProductSearch(request({ query: "Bleach" }), context)).rejects.toThrow(/connect/i);
  expect(mocks.search).not.toHaveBeenCalled();
});
test("listing does not return mappings from a previously connected store", async () => {
  mocks.get.mockResolvedValue({ shop: "old.myshopify.com", lotId: 42 });
  const result = await shopifyProductListing(request({ lotId: 42 }), context);
  expect(result.jsonBody).toEqual({ listing: null });
});

test("token refresh does not invalidate a link while a reconnect generation does", async () => {
  mocks.connection.mockResolvedValueOnce({ shop: "a.myshopify.com", updatedAt: "before-refresh", generation: 0 })
    .mockResolvedValueOnce({ shop: "a.myshopify.com", updatedAt: "after-refresh", generation: 0 });
  const body = { lotId: 42, variantId: "gid://shopify/ProductVariant/2", locationId: "gid://shopify/Location/4" };
  expect((await shopifyProductLink(request(body), context)).status).toBe(200);
  mocks.put.mockClear();
  mocks.connection.mockResolvedValueOnce({ shop: "a.myshopify.com", updatedAt: "before", generation: 0 })
    .mockResolvedValueOnce({ shop: "a.myshopify.com", updatedAt: "after", generation: 1 });
  await expect(shopifyProductLink(request(body), context)).rejects.toThrow(/connection changed/i);
  expect(mocks.put).not.toHaveBeenCalled();
});

test("listing marks legacy provider mappings as managed for the editor", async () => {
  mocks.get.mockResolvedValue({ shop: "a.myshopify.com", lotId: 42, productId: "p" });
  const result = await shopifyProductListing(request({ lotId: 42 }), context);
  expect(result.jsonBody).toEqual({ listing: { shop: "a.myshopify.com", lotId: 42, productId: "p", mode: "managed" } });
});
