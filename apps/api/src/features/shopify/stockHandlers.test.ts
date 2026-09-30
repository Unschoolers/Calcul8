import { beforeEach, expect, test, vi } from "vitest";
import type { HttpRequest, InvocationContext } from "@azure/functions";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), scope: vi.fn(), connection: vi.fn(), snapshot: vi.fn(), get: vi.fn(), getStock: vi.fn(), token: vi.fn() }));
vi.mock("../../lib/auth", async original => ({ ...await original<typeof import("../../lib/auth")>(), resolveUserId: mocks.actor }));
vi.mock("../../lib/http", () => ({ executeHttpHandler: async (_req: unknown, _ctx: unknown, opts: { operation: (input: { config: unknown }) => unknown }) => opts.operation({ config: {} }), jsonResponse: (_req: unknown, _cfg: unknown, status: number, jsonBody: unknown) => ({ status, jsonBody }) }));
vi.mock("./requestHelpers", () => ({ parseBody: async (req: { json: () => Promise<unknown> }) => req.json(), workspaceIdFrom: (body: Record<string, unknown>) => body.workspaceId, resolveShopifyScope: mocks.scope }));
vi.mock("../../lib/cosmos/shopifyRepository", () => ({ getShopifyConnection: mocks.connection }));
vi.mock("../../lib/cosmos/shopifyListingRepository", () => ({ createShopifyListingStore: () => ({ get: mocks.get }) }));
vi.mock("../../lib/cosmos/syncSnapshotRepository", () => ({ getEffectiveSyncSnapshot: mocks.snapshot }));
vi.mock("./tokenProvider", () => ({ getShopifyAccessToken: mocks.token }));
vi.mock("./adminClient", () => ({ createShopifyAdminClient: () => ({ getStock: mocks.getStock }) }));
import { shopifyProductStock } from "./stockHandlers";
const request = (body: unknown) => ({ json: async () => body }) as HttpRequest;
const context = {} as InvocationContext;
const mapping = { scopeKey: "ws:1", shop: "a.myshopify.com", lotId: 42, mode: "linked", variantId: "gid://shopify/ProductVariant/2", inventoryItemId: "gid://shopify/InventoryItem/3", locationId: "gid://shopify/Location/4" };
const reading = { locationId: mapping.locationId, locationName: "Store", available: 12, onHand: 14, committed: 2 };
beforeEach(() => {
  vi.clearAllMocks(); mocks.actor.mockResolvedValue("actor"); mocks.scope.mockResolvedValue({ partitionKey: "ws:1" });
  mocks.connection.mockResolvedValue({ shop: mapping.shop, generation: 3 }); mocks.get.mockResolvedValue(mapping);
  mocks.snapshot.mockResolvedValue({ lots: [{ id: 42 }] }); mocks.getStock.mockResolvedValue(reading); mocks.token.mockResolvedValue("token");
});
test("returns live linked stock using only stored IDs without writing the mapping", async () => {
  const result = await shopifyProductStock(request({ workspaceId: "team", lotId: 42, shop: "evil.myshopify.com", inventoryItemId: "gid://shopify/InventoryItem/999", locationId: "gid://shopify/Location/999" }), context);
  expect(result).toMatchObject({ status: 200, jsonBody: { observation: { shop: mapping.shop, variantId: mapping.variantId, inventoryItemId: mapping.inventoryItemId, ...reading } } });
  expect(mocks.getStock).toHaveBeenCalledWith(mapping.inventoryItemId, mapping.locationId);
  expect(mocks.scope).toHaveBeenCalledWith({}, "actor", "team");
  expect(mocks.getStock).not.toHaveBeenCalledWith(expect.anything(), "gid://shopify/Location/999");
});
test("refuses missing linked mappings and rechecks mapping identity after the read", async () => {
  mocks.get.mockResolvedValueOnce(null);
  await expect(shopifyProductStock(request({ lotId: 42 }), context)).rejects.toThrow(/linked/i);
  mocks.get.mockResolvedValueOnce(mapping).mockResolvedValueOnce({ ...mapping, locationId: "gid://shopify/Location/5" });
  await expect(shopifyProductStock(request({ lotId: 42 }), context)).rejects.toThrow(/changed/i);
});
test("rejects a reconnect while Shopify stock is being read", async () => {
  mocks.connection.mockResolvedValueOnce({ shop: mapping.shop, generation: 3 }).mockResolvedValueOnce({ shop: "b.myshopify.com", generation: 4 });
  await expect(shopifyProductStock(request({ lotId: 42 }), context)).rejects.toThrow(/changed/i);
});
test("does not turn a provider read failure into a stock observation", async () => {
  mocks.getStock.mockRejectedValueOnce(new Error("provider unavailable"));
  await expect(shopifyProductStock(request({ lotId: 42 }), context)).rejects.toThrow(/provider unavailable/i);
  expect(mocks.get).toHaveBeenCalledTimes(1);
});
