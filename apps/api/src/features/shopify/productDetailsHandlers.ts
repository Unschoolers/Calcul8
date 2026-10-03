import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { HttpError, resolveUserId } from "../../lib/auth";
import { executeHttpHandler, jsonResponse } from "../../lib/http";
import { getShopifyConnection } from "../../lib/cosmos/shopifyRepository";
import { getEffectiveSyncSnapshot } from "../../lib/cosmos/syncSnapshotRepository";
import { createShopifyListingStore } from "../../lib/cosmos/shopifyListingRepository";
import { createShopifyOperationStore } from "../../lib/cosmos/shopifyOperationRepository";
import { normalizeProductDetailsMutation, type ProductDetailsResult } from "../../shared/shopify-product-manager";
import { ShopifyErrorCode } from "../../shared/shopify-errors";
import { parseBody, resolveShopifyScope, workspaceIdFrom } from "./requestHelpers";
import { withShopifyLotLease } from "./lotLease";
import { createShopifyAdminClient } from "./adminClient";
import { getShopifyAccessToken } from "./tokenProvider";
import { isActiveShopifyListing } from "./listingService";
import { updateShopifyProductDetails } from "./productDetailsService";

export async function shopifyProductDetails(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, { errorLogMessage: "Shopify product details failed", fallbackErrorMessage: "Could not update Shopify product details", operation: async ({ config }) => {
    const actor = await resolveUserId(request, config), body = await parseBody(request);
    const scope = await resolveShopifyScope(config, actor, workspaceIdFrom(body), true);
    const input = { ...body }; delete input.workspaceId;
    const mutation = normalizeProductDetailsMutation(input);
    if (!mutation) throw new HttpError(400, "Invalid Shopify details request");
    let result: ProductDetailsResult | null = null;
    const processed = await withShopifyLotLease(config, scope.partitionKey, 0, async assertScopeCurrent => {
      const lotProcessed = await withShopifyLotLease(config, scope.partitionKey, mutation.lotId, async assertLotCurrent => {
        const connection = await getShopifyConnection(config, scope.partitionKey);
        if (!connection || (connection.generation ?? 0) !== mutation.generation) throw new HttpError(409, "Shopify connection changed; refresh the manager", ShopifyErrorCode.CONNECTION_CHANGED);
        const snapshot = await getEffectiveSyncSnapshot(config, scope.partitionKey);
        const lot = snapshot?.lots.find(item => item.id === mutation.lotId);
        if (!lot || lot.lotType === "singles") throw new HttpError(409, "A saved bulk lot is required", ShopifyErrorCode.LOT_UNAVAILABLE);
        const assertCurrent = async () => {
          await assertScopeCurrent(); await assertLotCurrent();
          const current = await getShopifyConnection(config, scope.partitionKey);
          if (current?.shop !== connection.shop || (current.generation ?? 0) !== mutation.generation) throw new HttpError(409, "Shopify connection changed; refresh the manager", ShopifyErrorCode.CONNECTION_CHANGED);
        };
        const store = createShopifyListingStore(config);
        if (result) {
          await assertCurrent();
          const current = await store.get(scope.partitionKey, mutation.lotId);
          const original = result.listing;
          if (!current || !original || current.scopeKey !== scope.partitionKey || current.shop !== connection.shop || current.mode !== "linked" || !isActiveShopifyListing(current) || current.version !== mutation.expectedVersion || ["productId", "variantId", "inventoryItemId", "locationId"].some(key => current[key as keyof typeof current] !== original[key as keyof typeof original])) {
            throw new HttpError(409, "Shopify binding changed; refresh the manager", ShopifyErrorCode.BINDING_CHANGED);
          }
          await assertCurrent();
          return;
        }
        result = await updateShopifyProductDetails({ scopeKey: scope.partitionKey, shop: connection.shop, generation: mutation.generation, request: mutation, assertCurrent,
          store, operations: createShopifyOperationStore(config), client: createShopifyAdminClient(connection.shop, () => getShopifyAccessToken(config, scope.partitionKey, connection.shop)) });
      });
      if (!lotProcessed) throw new HttpError(409, "Shopify inventory is syncing; retry shortly");
    });
    if (!processed || !result) throw new HttpError(409, "Another Shopify operation is running; retry shortly");
    return jsonResponse(request, config, 200, result);
  } });
}
