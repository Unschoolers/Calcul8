import type { ApiConfig } from "../../types";
import type { ShopifyListing, ShopifyListingStore } from "../../features/shopify/listingService";
import { getContainers, isConflictError, isNotFoundError, isPreconditionFailedError, withCosmosRetry } from "./core";

const listingId = (lotId: number) => `shopify_listing:${lotId}`;
type ListingDocument = ShopifyListing & { id: string; userId: string; docType: "shopify_listing"; _etag?: string };

export function createShopifyListingStore(config: ApiConfig): ShopifyListingStore & { list(scopeKey: string): Promise<ShopifyListing[]> } {
  const { entitlements } = getContainers(config);
  const strip = (resource: ListingDocument): ShopifyListing => {
    const { id: _id, userId: _userId, docType: _docType, _etag, ...listing } = resource;
    return { ...listing, version: _etag };
  };
  return {
    async get(scopeKey, lotId) {
      try {
        const { resource } = await withCosmosRetry(() => entitlements.item(listingId(lotId), scopeKey).read<ListingDocument>());
        return resource?.docType === "shopify_listing" && resource.scopeKey === scopeKey && resource.lotId === lotId ? strip(resource) : null;
      } catch (error) { if (isNotFoundError(error)) return null; throw error; }
    },
    async put(listing) {
      const { version, ...data } = listing;
      const document: ListingDocument = { ...data, id: listingId(listing.lotId), userId: listing.scopeKey, docType: "shopify_listing" };
      try {
        if (version) await withCosmosRetry(() => entitlements.item(document.id, listing.scopeKey).replace(document,
          { accessCondition: { type: "IfMatch", condition: version } }));
        else await withCosmosRetry(() => entitlements.items.create(document));
      } catch (error) {
        if (isConflictError(error) || isPreconditionFailedError(error)) throw new Error("Shopify listing changed; retry reconciliation");
        throw error;
      }
      const { resource } = await withCosmosRetry(() => entitlements.item(document.id, listing.scopeKey).read<ListingDocument>());
      if (!resource?._etag) throw new Error("Shopify listing version unavailable");
      return strip(resource);
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
