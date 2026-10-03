import { createHmac, timingSafeEqual } from "node:crypto";
import type { ApiConfig } from "../../types";
import { isShopifyDomain } from "../../lib/shopify";
import { listShopifyConnectionsForShop } from "../../lib/cosmos/shopifyRepository";
import { createShopifyListingStore } from "../../lib/cosmos/shopifyListingRepository";
import { cancelShopifyOrderLine, getShopifyOrderRecord, recordShopifyPaidLine, type ShopifyOrderRecord } from "../../lib/cosmos/shopifyOrderRepository";
import { isActiveShopifyListing } from "./listingService";
import { reconcileShopifyScope } from "./reconcileService";
import { projectShopifyBoxSale } from "./saleProjection";

export function verifyShopifyWebhook(body: Buffer, signature: string | null, secret: string): boolean {
  if (!signature || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const provided = Buffer.from(signature, "base64");
  const expected = createHmac("sha256", secret).update(body).digest();
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

type OrderLine = { id: string; variantId: string; quantity: number; unitPrice: number };
export function assertShopifyOrderIdentity(line: ShopifyOrderRecord, identity: { scopeKey: string; shop: string; orderId: string; lineId: string; variantId: string }): void {
  if (line.scopeKey !== identity.scopeKey || line.shop !== identity.shop || line.orderId !== identity.orderId ||
    line.lineId !== identity.lineId || line.variantId !== identity.variantId) throw new Error("Shopify order line identity conflict");
}
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
    const price = Number(line?.price ?? 0);
    const discount = Number(line?.total_discount ?? 0);
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(quantity) || Number(quantity) < 0) {
      throw new Error("Invalid Shopify order line");
    }
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(discount) || discount < 0 || discount > price * Number(quantity)) {
      throw new Error("Invalid Shopify order line price");
    }
    const unitPrice = quantity ? Math.round((price - discount / Number(quantity)) * 100) / 100 : 0;
    return /^\d+$/.test(variant) ? [{ id, variantId: `gid://shopify/ProductVariant/${variant}`, quantity: Number(quantity), unitPrice }] : [];
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
    const byVariant = new Map(listings.filter((listing) => listing.shop === shop && isActiveShopifyListing(listing)).map((listing) => [listing.variantId, listing]));
    for (const line of order.lines) {
      const identity = { scopeKey: connection.scopeKey, shop, orderId: order.orderId, lineId: line.id, variantId: line.variantId };
      const historical = await getShopifyOrderRecord(config, connection.scopeKey, shop, order.orderId, line.id);
      if (historical) assertShopifyOrderIdentity(historical, identity);
      const listing = byVariant.get(line.variantId);
      if (!historical) {
        if (topic === "orders/paid") {
          if (!listing || line.quantity === 0) continue;
          await recordShopifyPaidLine(config, { ...identity, lotId: listing.lotId,
            quantity: line.quantity, cancelled: false, paidAt: order.paidAt, unitPrice: line.unitPrice });
        } else {
          // Keep cancellation identity even after unlink; delayed payment must not bind to a later lot.
          await recordShopifyPaidLine(config, { ...identity, lotId: listing?.lotId ?? null,
            quantity: line.quantity, cancelled: true, paidAt: order.paidAt, unitPrice: line.unitPrice });
        }
      }
      if (topic === "orders/cancelled") await cancelShopifyOrderLine(config, connection.scopeKey, shop, order.orderId, line.id);
      const persisted = await getShopifyOrderRecord(config, connection.scopeKey, shop, order.orderId, line.id);
      if (!persisted) throw new Error("Shopify order line was not persisted");
      assertShopifyOrderIdentity(persisted, identity);
      if (persisted.lotId === null) continue;
      await projectShopifyBoxSale(config, persisted);
      const latest = await getShopifyOrderRecord(config, connection.scopeKey, shop, order.orderId, line.id);
      if (latest && latest.lotId !== null && latest.cancelled !== persisted.cancelled) await projectShopifyBoxSale(config, latest);
      const lots = affected.get(connection.scopeKey) ?? new Set<number>();
      lots.add(persisted.lotId);
      affected.set(connection.scopeKey, lots);
    }
  }
  for (const [scopeKey, lots] of affected) {
    for (const lotId of lots) await reconcileShopifyScope(config, scopeKey, lotId);
  }
}
