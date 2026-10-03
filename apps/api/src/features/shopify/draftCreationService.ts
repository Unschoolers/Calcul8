import { createHash } from "node:crypto";
import { HttpError } from "../../lib/auth";
import { ShopifyErrorCode } from "../../shared/shopify-errors";
import { normalizeDraftCreateMutation, type DraftCreateMutation, type BindingResult } from "../../shared/shopify-product-manager";
import { isActiveShopifyListing, type ShopifyListing, type ShopifyListingStore } from "./listingService";
import type { ShopifyLinkedDraftClient } from "./adminClient";
import type { CreateAttempt, ShopifyOperationStore } from "./operationTypes";
import type { ShopifyDraftPreview } from "./draftService";

export type DraftCreationServiceInput = {
  scopeKey: string; shop: string; generation: number; request: DraftCreateMutation;
  store: ShopifyListingStore; operations: ShopifyOperationStore;
  client: Pick<ShopifyLinkedDraftClient, "findOwnedDraft" | "createLinkedDraft">;
  loadPreview: () => Promise<{ preview: ShopifyDraftPreview }>;
  assertCurrent: () => Promise<void>;
};
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function conflict(message: string): never { throw new HttpError(409, message, ShopifyErrorCode.BINDING_CHANGED); }

/** Final payload and provider identity are durable before creation; recovery never reseeds stock. */
export async function createShopifyDraftAttempt(input: DraftCreationServiceInput): Promise<BindingResult> {
  const request = normalizeDraftCreateMutation(input.request);
  if (!request) throw new HttpError(400, "Invalid Shopify draft payload");
  if (request.generation !== input.generation) throw new HttpError(409, "Shopify connection changed", ShopifyErrorCode.CONNECTION_CHANGED);
  const fingerprint = hash({ scopeKey: input.scopeKey, shop: input.shop, request });
  let saved = await input.operations.get(input.scopeKey, request.lotId, request.operationId);
  if (saved && (saved.kind !== "create" || saved.fingerprint !== fingerprint)) conflict("Shopify creation payload changed; recover the original input");
  let attempt = saved as CreateAttempt | null;
  const matchesAttempt = (mapping: ShopifyListing) => attempt?.ids && mapping.shop === input.shop && isActiveShopifyListing(mapping) && mapping.mode === "linked" && mapping.lastMutationId === request.operationId && mapping.lastMutationFingerprint === fingerprint && mapping.productId === attempt.ids.productId && mapping.variantId === attempt.ids.variantId && mapping.inventoryItemId === attempt.ids.inventoryItemId && mapping.locationId === request.overrides.locationId;
  let current: ShopifyListing | null = null;
  const guard = async () => {
    await input.assertCurrent();
    current = await input.store.get(input.scopeKey, request.lotId);
    if (current && (current.scopeKey !== input.scopeKey || current.lotId !== request.lotId)) conflict("Shopify binding identity changed");
    if (current && matchesAttempt(current)) return;
    if ((current?.version ?? null) !== request.expectedVersion) conflict("Shopify binding changed; refresh before creation");
    if (current && current.shop === input.shop && isActiveShopifyListing(current)) throw new HttpError(409, "This lot already has a Shopify product link", ShopifyErrorCode.ALREADY_LINKED);
  };
  await guard();
  if (!attempt) {
    const unresolved = (await input.operations.list(input.scopeKey, request.lotId)).some(item => item.kind === "create" && item.shop === input.shop && item.generation === input.generation && item.bindingVersion === request.expectedVersion && item.status !== "mapped" && item.status !== "failed");
    if (unresolved) conflict("Recover the previous creation attempt before starting another");
    const built = await input.loadPreview();
    if (built.preview.previewToken !== request.previewToken) throw new HttpError(409, "Shopify preview is stale; refresh it", ShopifyErrorCode.PREVIEW_STALE);
    if (built.preview.title !== request.overrides.title || built.preview.price !== request.overrides.price) throw new HttpError(409, "Shopify preview input changed", ShopifyErrorCode.PREVIEW_STALE);
    const location = built.preview.locations.find(item => item.id === request.overrides.locationId);
    if (!location) throw new HttpError(400, "Choose an active inventory location", ShopifyErrorCode.LOCATION_REQUIRED);
    const handle = `calcul8-created-${hash([input.scopeKey, input.shop, request.lotId, request.operationId, request.expectedVersion]).slice(0, 24)}`;
    attempt = { kind: "create", scopeKey: input.scopeKey, shop: input.shop, lotId: request.lotId, operationId: request.operationId, fingerprint, generation: input.generation, bindingVersion: request.expectedVersion, request,
      handle, ownershipHash: hash([input.scopeKey, request.lotId, fingerprint]), status: "prepared", updatedAt: new Date().toISOString(),
      payload: { title: built.preview.title, price: built.preview.price, currency: built.preview.currency, sku: built.preview.sku, quantity: built.preview.quantity, locationId: location.id, locationName: location.name, variantTitle: "Booster box" } };
  }
  const persist = async () => { await guard(); attempt = await input.operations.put({ ...attempt!, updatedAt: new Date().toISOString() }) as CreateAttempt; };
  await persist();
  const completedMapping = current as ShopifyListing | null;
  if (completedMapping && matchesAttempt(completedMapping)) {
    attempt.status = "mapped"; await persist();
    return { listing: completedMapping, bindingVersion: completedMapping.version ?? null, shop: input.shop, generation: input.generation };
  }
  await guard();
  let recovered = await input.client.findOwnedDraft(attempt.handle, attempt.ownershipHash, attempt.payload.locationId, { variantTitle: attempt.payload.variantTitle });
  const recordedIds = attempt.ids;
  if (recordedIds && (!recovered || (["productId", "variantId", "inventoryItemId"] as const).some(key => recovered![key] !== recordedIds[key]))) conflict("Shopify creation recovery identity changed");
  if (!recovered && (attempt.status === "unknown" || attempt.status === "created" || attempt.status === "mapped")) conflict("Shopify creation outcome is unknown; recover this attempt before retrying");
  let ids = recovered ?? attempt.ids;
  if (!ids) {
    attempt.status = "unknown"; await persist();
    try { ids = await input.client.createLinkedDraft({ handle: attempt.handle, ownershipHash: attempt.ownershipHash, ...attempt.payload, beforeMutation: guard }); }
    catch (error) {
      await guard();
      try { recovered = await input.client.findOwnedDraft(attempt.handle, attempt.ownershipHash, attempt.payload.locationId, { variantTitle: attempt.payload.variantTitle }); } catch { /* Keep the durable uncertainty. */ }
      if (!recovered) {
        if (error && typeof error === "object" && "definitive" in error && error.definitive === true) { attempt.status = "failed"; await persist(); }
        conflict("Shopify creation outcome is unknown; recover the original attempt");
      }
      ids = recovered;
    }
  }
  attempt.ids = { productId: ids.productId, variantId: ids.variantId, inventoryItemId: ids.inventoryItemId };
  attempt.status = "created"; await persist();
  await guard();
  const mapping: ShopifyListing = { scopeKey: input.scopeKey, shop: input.shop, lotId: request.lotId, mode: "linked", lifecycle: "active", ...attempt.ids,
    locationId: attempt.payload.locationId, locationName: attempt.payload.locationName, lastQuantity: recovered?.available ?? attempt.payload.quantity,
    productTitle: attempt.payload.title, variantTitle: attempt.payload.variantTitle, sku: attempt.payload.sku, creationHandle: attempt.handle, version: request.expectedVersion ?? undefined,
    lastMutationId: request.operationId, lastMutationFingerprint: fingerprint, updatedAt: new Date().toISOString() };
  const listing = await input.store.put(mapping);
  attempt.status = "mapped"; await persist();
  return { listing, bindingVersion: listing.version ?? null, shop: input.shop, generation: input.generation };
}
