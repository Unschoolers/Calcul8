import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mode: "entity" as "entity" | "snapshot",
  boxesPurchased: 3,
  snapshotSales: [] as unknown[],
  entitySales: [] as Array<{ sale: unknown }>,
  orders: [] as Array<Record<string, unknown>>,
  lease: { owner: false, revision: 0 },
  reconcileListing: vi.fn(async (_input: unknown) => {})
}));
vi.mock("../../lib/cosmos/syncSnapshotRepository", () => ({ getEffectiveSyncSnapshot: async () => ({
  lots: [{ id: 4, name: "Bulk lot", shopifyEnabled: true, boxesPurchased: mocks.boxesPurchased, packsPerBox: 10 }],
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
vi.mock("../../lib/cosmos/shopifyLotLeaseRepository", () => ({ createShopifyLotLeaseStore: () => ({
  request: async () => { mocks.lease.revision += 1; if (mocks.lease.owner) return { kind: "busy" }; mocks.lease.owner = true; return { kind: "acquired", lease: { owner: "one", fence: 1, revision: mocks.lease.revision } }; },
  renew: async () => {},
  finish: async (_scope: string, _lot: number, lease: { revision: number }) => {
    if (lease.revision !== mocks.lease.revision) return { kind: "dirty", revision: mocks.lease.revision };
    mocks.lease.owner = false; return { kind: "released" };
  },
  abandon: async () => { mocks.lease.owner = false; }
}) }));
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

beforeEach(() => { mocks.mode = "entity"; mocks.boxesPurchased = 3; mocks.snapshotSales = []; mocks.entitySales = []; mocks.orders = []; mocks.lease.owner = false; mocks.lease.revision = 0; mocks.reconcileListing.mockReset(); mocks.reconcileListing.mockImplementation(async () => {}); });

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

test("a newer lot quantity request wins over an older in-flight reconciliation", async () => {
  let releaseOlder!: () => void;
  let firstStarted!: () => void;
  const held = new Promise<void>((resolve) => { releaseOlder = resolve; });
  const started = new Promise<void>((resolve) => { firstStarted = resolve; });
  let published = -1;
  mocks.boxesPurchased = 5;
  mocks.reconcileListing.mockImplementationOnce(async (input: { lot: { boxesPurchased: number } }) => {
    firstStarted(); await held; published = input.lot.boxesPurchased;
  }).mockImplementation(async (input: { lot: { boxesPurchased: number } }) => { published = input.lot.boxesPurchased; });
  const older = reconcileShopifyScope({} as never, "ws:one", 4);
  await started;
  mocks.boxesPurchased = 3;
  const newer = reconcileShopifyScope({} as never, "ws:one", 4);
  await newer;
  releaseOlder();
  await older;
  assert.equal(published, 3);
});
