import type { ShopifyEditListing } from "../../../../types/app.ts";
import { ShopifyErrorCode, ShopifyUiError, shopifyResponseUiError, shopifyUiErrorRecovery } from "../../../../domain/shopify-ui-error.ts";
import { normalizeProductDetailsMutation, type ProductDetailsDraft, type ProductDetailsResult } from "../../../../../shared/shopify-product-manager.ts";
import type { ConfigLotMethodImplementation, LotConfigurationContext } from "../../../context/commerce.ts";
import { isApiRequestAborted } from "../common/api-client.ts";
import { createShopifyEditorClient } from "./shopify-editor-client.ts";
import { cancelShopifyEditSearchTimer, shopifyEditScopeBody, shopifyEditRequestIsOwned, shopifyEditRequestIsCurrent, shopifyEditSessionIsCurrent, shopifyEditErrorText, shopifyEditOwnerScope, newShopifyOperationId, isRecord, scopedResult, refreshSummaryAfterSuccess, clearPendingShopifyAttempts } from "./shopify-editor-support.ts";

export const detailsShopifyController = {
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
      const response = await createShopifyEditorClient(this).post("details", {
        ...shopifyEditScopeBody(this), ...mutation
      }, { retryUnsafeMethods: true });
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
      if (isApiRequestAborted(error)) throw error;
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
  }
} satisfies Pick<ConfigLotMethodImplementation, | "saveShopifyProductDetails"> & ThisType<LotConfigurationContext>;
