import { ShopifyErrorCode, ShopifyUiError, shopifyResponseUiError, shopifyUiErrorRecovery } from "../../../../domain/shopify-ui-error.ts";
import { isShopifyStockObservation, type ShopifyStockObservation } from "../../../../../shared/shopify-stock.ts";
import { normalizeDraftCreateMutation, normalizeProductDetailsMutation, type ProductDetailsResult } from "../../../../../shared/shopify-product-manager.ts";
import type { ShopifyEditListing } from "../../../../types/app.ts";
import type { ConfigLotMethodImplementation, LotConfigurationContext } from "../../../context/commerce.ts";
import { isApiRequestAborted } from "../common/api-client.ts";
import { createShopifyEditorClient } from "./shopify-editor-client.ts";
import { cancelShopifyEditSearchTimer, shopifyEditScopeBody, type ShopifyEditRequestContext, shopifyEditRequestIsOwned, shopifyEditRequestIsCurrent, shopifyEditSessionIsCurrent, shopifyEditErrorText, shopifyEditOwnerScope, isRecord, scopedResult, clearPendingShopifyAttempts } from "./shopify-editor-support.ts";

export const sessionShopifyController = {
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
      const response = await createShopifyEditorClient(this).post("stock", {
        ...shopifyEditScopeBody(this), lotId: this.currentLotId
      }, { retryUnsafeMethods: true });
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
    const previousListingStatus = this.shopifyEditListingStatus;
    const previousErrorState = {
      error: this.shopifyEditError,
      recovery: this.shopifyEditRecovery,
      operation: this.shopifyEditErrorOperation
    };
    this.shopifyEditListingStatus = "loading";
    this.shopifyEditError = null;
    this.shopifyEditRecovery = "none";
    this.shopifyEditErrorOperation = null;
    this.shopifyEditRequestRevision += 1;
    const captured = { auth: this.googleAuthEpoch, scope: JSON.stringify(shopifyEditScopeBody(this)), lotId: this.currentLotId, revision: this.shopifyEditRequestRevision, shop: this.shopifyConnectionShop };
    try {
      const response = await createShopifyEditorClient(this).post("listing", {
        ...shopifyEditScopeBody(this), lotId: this.currentLotId, manager: true
      }, { retryUnsafeMethods: true });
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
        if (isApiRequestAborted(error)) {
          if (shopifyEditRequestIsCurrent(this, captured)) {
            this.shopifyEditListingStatus = previousListingStatus;
            this.shopifyEditError = previousErrorState.error;
            this.shopifyEditRecovery = previousErrorState.recovery;
            this.shopifyEditErrorOperation = previousErrorState.operation;
          }
          return;
        }
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
    }
} satisfies Pick<ConfigLotMethodImplementation, | "resetShopifyEditor" | "loadShopifyLinkedStock" | "refreshShopifyEditListing"> & ThisType<LotConfigurationContext>;
