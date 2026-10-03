/** Public API contracts for the Shopify product manager. Keep independent of frontend types. */
export type ShopifyBindingMode = "linked" | "managed";
export type ShopifyBindingLifecycle = "active" | "unlinked";

export type ShopifyManagerListing = {
  scopeKey: string;
  shop: string;
  lotId: number;
  mode?: ShopifyBindingMode;
  lifecycle?: ShopifyBindingLifecycle;
  creationHandle?: string;
  locationName?: string;
  productTitle?: string;
  variantTitle?: string;
  sku?: string;
  productId: string;
  variantId: string;
  inventoryItemId: string;
  locationId: string;
  lastQuantity: number;
  updatedAt: string;
  version?: string;
  lastMutationId?: string;
  lastMutationFingerprint?: string;
  price?: string;
  currency?: string;
  observedAt?: string;
  availableLocations?: Array<{ id: string; name: string }>;
  productStatus?: "DRAFT" | "ACTIVE" | "ARCHIVED";
};

/** Compatibility name for callers that describe the same public shape as an edit listing. */
export type ShopifyEditListing = ShopifyManagerListing;

export type BindingAction = "link" | "replace" | "location" | "unlink" | "transfer";
export type BindingMutation = {
  lotId: number;
  mutationId: string;
  expectedVersion: string | null;
  generation: number;
  action: BindingAction;
  variantId?: string;
  locationId?: string;
  confirmTransfer?: boolean;
};

export type BindingResult = {
  listing: ShopifyManagerListing | null;
  bindingVersion: string | null;
  shop?: string | null;
  generation?: number;
};

export type BindingSummary = {
  scopeKey: string;
  shop: string | null;
  generation: number;
  generatedAt: string;
  complete: boolean;
  connected: boolean;
  bindings: Array<{ lotId: number; mode: ShopifyBindingMode; version: string }>;
};

export type ProductDetailsDraft = { title: string; price: string };
export type DraftOverrides = ProductDetailsDraft & { locationId: string };
export type DraftCreateMutation = {
  lotId: number; operationId: string; expectedVersion: string | null; generation: number;
  overrides: DraftOverrides; previewToken: string;
};
export function normalizeDraftOverrides(value: unknown): DraftOverrides | null {
  if (!isRecord(value) || Object.keys(value).some(key => !["title", "price", "locationId"].includes(key)) ||
    typeof value.title !== "string" || !value.title.trim() || value.title.trim().length > 255 ||
    typeof value.locationId !== "string" || !/^gid:\/\/shopify\/Location\/\d+$/.test(value.locationId)) return null;
  const price = normalizeShopifyMoney(value.price);
  return price ? { title: value.title.trim(), price, locationId: value.locationId } : null;
}
export function normalizeDraftCreateMutation(value: unknown): DraftCreateMutation | null {
  if (!isRecord(value) || Object.keys(value).some(key => !["lotId", "operationId", "expectedVersion", "generation", "overrides", "previewToken"].includes(key)) ||
    !Number.isSafeInteger(value.lotId) || Number(value.lotId) <= 0 || !Number.isSafeInteger(value.generation) || Number(value.generation) < 0 ||
    typeof value.operationId !== "string" || !value.operationId.trim() || value.operationId.length > 128 ||
    (value.expectedVersion !== null && (typeof value.expectedVersion !== "string" || !value.expectedVersion.trim() || value.expectedVersion.length > 512)) ||
    typeof value.previewToken !== "string" || !/^[a-f0-9]{64}$/.test(value.previewToken)) return null;
  const overrides = normalizeDraftOverrides(value.overrides);
  return overrides ? { lotId: Number(value.lotId), operationId: value.operationId.trim(), expectedVersion: value.expectedVersion as string | null, generation: Number(value.generation), overrides, previewToken: value.previewToken } : null;
}
export type FieldOutcome = "confirmed" | "pending" | "unknown";
export type ProductDetailsMutation = {
  lotId: number; operationId: string; expectedVersion: string; generation: number;
  currency: string; expected: ProductDetailsDraft; draft: ProductDetailsDraft;
};
export type ProductDetailsResult = BindingResult & { outcome: { title: FieldOutcome; price: FieldOutcome } };

export function normalizeShopifyMoney(value: unknown, allowZero = false): string | null {
  if (typeof value !== "string" || !/^\d{1,12}(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const amount = Number(value.trim());
  if (!Number.isFinite(amount) || (allowZero ? amount < 0 : amount <= 0)) return null;
  return amount.toFixed(2);
}

export function normalizeProductDetailsMutation(value: unknown): ProductDetailsMutation | null {
  if (!isRecord(value) || Object.keys(value).some(key => !["lotId", "operationId", "expectedVersion", "generation", "currency", "expected", "draft"].includes(key)) ||
    !Number.isSafeInteger(value.lotId) || Number(value.lotId) <= 0 || !Number.isSafeInteger(value.generation) || Number(value.generation) < 0 ||
    typeof value.operationId !== "string" || !value.operationId.trim() || value.operationId.length > 128 ||
    typeof value.expectedVersion !== "string" || !value.expectedVersion.trim() || value.expectedVersion.length > 512 ||
    typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency)) return null;
  const details = (input: unknown, allowZero: boolean): ProductDetailsDraft | null => {
    if (!isRecord(input) || Object.keys(input).some(key => key !== "title" && key !== "price") || typeof input.title !== "string" || !input.title.trim() || input.title.trim().length > 255) return null;
    const price = normalizeShopifyMoney(input.price, allowZero);
    return price === null ? null : { title: input.title.trim(), price };
  };
  const expected = details(value.expected, true), draft = details(value.draft, false);
  return expected && draft ? { lotId: Number(value.lotId), operationId: value.operationId.trim(), expectedVersion: value.expectedVersion, generation: Number(value.generation), currency: value.currency, expected, draft } : null;
}

const bindingActions = new Set<BindingAction>(["link", "replace", "location", "unlink", "transfer"]);
const variantIdPattern = /^gid:\/\/shopify\/ProductVariant\/\d+$/;
const locationIdPattern = /^gid:\/\/shopify\/Location\/\d+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Normalize and validate the externally supplied binding mutation shape. */
export function normalizeBindingMutation(value: unknown): BindingMutation | null {
  if (!isRecord(value)) return null;
  const allowedKeys = new Set(["lotId", "mutationId", "expectedVersion", "generation", "action", "variantId", "locationId", "confirmTransfer"]);
  if (Object.keys(value).some(key => !allowedKeys.has(key))) return null;
  const lotId = value.lotId;
  const generation = value.generation;
  const mutationId = typeof value.mutationId === "string" ? value.mutationId.trim() : "";
  const action = value.action;
  if (!Number.isSafeInteger(lotId) || Number(lotId) <= 0 || !Number.isSafeInteger(generation) || Number(generation) < 0 ||
    mutationId.length < 1 || mutationId.length > 128 || typeof action !== "string" || !bindingActions.has(action as BindingAction)) return null;
  if (value.expectedVersion !== null && (typeof value.expectedVersion !== "string" || !value.expectedVersion.trim() || value.expectedVersion.length > 512)) return null;
  if (value.confirmTransfer != null && typeof value.confirmTransfer !== "boolean") return null;
  if (value.variantId != null && (typeof value.variantId !== "string" || !variantIdPattern.test(value.variantId))) return null;
  if (value.locationId != null && (typeof value.locationId !== "string" || !locationIdPattern.test(value.locationId))) return null;

  const normalizedAction = action as BindingAction;
  const hasVariant = typeof value.variantId === "string";
  const hasLocation = typeof value.locationId === "string";
  if ((normalizedAction === "link" || normalizedAction === "replace") ? (!hasVariant || !hasLocation) :
    normalizedAction === "location" ? (!hasLocation || hasVariant) : hasVariant || hasLocation) return null;
  if (normalizedAction !== "replace" && normalizedAction !== "transfer" && value.confirmTransfer != null) return null;
  return {
    lotId: Number(lotId), mutationId, expectedVersion: value.expectedVersion as string | null,
    generation: Number(generation), action: normalizedAction,
    ...(hasVariant ? { variantId: value.variantId as string } : {}),
    ...(hasLocation ? { locationId: value.locationId as string } : {}),
    ...(value.confirmTransfer === true ? { confirmTransfer: true } : {})
  };
}
