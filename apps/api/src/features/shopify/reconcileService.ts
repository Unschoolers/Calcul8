import type { ApiConfig } from "../../types";
import type { SyncSaleDto } from "../../../../../shared/sync-contracts";
import { getEffectiveSyncSnapshot } from "../../lib/cosmos/syncSnapshotRepository";
import { getSyncMetaWithModes, listSalesForLot } from "../../lib/cosmos/salesRepository";
import { getShopifyConnection } from "../../lib/cosmos/shopifyRepository";
import { getShopifySyncStatus, recordShopifySyncStatus } from "../../lib/cosmos/shopifySyncStatusRepository";
import { createShopifyListingStore } from "../../lib/cosmos/shopifyListingRepository";
import { listShopifyOrderLines } from "../../lib/cosmos/shopifyOrderRepository";
import { createShopifyAdminClient } from "./adminClient";
import { getShopifyAccessToken } from "./tokenProvider";
import { ensureShopifyOrderWebhooks } from "./webhookSubscription";
import { reconcileBoxListing, type InventorySale, type ShopifyListingClient } from "./listingService";
import { projectShopifyBoxSale } from "./saleProjection";
import { withShopifyLotLease } from "./lotLease";

export function normalizeBoxSales(raw: readonly unknown[]): InventorySale[] {
  return raw.map((input) => {
    if (!input || typeof input !== "object") throw new Error("Invalid sale in Shopify inventory");
    const sale = input as Partial<SyncSaleDto>;
    if (!["box", "pack", "rtyh", "wheel"].includes(String(sale.type)) ||
      !Number.isSafeInteger(sale.quantity) || Number(sale.quantity) <= 0 ||
      (sale.type !== "box" && (!Number.isSafeInteger(sale.packsCount) || Number(sale.packsCount) < 0))) {
      throw new Error("Invalid sale in Shopify inventory");
    }
    return { type: sale.type!, quantity: sale.quantity!, packsCount: sale.type === "box" ? 0 : sale.packsCount! };
  });
}

/** Rebuilds desired stock from cloud records; callers never pass browser-computed quantities. */
async function reconcileWork(config: ApiConfig, scopeKey: string, onlyLotId?: number): Promise<boolean> {
  const connection = await getShopifyConnection(config, scopeKey);
  if (!connection) return false;
  const snapshot = await getEffectiveSyncSnapshot(config, scopeKey);
  if (!snapshot) return false;
  const store = createShopifyListingStore(config);
  const listings = await store.list(scopeKey);
  const lotIds = new Set(snapshot.lots.filter((lot) => lot.shopifyEnabled === true).map((lot) => lot.id));
  for (const listing of listings) lotIds.add(listing.lotId);
  if (lotIds.size) await ensureShopifyOrderWebhooks(config, scopeKey);
  let completed = true;
  for (const lotId of lotIds) {
    if (onlyLotId != null && lotId !== onlyLotId) continue;
    const processed = await withShopifyLotLease(config, scopeKey, lotId, async (assertCurrent) => {
      const currentConnection = await getShopifyConnection(config, scopeKey);
      const currentSnapshot = await getEffectiveSyncSnapshot(config, scopeKey);
      if (!currentConnection || !currentSnapshot) return;
      const lot = currentSnapshot.lots.find((candidate) => candidate.id === lotId) ??
        { id: lotId, name: `Lot ${lotId}`, shopifyEnabled: false, boxesPurchased: 0, packsPerBox: 1 };
      const allOrders = (await listShopifyOrderLines(config, scopeKey, lotId, true)).filter((order) => order.shop === currentConnection.shop);
      for (const order of allOrders) await projectShopifyBoxSale(config, order);
      const meta = await getSyncMetaWithModes(config, scopeKey);
      const sales = lot.shopifyEnabled !== true ? [] : meta?.salesMode === "entity"
        ? (await listSalesForLot(config, scopeKey, String(lotId))).map((document) => document.sale)
        : (currentSnapshot.salesByLot[String(lotId)] ?? []);
      const orders = lot.shopifyEnabled === true ?
        (await listShopifyOrderLines(config, scopeKey, lotId)).filter((order) => order.shop === currentConnection.shop) : [];
      const client = createShopifyAdminClient(currentConnection.shop, () => getShopifyAccessToken(config, scopeKey, currentConnection.shop));
      const guardedClient: ShopifyListingClient = {
        upsertBoxProduct: async (input) => { await assertCurrent(); return client.upsertBoxProduct({ ...input, beforeMutation: assertCurrent }); },
        activateProduct: async (id) => { await assertCurrent(); return client.activateProduct(id, assertCurrent); },
        pauseProduct: async (id) => { await assertCurrent(); return client.pauseProduct(id, assertCurrent); },
        ensureOrderWebhooks: (url) => client.ensureOrderWebhooks(url),
        setAvailable: async (input) => { await assertCurrent(); return client.setAvailable({ ...input, beforeMutation: assertCurrent }); }
      };
      await reconcileBoxListing({ scopeKey, shop: currentConnection.shop, lot,
        sales: [...normalizeBoxSales(sales.filter((sale) => !(sale && typeof sale === "object" && (sale as { externalProvider?: string }).externalProvider === "shopify"))),
          ...orders.map((order) => ({ type: "box", quantity: order.quantity, packsCount: 0 }))], store, client: guardedClient,
        beforeMutation: assertCurrent });
    });
    completed = completed && processed;
  }
  return completed;
}

export async function reconcileShopifyScope(config: ApiConfig, scopeKey: string, onlyLotId?: number): Promise<void> {
  const connection = await getShopifyConnection(config, scopeKey);
  if (!connection) return;
  try {
    const completed = await reconcileWork(config, scopeKey, onlyLotId);
    if (!completed) return;
    const now = new Date().toISOString();
    await recordShopifySyncStatus(config, { scopeKey, shop: connection.shop, lastAttemptAt: now, lastSyncedAt: now, lastError: null });
  } catch (error) {
    try {
      const previous = await getShopifySyncStatus(config, scopeKey);
      await recordShopifySyncStatus(config, { scopeKey, shop: connection.shop, lastAttemptAt: new Date().toISOString(),
        lastSyncedAt: previous?.shop === connection.shop ? previous.lastSyncedAt : null,
        lastError: error instanceof Error ? error.message.slice(0, 240) : "Shopify inventory sync failed" });
    } catch { /* The original reconciliation error remains the actionable failure. */ }
    throw error;
  }
}
