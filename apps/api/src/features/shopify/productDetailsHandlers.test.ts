import { beforeEach, expect, test, vi } from "vitest";
import type { HttpRequest, InvocationContext } from "@azure/functions";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), scope: vi.fn(), connection: vi.fn(), snapshot: vi.fn(), update: vi.fn(), get: vi.fn(), guard: vi.fn(), leasePasses: 1 }));
vi.mock("../../lib/auth", async original => ({ ...await original<typeof import("../../lib/auth")>(), resolveUserId: mocks.actor }));
vi.mock("../../lib/http", () => ({ executeHttpHandler: async (_req: unknown, _ctx: unknown, options: { operation: (input: { config: unknown }) => unknown }) => options.operation({ config: {} }), jsonResponse: (_req: unknown, _cfg: unknown, status: number, jsonBody: unknown) => ({ status, jsonBody }) }));
vi.mock("../whatnot/serviceCore", () => ({ resolveWhatnotScope: mocks.scope }));
vi.mock("../../lib/cosmos/shopifyRepository", () => ({ getShopifyConnection: mocks.connection }));
vi.mock("../../lib/cosmos/syncSnapshotRepository", () => ({ getEffectiveSyncSnapshot: mocks.snapshot }));
vi.mock("../../lib/cosmos/shopifyListingRepository", () => ({ createShopifyListingStore: () => ({ get: mocks.get }) }));
vi.mock("../../lib/cosmos/shopifyOperationRepository", () => ({ createShopifyOperationStore: () => ({}) }));
vi.mock("./adminClient", () => ({ createShopifyAdminClient: () => ({}) }));
vi.mock("./productDetailsService", () => ({ updateShopifyProductDetails: mocks.update }));
vi.mock("./lotLease", () => ({ withShopifyLotLease: async (_cfg: unknown, _scope: unknown, lot: number, work: (guard: () => Promise<void>) => Promise<void>) => { for (let i = 0; i < (lot === 0 ? mocks.leasePasses : 1); i++) await work(mocks.guard); return true; } }));
import { shopifyProductDetails } from "./productDetailsHandlers";
const request = (body: unknown) => ({ json: async () => body }) as HttpRequest;
const context = {} as InvocationContext;
const listing = { scopeKey: "ws:1", shop: "a.myshopify.com", lotId: 7, mode: "linked", version: "b1", productId: "p1", variantId: "v1", inventoryItemId: "i1", locationId: "l1" };
const body = { workspaceId: "team", lotId: 7, operationId: "d-1", expectedVersion: "b1", generation: 3, currency: "CAD", expected: { title: "Original", price: "10.00" }, draft: { title: "New", price: "20.00" } };
beforeEach(() => {
  vi.clearAllMocks(); mocks.leasePasses = 1;
  mocks.actor.mockResolvedValue("actor"); mocks.scope.mockResolvedValue({ partitionKey: "ws:1" }); mocks.connection.mockResolvedValue({ shop: "a.myshopify.com", generation: 3 }); mocks.snapshot.mockResolvedValue({ lots: [{ id: 7, lotType: "bulk" }] }); mocks.guard.mockResolvedValue(undefined);
  mocks.get.mockResolvedValue({ ...listing });
  mocks.update.mockImplementation(async input => { await input.assertCurrent(); return { listing: { ...listing }, bindingVersion: "b1", outcome: { title: "confirmed", price: "pending" } }; });
});
test("details use owner scope, both leases and the same operation on dirty replays", async () => {
  mocks.leasePasses = 2;
  expect((await shopifyProductDetails(request(body), context)).jsonBody).toMatchObject({ outcome: { title: "confirmed", price: "pending" } });
  expect(mocks.scope).toHaveBeenCalledWith({}, "actor", "team", true);
  expect(mocks.update).toHaveBeenCalledTimes(1);
  expect(mocks.update.mock.calls.map(args => args[0].request.operationId)).toEqual(["d-1"]);
  expect(mocks.guard).toHaveBeenCalledTimes(6);
});
test("invalid requests, members and missing saved lots cannot edit Shopify", async () => {
  await expect(shopifyProductDetails(request({ ...body, draft: { title: "", price: "20.00" } }), context)).rejects.toThrow(/invalid/i);
  expect(mocks.update).not.toHaveBeenCalled();
  mocks.scope.mockRejectedValueOnce(new Error("Owner required"));
  await expect(shopifyProductDetails(request(body), context)).rejects.toThrow(/owner/i);
  mocks.snapshot.mockResolvedValueOnce({ lots: [] });
  await expect(shopifyProductDetails(request(body), context)).rejects.toThrow(/lot/i);
  expect(mocks.update).not.toHaveBeenCalled();
});
test("connection switches during a provider guard reject and cannot be reported as success", async () => {
  mocks.connection.mockResolvedValueOnce({ shop: "a.myshopify.com", generation: 3 }).mockResolvedValue({ shop: "a.myshopify.com", generation: 4 });
  await expect(shopifyProductDetails(request(body), context)).rejects.toThrow(/connection changed/i);
});

test("dirty replay rejects a changed binding without repeating provider work", async () => {
  mocks.leasePasses = 2; mocks.get.mockResolvedValue({ ...listing, version: "b2" });
  await expect(shopifyProductDetails(request(body), context)).rejects.toThrow(/binding changed/i);
  expect(mocks.update).toHaveBeenCalledTimes(1);
});
