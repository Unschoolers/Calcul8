import { beforeEach, expect, test, vi } from "vitest";
import type { HttpRequest, InvocationContext } from "@azure/functions";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(), scope: vi.fn(), connection: vi.fn(), snapshot: vi.fn(), get: vi.fn(), list: vi.fn(), put: vi.fn(),
  getVariant: vi.fn(), webhooks: vi.fn(), leasePasses: 1
}));
vi.mock("../../lib/auth", async importOriginal => ({ ...await importOriginal<typeof import("../../lib/auth")>(), resolveUserId: mocks.actor }));
vi.mock("../../lib/http", () => ({ executeHttpHandler: async (_request: unknown, _context: unknown, options: { operation: (input: { config: unknown }) => unknown }) => options.operation({ config: {} }), jsonResponse: (_req: unknown, _cfg: unknown, status: number, jsonBody: unknown) => ({ status, jsonBody }) }));
vi.mock("../whatnot/serviceCore", () => ({ resolveWhatnotScope: mocks.scope }));
vi.mock("../../lib/cosmos/shopifyRepository", () => ({ getShopifyConnection: mocks.connection }));
vi.mock("../../lib/cosmos/syncSnapshotRepository", () => ({ getEffectiveSyncSnapshot: mocks.snapshot }));
vi.mock("../../lib/cosmos/shopifyListingRepository", () => ({ createShopifyListingStore: () => ({ get: mocks.get, list: mocks.list, put: mocks.put }) }));
vi.mock("./adminClient", () => ({ createShopifyAdminClient: () => ({ getVariant: mocks.getVariant }) }));
vi.mock("./webhookSubscription", () => ({ ensureShopifyOrderWebhooks: mocks.webhooks }));
vi.mock("./lotLease", () => ({ withShopifyLotLease: async (_cfg: unknown, _scope: unknown, lotId: number, work: (guard: () => Promise<void>) => Promise<void>) => {
  for (let pass = 0; pass < (lotId === 0 ? mocks.leasePasses : 1); pass += 1) await work(async () => {});
  return true;
} }));
import { shopifyProductBinding } from "./bindingHandlers";

const request = (body: unknown) => ({ json: async () => body }) as HttpRequest;
const context = {} as InvocationContext;
const old = { scopeKey: "ws:1", lotId: 42, shop: "a.myshopify.com", mode: "linked", lifecycle: "active", productId: "gid://shopify/Product/1", variantId: "gid://shopify/ProductVariant/2", inventoryItemId: "gid://shopify/InventoryItem/3", locationId: "gid://shopify/Location/4", lastQuantity: 9, updatedAt: "now", version: "v1" };
const variant = { productId: "gid://shopify/Product/11", variantId: "gid://shopify/ProductVariant/12", title: "New", variantTitle: "Box", sku: "NEW", price: "80.00", inventoryItemId: "gid://shopify/InventoryItem/13", locations: [{ id: "gid://shopify/Location/4", name: "Main", available: 6 }] };
const body = { workspaceId: "team", lotId: 42, mutationId: "mutation-0001", expectedVersion: "v1", generation: 7, action: "replace", variantId: variant.variantId, locationId: "gid://shopify/Location/4" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.leasePasses = 1;
  mocks.actor.mockResolvedValue("actor"); mocks.scope.mockResolvedValue({ partitionKey: "ws:1" });
  mocks.connection.mockResolvedValue({ shop: "a.myshopify.com", generation: 7 });
  mocks.snapshot.mockResolvedValue({ lots: [{ id: 42, lotType: "bulk" }] });
  mocks.get.mockResolvedValue({ ...old }); mocks.list.mockResolvedValue([{ ...old }]);
  mocks.put.mockImplementation(async value => ({ ...value, version: "v2" }));
  mocks.getVariant.mockResolvedValue(variant); mocks.webhooks.mockResolvedValue(undefined);
});

test("binding mutation requires owner scope and a synchronized lot", async () => {
  const result = await shopifyProductBinding(request(body), context);
  expect(result.status).toBe(200);
  expect(mocks.scope).toHaveBeenCalledWith({}, "actor", "team", true);
  mocks.snapshot.mockResolvedValueOnce({ lots: [] });
  await expect(shopifyProductBinding(request(body), context)).rejects.toThrow(/lot/i);
});

test("a non-owner cannot use the versioned binding mutation", async () => {
  mocks.scope.mockRejectedValueOnce(new Error("Only a workspace owner can manage the Shopify integration"));
  await expect(shopifyProductBinding(request(body), context)).rejects.toThrow(/owner/i);
  expect(mocks.snapshot).not.toHaveBeenCalled();
  expect(mocks.put).not.toHaveBeenCalled();
});

test("connection generation changes block a binding write", async () => {
  mocks.connection.mockResolvedValueOnce({ shop: "a.myshopify.com", generation: 7 }).mockResolvedValue({ shop: "a.myshopify.com", generation: 8 });
  await expect(shopifyProductBinding(request(body), context)).rejects.toThrow(/connection changed/i);
  expect(mocks.put).not.toHaveBeenCalled();
});

test("a dirty scope lease replays the same mutation without repeating Shopify reads or writes", async () => {
  mocks.leasePasses = 2;
  let persisted = { ...old };
  mocks.get.mockImplementation(async () => ({ ...persisted }));
  mocks.list.mockImplementation(async () => [{ ...persisted }]);
  mocks.put.mockImplementation(async value => { persisted = { ...value, version: "v2" }; return { ...persisted }; });
  await shopifyProductBinding(request(body), context);
  expect(mocks.put).toHaveBeenCalledTimes(1);
  expect(mocks.getVariant).toHaveBeenCalledTimes(1);
  expect(mocks.webhooks).toHaveBeenCalledTimes(1);
});

test("unlink returns the tombstone revision without reading or mutating a Shopify product", async () => {
  const result = await shopifyProductBinding(request({ ...body, action: "unlink", variantId: undefined, locationId: undefined }), context);
  expect(result.jsonBody).toMatchObject({ listing: null, bindingVersion: "v2", shop: "a.myshopify.com", generation: 7 });
  expect(mocks.getVariant).not.toHaveBeenCalled();
});

test("binding input rejects invalid IDs and malformed action shapes before taking leases", async () => {
  await expect(shopifyProductBinding(request({ ...body, locationId: "wrong" }), context)).rejects.toThrow(/binding|request/i);
  expect(mocks.put).not.toHaveBeenCalled();
  expect(mocks.snapshot).not.toHaveBeenCalled();
});
