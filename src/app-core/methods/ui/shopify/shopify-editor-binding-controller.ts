import type { ShopifyEditListing } from "../../../../types/app.ts";
import { ShopifyErrorCode, ShopifyUiError, shopifyResponseUiError, shopifyUiErrorRecovery } from "../../../../domain/shopify-ui-error.ts";
import { normalizeBindingMutation, type BindingAction, type BindingMutation, type BindingResult } from "../../../../../shared/shopify-product-manager.ts";
import type { ConfigLotMethodImplementation, LotConfigurationContext } from "../../../context/commerce.ts";
import { isApiRequestAborted } from "../common/api-client.ts";
import { createShopifyEditorClient } from "./shopify-editor-client.ts";
import { cancelShopifyEditSearchTimer, shopifyEditScopeBody, shopifyEditRequestIsOwned, shopifyEditRequestIsCurrent, shopifyEditSessionIsCurrent, shopifyEditErrorText, shopifyEditOwnerScope, newShopifyOperationId, scopedResult, refreshSummaryAfterSuccess, clearPendingShopifyAttempts } from "./shopify-editor-support.ts";

export const bindingShopifyController = {
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
      const response = await createShopifyEditorClient(this).post("binding", {
        ...shopifyEditScopeBody(this), ...mutation
      }, { retryUnsafeMethods: true });
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
      if (isApiRequestAborted(error)) throw error;
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
      return bindingShopifyController.saveShopifyBinding.call(this, pending);
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
    return bindingShopifyController.saveShopifyBinding.call(this, request);
  }
} satisfies Pick<ConfigLotMethodImplementation, | "saveShopifyBinding" | "applyShopifyBinding"> & ThisType<LotConfigurationContext>;
