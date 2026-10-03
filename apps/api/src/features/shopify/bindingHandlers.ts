import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { HttpError, resolveUserId } from "../../lib/auth";
import { executeHttpHandler, jsonResponse } from "../../lib/http";
import { getShopifyConnection } from "../../lib/cosmos/shopifyRepository";
import { getEffectiveSyncSnapshot } from "../../lib/cosmos/syncSnapshotRepository";
import { createShopifyListingStore } from "../../lib/cosmos/shopifyListingRepository";
import { createShopifyAdminClient } from "./adminClient";
import { getShopifyAccessToken } from "./tokenProvider";
import { withShopifyLotLease } from "./lotLease";
import { ensureShopifyOrderWebhooks } from "./webhookSubscription";
import { isActiveShopifyListing } from "./listingService";
import { mutateShopifyBinding } from "./bindingService";
import { normalizeBindingMutation, type BindingResult } from "../../shared/shopify-product-manager";
import { parseBody, resolveShopifyScope, workspaceIdFrom } from "./requestHelpers";
import { ShopifyErrorCode } from "../../shared/shopify-errors";

export async function shopifyProductBinding(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, { errorLogMessage: "Shopify product binding failed", fallbackErrorMessage: "Could not update the Shopify product link",
    operation: async ({ config }) => {
      const actor = await resolveUserId(request, config);
      const body = await parseBody(request);
      const scope = await resolveShopifyScope(config, actor, workspaceIdFrom(body), true);
      const mutationInput = { ...body };
      delete mutationInput.workspaceId;
      const mutation = normalizeBindingMutation(mutationInput);
      if (!mutation) throw new HttpError(400, "Invalid Shopify binding request");
      let result: Awaited<ReturnType<typeof mutateShopifyBinding>> | null = null;
      let resultShop: string | null = null;
      let resultGeneration = 0;
      let webhooksEnsured = false;

      const scopeProcessed = await withShopifyLotLease(config, scope.partitionKey, 0, async assertScopeCurrent => {
        const lotProcessed = await withShopifyLotLease(config, scope.partitionKey, mutation.lotId, async assertLotCurrent => {
          const connection = await getShopifyConnection(config, scope.partitionKey);
          if (!connection) throw new HttpError(409, "Connect Shopify before changing product links", ShopifyErrorCode.CONNECTION_CHANGED);
          const generation = connection.generation ?? 0;
          if (mutation.generation !== generation) throw new HttpError(409, "Shopify connection changed; refresh the dialog", ShopifyErrorCode.CONNECTION_CHANGED);
          const snapshot = await getEffectiveSyncSnapshot(config, scope.partitionKey);
          if (!snapshot?.lots.some(lot => lot.id === mutation.lotId)) throw new HttpError(404, "Sync this lot before changing its Shopify link");
          const lot = snapshot.lots.find(item => item.id === mutation.lotId);
          if (lot?.lotType === "singles") throw new HttpError(400, "Shopify box links require a bulk lot");
          const assertCurrent = async () => {
            await assertScopeCurrent();
            await assertLotCurrent();
            const current = await getShopifyConnection(config, scope.partitionKey);
            if (current?.shop !== connection.shop || (current.generation ?? 0) !== generation) {
              throw new HttpError(409, "Shopify connection changed; refresh the dialog", ShopifyErrorCode.CONNECTION_CHANGED);
            }
          };
          const store = createShopifyListingStore(config);
          const client = createShopifyAdminClient(connection.shop, () => getShopifyAccessToken(config, scope.partitionKey, connection.shop));
          result = await mutateShopifyBinding({ scopeKey: scope.partitionKey, shop: connection.shop, generation, request: mutation,
            store, client, assertCurrent });
          if (!webhooksEnsured && (mutation.action === "link" || mutation.action === "replace")) {
            await ensureShopifyOrderWebhooks(config, scope.partitionKey, assertCurrent);
            webhooksEnsured = true;
          }
          resultShop = connection.shop;
          resultGeneration = generation;
        });
        if (!lotProcessed) throw new HttpError(409, "Shopify inventory is syncing; retry the link change shortly");
      });
      const finalResult = result as Awaited<ReturnType<typeof mutateShopifyBinding>> | null;
      if (!scopeProcessed || !finalResult) throw new HttpError(409, "Another Shopify product link is being saved; retry shortly");
      const { lastMutationFingerprint: _fingerprint, ...publicListing } = finalResult;
      void _fingerprint;
      const response: BindingResult = {
        listing: finalResult.shop === resultShop && isActiveShopifyListing(finalResult) ? { ...publicListing, mode: finalResult.mode ?? "managed" } : null,
        bindingVersion: finalResult.version ?? null,
        shop: resultShop,
        generation: resultGeneration
      };
      return jsonResponse(request, config, 200, response);
    }
  });
}
