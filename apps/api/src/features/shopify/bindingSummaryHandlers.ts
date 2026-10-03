import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { HttpError, resolveUserId } from "../../lib/auth";
import { executeHttpHandler, jsonResponse } from "../../lib/http";
import { getShopifyConnectionIdentity } from "../../lib/cosmos/shopifyRepository";
import { createShopifyListingStore } from "../../lib/cosmos/shopifyListingRepository";
import { ShopifyErrorCode } from "../../shared/shopify-errors";
import type { BindingSummary } from "../../shared/shopify-product-manager";
import { isActiveShopifyListing } from "./listingService";
import { parseBody, resolveShopifyScope, workspaceIdFrom } from "./requestHelpers";

/** One scoped Cosmos read; does not fetch or infer provider health for individual lots. */
export async function shopifyBindingSummary(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, { errorLogMessage: "Shopify binding summary failed", fallbackErrorMessage: "Could not load Shopify links",
    operation: async ({ config }) => {
      const actor = await resolveUserId(request, config), body = await parseBody(request);
      const scope = await resolveShopifyScope(config, actor, workspaceIdFrom(body));
      const identity = await getShopifyConnectionIdentity(config, scope.partitionKey);
      const listings = identity.shop ? await createShopifyListingStore(config).list(scope.partitionKey) : [];
      const bindings = listings.filter(listing => listing.shop === identity.shop && isActiveShopifyListing(listing)).map(listing => {
        if (!listing.version) throw new HttpError(409, "Shopify link revision unavailable");
        return { lotId: listing.lotId, mode: listing.mode ?? "managed" as const, version: listing.version };
      });
      const current = await getShopifyConnectionIdentity(config, scope.partitionKey);
      if (current.shop !== identity.shop || current.generation !== identity.generation || current.connected !== identity.connected) {
        throw new HttpError(409, "Shopify connection changed; refresh links", ShopifyErrorCode.CONNECTION_CHANGED);
      }
      const summary: BindingSummary = { scopeKey: scope.partitionKey, ...identity, complete: true, generatedAt: new Date().toISOString(), bindings };
      return jsonResponse(request, config, 200, { summary });
    }
  });
}
