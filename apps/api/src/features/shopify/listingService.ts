import { createHash } from "node:crypto";
import type { SyncLotDto } from "../../../../../shared/sync-contracts";
import { calculateSealedBoxInventory } from "../../shared/box-inventory.cjs";

export type ShopifyListing = {
  scopeKey: string;
  lotId: number;
  shop: string;
  productId: string;
  variantId: string;
  inventoryItemId: string;
  locationId: string;
  lastQuantity: number;
  updatedAt: string;
};
export type ShopifyListingStore = {
  get(scopeKey: string, lotId: number): Promise<ShopifyListing | null>;
  put(listing: ShopifyListing): Promise<void>;
};
export type ShopifyListingClient = {
  upsertBoxProduct(input: {
    id?: string; variantId?: string; handle: string; title: string; sku: string;
    price: string; active: boolean; locationId?: string;
  }): Promise<{ productId: string; variantId: string; inventoryItemId: string; locationId: string }>;
  activateProduct(productId: string): Promise<void>;
  setAvailable(input: { inventoryItemId: string; locationId: string; quantity: number; previousQuantity: number }): Promise<void>;
};
export type InventorySale = { type: string; quantity: number; packsCount: number };

export function shopifyBoxHandle(scopeKey: string, lotId: number): string {
  return `calcul8-box-${createHash("sha256").update(`${scopeKey}:${lotId}`).digest("hex").slice(0, 24)}`;
}

export async function reconcileBoxListing(input: {
  scopeKey: string; shop: string; lot: SyncLotDto; sales: readonly InventorySale[];
  store: ShopifyListingStore; client: ShopifyListingClient;
}): Promise<{ status: "skipped" | "published" | "paused"; sealedBoxes: number }> {
  const { scopeKey, shop, lot, sales, store, client } = input;
  const existing = await store.get(scopeKey, lot.id);
  if (existing && existing.shop !== shop) throw new Error("This lot is linked to another Shopify store; reconnect the original store to retire its listing");
  const enabled = lot.shopifyEnabled === true && lot.lotType !== "singles";
  if (!enabled && !existing) return { status: "skipped", sealedBoxes: 0 };
  const inventory = calculateSealedBoxInventory({ boxesPurchased: lot.boxesPurchased ?? NaN, packsPerBox: lot.packsPerBox ?? NaN }, sales);
  if (!inventory.valid && enabled) throw new Error(`Invalid sealed-box inventory: ${inventory.error}`);
  const quantity = enabled ? inventory.sealedBoxes : 0;
  const title = typeof lot.name === "string" && lot.name.trim() ? `${lot.name.trim()} — sealed box` : `Lot ${lot.id} — sealed box`;
  if (enabled && (!Number.isFinite(lot.boxPriceSell) || Number(lot.boxPriceSell) <= 0)) throw new Error("A positive box selling price is required");
  const price = Number.isFinite(lot.boxPriceSell) && Number(lot.boxPriceSell) > 0 ? Number(lot.boxPriceSell).toFixed(2) : "0.00";
  const sku = typeof lot.externalSku === "string" && lot.externalSku.trim() ? lot.externalSku.trim() : `CALCUL8-${lot.id}-BOX`;
  const ids = await client.upsertBoxProduct({
    id: existing?.productId, variantId: existing?.variantId, handle: shopifyBoxHandle(scopeKey, lot.id), title, sku, price,
    active: enabled && Boolean(existing), locationId: existing?.locationId
  });
  // The Shopify product identity is separate from the editable marketplace SKU.
  const listing: ShopifyListing = {
    scopeKey, lotId: lot.id, shop, productId: ids.productId, variantId: ids.variantId,
    inventoryItemId: ids.inventoryItemId, locationId: ids.locationId,
    lastQuantity: existing?.lastQuantity ?? 0, updatedAt: existing?.updatedAt ?? new Date(0).toISOString()
  };
  await store.put(listing);
  await client.setAvailable({ inventoryItemId: listing.inventoryItemId, locationId: listing.locationId, quantity, previousQuantity: existing?.lastQuantity ?? 0 });
  if (enabled) await client.activateProduct(listing.productId);
  await store.put({ ...listing, lastQuantity: quantity, updatedAt: new Date().toISOString() });
  return { status: enabled ? "published" : "paused", sealedBoxes: quantity };
}
