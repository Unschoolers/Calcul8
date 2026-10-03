import { createHash } from "node:crypto";
import { HttpError } from "../../lib/auth";
import { ShopifyErrorCode } from "../../shared/shopify-errors";
import { normalizeProductDetailsMutation, normalizeShopifyMoney, type ProductDetailsMutation, type ProductDetailsResult, type ProductDetailsDraft } from "../../shared/shopify-product-manager";
import { isActiveShopifyListing, type ShopifyListingStore, type ShopifyListing } from "./listingService";
import type { ShopifyCatalogClient, ShopifyVariant } from "./catalogService";
import type { ShopifyProductDetailsClient, ShopifyLinkedDraftClient } from "./adminClient";
import type { DetailsAttempt, ShopifyOperationStore } from "./operationTypes";

export type ProductDetailsServiceInput = {
  scopeKey: string; shop: string; generation: number; request: ProductDetailsMutation;
  store: Pick<ShopifyListingStore, "get">; operations: ShopifyOperationStore;
  client: Pick<ShopifyCatalogClient, "getVariant"> & ShopifyProductDetailsClient & Pick<ShopifyLinkedDraftClient, "getShopCurrency">;
  assertCurrent: () => Promise<void>;
};
function conflict(message: string): never { throw new HttpError(409, message, ShopifyErrorCode.BINDING_CHANGED); }

/** Called under scope/lot leases. Persist uncertainty before every provider mutation. */
export async function updateShopifyProductDetails(input: ProductDetailsServiceInput): Promise<ProductDetailsResult> {
  const request = normalizeProductDetailsMutation(input.request);
  if (!request) throw new HttpError(400, "Invalid Shopify title or price");
  if (request.generation !== input.generation) throw new HttpError(409, "Shopify connection changed", ShopifyErrorCode.CONNECTION_CHANGED);
  let mapping: ShopifyListing | null = null;
  const guard = async () => {
    await input.assertCurrent();
    const current = await input.store.get(input.scopeKey, request.lotId);
    if (!current || current.scopeKey !== input.scopeKey || current.shop !== input.shop || !isActiveShopifyListing(current) || current.version !== request.expectedVersion) conflict("Shopify binding changed; refresh the manager");
    if (current.mode !== "linked") conflict("Transfer Shopify management before editing details");
    if (mapping && ["productId", "variantId", "inventoryItemId", "locationId"].some(key => current[key as keyof ShopifyListing] !== mapping![key as keyof ShopifyListing])) conflict("Shopify binding identity changed");
    mapping = current;
  };
  await guard();
  const binding = mapping!;
  const fingerprint = createHash("sha256").update(JSON.stringify({ scopeKey: input.scopeKey, shop: input.shop, request, productId: binding.productId, variantId: binding.variantId, inventoryItemId: binding.inventoryItemId, locationId: binding.locationId })).digest("hex");
  const saved = await input.operations.get(input.scopeKey, request.lotId, request.operationId);
  if (saved && (saved.kind !== "details" || saved.fingerprint !== fingerprint)) conflict("Shopify operation input changed; resolve the original operation");
  if (!saved && (await input.operations.list(input.scopeKey, request.lotId)).some(item => item.kind === "details" && !item.terminalConflict && item.shop === input.shop && item.generation === input.generation && item.productId === binding.productId && item.variantId === binding.variantId && Object.values(item.outcome).some(outcome => outcome !== "confirmed"))) conflict("Recover the previous Shopify operation before starting another");
  let attempt: DetailsAttempt = saved as DetailsAttempt ?? { kind: "details", scopeKey: input.scopeKey, shop: input.shop, lotId: request.lotId, operationId: request.operationId, fingerprint, generation: input.generation, bindingVersion: request.expectedVersion,
    productId: binding.productId, variantId: binding.variantId, inventoryItemId: binding.inventoryItemId, locationId: binding.locationId, expected: request.expected, draft: request.draft, currency: request.currency, updatedAt: new Date().toISOString(),
    attemptedFields: [], outcome: { title: request.expected.title === request.draft.title ? "confirmed" : "pending", price: request.expected.price === request.draft.price ? "confirmed" : "pending" } };
  if (attempt.terminalConflict) throw new HttpError(409, "Shopify details changed elsewhere; refresh before editing", ShopifyErrorCode.DETAILS_CHANGED);
  // Older records have no per-field claim list: conservatively treat all changed fields as attempted.
  attempt.attemptedFields ??= (["title", "price"] as const).filter(field => request.expected[field] !== request.draft[field]);
  const read = async (): Promise<ShopifyVariant> => {
    await guard();
    const variant = await input.client.getVariant(binding.variantId);
    if (!variant || variant.productId !== binding.productId || variant.variantId !== binding.variantId || variant.inventoryItemId !== binding.inventoryItemId) conflict("Shopify provider identity changed");
    await guard();
    return variant;
  };
  const currency = await input.client.getShopCurrency();
  if (currency !== request.currency) throw new HttpError(409, "Shopify currency changed", ShopifyErrorCode.CURRENCY_MISMATCH);
  let observed: ShopifyVariant | null = await read();
  const persist = async () => { await guard(); attempt = await input.operations.put({ ...attempt, updatedAt: new Date().toISOString() }) as DetailsAttempt; };
  const reconcile = async (variant: ShopifyVariant) => {
    const conflicts: ("title" | "price")[] = [];
    const values: ProductDetailsDraft = { title: variant.title, price: normalizeShopifyMoney(variant.price, true) ?? "" };
    for (const field of ["title", "price"] as const) {
      if (values[field] === request.draft[field]) attempt.outcome[field] = "confirmed";
      else if (values[field] === request.expected[field] && attempt.outcome[field] !== "confirmed") attempt.outcome[field] = "pending";
      else conflicts.push(field);
    }
    if (conflicts.length) {
      // This read confirms Shopify has a value outside this operation's expected/draft pair.
      // Keep each field outcome intact, but end this attempt so a refreshed explicit operation
      // can establish the new baseline instead of leaving an ambiguous write blocking the lot.
      attempt.terminalConflict = true;
      await persist();
      throw new HttpError(409, `Shopify ${conflicts.join(" and ")} changed elsewhere; refresh before editing`, ShopifyErrorCode.DETAILS_CHANGED);
    }
  };
  await reconcile(observed);
  await persist();
  for (const field of ["title", "price"] as const) {
    if (attempt.outcome[field] === "confirmed") continue;
    await guard();
    attempt.outcome[field] = "unknown";
    if (!attempt.attemptedFields!.includes(field)) attempt.attemptedFields!.push(field);
    await persist();
    try {
      if (field === "title") await input.client.updateProductTitle(binding.productId, request.draft.title, guard);
      else await input.client.updateVariantPrice(binding.productId, binding.variantId, request.draft.price, guard);
      attempt.outcome[field] = "confirmed";
    } catch { /* A lost response can be a completed write; only matching readback resolves it. */ }
    await guard();
    try { observed = await read(); } catch (error) {
      if (error instanceof HttpError) throw error;
      await guard(); observed = null;
      // Keep the persisted unknown claim (or acknowledged success) until an explicit recovery read.
      await persist(); break;
    }
    await reconcile(observed);
    await persist();
    if (attempt.outcome[field] !== "confirmed") break;
  }
  const { price: _price, currency: _currency, observedAt: _observedAt, availableLocations: _locations, productStatus: _status, ...fallback } = binding;
  const resultListing: ShopifyListing = observed ? { ...fallback, productTitle: observed.title, variantTitle: observed.variantTitle, sku: observed.sku, price: normalizeShopifyMoney(observed.price, true) ?? undefined, currency, observedAt: new Date().toISOString(), availableLocations: observed.locations.map(({ id, name }) => ({ id, name })), ...(observed.productStatus ? { productStatus: observed.productStatus } : {}) } : fallback;
  return { listing: resultListing, bindingVersion: binding.version ?? null, shop: input.shop, generation: input.generation, outcome: { ...attempt.outcome } };
}
