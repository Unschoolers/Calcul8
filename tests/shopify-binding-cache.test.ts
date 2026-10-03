import { beforeEach, expect, test, vi } from "vitest";
import type { BindingSummary } from "../shared/shopify-product-manager.ts";
const { fetchAuthenticatedApiResponse } = vi.hoisted(() => ({ fetchAuthenticatedApiResponse: vi.fn() }));
vi.mock("../src/app-core/methods/ui/common/api-client.ts", () => ({ fetchAuthenticatedApiResponse }));
import { shopifyBindingMethods, shopifyBindingsScopeKey } from "../src/app-core/methods/ui/shopify/shopify-bindings.ts";
const summary: BindingSummary = { scopeKey: "u:42", shop: "a.myshopify.com", generation: 2, complete: true, connected: true, generatedAt: "2026-10-03T00:00:00Z", bindings: [{ lotId: 7, mode: "linked", version: "v1" }] };
function context() { return { activeScopeType: "personal", activeWorkspaceId: null as string | null, googleAuthEpoch: 1, shopifyConnectionStatus: "connected", shopifyConnectionShop: summary.shop, shopifyBindingsSummary: null as BindingSummary | null, shopifyBindingsStatus: "idle", shopifyBindingsStale: false, shopifyBindingsScope: "" }; }
const response = (value: unknown) => new Response(JSON.stringify({ summary: value }));
beforeEach(() => fetchAuthenticatedApiResponse.mockReset());
test("one scoped request loads a complete summary and failed/partial refresh keeps known links stale", async () => {
  const app = context(); fetchAuthenticatedApiResponse.mockResolvedValueOnce(response(summary));
  await shopifyBindingMethods.refreshShopifyBindings.call(app as never);
  expect(app.shopifyBindingsSummary).toEqual(summary); expect(app.shopifyBindingsScope).toBe(shopifyBindingsScopeKey(app));
  fetchAuthenticatedApiResponse.mockResolvedValueOnce(response({ ...summary, complete: false, bindings: [] }));
  await shopifyBindingMethods.refreshShopifyBindings.call(app as never);
  expect(app.shopifyBindingsSummary?.bindings).toHaveLength(1); expect(app.shopifyBindingsStale).toBe(true);
  expect(app.shopifyBindingsStatus).toBe("error");
});
test("disconnect preserves known links, while a different store and scope clear old information", async () => {
  const app = context(); fetchAuthenticatedApiResponse.mockResolvedValue(response(summary)); await shopifyBindingMethods.refreshShopifyBindings.call(app as never);
  app.shopifyConnectionStatus = "disconnected"; app.shopifyConnectionShop = null;
  fetchAuthenticatedApiResponse.mockRejectedValueOnce(new Error("offline")); await shopifyBindingMethods.refreshShopifyBindings.call(app as never);
  expect(app.shopifyBindingsSummary?.bindings).toHaveLength(1);
  app.shopifyConnectionShop = "other.myshopify.com"; fetchAuthenticatedApiResponse.mockRejectedValueOnce(new Error("offline")); await shopifyBindingMethods.refreshShopifyBindings.call(app as never);
  expect(app.shopifyBindingsSummary).toBeNull();
  app.activeScopeType = "workspace"; app.activeWorkspaceId = "team"; fetchAuthenticatedApiResponse.mockRejectedValueOnce(new Error("offline")); await shopifyBindingMethods.refreshShopifyBindings.call(app as never);
  expect(app.shopifyBindingsSummary).toBeNull();
});
test("an older response or cleanup cannot replace a new account or scope read", async () => {
  const app = context(); let resolve!: (value: Response) => void;
  fetchAuthenticatedApiResponse.mockReturnValueOnce(new Promise<Response>(finish => resolve = finish));
  const old = shopifyBindingMethods.refreshShopifyBindings.call(app as never);
  app.activeScopeType = "workspace"; app.activeWorkspaceId = "team";
  fetchAuthenticatedApiResponse.mockResolvedValueOnce(response({ ...summary, scopeKey: "ws:team", bindings: [] }));
  await shopifyBindingMethods.refreshShopifyBindings.call(app as never); resolve(response(summary)); await old;
  expect(app.shopifyBindingsSummary?.scopeKey).toBe("ws:team"); expect(app.shopifyBindingsStatus).toBe("loaded");
});
test("store switches during body decoding reject an old store response", async () => {
  const app = context(); let finish!: (value: unknown) => void;
  fetchAuthenticatedApiResponse.mockResolvedValueOnce({ ok: true, json: () => new Promise(resolve => finish = resolve) });
  const pending = shopifyBindingMethods.refreshShopifyBindings.call(app as never); await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  app.shopifyConnectionShop = "new.myshopify.com"; finish({ summary }); await pending;
  expect(app.shopifyBindingsSummary).toBeNull();
});
