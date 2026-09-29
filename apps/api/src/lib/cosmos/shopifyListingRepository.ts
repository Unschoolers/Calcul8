import type { ApiConfig } from "../../types";
import type { ShopifyListing, ShopifyListingStore } from "../../features/shopify/listingService";
import { getContainers, isNotFoundError, withCosmosRetry } from "./core";

const listingId = (lotId: number) => `shopify_listing:${lotId}`;
type ListingDocument = ShopifyListing & { id: string; userId: string; docType: "shopify_listing" };

export function createShopifyListingStore(config: ApiConfig): ShopifyListingStore & { list(scopeKey: string): Promise<ShopifyListing[]> } {
  const { entitlements } = getContainers(config);
  const strip = (resource: ListingDocument): ShopifyListing => {
    const { id: _id, userId: _userId, docType: _docType, ...listing } = resource;
    return listing;
  };
  return {
    async get(scopeKey, lotId) {
      try {
        const { resource } = await withCosmosRetry(() => entitlements.item(listingId(lotId), scopeKey).read<ListingDocument>());
        return resource?.docType === "shopify_listing" && resource.scopeKey === scopeKey && resource.lotId === lotId ? strip(resource) : null;
      } catch (error) { if (isNotFoundError(error)) return null; throw error; }
    },
    async put(listing) {
      const document: ListingDocument = { ...listing, id: listingId(listing.lotId), userId: listing.scopeKey, docType: "shopify_listing" };
      await withCosmosRetry(() => entitlements.items.upsert(document));
    },
    async list(scopeKey) {
      const iterator = entitlements.items.query<ListingDocument>({
        query: "SELECT * FROM c WHERE c.docType = @docType AND c.userId = @scopeKey",
        parameters: [{ name: "@docType", value: "shopify_listing" }, { name: "@scopeKey", value: scopeKey }]
      }, { partitionKey: scopeKey });
      const { resources } = await withCosmosRetry(() => iterator.fetchAll());
      return (resources ?? []).filter((resource) => resource.scopeKey === scopeKey).map(strip);
    }
  };
}
