import { HttpError } from "../../lib/auth";
import type { ShopifyListing, ShopifyListingStore } from "./listingService";

export type ShopifyVariant = {
  productId: string; variantId: string; title: string; variantTitle: string; sku: string; price: string;
  inventoryItemId: string; locations: { id: string; name: string; available: number }[];
};
export type ShopifyVariantPage = { variants: ShopifyVariant[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
export type ShopifyCatalogClient = {
  searchVariants(query: string, after?: string): Promise<ShopifyVariantPage>;
  getVariant(variantId: string): Promise<ShopifyVariant | null>;
};

/** Caller serializes link changes across the scope and holds the lot reconciliation lease. */
export async function linkExistingVariant(input: {
  scopeKey: string; shop: string; lotId: number; variantId: string; locationId: string;
  store: ShopifyListingStore & { list(scopeKey: string): Promise<ShopifyListing[]> };
  client: Pick<ShopifyCatalogClient, "getVariant">;
  beforeSave?: () => Promise<void>;
}): Promise<ShopifyListing> {
  const { scopeKey, shop, lotId, variantId, locationId, store, client } = input;
  const existing = await store.get(scopeKey, lotId);
  if (existing?.shop === shop) {
    if (existing.mode !== "linked") throw new HttpError(409, "This lot already has a WhatFees-managed Shopify listing");
    if (existing.variantId !== variantId || existing.locationId !== locationId) {
      throw new HttpError(409, "This lot is already linked to another Shopify variant or location");
    }
  }
  const listings = await store.list(scopeKey);
  if (listings.some(item => item.shop === shop && item.variantId === variantId && item.lotId !== lotId)) {
    throw new HttpError(409, "This Shopify variant is already linked to another lot");
  }
  const variant = await client.getVariant(variantId);
  if (!variant || variant.variantId !== variantId) throw new HttpError(404, "Shopify variant is unavailable in the connected store");
  const location = variant.locations.find(item => item.id === locationId);
  if (!location) throw new HttpError(400, "Choose an active inventory location for this Shopify variant");
  const listing: ShopifyListing = {
    scopeKey, shop, lotId, mode: "linked", productId: variant.productId, variantId: variant.variantId,
    inventoryItemId: variant.inventoryItemId, locationId: location.id, lastQuantity: location.available,
    productTitle: variant.title, variantTitle: variant.variantTitle, sku: variant.sku,
    updatedAt: new Date().toISOString(), version: existing?.version
  };
  await input.beforeSave?.();
  return store.put(listing);
}
