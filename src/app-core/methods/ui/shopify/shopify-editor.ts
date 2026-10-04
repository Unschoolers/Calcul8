import type { ShopifyEditListing, ShopifyVariantSearchResult } from "../../../../types/app.ts";
import { isShopifyDraftPreview, type ShopifyDraftPreview } from "../../../../domain/shopify-draft.ts";
import { ShopifyErrorCode, ShopifyUiError, shopifyResponseUiError, shopifyUiErrorMessage, shopifyUiErrorRecovery, shopifySavedLotFieldsMatch } from "../../../../domain/shopify-ui-error.ts";
import { isShopifyStockObservation, type ShopifyStockObservation } from "../../../../../shared/shopify-stock.ts";
import { normalizeBindingMutation, normalizeDraftCreateMutation, normalizeDraftOverrides, normalizeProductDetailsMutation, type BindingAction, type BindingMutation, type BindingResult, type DraftCreateMutation, type DraftOverrides, type ProductDetailsDraft, type ProductDetailsMutation, type ProductDetailsResult } from "../../../../../shared/shopify-product-manager.ts";
import type { ConfigLotMethodImplementation, LotConfigurationContext } from "../../../context/commerce.ts";
import { fetchAuthenticatedApiResponse } from "../common/api-client.ts";

const shopifyEditSearchTimers = new WeakMap<object, ReturnType<typeof setTimeout>>();
const shopifyDraftPreviewCache = new WeakMap<object, ShopifyDraftPreview>();

function shopifyVariantLabel(result: ShopifyVariantSearchResult, noSku: string): string {
  return `${result.title}${result.variantTitle && result.variantTitle !== "Default Title" ? ` · ${result.variantTitle}` : ""} · ${result.sku || noSku} · ${result.price}`;
}
function cancelShopifyEditSearchTimer(context: object): void {
  const timer = shopifyEditSearchTimers.get(context);
  if (timer) clearTimeout(timer);
  shopifyEditSearchTimers.delete(context);
}

type ShopifyEditApiScope = { activeScopeType: string; activeWorkspaceId: string | null };
function shopifyEditScopeBody(context: ShopifyEditApiScope): { workspaceId?: string } {
  return context.activeScopeType === "workspace" && context.activeWorkspaceId ? { workspaceId: context.activeWorkspaceId } : {};
}
type ShopifyEditRequestContext = { googleAuthEpoch: number; activeScopeType: string; activeWorkspaceId: string | null; currentLotId: number | null; showRenameLotModal: boolean; shopifyEditRequestRevision: number; shopifyEditSessionAuthEpoch: number | null; shopifyEditSessionScope: string; shopifyEditSessionLotId: number | null; shopifyConnectionStatus: string; shopifyConnectionShop: string | null };
function shopifyEditRequestIsOwned(context: ShopifyEditRequestContext, captured: { auth: number; scope: string; lotId: number | null; revision: number }): boolean {
  return context.showRenameLotModal && context.googleAuthEpoch === captured.auth &&
    JSON.stringify(shopifyEditScopeBody(context)) === captured.scope && context.currentLotId === captured.lotId &&
    context.shopifyEditRequestRevision === captured.revision && context.shopifyEditSessionAuthEpoch === captured.auth &&
    context.shopifyEditSessionScope === captured.scope && context.shopifyEditSessionLotId === captured.lotId;
}
function shopifyEditRequestIsCurrent(context: ShopifyEditRequestContext, captured: { auth: number; scope: string; lotId: number | null; revision: number; shop: string | null }): boolean {
  return shopifyEditRequestIsOwned(context, captured) && context.shopifyConnectionStatus === "connected" && context.shopifyConnectionShop === captured.shop;
}
function shopifyEditSessionIsCurrent(context: ShopifyEditRequestContext): boolean {
  return context.shopifyEditSessionAuthEpoch === context.googleAuthEpoch &&
    context.shopifyEditSessionScope === JSON.stringify(shopifyEditScopeBody(context)) &&
    context.shopifyEditSessionLotId === context.currentLotId;
}
export function closeShopifyEditState(context: { shopifyEditRequestRevision: number; shopifyEditLoading: boolean; shopifyEditSaving: boolean; shopifyEditSearchResults: ShopifyVariantSearchResult[]; shopifyEditSearchCompleted: boolean; shopifyEditSelectedVariantId: string | null; shopifyEditSelectedLocationId: string | null; shopifyEditError: string | null; shopifyEditRecovery: "retry" | "refresh" | "reconnect" | "none"; shopifyEditErrorOperation: "listing" | "search" | "link" | "binding" | "details" | "create" | null; shopifyEditListingStatus: "idle" | "loading" | "loaded" | "error"; shopifyEditManagerOpen: boolean; showRenameLotModal: boolean }): void {
  context.shopifyEditRequestRevision += 1;
  context.shopifyEditLoading = false;
  context.shopifyEditSaving = false;
  context.shopifyEditSearchResults = [];
  context.shopifyEditSearchCompleted = false;
  context.shopifyEditSelectedVariantId = null;
  context.shopifyEditSelectedLocationId = null;
  context.shopifyEditError = null;
  context.shopifyEditRecovery = "none";
  context.shopifyEditErrorOperation = null;
  context.shopifyEditListingStatus = "idle";
  context.shopifyEditManagerOpen = false;
  context.showRenameLotModal = false;
}
function shopifyEditErrorText(error: unknown, t: (key: string) => string, fallback: string): string { return shopifyUiErrorMessage(error, t, fallback); }

function shopifyEditOwnerScope(context: ShopifyEditRequestContext): string {
  return JSON.stringify({ auth: context.googleAuthEpoch, scope: JSON.stringify(shopifyEditScopeBody(context)), lotId: context.currentLotId, shop: context.shopifyConnectionShop });
}
function newShopifyOperationId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `shopify-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isBindingResult(value: unknown): value is BindingResult {
  if (!isRecord(value) || !("listing" in value) || (value.bindingVersion !== null && typeof value.bindingVersion !== "string")) return false;
  if (value.shop != null && typeof value.shop !== "string") return false;
  if (value.generation != null && (!Number.isSafeInteger(value.generation) || Number(value.generation) < 0)) return false;
  if (value.listing === null) return true;
  if (!isRecord(value.listing)) return false;
  return (value.listing.mode === "linked" || value.listing.mode === "managed") &&
    typeof value.listing.productId === "string" && typeof value.listing.variantId === "string" &&
    typeof value.listing.inventoryItemId === "string" && typeof value.listing.locationId === "string";
}
function scopedResult(payload: unknown, context: { shopifyEditBindingVersion: string | null; shopifyEditGeneration: number | null }, allowLegacy = false): BindingResult {
  if (isBindingResult(payload) && typeof payload.bindingVersion === "string" && payload.bindingVersion.length > 0 &&
    typeof payload.shop === "string" && Number.isSafeInteger(payload.generation)) return payload;
  if (allowLegacy && isRecord(payload) && "listing" in payload) {
    return {
      listing: (payload.listing ?? null) as BindingResult["listing"],
      bindingVersion: typeof payload.bindingVersion === "string" ? payload.bindingVersion : context.shopifyEditBindingVersion,
      ...(typeof payload.shop === "string" || payload.shop === null ? { shop: payload.shop } : {}),
      ...(Number.isSafeInteger(payload.generation) ? { generation: Number(payload.generation) } : context.shopifyEditGeneration !== null ? { generation: context.shopifyEditGeneration } : {})
    };
  }
  throw new Error("configShopifyInvalidResponse");
}
async function refreshSummaryAfterSuccess(context: { refreshShopifyBindings(): Promise<void> }): Promise<void> {
  try { await context.refreshShopifyBindings(); } catch { /* Summary refresh is independent from the confirmed provider mutation. */ }
}
function clearPendingShopifyAttempts(context: { shopifyEditPendingOwnerScope: string | null; shopifyEditPendingBindingMutation: BindingMutation | null; shopifyEditPendingDetailsMutation: ProductDetailsMutation | null; shopifyEditPendingCreateMutation: DraftCreateMutation | null; shopifyEditOperationId: string | null }, ownerScope: string): void {
  if (context.shopifyEditPendingOwnerScope && context.shopifyEditPendingOwnerScope !== ownerScope) {
    context.shopifyEditPendingBindingMutation = null;
    context.shopifyEditPendingDetailsMutation = null;
    context.shopifyEditPendingCreateMutation = null;
    context.shopifyEditOperationId = null;
    context.shopifyEditPendingOwnerScope = null;
  }
}

type ShopifyDraftEligibilityContext = ShopifyEditRequestContext & {
  activeScopeType: string;
  activeWorkspaceId: string | null;
  isCurrentWorkspaceOwner: boolean;
  isOffline: boolean;
  currentLotType: string;
  lots: Array<{ id: number; name: string; externalSku?: string; image?: string }>;
  renameLotName: string;
  renameLotExternalSku: string;
  renameLotImage: string;
  renameLotImageBusy: boolean;
  shopifyEditListing: ShopifyEditListing | null;
  shopifyEditListingStatus: "idle" | "loading" | "loaded" | "error";
  shopifyEditSaving: boolean;
};

function canCreateShopifyDraft(context: ShopifyDraftEligibilityContext): boolean {
  const lot = context.lots.find(candidate => candidate.id === context.currentLotId);
  return Boolean(lot && context.currentLotType === "bulk" && context.shopifyConnectionStatus === "connected" &&
    !context.isOffline && !context.renameLotImageBusy && !context.shopifyEditSaving && context.showRenameLotModal &&
    context.shopifyEditListingStatus === "loaded" && !context.shopifyEditListing && shopifyEditSessionIsCurrent(context) &&
    (context.activeScopeType !== "workspace" || (context.activeWorkspaceId && context.isCurrentWorkspaceOwner)) &&
    shopifySavedLotFieldsMatch({ name: lot.name, externalSku: lot.externalSku, image: lot.image }, { name: context.renameLotName, externalSku: context.renameLotExternalSku, image: context.renameLotImage }));
}

async function createShopifyDraft(this: LotConfigurationContext, overrides: DraftOverrides, previewToken: string): Promise<BindingResult>;
async function createShopifyDraft(this: LotConfigurationContext, locationId: string, previewToken: string): Promise<void>;
async function createShopifyDraft(this: LotConfigurationContext, input: DraftOverrides | string, previewToken: string): Promise<BindingResult | void> {
  if (this.shopifyEditSaving) throw new ShopifyUiError(null, "retry", "configShopifyErrorRateLimited");
  const ownerScope = shopifyEditOwnerScope(this);
  clearPendingShopifyAttempts(this, ownerScope);
  const legacyCall = typeof input === "string";
  let mutation = this.shopifyEditPendingCreateMutation;
  if (!mutation) {
    const effectiveOverrides = legacyCall
      ? { title: shopifyDraftPreviewCache.get(this)?.title ?? "", price: shopifyDraftPreviewCache.get(this)?.price ?? "", locationId: input }
      : input;
    const normalizedOverrides = normalizeDraftOverrides(effectiveOverrides);
    if (!normalizedOverrides || !/^[a-f0-9]{64}$/.test(previewToken) || !canCreateShopifyDraft(this)) {
      throw new ShopifyUiError(ShopifyErrorCode.PREVIEW_STALE, "refresh", "configShopifyDraftStalePreview");
    }
    const savedLot = this.lots.find(candidate => candidate.id === this.currentLotId);
    if (!savedLot || !shopifySavedLotFieldsMatch({ name: savedLot.name, externalSku: savedLot.externalSku, image: savedLot.image }, { name: this.renameLotName, externalSku: this.renameLotExternalSku, image: this.renameLotImage })) {
      throw new ShopifyUiError(ShopifyErrorCode.PREVIEW_STALE, "refresh", "configShopifyDraftStalePreview");
    }
    const normalized = normalizeDraftCreateMutation({
      lotId: this.currentLotId, operationId: newShopifyOperationId(), expectedVersion: this.shopifyEditBindingVersion,
      generation: this.shopifyEditGeneration ?? 0, overrides: normalizedOverrides, previewToken
    });
    if (!normalized) throw new ShopifyUiError(ShopifyErrorCode.PREVIEW_STALE, "refresh", "configShopifyDraftStalePreview");
    mutation = normalized;
    this.shopifyEditPendingCreateMutation = mutation;
    this.shopifyEditPendingOwnerScope = ownerScope;
  } else if (mutation.lotId !== this.currentLotId || this.shopifyEditPendingOwnerScope !== ownerScope) {
    throw new ShopifyUiError(ShopifyErrorCode.BINDING_CHANGED, "refresh", "configShopifyConflictError");
  }
  const recoverableLot = this.lots.find(candidate => candidate.id === this.currentLotId);
  const canRecoverAttempt = Boolean(recoverableLot && this.currentLotType === "bulk" && this.shopifyConnectionStatus === "connected" &&
    !this.isOffline && this.showRenameLotModal && shopifyEditSessionIsCurrent(this) &&
    (this.activeScopeType !== "workspace" || (this.activeWorkspaceId && this.isCurrentWorkspaceOwner)));
  if (!canRecoverAttempt) throw new ShopifyUiError(ShopifyErrorCode.PREVIEW_STALE, "refresh", "configShopifyDraftStalePreview");

  cancelShopifyEditSearchTimer(this);
  this.shopifyEditRequestRevision += 1;
  this.shopifyEditLoading = false;
  this.shopifyEditError = null;
  this.shopifyEditRecovery = "none";
  this.shopifyEditErrorOperation = null;
  this.shopifyEditSaving = true;
  this.shopifyEditOperationId = mutation.operationId;
  const captured = { auth: this.googleAuthEpoch, scope: JSON.stringify(shopifyEditScopeBody(this)), lotId: this.currentLotId,
    revision: this.shopifyEditRequestRevision, shop: this.shopifyConnectionShop };
  let definitivePreClaimFailure = false;
  try {
    const response = await fetchAuthenticatedApiResponse(this, "/integrations/shopify/products/create", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...shopifyEditScopeBody(this), ...mutation })
    });
    if (!response.ok) {
      const error = await shopifyResponseUiError(response, this.t, "configShopifyDraftCreateError", "configShopifyDraftStalePreview");
      definitivePreClaimFailure = response.status === 400 || error.code === ShopifyErrorCode.PREVIEW_STALE;
      throw error;
    }
    const payload = await response.json() as unknown;
    const result = scopedResult(payload, this, legacyCall);
    if (!shopifyEditRequestIsCurrent(this, captured)) return legacyCall ? undefined : result;
    const listing = result.listing;
    const resultIdentityMatches = legacyCall
      ? (result.shop == null || result.shop === captured.shop) && (result.generation == null || result.generation === mutation.generation)
      : result.shop === captured.shop && result.generation === mutation.generation;
    const listingShopMatches = legacyCall ? (!listing?.shop || listing.shop === captured.shop) : listing?.shop === captured.shop;
    if (!listing || listing.mode !== "linked" || !resultIdentityMatches || !listingShopMatches || listing.locationId !== mutation.overrides.locationId ||
      !/^gid:\/\/shopify\/Product\/\d+$/.test(listing.productId) || !/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(listing.variantId) ||
      !/^gid:\/\/shopify\/InventoryItem\/\d+$/.test(String(listing.inventoryItemId ?? ""))) {
      throw new Error(this.t("configShopifyDraftInvalidResponse"));
    }
    this.shopifyEditListing = listing as ShopifyEditListing;
    this.shopifyEditBindingVersion = result.bindingVersion ?? listing.version ?? null;
    this.shopifyEditGeneration = result.generation ?? this.shopifyEditGeneration;
    this.shopifyEditListingStatus = "loaded";
    this.shopifyEditPendingCreateMutation = null;
    this.shopifyEditDetailsOutcome = null;
    this.shopifyEditOperationId = this.shopifyEditPendingBindingMutation?.mutationId ?? this.shopifyEditPendingDetailsMutation?.operationId ?? null;
    if (!this.shopifyEditPendingBindingMutation && !this.shopifyEditPendingDetailsMutation) this.shopifyEditPendingOwnerScope = null;
    this.shopifyEditSelectedVariantId = null;
    this.shopifyEditSelectedLocationId = null;
    this.shopifyEditSearchQuery = "";
    this.shopifyEditSearchResults = [];
    this.shopifyEditSearchCursor = null;
    this.shopifyEditSearchHasMore = false;
    this.shopifyEditSearchCompleted = false;
    await refreshSummaryAfterSuccess(this);
    return legacyCall ? undefined : result;
  } catch (error) {
    if (definitivePreClaimFailure && shopifyEditRequestIsCurrent(this, captured)) {
      this.shopifyEditPendingCreateMutation = null;
      if (!this.shopifyEditPendingBindingMutation && !this.shopifyEditPendingDetailsMutation) {
        this.shopifyEditPendingOwnerScope = null;
        this.shopifyEditOperationId = null;
      }
    }
    if (shopifyEditRequestIsCurrent(this, captured)) {
      this.shopifyEditError = shopifyUiErrorMessage(error, this.t, "configShopifyDraftCreateError");
      this.shopifyEditRecovery = shopifyUiErrorRecovery(error);
      this.shopifyEditErrorOperation = "create";
    }
    throw error;
  } finally {
    if (shopifyEditRequestIsOwned(this, captured)) this.shopifyEditSaving = false;
  }
}

export const shopifyEditorMethods = {
  async loadShopifyDraftPreview(overrides?: Partial<DraftOverrides>): Promise<ShopifyDraftPreview> {
    const ownerScope = shopifyEditOwnerScope(this);
    clearPendingShopifyAttempts(this, ownerScope);
    if (this.shopifyEditPendingCreateMutation) {
      throw new ShopifyUiError(ShopifyErrorCode.BINDING_CHANGED, "refresh", "configShopifyConflictError");
    }
    const normalizedOverrides = overrides == null ? null : normalizeDraftOverrides(overrides);
    if (overrides != null && !normalizedOverrides) throw new ShopifyUiError(ShopifyErrorCode.PREVIEW_STALE, "refresh", "configShopifyDraftStalePreview");
    const savedLot = this.lots.find(candidate => candidate.id === this.currentLotId);
    if (savedLot && this.currentLotType === "bulk" && !shopifySavedLotFieldsMatch({ name: savedLot.name, externalSku: savedLot.externalSku, image: savedLot.image }, { name: this.renameLotName, externalSku: this.renameLotExternalSku, image: this.renameLotImage })) {
      throw new ShopifyUiError(ShopifyErrorCode.PREVIEW_STALE, "refresh", "configShopifyDraftStalePreview");
    }
    if (!canCreateShopifyDraft(this)) throw new ShopifyUiError(null, "none", "configShopifyDraftNotAvailable");
    cancelShopifyEditSearchTimer(this);
    this.shopifyEditRequestRevision += 1;
    this.shopifyEditLoading = true;
    this.shopifyEditError = null;
    this.shopifyEditRecovery = "none";
    this.shopifyEditErrorOperation = null;
    const captured = { auth: this.googleAuthEpoch, scope: JSON.stringify(shopifyEditScopeBody(this)), lotId: this.currentLotId,
      revision: this.shopifyEditRequestRevision, shop: this.shopifyConnectionShop };
    try {
      const response = await fetchAuthenticatedApiResponse(this, "/integrations/shopify/products/create-preview", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...shopifyEditScopeBody(this), lotId: captured.lotId, manager: true,
          expectedVersion: this.shopifyEditBindingVersion, generation: this.shopifyEditGeneration ?? 0,
          ...(normalizedOverrides ? { overrides: normalizedOverrides } : {}) })
      });
      if (!shopifyEditRequestIsCurrent(this, captured)) throw new ShopifyUiError(ShopifyErrorCode.PREVIEW_STALE, "refresh", "configShopifyDraftStalePreview");
      if (!response.ok) throw await shopifyResponseUiError(response, this.t, "configShopifyDraftPreviewError", "configShopifyDraftStalePreview");
      const payload = await response.json() as { preview?: unknown };
      if (!shopifyEditRequestIsCurrent(this, captured)) throw new ShopifyUiError(ShopifyErrorCode.PREVIEW_STALE, "refresh", "configShopifyDraftStalePreview");
      if (!isShopifyDraftPreview(payload.preview)) throw new Error(this.t("configShopifyDraftPreviewError"));
      if (normalizedOverrides && (payload.preview.title !== normalizedOverrides.title || payload.preview.price !== normalizedOverrides.price || !payload.preview.locations.some(location => location.id === normalizedOverrides.locationId))) {
        throw new ShopifyUiError(ShopifyErrorCode.PREVIEW_STALE, "refresh", "configShopifyDraftStalePreview");
      }
      shopifyDraftPreviewCache.set(this, payload.preview);
      return payload.preview;
    } catch (error) {
      if (shopifyEditRequestIsCurrent(this, captured)) {
        this.shopifyEditError = shopifyEditErrorText(error, this.t, "configShopifyDraftPreviewError");
        this.shopifyEditRecovery = shopifyUiErrorRecovery(error);
        this.shopifyEditErrorOperation = "create";
      }
      throw error;
    } finally {
      if (shopifyEditRequestIsOwned(this, captured)) this.shopifyEditLoading = false;
    }
  },

  createShopifyDraft,

  async saveShopifyBinding(request: BindingMutation): Promise<BindingResult> {
    if (this.shopifyEditSaving) throw new ShopifyUiError(null, "retry", "configShopifyErrorRateLimited");
    const ownerScope = shopifyEditOwnerScope(this);
    clearPendingShopifyAttempts(this, ownerScope);
    const normalized = normalizeBindingMutation(request);
    if (!normalized || normalized.lotId !== this.currentLotId || !shopifyEditSessionIsCurrent(this) || this.shopifyConnectionStatus !== "connected") {
      throw new ShopifyUiError(ShopifyErrorCode.BINDING_CHANGED, "refresh", "configShopifyConflictError");
    }
    const pending = this.shopifyEditPendingBindingMutation;
    if (pending && JSON.stringify(pending) !== JSON.stringify(normalized)) {
      throw new ShopifyUiError(ShopifyErrorCode.BINDING_CHANGED, "refresh", "configShopifyConflictError");
    }
    if (!pending && (normalized.generation !== (this.shopifyEditGeneration ?? 0) || normalized.expectedVersion !== this.shopifyEditBindingVersion)) {
      throw new ShopifyUiError(ShopifyErrorCode.BINDING_CHANGED, "refresh", "configShopifyConflictError");
    }
    const mutation = pending ?? normalized;
    this.shopifyEditPendingBindingMutation = mutation;
    this.shopifyEditPendingOwnerScope = ownerScope;
    this.shopifyEditOperationId = mutation.mutationId;
    cancelShopifyEditSearchTimer(this);
    this.shopifyEditRequestRevision += 1;
    this.shopifyEditLoading = false;
    this.shopifyEditSaving = true;
    this.shopifyEditError = null;
    this.shopifyEditRecovery = "none";
    this.shopifyEditErrorOperation = null;
    const captured = { auth: this.googleAuthEpoch, scope: JSON.stringify(shopifyEditScopeBody(this)), lotId: this.currentLotId,
      revision: this.shopifyEditRequestRevision, shop: this.shopifyConnectionShop };
    let definitiveNoWrite = false;
    try {
      const response = await fetchAuthenticatedApiResponse(this, "/integrations/shopify/products/binding", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...shopifyEditScopeBody(this), ...mutation })
      });
      if (!response.ok) {
        const error = await shopifyResponseUiError(response, this.t, "configShopifyLinkError");
        definitiveNoWrite = response.status === 400 || error.code === ShopifyErrorCode.VARIANT_ALREADY_BOUND || error.code === ShopifyErrorCode.LOCATION_REQUIRED;
        throw error;
      }
      const result = scopedResult(await response.json() as unknown, this);
      if (!shopifyEditRequestIsCurrent(this, captured)) return result;
      if (result.shop !== captured.shop || result.generation !== mutation.generation) throw new ShopifyUiError(ShopifyErrorCode.CONNECTION_CHANGED, "reconnect", "configShopifyErrorConnectionChanged");
      this.shopifyEditListing = result.listing as ShopifyEditListing | null;
      this.shopifyEditBindingVersion = result.bindingVersion ?? result.listing?.version ?? null;
      this.shopifyEditGeneration = result.generation ?? this.shopifyEditGeneration;
      this.shopifyEditListingStatus = "loaded";
      this.shopifyEditPendingBindingMutation = null;
      this.shopifyEditOperationId = this.shopifyEditPendingDetailsMutation?.operationId ?? this.shopifyEditPendingCreateMutation?.operationId ?? null;
      if (!this.shopifyEditPendingDetailsMutation && !this.shopifyEditPendingCreateMutation) this.shopifyEditPendingOwnerScope = null;
      this.shopifyEditSelectedVariantId = null;
      this.shopifyEditSelectedLocationId = null;
      this.shopifyEditSearchResults = [];
      this.shopifyEditSearchCursor = null;
      this.shopifyEditSearchHasMore = false;
      this.shopifyEditSearchCompleted = false;
      await refreshSummaryAfterSuccess(this);
      return result;
    } catch (error) {
      if (shopifyEditRequestIsCurrent(this, captured)) {
        if (definitiveNoWrite) {
          this.shopifyEditPendingBindingMutation = null;
          if (!this.shopifyEditPendingDetailsMutation && !this.shopifyEditPendingCreateMutation) {
            this.shopifyEditPendingOwnerScope = null;
            this.shopifyEditOperationId = null;
          }
        }
        this.shopifyEditError = shopifyEditErrorText(error, this.t, "configShopifyLinkError");
        this.shopifyEditRecovery = shopifyUiErrorRecovery(error);
        this.shopifyEditErrorOperation = "binding";
      }
      throw error;
    } finally {
      if (shopifyEditRequestIsOwned(this, captured)) this.shopifyEditSaving = false;
    }
  },

  async applyShopifyBinding(action: BindingAction, selection?: { variantId?: string; locationId?: string; confirmTransfer?: boolean }): Promise<BindingResult> {
    const ownerScope = shopifyEditOwnerScope(this);
    clearPendingShopifyAttempts(this, ownerScope);
    const pending = this.shopifyEditPendingBindingMutation;
    if (pending) {
      const sameSelection = pending.action === action && pending.variantId === selection?.variantId && pending.locationId === selection?.locationId &&
        Boolean(pending.confirmTransfer) === Boolean(selection?.confirmTransfer);
      if (!sameSelection) throw new ShopifyUiError(ShopifyErrorCode.BINDING_CHANGED, "refresh", "configShopifyConflictError");
      return shopifyEditorMethods.saveShopifyBinding.call(this, pending);
    }
    const request = normalizeBindingMutation({
      lotId: this.currentLotId, mutationId: newShopifyOperationId(), expectedVersion: this.shopifyEditBindingVersion,
      generation: this.shopifyEditGeneration ?? 0, action, ...selection
    });
    if (!request) {
      this.shopifyEditError = this.t("configShopifyChooseLocation");
      this.shopifyEditRecovery = "none";
      this.shopifyEditErrorOperation = "binding";
      throw new ShopifyUiError(null, "none", "configShopifyChooseLocation");
    }
    return shopifyEditorMethods.saveShopifyBinding.call(this, request);
  },

  async saveShopifyProductDetails(draft: ProductDetailsDraft): Promise<ProductDetailsResult> {
    if (this.shopifyEditSaving) throw new ShopifyUiError(null, "retry", "configShopifyErrorRateLimited");
    const ownerScope = shopifyEditOwnerScope(this);
    clearPendingShopifyAttempts(this, ownerScope);
    let mutation = this.shopifyEditPendingDetailsMutation;
    if (!mutation) {
      const listing = this.shopifyEditListing;
      const expectedVersion = this.shopifyEditBindingVersion ?? listing?.version;
      if (!listing || listing.mode !== "linked" || !expectedVersion || !listing.productTitle || !listing.price || !listing.currency ||
        this.shopifyEditListingStatus !== "loaded" || this.shopifyConnectionStatus !== "connected" || !shopifyEditSessionIsCurrent(this)) {
        throw new ShopifyUiError(ShopifyErrorCode.BINDING_CHANGED, "refresh", "configShopifyConflictError");
      }
      mutation = normalizeProductDetailsMutation({
        lotId: this.currentLotId, operationId: newShopifyOperationId(), expectedVersion,
        generation: this.shopifyEditGeneration ?? 0, currency: listing.currency,
        expected: { title: listing.productTitle, price: listing.price }, draft
      });
      if (!mutation) throw new ShopifyUiError(null, "none", "configShopifyDetailsValidationError");
      this.shopifyEditPendingDetailsMutation = mutation;
      this.shopifyEditPendingOwnerScope = ownerScope;
    } else if (mutation.lotId !== this.currentLotId || this.shopifyEditPendingOwnerScope !== ownerScope) {
      throw new ShopifyUiError(ShopifyErrorCode.BINDING_CHANGED, "refresh", "configShopifyConflictError");
    }
    cancelShopifyEditSearchTimer(this);
    this.shopifyEditRequestRevision += 1;
    this.shopifyEditLoading = false;
    this.shopifyEditSaving = true;
    this.shopifyEditError = null;
    this.shopifyEditRecovery = "none";
    this.shopifyEditErrorOperation = null;
    this.shopifyEditOperationId = mutation.operationId;
    const captured = { auth: this.googleAuthEpoch, scope: JSON.stringify(shopifyEditScopeBody(this)), lotId: this.currentLotId,
      revision: this.shopifyEditRequestRevision, shop: this.shopifyConnectionShop };
    try {
      const response = await fetchAuthenticatedApiResponse(this, "/integrations/shopify/products/details", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...shopifyEditScopeBody(this), ...mutation })
      });
      if (!response.ok) throw await shopifyResponseUiError(response, this.t, "configShopifyDetailsSaveError");
      const payload = await response.json() as unknown;
      if (!isRecord(payload) || !isRecord(payload.outcome) || !["confirmed", "pending", "unknown"].includes(String(payload.outcome.title)) ||
        !["confirmed", "pending", "unknown"].includes(String(payload.outcome.price))) throw new Error(this.t("configShopifyDetailsSaveError"));
      const result = scopedResult(payload, this) as ProductDetailsResult;
      result.outcome = { title: payload.outcome.title as ProductDetailsResult["outcome"]["title"], price: payload.outcome.price as ProductDetailsResult["outcome"]["price"] };
      if (!shopifyEditRequestIsCurrent(this, captured)) return result;
      if (result.shop !== captured.shop || result.generation !== mutation.generation) throw new ShopifyUiError(ShopifyErrorCode.CONNECTION_CHANGED, "reconnect", "configShopifyErrorConnectionChanged");
      if (!result.listing || result.listing.mode !== "linked") throw new Error(this.t("configShopifyDetailsSaveError"));
      this.shopifyEditListing = result.listing as ShopifyEditListing | null;
      this.shopifyEditBindingVersion = result.bindingVersion ?? result.listing?.version ?? this.shopifyEditBindingVersion;
      this.shopifyEditGeneration = result.generation ?? this.shopifyEditGeneration;
      this.shopifyEditDetailsOutcome = result.outcome;
      await refreshSummaryAfterSuccess(this);
      if (result.outcome.title === "confirmed" && result.outcome.price === "confirmed") {
        const stillOwnsAttempt = shopifyEditRequestIsOwned(this, captured) && this.shopifyEditPendingDetailsMutation?.operationId === mutation.operationId;
        if (stillOwnsAttempt) {
          this.shopifyEditPendingDetailsMutation = null;
          this.shopifyEditOperationId = this.shopifyEditPendingBindingMutation?.mutationId ?? this.shopifyEditPendingCreateMutation?.operationId ?? null;
          if (!this.shopifyEditPendingBindingMutation && !this.shopifyEditPendingCreateMutation) this.shopifyEditPendingOwnerScope = null;
        }
      }
      return result;
    } catch (error) {
      const detailsChanged = error instanceof ShopifyUiError && error.code === ShopifyErrorCode.DETAILS_CHANGED;
      if (detailsChanged && shopifyEditRequestIsCurrent(this, captured)) {
        this.shopifyEditPendingDetailsMutation = null;
        this.shopifyEditDetailsOutcome = null;
        this.shopifyEditOperationId = this.shopifyEditPendingBindingMutation?.mutationId ?? this.shopifyEditPendingCreateMutation?.operationId ?? null;
        if (!this.shopifyEditPendingBindingMutation && !this.shopifyEditPendingCreateMutation) this.shopifyEditPendingOwnerScope = null;
        this.shopifyEditSaving = false;
      }
      if (shopifyEditRequestIsCurrent(this, captured)) {
        this.shopifyEditError = shopifyEditErrorText(error, this.t, "configShopifyDetailsSaveError");
        this.shopifyEditRecovery = shopifyUiErrorRecovery(error);
        this.shopifyEditErrorOperation = "details";
      }
      if (detailsChanged && shopifyEditRequestIsCurrent(this, captured)) await this.refreshShopifyEditListing();
      throw error;
    } finally {
      if (shopifyEditRequestIsOwned(this, captured)) this.shopifyEditSaving = false;
    }
  },

  resetShopifyEditor(): void {
    cancelShopifyEditSearchTimer(this);
    const ownerScope = shopifyEditOwnerScope(this);
    clearPendingShopifyAttempts(this, ownerScope);
    this.shopifyEditRequestRevision += 1;
    this.shopifyEditListing = null;
    this.shopifyEditSearchQuery = "";
    this.shopifyEditSearchResults = [];
    this.shopifyEditSearchCursor = null;
    this.shopifyEditSearchHasMore = false;
    this.shopifyEditSearchCompleted = false;
    this.shopifyEditSelectedVariantId = null;
    this.shopifyEditSelectedLocationId = null;
    this.shopifyEditLoading = false;
    this.shopifyEditSaving = false;
    this.shopifyEditError = null;
    this.shopifyEditRecovery = "none";
    this.shopifyEditErrorOperation = null;
    this.shopifyEditListingStatus = "idle";
    this.shopifyEditManagerOpen = false;
    if (!this.shopifyEditPendingDetailsMutation) this.shopifyEditDetailsOutcome = null;
    this.shopifyEditOperationId = this.shopifyEditPendingBindingMutation?.mutationId ?? this.shopifyEditPendingDetailsMutation?.operationId ?? this.shopifyEditPendingCreateMutation?.operationId ?? null;
  },

  async loadShopifyLinkedStock(): Promise<ShopifyStockObservation> {
      const listing = this.shopifyEditListing;
      if (!this.showRenameLotModal || !shopifyEditSessionIsCurrent(this) || this.shopifyConnectionStatus !== "connected" || listing?.mode !== "linked") {
        throw new ShopifyUiError(null, "refresh", "configShopifyStockStaleRequest");
      }
      const captured = { auth: this.googleAuthEpoch, scope: JSON.stringify(shopifyEditScopeBody(this)), lotId: this.currentLotId,
        revision: this.shopifyEditRequestRevision, shop: this.shopifyConnectionShop };
      const response = await fetchAuthenticatedApiResponse(this, "/integrations/shopify/products/stock", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...shopifyEditScopeBody(this), lotId: this.currentLotId })
      });
      if (!shopifyEditRequestIsCurrent(this, captured) || this.shopifyEditListing?.variantId !== listing.variantId || this.shopifyEditListing.locationId !== listing.locationId) {
        throw new ShopifyUiError(null, "refresh", "configShopifyStockStaleRequest");
      }
      if (!response.ok) throw await shopifyResponseUiError(response, this.t, "configShopifyStockRefreshError");
      const payload = await response.json() as { observation?: unknown };
      if (!shopifyEditRequestIsCurrent(this, captured)) throw new ShopifyUiError(null, "refresh", "configShopifyStockStaleRequest");
      if (!isShopifyStockObservation(payload.observation) || payload.observation.shop !== captured.shop || payload.observation.variantId !== listing.variantId ||
        payload.observation.inventoryItemId !== listing.inventoryItemId || payload.observation.locationId !== listing.locationId) {
        throw new Error(this.t("configShopifyStockRefreshError"));
      }
      return payload.observation;
    },

  async refreshShopifyEditListing(): Promise<void> {
    if (this.shopifyEditListingStatus === "loading" || this.shopifyConnectionStatus !== "connected" ||
      !shopifyEditSessionIsCurrent(this) || this.currentLotType === "singles") return;
    clearPendingShopifyAttempts(this, shopifyEditOwnerScope(this));
      this.shopifyEditListingStatus = "loading";
      this.shopifyEditError = null;
      this.shopifyEditRecovery = "none";
      this.shopifyEditErrorOperation = null;
      this.shopifyEditRequestRevision += 1;
      const captured = { auth: this.googleAuthEpoch, scope: JSON.stringify(shopifyEditScopeBody(this)), lotId: this.currentLotId, revision: this.shopifyEditRequestRevision, shop: this.shopifyConnectionShop };
      try {
      const response = await fetchAuthenticatedApiResponse(this, "/integrations/shopify/products/listing", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...shopifyEditScopeBody(this), lotId: this.currentLotId, manager: true })
      });
      if (!response.ok) throw await shopifyResponseUiError(response, this.t, "configShopifyListingLoadError");
      const payload = await response.json() as { listing?: ShopifyEditListing | null; bindingVersion?: string | null; generation?: number; shop?: string | null;
        pendingCreateMutation?: unknown; pendingDetailsMutation?: unknown; detailsOutcome?: ProductDetailsResult["outcome"] };
      if (payload.shop != null && payload.shop !== captured.shop) throw new ShopifyUiError(ShopifyErrorCode.CONNECTION_CHANGED, "reconnect", "configShopifyErrorConnectionChanged");
      if (Number.isSafeInteger(payload.generation) && this.shopifyEditGeneration != null && payload.generation !== this.shopifyEditGeneration) {
        throw new ShopifyUiError(ShopifyErrorCode.CONNECTION_CHANGED, "reconnect", "configShopifyErrorConnectionChanged");
      }
      if (shopifyEditRequestIsCurrent(this, captured)) {
        this.shopifyEditListing = payload.listing ?? null;
        this.shopifyEditBindingVersion = typeof payload.bindingVersion === "string" || payload.bindingVersion === null ? payload.bindingVersion : this.shopifyEditBindingVersion;
        this.shopifyEditGeneration = Number.isSafeInteger(payload.generation) ? Number(payload.generation) : this.shopifyEditGeneration;
        const pendingCreate = normalizeDraftCreateMutation(payload.pendingCreateMutation);
        const pendingDetails = normalizeProductDetailsMutation(payload.pendingDetailsMutation);
        if (pendingCreate && pendingCreate.lotId === captured.lotId && pendingCreate.generation === this.shopifyEditGeneration &&
          pendingCreate.expectedVersion === this.shopifyEditBindingVersion && !this.shopifyEditPendingCreateMutation) {
          this.shopifyEditPendingCreateMutation = pendingCreate;
          this.shopifyEditPendingOwnerScope = shopifyEditOwnerScope(this);
          this.shopifyEditOperationId = pendingCreate.operationId;
        }
        if (pendingDetails && pendingDetails.lotId === captured.lotId && pendingDetails.generation === this.shopifyEditGeneration &&
          pendingDetails.expectedVersion === this.shopifyEditBindingVersion && !this.shopifyEditPendingDetailsMutation) {
          this.shopifyEditPendingDetailsMutation = pendingDetails;
          this.shopifyEditDetailsOutcome = payload.detailsOutcome ?? null;
          this.shopifyEditPendingOwnerScope = shopifyEditOwnerScope(this);
          this.shopifyEditOperationId = pendingDetails.operationId;
        }
        this.shopifyEditListingStatus = "loaded";
          if (this.shopifyEditListing) {
            this.shopifyEditSelectedVariantId = null;
            this.shopifyEditSelectedLocationId = null;
            this.shopifyEditSearchQuery = "";
            this.shopifyEditSearchResults = [];
            this.shopifyEditSearchCursor = null;
            this.shopifyEditSearchHasMore = false;
            this.shopifyEditSearchCompleted = false;
          }
        }
      } catch (error) {
        if (shopifyEditRequestIsCurrent(this, captured)) {
          this.shopifyEditListingStatus = "error";
          this.shopifyEditError = shopifyEditErrorText(error, this.t, "configShopifyListingLoadError"); this.shopifyEditRecovery = shopifyUiErrorRecovery(error); this.shopifyEditErrorOperation = "listing";
        }
      } finally {
        if (shopifyEditRequestIsOwned(this, captured) && !shopifyEditRequestIsCurrent(this, captured)) {
          this.shopifyEditListingStatus = "error";
          this.shopifyEditError = this.t("configShopifyErrorConnectionChanged"); this.shopifyEditRecovery = "refresh"; this.shopifyEditErrorOperation = "listing";
        }
      }
    },

  onShopifyEditQueryChange(value: string): void {
      if (this.shopifyEditSearchResults.some((result) => value === shopifyVariantLabel(result, this.t("configShopifyNoSku")))) return;
      cancelShopifyEditSearchTimer(this);
      this.shopifyEditSearchQuery = value;
      this.shopifyEditError = null;
      this.shopifyEditRecovery = "none";
      this.shopifyEditErrorOperation = null;
      this.shopifyEditRequestRevision += 1;
      this.shopifyEditLoading = false;
      this.shopifyEditSearchResults = [];
      this.shopifyEditSearchCursor = null;
      this.shopifyEditSearchHasMore = false;
      this.shopifyEditSearchCompleted = false;
      this.shopifyEditSelectedVariantId = null;
      this.shopifyEditSelectedLocationId = null;
      if (value.trim().length >= 2) {
        const scheduledRevision = this.shopifyEditRequestRevision;
        shopifyEditSearchTimers.set(this, setTimeout(() => {
          shopifyEditSearchTimers.delete(this);
          if (this.showRenameLotModal && this.shopifyEditRequestRevision === scheduledRevision) {
            void shopifyEditorMethods.searchShopifyEditProducts.call(this, false);
          }
        }, 300));
      }
    },

  restoreShopifyEditSelection(selection: { query: string; variantId: string | null; locationId: string | null; product: ShopifyVariantSearchResult | null }): void {
      if (this.shopifyEditSaving || !this.showRenameLotModal || !shopifyEditSessionIsCurrent(this)) return;
      cancelShopifyEditSearchTimer(this);
      this.shopifyEditRequestRevision += 1;
      this.shopifyEditLoading = false;
      this.shopifyEditSearchQuery = selection.query;
      this.shopifyEditSearchResults = selection.product ? [selection.product] : [];
      this.shopifyEditSearchCursor = null;
      this.shopifyEditSearchHasMore = false;
      this.shopifyEditSearchCompleted = Boolean(selection.product);
      this.shopifyEditSelectedVariantId = selection.variantId;
      this.shopifyEditSelectedLocationId = selection.locationId;
      this.shopifyEditError = null;
      this.shopifyEditRecovery = "none";
      this.shopifyEditErrorOperation = null;
    },

  selectShopifyEditVariant(variantId: string): void {
      if (!variantId) {
        this.shopifyEditSelectedVariantId = null;
        this.shopifyEditSelectedLocationId = null;
        cancelShopifyEditSearchTimer(this);
        this.shopifyEditSearchQuery = "";
        this.shopifyEditSearchResults = [];
        this.shopifyEditSearchCursor = null;
        this.shopifyEditSearchHasMore = false;
        this.shopifyEditSearchCompleted = false;
        this.shopifyEditRequestRevision += 1;
        this.shopifyEditLoading = false;
        return;
      }
      const selected = this.shopifyEditSearchResults.find((result) => result.variantId === variantId);
      this.shopifyEditSelectedVariantId = selected?.variantId ?? null;
      this.shopifyEditSelectedLocationId = selected?.locations.length === 1 ? selected.locations[0]!.id : null;
    },

  selectShopifyEditLocation(locationId: string): void {
      const selected = this.shopifyEditSearchResults.find((result) => result.variantId === this.shopifyEditSelectedVariantId);
      this.shopifyEditSelectedLocationId = selected?.locations.some((location) => location.id === locationId) ? locationId : null;
    },

  async searchShopifyEditProducts(loadMore = false): Promise<void> {
      if (this.shopifyEditLoading || this.shopifyEditListingStatus !== "loaded" || this.shopifyEditListing || this.shopifyConnectionStatus !== "connected" || !shopifyEditSessionIsCurrent(this)) return;
      const query = this.shopifyEditSearchQuery.trim();
      if (query.length < 2) return;
      if (loadMore && (!this.shopifyEditSearchHasMore || !this.shopifyEditSearchCursor)) return;
      if (!loadMore) {
        this.shopifyEditSearchResults = [];
        this.shopifyEditSearchCursor = null;
        this.shopifyEditSearchHasMore = false;
        this.shopifyEditSelectedVariantId = null;
        this.shopifyEditSelectedLocationId = null;
      }
      this.shopifyEditError = null;
      this.shopifyEditRecovery = "none";
      this.shopifyEditErrorOperation = null;
      this.shopifyEditLoading = true;
      this.shopifyEditRequestRevision += 1;
      const captured = { auth: this.googleAuthEpoch, scope: JSON.stringify(shopifyEditScopeBody(this)), lotId: this.currentLotId, revision: this.shopifyEditRequestRevision, shop: this.shopifyConnectionShop };
      try {
        const response = await fetchAuthenticatedApiResponse(this, "/integrations/shopify/products/search", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...shopifyEditScopeBody(this), query, ...(loadMore && this.shopifyEditSearchCursor ? { after: this.shopifyEditSearchCursor } : {}) })
        });
        if (!response.ok) throw await shopifyResponseUiError(response, this.t, "configShopifySearchError");
        const page = await response.json() as { variants: ShopifyVariantSearchResult[]; matchedVariantCount?: number; excludedVariantCount?: number; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
        if (!shopifyEditRequestIsCurrent(this, captured)) return;
        this.shopifyEditSearchResults = loadMore ? [...this.shopifyEditSearchResults, ...page.variants] : page.variants;
        this.shopifyEditSearchHasMore = page.pageInfo.hasNextPage;
        this.shopifyEditSearchCursor = page.pageInfo.endCursor;
        this.shopifyEditSearchCompleted = true;
        if (!this.shopifyEditSearchResults.length && (page.matchedVariantCount ?? 0) > 0 && page.excludedVariantCount === page.matchedVariantCount) {
          this.shopifyEditError = this.t("configShopifyNoEligibleResults");
          this.shopifyEditRecovery = "none";
          this.shopifyEditErrorOperation = "search";
        }
      } catch (error) {
        if (shopifyEditRequestIsCurrent(this, captured)) { this.shopifyEditError = shopifyEditErrorText(error, this.t, "configShopifySearchError"); this.shopifyEditRecovery = shopifyUiErrorRecovery(error); this.shopifyEditErrorOperation = "search"; }
      } finally {
        if (shopifyEditRequestIsOwned(this, captured)) this.shopifyEditLoading = false;
      }
    }
} satisfies Pick<ConfigLotMethodImplementation,
  | "loadShopifyDraftPreview" | "createShopifyDraft" | "refreshShopifyEditListing" | "loadShopifyLinkedStock"
  | "onShopifyEditQueryChange" | "restoreShopifyEditSelection" | "selectShopifyEditVariant"
  | "selectShopifyEditLocation" | "searchShopifyEditProducts" | "saveShopifyBinding"
  | "applyShopifyBinding" | "saveShopifyProductDetails" | "resetShopifyEditor"
> & ThisType<LotConfigurationContext>;
