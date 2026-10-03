import { createHash } from "node:crypto";
import { HttpError } from "../../lib/auth";
import { normalizeBindingMutation, type BindingMutation } from "../../shared/shopify-product-manager";
import { ShopifyErrorCode } from "../../shared/shopify-errors";
import type { ShopifyListing, ShopifyListingStore } from "./listingService";
import { isActiveShopifyListing } from "./listingService";
import type { ShopifyCatalogClient } from "./catalogService";

export type BindingServiceInput = {
  scopeKey: string;
  shop: string;
  generation: number;
  request: BindingMutation;
  store: ShopifyListingStore & { list(scopeKey: string): Promise<ShopifyListing[]> };
  client: Pick<ShopifyCatalogClient, "getVariant">;
  assertCurrent: () => Promise<void>;
};

function conflict(message: string): HttpError {
  return new HttpError(409, message, ShopifyErrorCode.BINDING_CHANGED);
}

function fingerprint(scopeKey: string, shop: string, request: BindingMutation): string {
  return createHash("sha256").update(JSON.stringify({ scopeKey, shop, request })).digest("hex");
}

function activeVariantOwnedByAnotherLot(listings: ShopifyListing[], scopeKey: string, shop: string, lotId: number, variantId: string): boolean {
  return listings.some(listing => listing.scopeKey === scopeKey && listing.shop === shop && listing.lotId !== lotId &&
    listing.variantId === variantId && isActiveShopifyListing(listing));
}

async function saveWithVersionCheck(input: BindingServiceInput, listing: ShopifyListing): Promise<ShopifyListing> {
  await input.assertCurrent();
  try { return await input.store.put(listing); }
  catch (error) {
    if (error instanceof Error && /changed|conflict|precondition/i.test(error.message)) throw conflict("Shopify product link changed; refresh before saving");
    throw error;
  }
}

/** Saves binding corrections only. It never calls a Shopify product or inventory mutation. */
export async function mutateShopifyBinding(input: BindingServiceInput): Promise<ShopifyListing> {
  const request = normalizeBindingMutation(input.request);
  if (!request) throw new HttpError(400, "Invalid Shopify binding request");
  if (request.generation !== input.generation) throw new HttpError(409, "Shopify connection changed; refresh the dialog", ShopifyErrorCode.CONNECTION_CHANGED);

  await input.assertCurrent();
  const current = await input.store.get(input.scopeKey, request.lotId);
  await input.assertCurrent();
  if (current && (current.scopeKey !== input.scopeKey || current.lotId !== request.lotId)) throw conflict("Shopify product link identity changed; refresh before saving");
  const requestFingerprint = fingerprint(input.scopeKey, input.shop, request);

  if (current?.lastMutationId === request.mutationId) {
    if (current.lastMutationFingerprint !== requestFingerprint) throw conflict("This Shopify mutation ID was already used with different input");
    return current;
  }
  const currentVersion = current?.version ?? null;
  if (request.expectedVersion !== currentVersion) throw conflict("Shopify product link changed; refresh before saving");
  const sameStore = current?.shop === input.shop;
  if (current && !sameStore && ["replace", "location", "transfer"].includes(request.action)) {
    throw conflict("This Shopify product link belongs to a different store connection");
  }

  const lifecycleActive = sameStore && isActiveShopifyListing(current);
  if (!current && request.action !== "link") throw conflict("Set up a Shopify product link before correcting it");
  if (current && sameStore && !lifecycleActive && request.action !== "link" && request.action !== "unlink") {
    throw conflict("This Shopify link was removed; use explicit setup to link a product again");
  }
  if (request.action === "link" && current && sameStore && lifecycleActive) {
    if (current.mode !== "linked") throw conflict("Transfer Shopify management before linking this product");
    if (current.variantId === request.variantId && current.locationId === request.locationId) {
      return saveWithVersionCheck(input, { ...current, updatedAt: new Date().toISOString(),
        lastMutationId: request.mutationId, lastMutationFingerprint: requestFingerprint });
    }
    throw conflict("This lot already has a Shopify link; use replace or location correction");
  }

  if (request.action === "transfer") {
    if (!current || !sameStore || !lifecycleActive) throw conflict("An active Shopify link is required before transfer");
    if (current.mode === "linked") throw conflict("This Shopify link is already managed by Shopify");
    if (request.confirmTransfer !== true) throw conflict("Confirm that future product and stock management transfers to Shopify");
    return saveWithVersionCheck(input, { ...current, mode: "linked", lifecycle: "active", updatedAt: new Date().toISOString(),
      lastMutationId: request.mutationId, lastMutationFingerprint: requestFingerprint });
  }

  if (request.action === "unlink") {
    if (!current) throw conflict("There is no Shopify link to remove");
    return saveWithVersionCheck(input, { ...current, lifecycle: "unlinked", updatedAt: new Date().toISOString(),
      lastMutationId: request.mutationId, lastMutationFingerprint: requestFingerprint });
  }

  if (request.action === "location") {
    if (!current || !sameStore || !lifecycleActive) throw conflict("An active Shopify link is required before changing location");
    if (current.mode !== "linked") throw conflict("Transfer Shopify management before correcting this link");
  }
  if (request.action === "replace") {
    if (!current || !sameStore || !lifecycleActive) throw conflict("An active Shopify link is required before replacing it");
    if (current.mode !== "linked") throw conflict("Transfer Shopify management before replacing this link");
  }

  const variantId = request.action === "location" ? current!.variantId : request.variantId;
  if (!variantId || !request.locationId) throw new HttpError(400, "Choose a Shopify product and inventory location");
  const variant = await input.client.getVariant(variantId);
  if (!variant || variant.variantId !== variantId) throw new HttpError(404, "Shopify variant is unavailable in the connected store");
  if (request.action === "location" && current &&
    (variant.productId !== current.productId || variant.inventoryItemId !== current.inventoryItemId)) {
    throw conflict("The current Shopify product identity changed; refresh before changing location");
  }
  const location = variant.locations.find(item => item.id === request.locationId);
  if (!location) throw new HttpError(400, "Choose an active inventory location for this Shopify variant", ShopifyErrorCode.LOCATION_REQUIRED);
  const listings = await input.store.list(input.scopeKey);
  if (activeVariantOwnedByAnotherLot(listings, input.scopeKey, input.shop, request.lotId, variant.variantId)) {
    throw new HttpError(409, "This Shopify variant is already linked to another lot", ShopifyErrorCode.VARIANT_ALREADY_BOUND);
  }

  const next: ShopifyListing = {
    scopeKey: input.scopeKey, lotId: request.lotId, shop: input.shop, mode: "linked", lifecycle: "active",
    productId: variant.productId, variantId: variant.variantId, inventoryItemId: variant.inventoryItemId, locationId: location.id,
    lastQuantity: location.available, productTitle: variant.title, variantTitle: variant.variantTitle, sku: variant.sku,
    updatedAt: new Date().toISOString(), version: current?.version,
    lastMutationId: request.mutationId, lastMutationFingerprint: requestFingerprint
  };
  return saveWithVersionCheck(input, next);
}
