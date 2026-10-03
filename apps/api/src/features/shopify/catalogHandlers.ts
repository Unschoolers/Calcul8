import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { HttpError, resolveUserId } from "../../lib/auth";
import { executeHttpHandler, jsonResponse } from "../../lib/http";
import { getShopifyConnection } from "../../lib/cosmos/shopifyRepository";
import { getEffectiveSyncSnapshot } from "../../lib/cosmos/syncSnapshotRepository";
import { createShopifyListingStore } from "../../lib/cosmos/shopifyListingRepository";
import { createShopifyOperationStore } from "../../lib/cosmos/shopifyOperationRepository";
import { createShopifyAdminClient } from "./adminClient";
import { getShopifyAccessToken } from "./tokenProvider";
import { linkExistingVariant } from "./catalogService";
import { withShopifyLotLease } from "./lotLease";
import { ensureShopifyOrderWebhooks } from "./webhookSubscription";
import { parseBody, resolveShopifyScope, workspaceIdFrom } from "./requestHelpers";
import { isActiveShopifyListing, type ShopifyListing } from "./listingService";
import { isShopifyProductStatus } from "../../shared/shopify-product-status";
import { ShopifyErrorCode } from "../../shared/shopify-errors";
import { normalizeDraftCreateMutation, normalizeProductDetailsMutation, normalizeShopifyMoney } from "../../shared/shopify-product-manager";

function lotIdFrom(body: Record<string, unknown>): number {
  if (!Number.isSafeInteger(body.lotId) || Number(body.lotId) <= 0) throw new HttpError(400, "A valid lot ID is required");
  return Number(body.lotId);
}

export async function shopifyProductSearch(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, { errorLogMessage: "Shopify product search failed", fallbackErrorMessage: "Could not search Shopify products",
    operation: async ({ config }) => {
      const actor = await resolveUserId(request, config);
      const body = await parseBody(request);
      const scope = await resolveShopifyScope(config, actor, workspaceIdFrom(body));
      const query = typeof body.query === "string" ? body.query.trim() : "";
      if (query.length < 2 || query.length > 100 || !/[\p{L}\p{N}]/u.test(query)) throw new HttpError(400, "Enter 2–100 characters to search Shopify");
      if (body.after != null && (typeof body.after !== "string" || body.after.length > 1024)) throw new HttpError(400, "Invalid Shopify search cursor");
      const connection = await getShopifyConnection(config, scope.partitionKey);
      if (!connection) throw new HttpError(409, "Connect Shopify before searching products");
      const client = createShopifyAdminClient(connection.shop, () => getShopifyAccessToken(config, scope.partitionKey, connection.shop));
      const result = await client.searchVariants(query, typeof body.after === "string" ? body.after : undefined);
      return jsonResponse(request, config, 200, result);
    }
  });
}

export async function shopifyProductListing(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, { errorLogMessage: "Shopify lot listing failed", fallbackErrorMessage: "Could not load the Shopify link",
    operation: async ({ config }) => {
      const actor = await resolveUserId(request, config);
      const body = await parseBody(request);
      const scope = await resolveShopifyScope(config, actor, workspaceIdFrom(body));
      const lotId = lotIdFrom(body);
      const managerRequest = body.manager === true;
      const connection = await getShopifyConnection(config, scope.partitionKey);
      const store = createShopifyListingStore(config);
      const mapping = connection ? await store.get(scope.partitionKey, lotId) : null;
      const pending = async () => {
        if (!managerRequest || !connection) return {};
        const attempts = await createShopifyOperationStore(config).list(scope.partitionKey, lotId);
        const currentConnection = await getShopifyConnection(config, scope.partitionKey);
        if (currentConnection?.shop !== connection.shop || (currentConnection.generation ?? 0) !== (connection.generation ?? 0)) {
          throw new HttpError(409, "Shopify connection changed; refresh the dialog", ShopifyErrorCode.CONNECTION_CHANGED);
        }
        const relevant = attempts.filter(item => item.shop === connection.shop && item.generation === (connection.generation ?? 0) &&
          item.bindingVersion === (mapping?.version ?? null)).sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
        const create = relevant.find(item => item.kind === "create" && item.status !== "mapped" && item.status !== "failed" &&
          item.request && normalizeDraftCreateMutation(item.request));
        const details = relevant.find(item => item.kind === "details" && !item.terminalConflict &&
          Object.values(item.outcome).some(value => value !== "confirmed") &&
          mapping?.mode === "linked" && item.productId === mapping.productId && item.variantId === mapping.variantId);
        return {
          ...(create?.kind === "create" && create.request ? { pendingCreateMutation: create.request } : {}),
          ...(details?.kind === "details" ? { pendingDetailsMutation: normalizeProductDetailsMutation({
            lotId, operationId: details.operationId, expectedVersion: details.bindingVersion, generation: details.generation,
            currency: details.currency, expected: details.expected, draft: details.draft
          }), detailsOutcome: details.outcome } : {})
        };
      };
      if (!connection) return jsonResponse(request, config, 200, { listing: null,
        ...(managerRequest ? { bindingVersion: mapping?.version ?? null, shop: null, generation: 0 } : {}) });
      if (!mapping) return jsonResponse(request, config, 200, { listing: null,
        ...(managerRequest ? { bindingVersion: null, shop: connection.shop, generation: connection.generation ?? 0, ...await pending() } : {}) });
      if (mapping.shop !== connection.shop) return jsonResponse(request, config, 200, { listing: null,
        ...(managerRequest || (typeof mapping.version === "string" && mapping.version)
          ? { bindingVersion: mapping.version ?? null } : {}),
        ...(managerRequest ? { shop: connection.shop, generation: connection.generation ?? 0, ...await pending() } : {}) });
      const { productStatus: _storedProductStatus, lastMutationFingerprint: _storedMutationFingerprint, price: _storedPrice, currency: _storedCurrency, observedAt: _storedObservedAt, availableLocations: _storedLocations, ...mappingWithoutStoredStatus } = mapping as ShopifyListing & { productStatus?: unknown };
      void _storedProductStatus; void _storedMutationFingerprint;
      let listing = mapping.lifecycle === "unlinked" ? null : { ...mappingWithoutStoredStatus, mode: mapping.mode ?? "managed" };
      if (mapping.variantId && isActiveShopifyListing(mapping)) {
        try {
          const client = createShopifyAdminClient(connection.shop, () => getShopifyAccessToken(config, scope.partitionKey, connection.shop));
          const variant = await client.getVariant(mapping.variantId);
          if (variant?.productId === mapping.productId &&
              variant.variantId === mapping.variantId && (!mapping.inventoryItemId || variant.inventoryItemId === mapping.inventoryItemId)) {
            const location = variant.locations.find(item => item.id === mapping.locationId);
            const price = normalizeShopifyMoney(variant.price, true);
            const currency = managerRequest ? await client.getShopCurrency() : null;
            listing = { ...listing!, productTitle: variant.title, variantTitle: variant.variantTitle, sku: variant.sku,
              ...(managerRequest ? { availableLocations: variant.locations.map(({ id, name }) => ({ id, name })) } : {}),
              ...(managerRequest && price && currency && /^[A-Z]{3}$/.test(currency) ? { price, currency, observedAt: new Date().toISOString() } : {}),
              ...(location ? { locationName: location.name } : {}),
              ...(mapping.inventoryItemId === variant.inventoryItemId && isShopifyProductStatus(variant.productStatus)
                ? { productStatus: variant.productStatus } : {}) };
          }
        } catch { /* Keep the persisted IDs as a useful fallback when Shopify is unavailable. */ }
      }
      const currentConnection = await getShopifyConnection(config, scope.partitionKey);
      if (currentConnection?.shop !== connection.shop || (currentConnection.generation ?? 0) !== (connection.generation ?? 0)) {
        throw new HttpError(409, "Shopify connection changed; refresh the dialog", ShopifyErrorCode.CONNECTION_CHANGED);
      }
      const currentMapping = await store.get(scope.partitionKey, lotId);
      if (!currentMapping || currentMapping.scopeKey !== mapping.scopeKey || currentMapping.shop !== mapping.shop || currentMapping.lotId !== mapping.lotId ||
        currentMapping.version !== mapping.version || currentMapping.lifecycle !== mapping.lifecycle || currentMapping.mode !== mapping.mode ||
        currentMapping.productId !== mapping.productId || currentMapping.variantId !== mapping.variantId ||
        currentMapping.inventoryItemId !== mapping.inventoryItemId || currentMapping.locationId !== mapping.locationId ||
        currentMapping.lastMutationId !== mapping.lastMutationId) {
        throw new HttpError(409, "Shopify product link changed; refresh the dialog", ShopifyErrorCode.BINDING_CHANGED);
      }
      return jsonResponse(request, config, 200, { listing,
        ...(managerRequest ? { bindingVersion: mapping.version ?? null, shop: connection.shop, generation: connection.generation ?? 0, ...await pending() } :
          (typeof mapping.version === "string" && mapping.version ? { bindingVersion: mapping.version } : {})) });
    }
  });
}

export async function shopifyProductLink(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, { errorLogMessage: "Shopify product link failed", fallbackErrorMessage: "Could not link the Shopify product",
    operation: async ({ config }) => {
      const actor = await resolveUserId(request, config);
      const body = await parseBody(request);
      const scope = await resolveShopifyScope(config, actor, workspaceIdFrom(body), true);
      const lotId = lotIdFrom(body);
      if (typeof body.variantId !== "string" || !/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(body.variantId)) throw new HttpError(400, "Invalid Shopify variant ID");
      if (typeof body.locationId !== "string" || !/^gid:\/\/shopify\/Location\/\d+$/.test(body.locationId)) throw new HttpError(400, "Invalid Shopify inventory location ID");
      const variantId = body.variantId, locationId = body.locationId;
      let listing: ShopifyListing | undefined;
      // Lot zero serializes all link selections in this scope, preventing duplicate variant ownership.
      const scopeProcessed = await withShopifyLotLease(config, scope.partitionKey, 0, async assertScopeCurrent => {
        const processed = await withShopifyLotLease(config, scope.partitionKey, lotId, async assertLotCurrent => {
          const connection = await getShopifyConnection(config, scope.partitionKey);
          if (!connection) throw new HttpError(409, "Connect Shopify before linking products");
          const snapshot = await getEffectiveSyncSnapshot(config, scope.partitionKey);
          const lot = snapshot?.lots.find(item => item.id === lotId);
          if (!lot) throw new HttpError(404, "Sync this lot before linking it to Shopify");
          if (lot.lotType === "singles") throw new HttpError(400, "Shopify box links require a bulk lot");
          await ensureShopifyOrderWebhooks(config, scope.partitionKey);
          const client = createShopifyAdminClient(connection.shop, () => getShopifyAccessToken(config, scope.partitionKey, connection.shop));
          listing = await linkExistingVariant({ scopeKey: scope.partitionKey, shop: connection.shop, lotId, variantId, locationId,
            store: createShopifyListingStore(config), client, beforeSave: async () => {
              await assertScopeCurrent(); await assertLotCurrent();
              const current = await getShopifyConnection(config, scope.partitionKey);
              if (current?.shop !== connection.shop || (current.generation ?? 0) !== (connection.generation ?? 0)) throw new HttpError(409, "Shopify connection changed; retry linking");
            } });
        });
        if (!processed) throw new HttpError(409, "Shopify inventory is syncing; retry linking shortly");
      });
      if (!scopeProcessed || !listing) throw new HttpError(409, "Another Shopify link is being saved; retry shortly");
      return jsonResponse(request, config, 200, { listing });
    }
  });
}
