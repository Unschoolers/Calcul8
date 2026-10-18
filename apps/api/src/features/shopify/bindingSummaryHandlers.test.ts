import { beforeEach, expect, test, vi } from "vitest";
import type { HttpRequest, InvocationContext } from "@azure/functions";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), scope: vi.fn(), identity: vi.fn(), list: vi.fn() }));
vi.mock("../../lib/auth", async original => ({ ...await original<typeof import("../../lib/auth")>(), resolveUserId: mocks.actor }));
vi.mock("../../lib/http", () => ({ executeHttpHandler: async (_r: unknown, _c: unknown, options: { operation: (c: { config: unknown }) => unknown }) => options.operation({ config: {} }), jsonResponse: (_r: unknown, _c: unknown, status: number, jsonBody: unknown) => ({ status, jsonBody }) }));
vi.mock("../whatnot/serviceCore", () => ({ resolveWhatnotScope: mocks.scope }));
vi.mock("../../lib/cosmos/shopifyRepository", () => ({ getShopifyConnectionIdentity: mocks.identity }));
vi.mock("../../lib/cosmos/shopifyListingRepository", () => ({ createShopifyListingStore: () => ({ list: mocks.list }) }));
import { shopifyBindingSummary } from "./bindingSummaryHandlers";
const context = {} as InvocationContext;
const request = (body: unknown = {}) => ({ json: async () => body }) as HttpRequest;
beforeEach(() => {
  vi.clearAllMocks(); mocks.actor.mockResolvedValue("actor"); mocks.scope.mockResolvedValue({ partitionKey: "ws:1" });
  mocks.identity.mockResolvedValue({ shop: "a.myshopify.com", generation: 2, connected: true });
  mocks.list.mockResolvedValue([
    { shop: "a.myshopify.com", lotId: 1, mode: "linked", lifecycle: "active", version: "v1", accessToken: "never-return-this" },
    { shop: "a.myshopify.com", lotId: 2, version: "v2" },
    { shop: "a.myshopify.com", lotId: 3, lifecycle: "unlinked", version: "v3" },
    { shop: "old.myshopify.com", lotId: 4, version: "v4" }
  ]);
});
test("one authorized scope summary returns active bindings and no provider metadata or secrets", async () => {
  const result = await shopifyBindingSummary(request({ workspaceId: "team" }), context);
  expect(result.status).toBe(200);
  expect(result.jsonBody.summary).toMatchObject({ scopeKey: "ws:1", shop: "a.myshopify.com", generation: 2, connected: true, complete: true, bindings: [{ lotId: 1, mode: "linked", version: "v1" }, { lotId: 2, mode: "managed", version: "v2" }] });
  expect(mocks.scope).toHaveBeenCalledWith({}, "actor", "team", false);
  expect(mocks.list).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(result.jsonBody)).not.toContain("never-return-this");
  expect(Number.isFinite(Date.parse(result.jsonBody.summary.generatedAt))).toBe(true);
});
test("disconnected summaries retain the known store bindings without claiming sync health", async () => {
  mocks.identity.mockResolvedValue({ shop: "a.myshopify.com", generation: 3, connected: false });
  const result = await shopifyBindingSummary(request(), context);
  expect(result.jsonBody.summary).toMatchObject({ shop: "a.myshopify.com", generation: 3, connected: false });
  expect(result.jsonBody.summary.bindings).toHaveLength(2);
});
test("no store produces a complete empty summary while store changes reject mixed scope data", async () => {
  mocks.identity.mockResolvedValue({ shop: null, generation: 0, connected: false });
  expect((await shopifyBindingSummary(request(), context)).jsonBody.summary.bindings).toEqual([]);
  mocks.identity.mockResolvedValueOnce({ shop: "a.myshopify.com", generation: 2, connected: true })
    .mockResolvedValueOnce({ shop: "b.myshopify.com", generation: 3, connected: true });
  await expect(shopifyBindingSummary(request(), context)).rejects.toThrow(/changed/i);
});
test("a failed store read never returns a complete empty list and unauthorized scopes cannot be queried", async () => {
  mocks.list.mockRejectedValueOnce(new Error("Cosmos unavailable"));
  await expect(shopifyBindingSummary(request(), context)).rejects.toThrow(/Cosmos/);
  mocks.scope.mockRejectedValueOnce(new Error("Not a member"));
  mocks.list.mockClear();
  await expect(shopifyBindingSummary(request({ workspaceId: "other" }), context)).rejects.toThrow(/member/);
  expect(mocks.list).not.toHaveBeenCalled();
});
