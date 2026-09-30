import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { HttpError, resolveUserId } from "../../lib/auth";
import { executeHttpHandler, jsonResponse } from "../../lib/http";
import { getShopifyConnection } from "../../lib/cosmos/shopifyRepository";
import { getEffectiveSyncSnapshot } from "../../lib/cosmos/syncSnapshotRepository";
import { createShopifyListingStore } from "../../lib/cosmos/shopifyListingRepository";
import { createShopifyAdminClient } from "./adminClient";
import { getShopifyAccessToken } from "./tokenProvider";
import { parseBody, resolveShopifyScope, workspaceIdFrom } from "./requestHelpers";

function validLotId(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new HttpError(400, "A valid lot ID is required");
  return Number(value);
}

export async function shopifyProductStock(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, { errorLogMessage: "Shopify linked stock observation failed", fallbackErrorMessage: "Could not read Shopify stock",
    operation: async ({ config }) => {
      const actor = await resolveUserId(request, config);
      const body = await parseBody(request);
      const scope = await resolveShopifyScope(config, actor, workspaceIdFrom(body));
      const lotId = validLotId(body.lotId);
      const connection = await getShopifyConnection(config, scope.partitionKey);
      if (!connection) throw new HttpError(409, "Connect Shopify before reading linked stock");
      const snapshot = await getEffectiveSyncSnapshot(config, scope.partitionKey);
      if (!snapshot?.lots.some((lot) => lot.id === lotId)) throw new HttpError(404, "Sync this lot before reading Shopify stock");
      const store = createShopifyListingStore(config);
      const mapping = await store.get(scope.partitionKey, lotId);
      if (!mapping || mapping.shop !== connection.shop || mapping.mode !== "linked") throw new HttpError(409, "This lot has no linked Shopify product");
      const client = createShopifyAdminClient(connection.shop, () => getShopifyAccessToken(config, scope.partitionKey, connection.shop));
      const stock = await client.getStock(mapping.inventoryItemId, mapping.locationId);

      // This endpoint reports a transient observation only. Do not write mappings, snapshots, or inventory state.
      const [currentConnection, currentMapping] = await Promise.all([
        getShopifyConnection(config, scope.partitionKey), store.get(scope.partitionKey, lotId)
      ]);
      if (currentConnection?.shop !== connection.shop || (currentConnection.generation ?? 0) !== (connection.generation ?? 0) ||
        !currentMapping || currentMapping.shop !== mapping.shop || currentMapping.mode !== "linked" ||
        currentMapping.variantId !== mapping.variantId || currentMapping.inventoryItemId !== mapping.inventoryItemId || currentMapping.locationId !== mapping.locationId) {
        throw new HttpError(409, "Shopify connection or product link changed; retry reading stock");
      }
      const observation = { shop: connection.shop, variantId: mapping.variantId,
        inventoryItemId: mapping.inventoryItemId, locationId: stock.locationId, locationName: stock.locationName,
        available: stock.available, onHand: stock.onHand, committed: stock.committed, observedAt: new Date().toISOString() };
      return jsonResponse(request, config, 200, { observation });
    }
  });
}
