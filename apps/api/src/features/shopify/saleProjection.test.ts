import assert from "node:assert/strict";
import { test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  line: { scopeKey: "ws:one", shop: "example.myshopify.com", lotId: 4, orderId: "91", lineId: "14",
    variantId: "gid://shopify/ProductVariant/22", quantity: 1, paidAt: "2026-09-29T12:00:00Z", cancelled: false },
  sale: null as null | { sale: Record<string, unknown>; deletedAt: string | null; version: number },
  cancelDuringCreate: false
}));
vi.mock("../../lib/cosmos/shopifyOrderRepository", () => ({ getShopifyOrderLine: async () => ({ ...mocks.line }) }));
vi.mock("../../lib/cosmos/salesRepository", () => ({
  EntityVersionConflictError: class EntityVersionConflictError extends Error {},
  getSaleDocument: async () => mocks.sale,
  upsertSaleDocument: async (_config: unknown, input: { sale: Record<string, unknown> }) => {
    mocks.sale = { sale: input.sale, deletedAt: null, version: 1 };
    if (mocks.cancelDuringCreate) mocks.line.cancelled = true;
    return mocks.sale;
  },
  deleteSaleDocument: async () => { if (mocks.sale) mocks.sale.deletedAt = "cancelled"; return mocks.sale; }
}));
import { projectShopifyBoxSale } from "./saleProjection";

test("a cancellation committed during stale paid projection leaves the sale deleted", async () => {
  mocks.line.cancelled = false; mocks.sale = null; mocks.cancelDuringCreate = true;
  await projectShopifyBoxSale({} as never, { ...mocks.line });
  assert.equal(mocks.sale?.deletedAt, "cancelled");
});
