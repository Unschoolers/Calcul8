import assert from "node:assert/strict";
import { test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const records = new Map<string, { cancelled: boolean; scopeKey: string; shop: string; lotId: number | null; orderId: string; lineId: string; variantId: string; quantity: number; paidAt: string; unitPrice?: number }>();
  const sales = new Map<string, { sale: Record<string, unknown>; deleted: boolean }>();
  return { records, sales,
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
    mocks.records.set(key, { ...line });
    return true;
  }),
  cancelShopifyOrderLine: vi.fn(async (_config, _scope, shop, orderId, lineId) => {
    const key = `${shop}:${orderId}:${lineId}`;
    const record = mocks.records.get(key);
    if (!record || record.cancelled) return false;
    record.cancelled = true;
    return true;
  }),
  getShopifyOrderRecord: vi.fn(async (_config, _scope, shop, orderId, lineId) => mocks.records.get(`${shop}:${orderId}:${lineId}`) ?? null),
  getShopifyOrderLine: vi.fn(async (_config, _scope, shop, orderId, lineId) => {
    const record = mocks.records.get(`${shop}:${orderId}:${lineId}`);
    return record?.lotId === null ? null : record ?? null;
  }),
  listShopifyOrderLines: vi.fn(async () => [...mocks.records.values()])
}));
vi.mock("../../lib/cosmos/salesRepository", () => ({
  getSaleDocument: vi.fn(async (_config, scopeKey, lotId, saleId) => {
    const record = mocks.sales.get(`${scopeKey}:${lotId}:${saleId}`);
    return record ? { sale: record.sale, deletedAt: record.deleted ? "cancelled" : null, version: 1 } : null;
  }),
  upsertSaleDocument: vi.fn(async (_config, input) => {
    const key = `${input.scopeKey}:${input.lotId}:${input.saleId}`;
    const existing = mocks.sales.get(key);
    if (existing && JSON.stringify(existing.sale) !== JSON.stringify(input.sale)) throw new Error("unexpected sale overwrite");
    mocks.sales.set(key, { sale: input.sale, deleted: false });
    return { sale: input.sale, version: 1 };
  }),
  deleteSaleDocument: vi.fn(async (_config, input) => {
    const record = mocks.sales.get(`${input.scopeKey}:${input.lotId}:${input.saleId}`);
    if (record) record.deleted = true;
    return record ? { sale: record.sale, deletedAt: "cancelled" } : null;
  })
}));
vi.mock("./reconcileService", () => ({ reconcileShopifyScope: mocks.reconcile }));
import { processShopifyOrderWebhook } from "./orderWebhook.js";

const order = { id: 91, processed_at: "2026-09-29T12:00:00Z", currency: "CAD", line_items: [{ id: 14, variant_id: 22, quantity: 2, price: "10.00", total_discount: "2.00" }, { id: 15, variant_id: 999, quantity: 1 }] };
test("paid orders match variant IDs, dedupe retries, and cancellations retire only matched box lines", async () => {
  mocks.records.clear(); mocks.sales.clear(); mocks.reconcile.mockClear();
  await processShopifyOrderWebhook({} as never, "example.myshopify.com", "orders/paid", order);
  await processShopifyOrderWebhook({} as never, "example.myshopify.com", "orders/paid", order);
  assert.equal(mocks.records.size, 1);
  assert.equal(mocks.sales.size, 1);
  const imported = [...mocks.sales.values()][0]!;
  assert.equal(imported.sale.type, "box");
  assert.equal(imported.sale.quantity, 2);
  assert.equal(imported.sale.price, 9);
  assert.equal(imported.sale.externalProvider, "shopify");
  assert.equal(imported.sale.externalOrderId, "91");
  assert.equal(imported.sale.externalOrderItemId, "14");
  assert.equal(imported.deleted, false);
  await processShopifyOrderWebhook({} as never, "example.myshopify.com", "orders/cancelled", order);
  assert.equal(mocks.records.get("example.myshopify.com:91:14")?.cancelled, true);
  assert.equal([...mocks.sales.values()][0]?.deleted, true);
});

test("replayed paid delivery repairs a sale missing after the order line was recorded", async () => {
  mocks.records.clear(); mocks.sales.clear(); mocks.reconcile.mockClear();
  await processShopifyOrderWebhook({} as never, "example.myshopify.com", "orders/paid", order);
  mocks.sales.clear(); // A process crash between the durable ledger and sale projection.
  await processShopifyOrderWebhook({} as never, "example.myshopify.com", "orders/paid", order);
  assert.equal(mocks.records.size, 1);
  assert.equal(mocks.sales.size, 1);
  assert.equal([...mocks.sales.values()][0]?.sale.externalOrderItemId, "14");
});

test("replayed paid delivery retries reconciliation after an earlier failure", async () => {
  mocks.records.clear(); mocks.sales.clear(); mocks.reconcile.mockClear();
  mocks.reconcile.mockRejectedValueOnce(new Error("temporary inventory failure"));
  await assert.rejects(() => processShopifyOrderWebhook({} as never, "example.myshopify.com", "orders/paid", order), /temporary inventory failure/);
  assert.equal(mocks.records.size, 1);
  assert.equal(mocks.sales.size, 1);
  await processShopifyOrderWebhook({} as never, "example.myshopify.com", "orders/paid", order);
  assert.equal(mocks.reconcile.mock.calls.length, 2);
});

test("a cancellation received before payment keeps the order line and sale cancelled", async () => {
  mocks.records.clear(); mocks.sales.clear(); mocks.reconcile.mockClear();
  await processShopifyOrderWebhook({} as never, "example.myshopify.com", "orders/cancelled", order);
  await processShopifyOrderWebhook({} as never, "example.myshopify.com", "orders/paid", order);
  assert.equal(mocks.records.get("example.myshopify.com:91:14")?.cancelled, true);
  assert.equal(mocks.sales.size, 0);
});

test("cancellation after unlink still retires the original lot sale", async () => {
  mocks.records.clear(); mocks.sales.clear(); mocks.reconcile.mockClear();
  mocks.listings.mockResolvedValueOnce([{ scopeKey: "ws:one", shop: "example.myshopify.com", lotId: 4, variantId: "gid://shopify/ProductVariant/22" }]);
  await processShopifyOrderWebhook({} as never, "example.myshopify.com", "orders/paid", order);
  mocks.listings.mockResolvedValueOnce([]);
  await processShopifyOrderWebhook({} as never, "example.myshopify.com", "orders/cancelled", order);
  assert.equal(mocks.records.get("example.myshopify.com:91:14")?.cancelled, true);
  assert.equal([...mocks.sales.values()][0]?.deleted, true);
  assert.equal(mocks.reconcile.mock.calls.at(-1)?.[2], 4);
});

test("cancellation before payment leaves a tombstone when unlinked so a reused variant cannot route it to a new lot", async () => {
  mocks.records.clear(); mocks.sales.clear(); mocks.reconcile.mockClear();
  mocks.listings.mockResolvedValueOnce([]);
  await processShopifyOrderWebhook({} as never, "example.myshopify.com", "orders/cancelled", order);

  mocks.listings.mockResolvedValueOnce([{ scopeKey: "ws:one", shop: "example.myshopify.com", lotId: 9, variantId: "gid://shopify/ProductVariant/22" }]);
  await processShopifyOrderWebhook({} as never, "example.myshopify.com", "orders/paid", order);

  const cancelled = mocks.records.get("example.myshopify.com:91:14");
  assert.equal(cancelled?.scopeKey, "ws:one");
  assert.equal(cancelled?.shop, "example.myshopify.com");
  assert.equal(cancelled?.orderId, "91");
  assert.equal(cancelled?.lineId, "14");
  assert.equal(cancelled?.variantId, "gid://shopify/ProductVariant/22");
  assert.equal(cancelled?.cancelled, true);
  assert.equal(cancelled?.lotId, null);
  assert.equal(mocks.sales.size, 0);
  assert.equal(mocks.reconcile.mock.calls.length, 0);
});

test("a paid retry after variant reuse repairs only the original lot projection", async () => {
  mocks.records.clear(); mocks.sales.clear(); mocks.reconcile.mockClear();
  mocks.listings.mockResolvedValueOnce([{ scopeKey: "ws:one", shop: "example.myshopify.com", lotId: 4, variantId: "gid://shopify/ProductVariant/22" }]);
  await processShopifyOrderWebhook({} as never, "example.myshopify.com", "orders/paid", order);
  mocks.sales.clear(); mocks.reconcile.mockClear();
  mocks.listings.mockResolvedValueOnce([{ scopeKey: "ws:one", shop: "example.myshopify.com", lotId: 9, variantId: "gid://shopify/ProductVariant/22" }]);
  await processShopifyOrderWebhook({} as never, "example.myshopify.com", "orders/paid", order);
  assert.equal(mocks.records.get("example.myshopify.com:91:14")?.lotId, 4);
  assert.equal(mocks.sales.size, 1);
  assert.equal([...mocks.sales.keys()][0]?.startsWith("ws:one:4:"), true);
  assert.equal(mocks.reconcile.mock.calls[0]?.[2], 4);
});

test("new paid lines do not route through unlinked suppression records", async () => {
  mocks.records.clear(); mocks.sales.clear(); mocks.reconcile.mockClear();
  const removed = { scopeKey: "ws:one", shop: "example.myshopify.com", lotId: 4, variantId: "gid://shopify/ProductVariant/22", lifecycle: "unlinked" };
  mocks.listings.mockResolvedValueOnce([removed]);
  await processShopifyOrderWebhook({} as never, "example.myshopify.com", "orders/paid", order);
  assert.equal(mocks.records.size, 0);
  assert.equal(mocks.sales.size, 0);
});

test("a historical line with a conflicting immutable identity cannot fall back to a new link", async () => {
  mocks.records.clear(); mocks.sales.clear(); mocks.reconcile.mockClear();
  mocks.records.set("example.myshopify.com:91:14", { scopeKey: "ws:one", shop: "example.myshopify.com", lotId: 4, orderId: "91", lineId: "14", variantId: "gid://shopify/ProductVariant/999", quantity: 2, cancelled: false, paidAt: "2026-09-29T12:00:00Z", unitPrice: 9 });
  await assert.rejects(() => processShopifyOrderWebhook({} as never, "example.myshopify.com", "orders/paid", order), /identity/i);
  assert.equal(mocks.sales.size, 0);
});
