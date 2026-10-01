import { beforeEach, expect, test, vi } from "vitest";
import type { HttpRequest, InvocationContext } from "@azure/functions";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), scope: vi.fn(), connection: vi.fn(), snapshot: vi.fn(), meta: vi.fn(), sales: vi.fn(), livePrice: vi.fn(), get: vi.fn(), put: vi.fn(), webhooks: vi.fn(), client: vi.fn(), locations: vi.fn(), currency: vi.fn(), find: vi.fn(), create: vi.fn() }));
vi.mock("../../lib/auth", async importOriginal => ({ ...await importOriginal<typeof import("../../lib/auth")>(), resolveUserId: mocks.actor }));
vi.mock("../../lib/http", () => ({ executeHttpHandler: async (_request: unknown, _context: unknown, options: { operation: (input: { config: unknown }) => unknown }) => options.operation({ config: {} }), jsonResponse: (_req: unknown, _cfg: unknown, status: number, jsonBody: unknown) => ({ status, jsonBody }) }));
vi.mock("./requestHelpers", () => ({ parseBody: async (request: HttpRequest) => request.json(), resolveShopifyScope: mocks.scope, workspaceIdFrom: (body: any) => body.workspaceId }));
vi.mock("../../lib/cosmos/shopifyRepository", () => ({ getShopifyConnection: mocks.connection }));
vi.mock("../../lib/cosmos/syncSnapshotRepository", () => ({ getEffectiveSyncSnapshot: mocks.snapshot }));
vi.mock("../../lib/cosmos/salesRepository", () => ({ getSyncMetaWithModes: mocks.meta, listSalesForLot: mocks.sales, getLotLivePricing: mocks.livePrice }));
vi.mock("../../lib/cosmos/shopifyListingRepository", () => ({ createShopifyListingStore: () => ({ get: mocks.get, put: mocks.put }) }));
vi.mock("./adminClient", () => ({ createShopifyAdminClient: mocks.client }));
vi.mock("./tokenProvider", () => ({ getShopifyAccessToken: vi.fn() }));
vi.mock("./lotLease", () => ({ withShopifyLotLease: async (_cfg: unknown, _scope: unknown, _id: unknown, work: (guard: () => Promise<void>) => Promise<void>) => { await work(async () => {}); return true; } }));
vi.mock("./webhookSubscription", () => ({ ensureShopifyOrderWebhooks: mocks.webhooks }));
import { shopifyProductCreatePreview, shopifyProductCreate } from "./draftHandlers";
const request = (body: unknown) => ({ json: async () => body }) as HttpRequest;
const context = {} as InvocationContext;
const lot = { id: 42, lotType: "bulk", name: "Box", boxesPurchased: 5, packsPerBox: 10, boxPriceSell: 20, sellingCurrency: "CAD", externalSku: "B42" };
beforeEach(() => {
  vi.clearAllMocks(); mocks.actor.mockResolvedValue("actor"); mocks.scope.mockResolvedValue({ partitionKey: "ws:1" });
  mocks.connection.mockResolvedValue({ shop: "a.myshopify.com", generation: 2 });
  mocks.snapshot.mockResolvedValue({ lots: [lot], salesByLot: { "42": [] } }); mocks.meta.mockResolvedValue({ salesMode: "snapshot", livePricingMode: "lot_defaults" });
  mocks.sales.mockResolvedValue([]); mocks.livePrice.mockResolvedValue({ liveBoxPriceSell: 20 }); mocks.get.mockResolvedValue(null); mocks.put.mockImplementation(async listing => { mocks.get.mockResolvedValue(listing); return listing; });
  mocks.client.mockReturnValue({ listActiveLocations: mocks.locations, getShopCurrency: mocks.currency, findOwnedDraft: mocks.find, createLinkedDraft: mocks.create });
  mocks.locations.mockResolvedValue([{ id: "gid://shopify/Location/7", name: "Main", isActive: true }]); mocks.currency.mockResolvedValue("CAD"); mocks.find.mockResolvedValue(null);
  mocks.create.mockResolvedValue({ productId: "gid://shopify/Product/1", variantId: "gid://shopify/ProductVariant/2", inventoryItemId: "gid://shopify/InventoryItem/3" });
});
test("preview is owner-only and returns server-derived stock, currency, and active locations", async () => {
  const result = await shopifyProductCreatePreview(request({ workspaceId: "team", lotId: 42, quantity: 999 }), context);
  expect(mocks.scope).toHaveBeenCalledWith({}, "actor", "team", true);
  expect(result.jsonBody.preview).toMatchObject({ title: "Box — sealed box", sku: "B42", price: "20.00", currency: "CAD", quantity: 5, locations: [{ id: "gid://shopify/Location/7", name: "Main" }] });
});
test("creation validates preview and persists a Shopify-owned linked mapping with seeded quantity", async () => {
  const preview = await shopifyProductCreatePreview(request({ lotId: 42 }), context);
  const { previewToken } = preview.jsonBody.preview;
  const result = await shopifyProductCreate(request({ lotId: 42, locationId: "gid://shopify/Location/7", previewToken }), context);
  expect(result.jsonBody.listing).toMatchObject({ mode: "linked", lastQuantity: 5, locationId: "gid://shopify/Location/7", creationHandle: expect.stringMatching(/^calcul8-created-/) });
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.put).toHaveBeenCalledOnce();
});
test("creation rejects stale preview and refuses unrelated existing mapping before Shopify mutation", async () => {
  await expect(shopifyProductCreate(request({ lotId: 42, locationId: "gid://shopify/Location/7", previewToken: "stale" }), context)).rejects.toThrow(/preview/i);
  expect(mocks.create).not.toHaveBeenCalled();
  mocks.get.mockResolvedValue(null);
  const preview = await shopifyProductCreatePreview(request({ lotId: 42 }), context);
  mocks.get.mockResolvedValue({ shop: "a.myshopify.com", mode: "managed", productId: "gid://shopify/Product/9" });
  await expect(shopifyProductCreate(request({ lotId: 42, locationId: "gid://shopify/Location/7", previewToken: preview.jsonBody.preview.previewToken }), context)).rejects.toThrow(/already/i);
  expect(mocks.create).not.toHaveBeenCalled();
});

test("entity pricing and imported Shopify sales are included once without preview writes", async () => {
  mocks.meta.mockResolvedValue({ salesMode: "entity", livePricingMode: "entity" });
  mocks.sales.mockResolvedValue([{ sale: { type: "box", quantity: 1, packsCount: 0, externalProvider: "shopify" } }, { sale: { type: "pack", quantity: 1, packsCount: 10 } }]);
  mocks.livePrice.mockResolvedValue({ liveBoxPriceSell: 27.5 });
  const result = await shopifyProductCreatePreview(request({ lotId: 42 }), context);
  expect(result.jsonBody.preview).toMatchObject({ price: "27.50", quantity: 3 });
  expect(mocks.sales).toHaveBeenCalledOnce();
});

test("store currency mismatch and an inactive location cannot create a draft", async () => {
  mocks.currency.mockResolvedValue("USD");
  await expect(shopifyProductCreatePreview(request({ lotId: 42 }), context)).rejects.toThrow(/currency/i);
  mocks.currency.mockResolvedValue("CAD");
  const preview = await shopifyProductCreatePreview(request({ lotId: 42 }), context);
  await expect(shopifyProductCreate(request({ lotId: 42, locationId: "gid://shopify/Location/99", previewToken: preview.jsonBody.preview.previewToken }), context)).rejects.toThrow(/location/i);
  expect(mocks.create).not.toHaveBeenCalled();
});

test("a mapped creation retry returns the linked mapping without another Shopify mutation", async () => {
  const preview = await shopifyProductCreatePreview(request({ lotId: 42 }), context);
  const created = await shopifyProductCreate(request({ lotId: 42, locationId: "gid://shopify/Location/7", previewToken: preview.jsonBody.preview.previewToken }), context);
  mocks.create.mockClear();
  const retry = await shopifyProductCreate(request({ lotId: 42, locationId: "gid://shopify/Location/7", previewToken: "0".repeat(64) }), context);
  expect(retry.jsonBody.listing).toEqual(created.jsonBody.listing);
  expect(mocks.create).not.toHaveBeenCalled();
  await expect(shopifyProductCreate(request({ lotId: 42, locationId: "gid://shopify/Location/99", previewToken: "0".repeat(64) }), context)).rejects.toThrow(/already/i);
});

test("a remotely created draft is recovered without reseeding its current stock", async () => {
  const preview = await shopifyProductCreatePreview(request({ lotId: 42 }), context);
  mocks.find.mockResolvedValue({ productId: "gid://shopify/Product/8", variantId: "gid://shopify/ProductVariant/9", inventoryItemId: "gid://shopify/InventoryItem/10", available: 2 });
  const result = await shopifyProductCreate(request({ lotId: 42, locationId: "gid://shopify/Location/7", previewToken: preview.jsonBody.preview.previewToken }), context);
  expect(result.jsonBody.listing).toMatchObject({ productId: "gid://shopify/Product/8", lastQuantity: 2, mode: "linked" });
  expect(mocks.create).not.toHaveBeenCalled();
});

test("recovers a remotely completed create when its mutation response is lost", async () => {
  const preview = await shopifyProductCreatePreview(request({ lotId: 42 }), context);
  mocks.find.mockResolvedValueOnce(null).mockResolvedValueOnce({ productId: "gid://shopify/Product/8", variantId: "gid://shopify/ProductVariant/9", inventoryItemId: "gid://shopify/InventoryItem/10", available: 3 });
  mocks.create.mockRejectedValueOnce(new Error("response lost after productSet completed"));

  const result = await shopifyProductCreate(request({ lotId: 42, locationId: "gid://shopify/Location/7", previewToken: preview.jsonBody.preview.previewToken }), context);

  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.find).toHaveBeenCalledTimes(2);
  expect(mocks.put).toHaveBeenCalledOnce();
  expect(result.jsonBody.listing).toMatchObject({ productId: "gid://shopify/Product/8", lastQuantity: 3, mode: "linked" });
});

test("recovers a created draft after mapping persistence fails without reseeding stock", async () => {
  const preview = await shopifyProductCreatePreview(request({ lotId: 42 }), context);
  mocks.put.mockRejectedValueOnce(new Error("mapping write failed"));
  await expect(shopifyProductCreate(request({ lotId: 42, locationId: "gid://shopify/Location/7", previewToken: preview.jsonBody.preview.previewToken }), context)).rejects.toThrow(/mapping write failed/i);
  expect(mocks.create).toHaveBeenCalledOnce();

  mocks.find.mockResolvedValue({ productId: "gid://shopify/Product/1", variantId: "gid://shopify/ProductVariant/2", inventoryItemId: "gid://shopify/InventoryItem/3", available: 1 });
  const retry = await shopifyProductCreate(request({ lotId: 42, locationId: "gid://shopify/Location/7", previewToken: preview.jsonBody.preview.previewToken }), context);

  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.put).toHaveBeenCalledTimes(2);
  expect(mocks.put).toHaveBeenLastCalledWith(expect.objectContaining({ productId: "gid://shopify/Product/1", lastQuantity: 1, mode: "linked" }));
  expect(retry.jsonBody.listing).toMatchObject({ productId: "gid://shopify/Product/1", lastQuantity: 1, mode: "linked" });
});

test("connection generation change immediately before mutation prevents create and mapping write", async () => {
  const preview = await shopifyProductCreatePreview(request({ lotId: 42 }), context);
  mocks.connection.mockResolvedValueOnce({ shop: "a.myshopify.com", generation: 2 })
    .mockResolvedValueOnce({ shop: "a.myshopify.com", generation: 2 })
    .mockResolvedValueOnce({ shop: "a.myshopify.com", generation: 3 });

  await expect(shopifyProductCreate(request({ lotId: 42, locationId: "gid://shopify/Location/7", previewToken: preview.jsonBody.preview.previewToken }), context)).rejects.toThrow(/connection changed/i);

  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.put).not.toHaveBeenCalled();
});

test("preview rejects a connection generation change during its Shopify reads", async () => {
  mocks.connection.mockResolvedValueOnce({ shop: "a.myshopify.com", generation: 2 }).mockResolvedValueOnce({ shop: "a.myshopify.com", generation: 3 });
  await expect(shopifyProductCreatePreview(request({ lotId: 42 }), context)).rejects.toThrow(/connection changed/i);
});
