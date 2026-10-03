import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { HttpError, resolveUserId } from "../../lib/auth";
import { executeHttpHandler, jsonResponse } from "../../lib/http";
import { getShopifyConnection } from "../../lib/cosmos/shopifyRepository";
import { getEffectiveSyncSnapshot } from "../../lib/cosmos/syncSnapshotRepository";
import { getLotLivePricing, getSyncMetaWithModes, listSalesForLot } from "../../lib/cosmos/salesRepository";
import { createShopifyListingStore } from "../../lib/cosmos/shopifyListingRepository";
import { createShopifyAdminClient } from "./adminClient";
import { getShopifyAccessToken } from "./tokenProvider";
import { withShopifyLotLease } from "./lotLease";
import { ensureShopifyOrderWebhooks } from "./webhookSubscription";
import { normalizeBoxSales } from "./reconcileService";
import { buildShopifyDraftPreview, shopifyDraftHandle } from "./draftService";
import { isActiveShopifyListing, type ShopifyListing } from "./listingService";
import { parseBody, resolveShopifyScope, workspaceIdFrom } from "./requestHelpers";
import { ShopifyErrorCode } from "../../shared/shopify-errors";
import { normalizeDraftOverrides, normalizeDraftCreateMutation, type DraftOverrides } from "../../shared/shopify-product-manager";
import { createShopifyOperationStore } from "../../lib/cosmos/shopifyOperationRepository";
import { createShopifyDraftAttempt } from "./draftCreationService";

function requestFields(body: Record<string, unknown>): { lotId: number; locationId?: string; previewToken?: string } {
  if (!Number.isSafeInteger(body.lotId) || Number(body.lotId) <= 0) throw new HttpError(400, "A valid lot ID is required");
  if (body.locationId != null && (typeof body.locationId !== "string" || !/^gid:\/\/shopify\/Location\/\d+$/.test(body.locationId))) throw new HttpError(400, "Invalid Shopify location ID");
  if (body.previewToken != null && (typeof body.previewToken !== "string" || !/^[a-f0-9]{64}$/.test(body.previewToken))) throw new HttpError(400, "Invalid Shopify preview token");
  return { lotId: Number(body.lotId), ...(typeof body.locationId === "string" ? { locationId: body.locationId } : {}), ...(typeof body.previewToken === "string" ? { previewToken: body.previewToken } : {}) };
}

async function authoritativePreview(config: Parameters<typeof getShopifyConnection>[0], scopeKey: string, connection: NonNullable<Awaited<ReturnType<typeof getShopifyConnection>>>, lotId: number, modern?: { overrides?: DraftOverrides; bindingVersion: string | null }) {
  const snapshot = await getEffectiveSyncSnapshot(config, scopeKey);
  if (!snapshot) throw new HttpError(409, "Sync inventory before creating a Shopify product", ShopifyErrorCode.LOT_UNAVAILABLE);
  const lot = snapshot.lots.find(item => item.id === lotId);
  if (!lot) throw new HttpError(404, "Sync this lot before creating a Shopify product", ShopifyErrorCode.LOT_UNAVAILABLE);
  if (lot.lotType === "singles") throw new HttpError(400, "Shopify draft creation requires a bulk lot");
  const meta = await getSyncMetaWithModes(config, scopeKey);
  const rawSales: readonly unknown[] = meta?.salesMode === "entity"
    ? (await listSalesForLot(config, scopeKey, String(lotId))).map(document => document.sale)
    : snapshot.salesByLot[String(lotId)] ?? [];
  const livePricing = meta?.livePricingMode === "entity" ? await getLotLivePricing(config, scopeKey, String(lotId)) : null;
  if (meta?.livePricingMode === "entity" && !livePricing) throw new HttpError(409, "Live lot pricing is unavailable; sync inventory and retry", ShopifyErrorCode.LOT_UNAVAILABLE);
  const price = meta?.livePricingMode === "entity" ? livePricing!.liveBoxPriceSell : lot.boxPriceSell;
  const client = createShopifyAdminClient(connection.shop, () => getShopifyAccessToken(config, scopeKey, connection.shop));
  const [locations, shopCurrency] = await Promise.all([client.listActiveLocations(), client.getShopCurrency()]);
  const currency = lot.usesSystemPricingDefaults ? snapshot.systemPricingDefaults?.sellingCurrency : lot.sellingCurrency;
  const normalizedLot = { ...lot, sellingCurrency: currency || "CAD", boxPriceSell: price };
  const normalizedSales = normalizeBoxSales(rawSales);
  let built: ReturnType<typeof buildShopifyDraftPreview>;
  try { built = buildShopifyDraftPreview({ scopeKey, shop: connection.shop, generation: connection.generation ?? 0, lot: normalizedLot, sales: normalizedSales, locations, shopCurrency, price, ...(modern ? { overrides: modern.overrides, bindingVersion: modern.bindingVersion } : { variantTitle: "Sealed box" }) }); }
  catch (error) { const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : ShopifyErrorCode.INVENTORY_INVALID; throw new HttpError(400, error instanceof Error ? error.message : "Shopify product details are invalid", code); }
  return { ...built, locationNames: new Map(locations.map(location => [location.id, location.name])) };
}

export async function shopifyProductCreatePreview(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, { errorLogMessage: "Shopify draft preview failed", fallbackErrorMessage: "Could not preview the Shopify product",
    operation: async ({ config }) => {
      const actor = await resolveUserId(request, config), body = await parseBody(request), fields = requestFields(body);
      const scope = await resolveShopifyScope(config, actor, workspaceIdFrom(body), true);
      const connection = await getShopifyConnection(config, scope.partitionKey);
      if (!connection) throw new HttpError(409, "Connect Shopify before creating products");
      const mapping = await createShopifyListingStore(config).get(scope.partitionKey, fields.lotId);
      const modern = body.manager === true;
      const overrides = body.overrides == null ? undefined : normalizeDraftOverrides(body.overrides);
      if (modern) {
        if (!Number.isSafeInteger(body.generation) || body.generation !== (connection.generation ?? 0)) throw new HttpError(409, "Shopify connection changed", ShopifyErrorCode.CONNECTION_CHANGED);
        if (body.expectedVersion !== (mapping?.version ?? null)) throw new HttpError(409, "Shopify binding changed", ShopifyErrorCode.BINDING_CHANGED);
        if (body.overrides != null && !overrides) throw new HttpError(400, "Invalid Shopify title, price or location");
      }
      if (mapping && (!modern || (mapping.shop === connection.shop && isActiveShopifyListing(mapping)))) throw new HttpError(409, "This lot already has a Shopify product link", ShopifyErrorCode.ALREADY_LINKED);
      const { preview } = await authoritativePreview(config, scope.partitionKey, connection, fields.lotId, modern ? { overrides: overrides ?? undefined, bindingVersion: mapping?.version ?? null } : undefined);
      const currentConnection = await getShopifyConnection(config, scope.partitionKey);
      if (currentConnection?.shop !== connection.shop || (currentConnection.generation ?? 0) !== (connection.generation ?? 0)) throw new HttpError(409, "Shopify connection changed; refresh the preview", ShopifyErrorCode.CONNECTION_CHANGED);
      if (modern && ((await createShopifyListingStore(config).get(scope.partitionKey, fields.lotId))?.version ?? null) !== (mapping?.version ?? null)) throw new HttpError(409, "Shopify binding changed", ShopifyErrorCode.BINDING_CHANGED);
      return jsonResponse(request, config, 200, { preview });
    }
  });
}

export async function shopifyProductCreate(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  return executeHttpHandler(request, context, { errorLogMessage: "Shopify draft creation failed", fallbackErrorMessage: "Could not create the Shopify draft",
    operation: async ({ config }) => {
      const actor = await resolveUserId(request, config), body = await parseBody(request), fields = requestFields(body);
      if ("operationId" in body || "overrides" in body) {
        const input = { ...body }; delete input.workspaceId;
        const mutation = normalizeDraftCreateMutation(input);
        if (!mutation) throw new HttpError(400, "Invalid Shopify draft request");
        const scope = await resolveShopifyScope(config, actor, workspaceIdFrom(body), true);
        const result: { value: Awaited<ReturnType<typeof createShopifyDraftAttempt>> | null } = { value: null };
        const processed = await withShopifyLotLease(config, scope.partitionKey, 0, async scopeGuard => {
          const lotProcessed = await withShopifyLotLease(config, scope.partitionKey, mutation.lotId, async lotGuard => {
            const connection = await getShopifyConnection(config, scope.partitionKey);
            if (!connection || (connection.generation ?? 0) !== mutation.generation) throw new HttpError(409, "Shopify connection changed", ShopifyErrorCode.CONNECTION_CHANGED);
            const guard = async () => {
              await scopeGuard(); await lotGuard();
              const current = await getShopifyConnection(config, scope.partitionKey);
              if (current?.shop !== connection.shop || (current.generation ?? 0) !== mutation.generation) throw new HttpError(409, "Shopify connection changed", ShopifyErrorCode.CONNECTION_CHANGED);
            };
            await guard(); await ensureShopifyOrderWebhooks(config, scope.partitionKey, guard);
            result.value = await createShopifyDraftAttempt({ scopeKey: scope.partitionKey, shop: connection.shop, generation: mutation.generation, request: mutation, store: createShopifyListingStore(config), operations: createShopifyOperationStore(config),
              client: createShopifyAdminClient(connection.shop, () => getShopifyAccessToken(config, scope.partitionKey, connection.shop)), assertCurrent: guard,
              loadPreview: () => authoritativePreview(config, scope.partitionKey, connection, mutation.lotId, { overrides: mutation.overrides, bindingVersion: mutation.expectedVersion }) });
          });
          if (!lotProcessed) throw new HttpError(409, "Shopify inventory is syncing; retry shortly");
        });
        if (!processed || !result.value) throw new HttpError(409, "Another Shopify creation is running; retry shortly");
        return jsonResponse(request, config, 200, result.value);
      }
      if (!fields.locationId || !fields.previewToken) throw new HttpError(400, "Location and preview token are required");
      const requestedLocationId = fields.locationId, requestedPreviewToken = fields.previewToken;
      const scope = await resolveShopifyScope(config, actor, workspaceIdFrom(body), true);
      let result: ShopifyListing | null = null;
      const scopeProcessed = await withShopifyLotLease(config, scope.partitionKey, 0, async assertScopeCurrent => {
        const lotProcessed = await withShopifyLotLease(config, scope.partitionKey, fields.lotId, async assertLotCurrent => {
          const connection = await getShopifyConnection(config, scope.partitionKey);
          if (!connection) throw new HttpError(409, "Connect Shopify before creating products");
          const store = createShopifyListingStore(config);
          const existing = await store.get(scope.partitionKey, fields.lotId);
          const handle = shopifyDraftHandle(scope.partitionKey, fields.lotId);
          if (existing) {
            if (existing.lifecycle === "unlinked") throw new HttpError(409, "This Shopify product link was removed; use explicit setup to link a product again", ShopifyErrorCode.ALREADY_LINKED);
            if (existing.shop === connection.shop && isActiveShopifyListing(existing) && existing.mode === "linked" && existing.creationHandle === handle && existing.locationId === requestedLocationId) {
              const current = await getShopifyConnection(config, scope.partitionKey);
          if (current?.shop !== connection.shop || (current.generation ?? 0) !== (connection.generation ?? 0)) throw new HttpError(409, "Shopify connection changed; retry creation", ShopifyErrorCode.CONNECTION_CHANGED);
              result = existing; return;
            }
            throw new HttpError(409, "This lot already has a Shopify product link", ShopifyErrorCode.ALREADY_LINKED);
          }
          const built = await authoritativePreview(config, scope.partitionKey, connection, fields.lotId);
          if (built.preview.previewToken !== requestedPreviewToken) throw new HttpError(409, "Shopify product preview is stale; refresh it", ShopifyErrorCode.PREVIEW_STALE);
          const selected = built.preview.locations.find(location => location.id === requestedLocationId);
          if (!selected) throw new HttpError(400, "Choose an active Shopify location", ShopifyErrorCode.LOCATION_REQUIRED);
          const assertCurrent = async () => {
            await assertScopeCurrent(); await assertLotCurrent();
            const current = await getShopifyConnection(config, scope.partitionKey);
            if (current?.shop !== connection.shop || (current.generation ?? 0) !== (connection.generation ?? 0)) throw new HttpError(409, "Shopify connection changed; refresh the preview", ShopifyErrorCode.CONNECTION_CHANGED);
          };
          await assertCurrent();
          await ensureShopifyOrderWebhooks(config, scope.partitionKey, assertCurrent);
          const client = createShopifyAdminClient(connection.shop, () => getShopifyAccessToken(config, scope.partitionKey, connection.shop));
          let recovered = await client.findOwnedDraft(built.handle, built.ownershipHash, requestedLocationId);
          let ids: { productId: string; variantId: string; inventoryItemId: string } | null = recovered;
          if (!ids) {
            await assertCurrent();
            try {
              ids = await client.createLinkedDraft({ handle: built.handle, ownershipHash: built.ownershipHash, title: built.preview.title, sku: built.preview.sku, price: built.preview.price, locationId: requestedLocationId, quantity: built.preview.quantity, beforeMutation: assertCurrent });
            } catch (error) {
              // productSet may have completed while the response was lost. Recover by exact identity;
              // never issue a second upsert or inventory mutation in this request.
              try { recovered = await client.findOwnedDraft(built.handle, built.ownershipHash, requestedLocationId); ids = recovered; }
              catch { throw error; }
              if (!ids) throw error;
            }
          }
          if (!ids) throw new Error("Shopify draft could not be recovered");
          await assertCurrent();
          const mapping: ShopifyListing = { scopeKey: scope.partitionKey, lotId: fields.lotId, shop: connection.shop, mode: "linked", lifecycle: "active", creationHandle: built.handle,
            productId: ids.productId, variantId: ids.variantId, inventoryItemId: ids.inventoryItemId, locationId: requestedLocationId, locationName: built.locationNames.get(requestedLocationId),
            lastQuantity: recovered?.available ?? built.preview.quantity, productTitle: built.preview.title, variantTitle: "Sealed box", sku: built.preview.sku, updatedAt: new Date().toISOString() };
          await assertCurrent();
          result = await store.put(mapping);
        });
        if (!lotProcessed) throw new HttpError(409, "Shopify inventory is syncing; retry shortly");
      });
      if (!scopeProcessed || !result) throw new HttpError(409, "Another Shopify product is being created; retry shortly");
      return jsonResponse(request, config, 200, { listing: result });
    }
  });
}
