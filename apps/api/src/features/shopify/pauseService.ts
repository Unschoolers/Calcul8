import type { ApiConfig } from "../../types";
import { getShopifyConnection } from "../../lib/cosmos/shopifyRepository";
import { createShopifyListingStore } from "../../lib/cosmos/shopifyListingRepository";
import { createShopifyAdminClient } from "./adminClient";
import { getShopifyAccessToken } from "./tokenProvider";
import { isActiveShopifyListing } from "./listingService";

/** Disconnect only after every product managed by this scope is no longer for sale. */
export async function pauseShopifyScope(config: ApiConfig, scopeKey: string): Promise<void> {
  const connection = await getShopifyConnection(config, scopeKey);
  if (!connection) return;
  const listings = await createShopifyListingStore(config).list(scopeKey);
  const client = createShopifyAdminClient(connection.shop, () => getShopifyAccessToken(config, scopeKey, connection.shop));
  for (const listing of listings) {
    if (listing.shop === connection.shop && isActiveShopifyListing(listing) && listing.mode !== "linked") await client.pauseProduct(listing.productId);
  }
}
