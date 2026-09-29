import { createHash } from "node:crypto";
import type { ApiConfig } from "../../types";
import { getShopifyOrderLine, type ShopifyOrderLine } from "../../lib/cosmos/shopifyOrderRepository";
import { EntityVersionConflictError, deleteSaleDocument, getSaleDocument, upsertSaleDocument } from "../../lib/cosmos/salesRepository";

const provider = "shopify";
const actor = "shopify:webhook";

function saleIdFor(line: ShopifyOrderLine, salt: number): string {
  const hash = createHash("sha256").update(JSON.stringify([line.scopeKey, line.shop, line.orderId, line.lineId, salt])).digest();
  // Reserve a high, safe-integer range away from timestamp-based local sale IDs.
  return String(2 ** 48 + hash.readUIntBE(0, 6));
}

function belongsToLine(value: unknown, line: ShopifyOrderLine): boolean {
  if (!value || typeof value !== "object") return false;
  const sale = value as Record<string, unknown>;
  return sale.externalProvider === provider && sale.externalAccountId === line.shop &&
    sale.externalOrderId === line.orderId && sale.externalOrderItemId === line.lineId;
}

async function applyProjection(config: ApiConfig, line: ShopifyOrderLine): Promise<void> {
  for (let salt = 0; salt < 32; salt += 1) {
    const saleId = saleIdFor(line, salt);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const existing = await getSaleDocument(config, line.scopeKey, String(line.lotId), saleId);
      if (existing && !belongsToLine(existing.sale, line)) break; // Rare hash collision: use another ID.
      if (line.cancelled) {
        if (!existing) break;
        if (existing && !existing.deletedAt) {
          try {
            await deleteSaleDocument(config, { scopeKey: line.scopeKey, lotId: String(line.lotId), saleId,
              updatedBy: actor, mutationId: `shopify:cancel:${line.shop}:${line.orderId}:${line.lineId}`, baseVersion: existing.version });
          } catch (error) { if (error instanceof EntityVersionConflictError) continue; throw error; }
        }
        return;
      }
      if (existing && !existing.deletedAt) return;
      const sale = { id: Number(saleId), type: "box", quantity: line.quantity, packsCount: 0,
        price: line.unitPrice ?? 0, buyerShipping: 0, date: line.paidAt.slice(0, 10),
        externalProvider: provider, externalAccountId: line.shop, externalOrderId: line.orderId,
        externalOrderItemId: line.lineId, memo: `Shopify order ${line.orderId}` };
      try {
        await upsertSaleDocument(config, { scopeKey: line.scopeKey, lotId: String(line.lotId), saleId, sale,
          updatedBy: actor, mutationId: `shopify:paid:${line.shop}:${line.orderId}:${line.lineId}`, baseVersion: existing?.version ?? 0 });
        return;
      } catch (error) { if (error instanceof EntityVersionConflictError) continue; throw error; }
    }
  }
  if (line.cancelled) return;
  throw new Error("Could not allocate a unique Shopify sale ID");
}

/** Replays the latest durable line state; a concurrent cancellation wins over a stale paid read. */
export async function projectShopifyBoxSale(config: ApiConfig, line: ShopifyOrderLine): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = await getShopifyOrderLine(config, line.scopeKey, line.shop, line.orderId, line.lineId);
    if (!current) throw new Error("Shopify order line was not persisted");
    await applyProjection(config, current);
    const latest = await getShopifyOrderLine(config, line.scopeKey, line.shop, line.orderId, line.lineId);
    if (latest?.cancelled === current.cancelled) return;
  }
  throw new Error("Shopify order changed during sale projection; retry delivery");
}
