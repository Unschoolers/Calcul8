import { beforeEach, expect, test, vi } from "vitest";
import type { HttpRequest, InvocationContext } from "@azure/functions";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), scope: vi.fn(), connection: vi.fn(), snapshot: vi.fn(), search: vi.fn(), getVariant: vi.fn(), get: vi.fn(), list: vi.fn(), put: vi.fn(), operations: vi.fn(), webhooks: vi.fn(), currency: vi.fn() }));
vi.mock("../../lib/auth", async importOriginal => ({ ...await importOriginal<typeof import("../../lib/auth")>(), resolveUserId: mocks.actor }));
vi.mock("../../lib/http", () => ({ executeHttpHandler: async (_request: unknown, _context: unknown, options: { operation: (input: { config: unknown }) => unknown }) => options.operation({ config: {} }), jsonResponse: (_req: unknown, _cfg: unknown, status: number, jsonBody: unknown) => ({ status, jsonBody }) }));
vi.mock("../whatnot/serviceCore", () => ({ resolveWhatnotScope: mocks.scope }));
vi.mock("../../lib/cosmos/shopifyRepository", () => ({ getShopifyConnection: mocks.connection }));
vi.mock("../../lib/cosmos/syncSnapshotRepository", () => ({ getEffectiveSyncSnapshot: mocks.snapshot }));
vi.mock("../../lib/cosmos/shopifyListingRepository", () => ({ createShopifyListingStore: () => ({ get: mocks.get, list: mocks.list, put: mocks.put }) }));
vi.mock("../../lib/cosmos/shopifyOperationRepository", () => ({ createShopifyOperationStore: () => ({ list: mocks.operations }) }));
vi.mock("./adminClient", () => ({ createShopifyAdminClient: () => ({ searchVariants: mocks.search, getVariant: mocks.getVariant, getShopCurrency: mocks.currency }) }));
vi.mock("./lotLease", () => ({ withShopifyLotLease: async (_cfg: unknown, _scope: unknown, _id: unknown, work: (guard: () => Promise<void>) => Promise<void>) => { await work(async () => {}); return true; } }));
vi.mock("./webhookSubscription", () => ({ ensureShopifyOrderWebhooks: mocks.webhooks }));
import { shopifyProductSearch, shopifyProductLink, shopifyProductListing } from "./catalogHandlers";
import { ShopifyErrorCode } from "../../shared/shopify-errors";
const request = (body: unknown) => ({ json: async () => body }) as HttpRequest;
const context = {} as InvocationContext;
beforeEach(() => {
  vi.clearAllMocks(); mocks.currency.mockResolvedValue("CAD");
  mocks.actor.mockResolvedValue("actor"); mocks.scope.mockResolvedValue({ partitionKey: "ws:1" });
  mocks.connection.mockResolvedValue({ shop: "a.myshopify.com", generation: 7, updatedAt: "now" });
  mocks.snapshot.mockResolvedValue({ lots: [{ id: 42, lotType: "bulk" }] });
  mocks.get.mockResolvedValue(null); mocks.list.mockResolvedValue([]); mocks.put.mockImplementation(async value => value);
  mocks.operations.mockResolvedValue([]);
  mocks.search.mockResolvedValue({ variants: [], pageInfo: { hasNextPage: false, endCursor: null } });
  mocks.getVariant.mockResolvedValue({ productId: "gid://shopify/Product/1", variantId: "gid://shopify/ProductVariant/2", title: "Bleach", variantTitle: "Box", sku: "BL", price: "100", inventoryItemId: "gid://shopify/InventoryItem/3", locations: [{ id: "gid://shopify/Location/4", name: "Store", available: 17 }] });
});
test("manager listing restores the exact unresolved creation request after a reload", async () => {
  const mutation = { lotId: 42, operationId: "original-attempt", expectedVersion: null, generation: 7,
    overrides: { title: "Custom booster", price: "19.00", locationId: "gid://shopify/Location/4" }, previewToken: "a".repeat(64) };
  mocks.operations.mockResolvedValue([{ kind: "create", scopeKey: "ws:1", shop: "a.myshopify.com", lotId: 42, operationId: mutation.operationId,
    generation: 7, bindingVersion: null, status: "unknown", request: mutation }]);
  const result = await shopifyProductListing(request({ lotId: 42, manager: true }), context);
  expect(result.jsonBody).toMatchObject({ listing: null, pendingCreateMutation: mutation });
});
test("manager pending read rejects a connection change before exposing a recovery request", async () => {
  const mutation = { lotId: 42, operationId: "pending", expectedVersion: null, generation: 7,
    overrides: { title: "Draft", price: "19.00", locationId: "gid://shopify/Location/4" }, previewToken: "a".repeat(64) };
  mocks.operations.mockResolvedValue([{ kind: "create", shop: "a.myshopify.com", generation: 7,
    bindingVersion: null, status: "unknown", request: mutation }]);
  mocks.connection.mockResolvedValueOnce({ shop: "a.myshopify.com", generation: 7 })
    .mockResolvedValueOnce({ shop: "another.myshopify.com", generation: 8 });
  await expect(shopifyProductListing(request({ lotId: 42, manager: true }), context)).rejects.toMatchObject({
    code: ShopifyErrorCode.CONNECTION_CHANGED
  });
});
test("manager listing restores unresolved detail fields only for the current binding", async () => {
  const mapping = { scopeKey: "ws:1", shop: "a.myshopify.com", lotId: 42, mode: "linked", version: "v1",
    productId: "gid://shopify/Product/1", variantId: "gid://shopify/ProductVariant/2",
    inventoryItemId: "gid://shopify/InventoryItem/3", locationId: "gid://shopify/Location/4" };
  mocks.get.mockResolvedValue(mapping);
  const attempt = { kind: "details", shop: mapping.shop, generation: 7, bindingVersion: "v1", lotId: 42,
    operationId: "original-details", productId: mapping.productId, variantId: mapping.variantId,
    currency: "CAD", expected: { title: "Bleach", price: "100.00" }, draft: { title: "Custom", price: "101.00" },
    outcome: { title: "confirmed", price: "unknown" } };
  mocks.operations.mockResolvedValue([attempt]);
  expect((await shopifyProductListing(request({ lotId: 42, manager: true }), context)).jsonBody).toMatchObject({
    pendingDetailsMutation: { operationId: attempt.operationId, expected: attempt.expected, draft: attempt.draft },
    detailsOutcome: attempt.outcome
  });
  mocks.operations.mockResolvedValue([{ ...attempt, variantId: "gid://shopify/ProductVariant/99" }]);
  expect((await shopifyProductListing(request({ lotId: 42, manager: true }), context)).jsonBody).not.toHaveProperty("pendingDetailsMutation");
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

test.each(["managed", "linked"] as const)("listing enriches persisted %s IDs with Shopify names and location", async mode => {
  mocks.get.mockResolvedValue({ shop: "a.myshopify.com", lotId: 42, mode, productId: "gid://shopify/Product/1", variantId: "gid://shopify/ProductVariant/2", inventoryItemId: "gid://shopify/InventoryItem/3", locationId: "gid://shopify/Location/4" });
  const result = await shopifyProductListing(request({ lotId: 42 }), context);
  expect(result.jsonBody).toEqual({ listing: expect.objectContaining({ mode, productTitle: "Bleach", variantTitle: "Box", sku: "BL", locationName: "Store" }) });
  expect(mocks.getVariant).toHaveBeenCalledWith("gid://shopify/ProductVariant/2");
});

test("listing exposes only a current valid provider status and drops stored status", async () => {
  const persisted = { shop: "a.myshopify.com", lotId: 42, mode: "linked", productId: "gid://shopify/Product/1", variantId: "gid://shopify/ProductVariant/2", inventoryItemId: "gid://shopify/InventoryItem/3", locationId: "gid://shopify/Location/4", productStatus: "DRAFT" };
  mocks.get.mockResolvedValue(persisted);
  mocks.getVariant.mockResolvedValueOnce({ productId: persisted.productId, variantId: persisted.variantId, inventoryItemId: persisted.inventoryItemId, title: "Bleach", variantTitle: "Box", sku: "BL", locations: [], productStatus: "ACTIVE" });
  const result = await shopifyProductListing(request({ lotId: 42 }), context);
  expect(result.jsonBody.listing.productStatus).toBe("ACTIVE");
  expect(mocks.put).not.toHaveBeenCalled();
});

test("listing omits stale status on lookup failure, malformed provider status, or identity mismatch", async () => {
  const persisted = { shop: "a.myshopify.com", lotId: 42, productId: "gid://shopify/Product/1", variantId: "gid://shopify/ProductVariant/2", inventoryItemId: "gid://shopify/InventoryItem/3", productStatus: "ACTIVE" };
  mocks.get.mockResolvedValue(persisted);
  mocks.getVariant.mockRejectedValueOnce(new Error("offline"));
  expect((await shopifyProductListing(request({ lotId: 42 }), context)).jsonBody.listing).not.toHaveProperty("productStatus");
  mocks.getVariant.mockResolvedValueOnce({ productId: persisted.productId, variantId: persisted.variantId, inventoryItemId: persisted.inventoryItemId, title: "Bleach", variantTitle: "Box", sku: "BL", locations: [], productStatus: "PUBLISHED" });
  expect((await shopifyProductListing(request({ lotId: 42 }), context)).jsonBody.listing).not.toHaveProperty("productStatus");
  mocks.getVariant.mockResolvedValueOnce({ productId: persisted.productId, variantId: persisted.variantId, inventoryItemId: "gid://shopify/InventoryItem/99", title: "Bleach", variantTitle: "Box", sku: "BL", locations: [], productStatus: "DRAFT" });
  expect((await shopifyProductListing(request({ lotId: 42 }), context)).jsonBody.listing).not.toHaveProperty("productStatus");
});

test("listing retains identifier fallback when provider details are unavailable or mismatch", async () => {
  const persisted = { shop: "a.myshopify.com", lotId: 42, mode: "linked", productId: "gid://shopify/Product/1", variantId: "gid://shopify/ProductVariant/2", locationId: "gid://shopify/Location/4" };
  mocks.get.mockResolvedValue(persisted);
  mocks.getVariant.mockResolvedValueOnce(null).mockResolvedValueOnce({ productId: "gid://shopify/Product/other", variantId: persisted.variantId, inventoryItemId: "gid://shopify/InventoryItem/3", locations: [] });
  expect((await shopifyProductListing(request({ lotId: 42 }), context)).jsonBody).toEqual({ listing: { ...persisted, mode: "linked" } });
  expect((await shopifyProductListing(request({ lotId: 42 }), context)).jsonBody).toEqual({ listing: { ...persisted, mode: "linked" } });
});

test("listing hides a mapping when the Shopify connection changes during detail lookup", async () => {
  mocks.get.mockResolvedValue({ shop: "a.myshopify.com", lotId: 42, productId: "gid://shopify/Product/1", variantId: "gid://shopify/ProductVariant/2" });
  mocks.connection.mockResolvedValueOnce({ shop: "a.myshopify.com", generation: 1 }).mockResolvedValueOnce({ shop: "a.myshopify.com", generation: 2 });
  await expect(shopifyProductListing(request({ lotId: 42 }), context)).rejects.toMatchObject({ code: ShopifyErrorCode.CONNECTION_CHANGED });
});


test("listing preserves the binding when Shopify lookup fails without writing to the store", async () => {
  const persisted = { shop: "a.myshopify.com", lotId: 42, productId: "gid://shopify/Product/1", variantId: "gid://shopify/ProductVariant/2", locationId: "gid://shopify/Location/4" };
  mocks.get.mockResolvedValue(persisted);
  mocks.getVariant.mockRejectedValueOnce(new Error("Shopify unavailable"));
  expect((await shopifyProductListing(request({ lotId: 42 }), context)).jsonBody).toEqual({ listing: { ...persisted, mode: "managed" } });
  expect(mocks.put).not.toHaveBeenCalled();
});

test("modern listing reads expose connection and foreign binding revision without leaking old IDs", async () => {
  mocks.connection.mockResolvedValue({ shop: "a.myshopify.com", generation: 7 });
  mocks.get.mockResolvedValue({ shop: "previous.myshopify.com", lotId: 42, productId: "old-product", variantId: "old-variant", version: "v3" });
  const result = await shopifyProductListing(request({ lotId: 42, manager: true }), context);
  expect(result.jsonBody).toEqual({ listing: null, bindingVersion: "v3", shop: "a.myshopify.com", generation: 7 });
  expect(mocks.getVariant).not.toHaveBeenCalled();
});

test("listing preserves a same-store tombstone revision and rechecks identity after provider enrichment", async () => {
  const tombstone = { shop: "a.myshopify.com", lotId: 42, lifecycle: "unlinked", productId: "p", variantId: "v", version: "v4" };
  mocks.get.mockResolvedValue(tombstone);
  const removed = await shopifyProductListing(request({ lotId: 42, manager: true }), context);
  expect(removed.jsonBody).toEqual({ listing: null, bindingVersion: "v4", shop: "a.myshopify.com", generation: 7 });
  expect(mocks.getVariant).not.toHaveBeenCalled();

  const persisted = { shop: "a.myshopify.com", lotId: 42, productId: "p", variantId: "v", version: "v5" };
  mocks.get.mockResolvedValueOnce(persisted).mockResolvedValueOnce({ ...persisted, version: "v6" });
  await expect(shopifyProductListing(request({ lotId: 42 }), context)).rejects.toMatchObject({ code: ShopifyErrorCode.BINDING_CHANGED });
});


test("modern listing returns observed independent price/currency and never falls back to persisted observations", async () => {
  const persisted = { scopeKey: "ws:1", shop: "a.myshopify.com", lotId: 42, mode: "linked", productId: "gid://shopify/Product/1", variantId: "gid://shopify/ProductVariant/2", inventoryItemId: "gid://shopify/InventoryItem/3", locationId: "gid://shopify/Location/4", version: "v1", price: "999.00", currency: "USD", observedAt: "old" };
  mocks.get.mockResolvedValue(persisted);
  const observed = (await shopifyProductListing(request({ lotId: 42, manager: true }), context)).jsonBody.listing;
  expect(observed).toMatchObject({ price: "100.00", currency: "CAD", availableLocations: [{ id: "gid://shopify/Location/4", name: "Store" }] });
  expect(Number.isFinite(Date.parse(observed.observedAt))).toBe(true);
  mocks.getVariant.mockRejectedValueOnce(new Error("offline"));
  const unavailable = (await shopifyProductListing(request({ lotId: 42, manager: true }), context)).jsonBody.listing;
  expect(unavailable).not.toHaveProperty("availableLocations"); expect(unavailable).not.toHaveProperty("price"); expect(unavailable).not.toHaveProperty("currency"); expect(unavailable).not.toHaveProperty("observedAt");
});
