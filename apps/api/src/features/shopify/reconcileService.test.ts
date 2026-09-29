import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mode: "entity" as "entity" | "snapshot",
  snapshotSales: [] as unknown[],
  entitySales: [] as Array<{ sale: unknown }>,
  orders: [] as Array<Record<string, unknown>>,
  reconcileListing: vi.fn(async (_input: unknown) => {})
}));
vi.mock("../../lib/cosmos/syncSnapshotRepository", () => ({ getEffectiveSyncSnapshot: async () => ({
  lots: [{ id: 4, name: "Bulk lot", shopifyEnabled: true, boxesPurchased: 3, packsPerBox: 10 }],
  salesByLot: { "4": mocks.snapshotSales }
}) }));
vi.mock("../../lib/cosmos/salesRepository", () => ({
  getSyncMetaWithModes: async () => ({ salesMode: mocks.mode }),
  listSalesForLot: async () => mocks.entitySales
}));
vi.mock("../../lib/cosmos/shopifyRepository", () => ({ getShopifyConnection: async () => ({ shop: "example.myshopify.com" }) }));
vi.mock("../../lib/cosmos/shopifySyncStatusRepository", () => ({ getShopifySyncStatus: async () => null, recordShopifySyncStatus: async () => {} }));
vi.mock("../../lib/cosmos/shopifyListingRepository", () => ({ createShopifyListingStore: () => ({ list: async () => [] }) }));
vi.mock("../../lib/cosmos/shopifyOrderRepository", () => ({ listShopifyOrderLines: async () => mocks.orders }));
vi.mock("./saleProjection", () => ({ projectShopifyBoxSale: async () => {} }));
vi.mock("./adminClient", () => ({ createShopifyAdminClient: () => ({}) }));
vi.mock("./tokenProvider", () => ({ getShopifyAccessToken: async () => "token" }));
vi.mock("./webhookSubscription", () => ({ ensureShopifyOrderWebhooks: async () => {} }));
vi.mock("./listingService", () => ({ reconcileBoxListing: mocks.reconcileListing }));
import { reconcileShopifyScope } from "./reconcileService";

const shopifySale = { id: 123, type: "box", quantity: 1, packsCount: 0, externalProvider: "shopify",
  externalAccountId: "example.myshopify.com", externalOrderId: "91", externalOrderItemId: "14" };
const orderLine = { scopeKey: "ws:one", shop: "example.myshopify.com", lotId: 4, orderId: "91", lineId: "14",
  variantId: "gid://shopify/ProductVariant/22", quantity: 1, paidAt: "2026-09-29T12:00:00Z", cancelled: false };

beforeEach(() => { mocks.mode = "entity"; mocks.snapshotSales = []; mocks.entitySales = []; mocks.orders = []; mocks.reconcileListing.mockClear(); });

test("entity sales and the order ledger count the same Shopify box once", async () => {
  mocks.entitySales = [{ sale: shopifySale }]; mocks.orders = [orderLine];
  await reconcileShopifyScope({} as never, "ws:one", 4);
  const input = mocks.reconcileListing.mock.calls[0]?.[0] as { sales: Array<{ type: string; quantity: number }> };
  assert.deepEqual(input.sales, [{ type: "box", quantity: 1, packsCount: 0 }]);
});

test("snapshot mode still counts the Shopify ledger once alongside manual sales", async () => {
  mocks.mode = "snapshot";
  mocks.snapshotSales = [{ type: "pack", quantity: 1, packsCount: 1 }, shopifySale];
  mocks.orders = [orderLine];
  await reconcileShopifyScope({} as never, "ws:one", 4);
  const input = mocks.reconcileListing.mock.calls[0]?.[0] as { sales: Array<{ type: string; quantity: number; packsCount: number }> };
  assert.deepEqual(input.sales, [{ type: "pack", quantity: 1, packsCount: 1 }, { type: "box", quantity: 1, packsCount: 0 }]);
});
