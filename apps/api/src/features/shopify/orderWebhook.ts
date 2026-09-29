import { createHmac, timingSafeEqual } from "node:crypto";
import type { ApiConfig } from "../../types";
import { isShopifyDomain } from "../../lib/shopify";
import { listShopifyConnectionsForShop } from "../../lib/cosmos/shopifyRepository";
import { createShopifyListingStore } from "../../lib/cosmos/shopifyListingRepository";
import { cancelShopifyOrderLine, recordShopifyPaidLine } from "../../lib/cosmos/shopifyOrderRepository";
import { reconcileShopifyScope } from "./reconcileService";

export function verifyShopifyWebhook(body: Buffer, signature: string | null, secret: string): boolean {
  if (!signature || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const provided = Buffer.from(signature, "base64");
  const expected = createHmac("sha256", secret).update(body).digest();
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

type OrderLine = { id: string; variantId: string; quantity: number };
export function parseShopifyOrder(body: unknown): { orderId: string; paidAt: string; lines: OrderLine[] } {
  if (!body || typeof body !== "object") throw new Error("Invalid Shopify order");
  const value = body as Record<string, unknown>;
  const orderId = String(value.id ?? "");
  if (!/^\d+$/.test(orderId) || !Array.isArray(value.line_items)) throw new Error("Invalid Shopify order");
  const timestamp = String(value.processed_at ?? value.created_at ?? "");
  const paidAt = Number.isFinite(Date.parse(timestamp)) ? new Date(timestamp).toISOString() : new Date().toISOString();
  const lines: OrderLine[] = value.line_items.flatMap((raw) => {
    const line = raw as Record<string, unknown>;
    const id = String(line?.id ?? "");
    const variant = String(line?.variant_id ?? "");
    const quantity = line?.quantity;
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(quantity) || Number(quantity) < 0) {
      throw new Error("Invalid Shopify order line");
    }
    return /^\d+$/.test(variant) ? [{ id, variantId: `gid://shopify/ProductVariant/${variant}`, quantity: Number(quantity) }] : [];
  });
  return { orderId, paidAt, lines };
}

/** Shopify order payloads only select server-owned variant mappings; they never supply a scope or lot ID. */
export async function processShopifyOrderWebhook(config: ApiConfig, shop: string, topic: string, body: unknown): Promise<void> {
  if (!isShopifyDomain(shop) || !["orders/paid", "orders/cancelled"].includes(topic)) throw new Error("Unsupported Shopify webhook");
  const order = parseShopifyOrder(body);
  const connections = await listShopifyConnectionsForShop(config, shop);
  const store = createShopifyListingStore(config);
  const affected = new Map<string, Set<number>>();
  for (const connection of connections) {
    const listings = await store.list(connection.scopeKey);
    const byVariant = new Map(listings.filter((listing) => listing.shop === shop).map((listing) => [listing.variantId, listing]));
    for (const line of order.lines) {
      const listing = byVariant.get(line.variantId);
      if (!listing || (topic === "orders/paid" && line.quantity === 0)) continue;
      let changed = false;
      if (topic === "orders/paid") {
        changed = await recordShopifyPaidLine(config, { scopeKey: connection.scopeKey, shop,
          lotId: listing.lotId, orderId: order.orderId, lineId: line.id, variantId: line.variantId,
          quantity: line.quantity, cancelled: false, paidAt: order.paidAt });
      } else {
        // A cancellation arriving before a paid event leaves a tombstone, so a late paid retry cannot resell it.
        const tombstone = await recordShopifyPaidLine(config, { scopeKey: connection.scopeKey, shop,
          lotId: listing.lotId, orderId: order.orderId, lineId: line.id, variantId: line.variantId,
          quantity: line.quantity, cancelled: true, paidAt: order.paidAt });
        changed = tombstone || await cancelShopifyOrderLine(config, connection.scopeKey, shop, order.orderId, line.id);
      }
      if (changed) {
        const lots = affected.get(connection.scopeKey) ?? new Set<number>();
        lots.add(listing.lotId);
        affected.set(connection.scopeKey, lots);
      }
    }
  }
  for (const [scopeKey, lots] of affected) {
    for (const lotId of lots) await reconcileShopifyScope(config, scopeKey, lotId);
  }
}
