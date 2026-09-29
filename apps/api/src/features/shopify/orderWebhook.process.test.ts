import assert from "node:assert/strict";
import { test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const records = new Map<string, { cancelled: boolean }>();
  return { records,
    connections: vi.fn(async () => [{ scopeKey: "ws:one", shop: "example.myshopify.com" }]),
    listings: vi.fn(async () => [{ scopeKey: "ws:one", shop: "example.myshopify.com", lotId: 4, variantId: "gid://shopify/ProductVariant/22" }]),
    reconcile: vi.fn(async () => {}) };
});
vi.mock("../../lib/cosmos/shopifyRepository", () => ({ listShopifyConnectionsForShop: mocks.connections }));
vi.mock("../../lib/cosmos/shopifyListingRepository", () => ({ createShopifyListingStore: () => ({ list: mocks.listings }) }));
vi.mock("../../lib/cosmos/shopifyOrderRepository", () => ({
  recordShopifyPaidLine: vi.fn(async (_config, line) => {
    const key = `${line.shop}:${line.orderId}:${line.lineId}`;
    if (mocks.records.has(key)) return false;
    mocks.records.set(key, { cancelled: line.cancelled });
    return true;
  }),
  cancelShopifyOrderLine: vi.fn(async (_config, _scope, shop, orderId, lineId) => {
    const key = `${shop}:${orderId}:${lineId}`;
    const record = mocks.records.get(key);
    if (!record || record.cancelled) return false;
    record.cancelled = true;
    return true;
  })
}));
vi.mock("./reconcileService", () => ({ reconcileShopifyScope: mocks.reconcile }));
import { processShopifyOrderWebhook } from "./orderWebhook.js";

const order = { id: 91, line_items: [{ id: 14, variant_id: 22, quantity: 2 }, { id: 15, variant_id: 999, quantity: 1 }] };
test("paid orders match variant IDs, dedupe retries, and cancellations retire only matched box lines", async () => {
  mocks.records.clear(); mocks.reconcile.mockClear();
  await processShopifyOrderWebhook({} as never, "example.myshopify.com", "orders/paid", order);
  await processShopifyOrderWebhook({} as never, "example.myshopify.com", "orders/paid", order);
  assert.equal(mocks.records.size, 1);
  assert.equal(mocks.reconcile.mock.calls.length, 1);
  await processShopifyOrderWebhook({} as never, "example.myshopify.com", "orders/cancelled", order);
  assert.equal(mocks.records.get("example.myshopify.com:91:14")?.cancelled, true);
  assert.equal(mocks.reconcile.mock.calls.length, 2);
});
