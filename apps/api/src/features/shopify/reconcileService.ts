import type { ApiConfig } from "../../types";
import type { SyncSaleDto } from "../../../../../shared/sync-contracts";
import { getEffectiveSyncSnapshot } from "../../lib/cosmos/syncSnapshotRepository";
import { getSyncMetaWithModes, listSalesForLot } from "../../lib/cosmos/salesRepository";
import { getShopifyConnection } from "../../lib/cosmos/shopifyRepository";
import { createShopifyListingStore } from "../../lib/cosmos/shopifyListingRepository";
import { listShopifyOrderLines } from "../../lib/cosmos/shopifyOrderRepository";
import { createShopifyAdminClient } from "./adminClient";
import { getShopifyAccessToken } from "./tokenProvider";
import { reconcileBoxListing, type InventorySale } from "./listingService";

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
export async function reconcileShopifyScope(config: ApiConfig, scopeKey: string, onlyLotId?: number): Promise<void> {
  const connection = await getShopifyConnection(config, scopeKey);
  if (!connection) return;
  const snapshot = await getEffectiveSyncSnapshot(config, scopeKey);
  if (!snapshot) return;
  const store = createShopifyListingStore(config);
  const listings = await store.list(scopeKey);
  const lotIds = new Set(snapshot.lots.filter((lot) => lot.shopifyEnabled === true).map((lot) => lot.id));
  for (const listing of listings) lotIds.add(listing.lotId);
  const meta = await getSyncMetaWithModes(config, scopeKey);
  const client = createShopifyAdminClient(connection.shop, () => getShopifyAccessToken(config, scopeKey, connection.shop));
  for (const lotId of lotIds) {
    if (onlyLotId != null && lotId !== onlyLotId) continue;
    const lot = snapshot.lots.find((candidate) => candidate.id === lotId) ??
      { id: lotId, name: `Lot ${lotId}`, shopifyEnabled: false, boxesPurchased: 0, packsPerBox: 1 };
    const sales = lot.shopifyEnabled !== true ? [] : meta?.salesMode === "entity"
      ? (await listSalesForLot(config, scopeKey, String(lotId))).map((document) => document.sale)
      : (snapshot.salesByLot[String(lotId)] ?? []);
    const orders = lot.shopifyEnabled === true ? await listShopifyOrderLines(config, scopeKey, lotId) : [];
    await reconcileBoxListing({ scopeKey, shop: connection.shop, lot,
      sales: [...normalizeBoxSales(sales), ...orders.map((order) => ({ type: "box", quantity: order.quantity, packsCount: 0 }))], store, client });
  }
}
