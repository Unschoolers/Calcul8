import type { ShopifyEditListing } from "../../../../types/app.ts";
import { isShopifyDraftPreview, type ShopifyDraftPreview } from "../../../../domain/shopify-draft.ts";
import { ShopifyErrorCode, ShopifyUiError, shopifyResponseUiError, shopifyUiErrorMessage, shopifyUiErrorRecovery, shopifySavedLotFieldsMatch } from "../../../../domain/shopify-ui-error.ts";
import { normalizeDraftCreateMutation, normalizeDraftOverrides, type BindingResult, type DraftOverrides } from "../../../../../shared/shopify-product-manager.ts";
import type { ConfigLotMethodImplementation, LotConfigurationContext } from "../../../context/commerce.ts";
import { isApiRequestAborted } from "../common/api-client.ts";
import { createShopifyEditorClient } from "./shopify-editor-client.ts";
import { shopifyDraftPreviewCache, cancelShopifyEditSearchTimer, shopifyEditScopeBody, shopifyEditRequestIsOwned, shopifyEditRequestIsCurrent, shopifyEditSessionIsCurrent, shopifyEditErrorText, shopifyEditOwnerScope, newShopifyOperationId, scopedResult, refreshSummaryAfterSuccess, clearPendingShopifyAttempts, canCreateShopifyDraft } from "./shopify-editor-support.ts";

export async function createShopifyDraft(this: LotConfigurationContext, overrides: DraftOverrides, previewToken: string): Promise<BindingResult>;
export async function createShopifyDraft(this: LotConfigurationContext, locationId: string, previewToken: string): Promise<void>;
export async function createShopifyDraft(this: LotConfigurationContext, input: DraftOverrides | string, previewToken: string): Promise<BindingResult | void> {
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
    const response = await createShopifyEditorClient(this).post("create", {
      ...shopifyEditScopeBody(this), ...mutation
    }, { retryUnsafeMethods: true });
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
    if (isApiRequestAborted(error)) throw error;
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

export const createShopifyController = {
  createShopifyDraft,

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
      const response = await createShopifyEditorClient(this).post("createPreview", {
        ...shopifyEditScopeBody(this), lotId: captured.lotId, manager: true,
          expectedVersion: this.shopifyEditBindingVersion, generation: this.shopifyEditGeneration ?? 0,
          ...(normalizedOverrides ? { overrides: normalizedOverrides } : {})
      }, { retryUnsafeMethods: true });
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
      if (isApiRequestAborted(error)) throw error;
      if (shopifyEditRequestIsCurrent(this, captured)) {
        this.shopifyEditError = shopifyEditErrorText(error, this.t, "configShopifyDraftPreviewError");
        this.shopifyEditRecovery = shopifyUiErrorRecovery(error);
        this.shopifyEditErrorOperation = "create";
      }
      throw error;
    } finally {
      if (shopifyEditRequestIsOwned(this, captured)) this.shopifyEditLoading = false;
    }
  }
} satisfies Pick<ConfigLotMethodImplementation, | "loadShopifyDraftPreview" | "createShopifyDraft"> & ThisType<LotConfigurationContext>;
