import type { ShopifyVariantSearchResult } from "../../../../types/app.ts";
import { ShopifyUiError, shopifyResponseUiError, shopifyUiErrorRecovery } from "../../../../domain/shopify-ui-error.ts";
import type { ConfigLotMethodImplementation, LotConfigurationContext } from "../../../context/commerce.ts";
import { isApiRequestAborted } from "../common/api-client.ts";
import { createShopifyEditorClient } from "./shopify-editor-client.ts";
import { shopifyVariantLabel, shopifyEditScopeBody, shopifyEditRequestIsOwned, shopifyEditRequestIsCurrent, shopifyEditSessionIsCurrent, shopifyEditErrorText, shopifyEditSearchLifecycle } from "./shopify-editor-support.ts";

export const searchShopifyController = {
  onShopifyEditQueryChange(value: string): void {
      if (this.shopifyEditSearchResults.some((result) => value === shopifyVariantLabel(result, this.t("configShopifyNoSku")))) return;
      shopifyEditSearchLifecycle(this).clear();
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
        shopifyEditSearchLifecycle(this).schedule(value, 300, async () => {
          if (this.showRenameLotModal && this.shopifyEditRequestRevision === scheduledRevision) {
            await searchShopifyController.searchShopifyEditProducts.call(this, false);
          }
          return [];
        });
      }
    },

  restoreShopifyEditSelection(selection: { query: string; variantId: string | null; locationId: string | null; product: ShopifyVariantSearchResult | null }): void {
      if (this.shopifyEditSaving || !this.showRenameLotModal || !shopifyEditSessionIsCurrent(this)) return;
      shopifyEditSearchLifecycle(this).clear();
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
        shopifyEditSearchLifecycle(this).clear();
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
        const lifecycle = shopifyEditSearchLifecycle(this);
        await lifecycle.execute(query, async (_query, signal) => {
        const response = await createShopifyEditorClient(this).post("search", {
          ...shopifyEditScopeBody(this), query, ...(loadMore && this.shopifyEditSearchCursor ? { after: this.shopifyEditSearchCursor } : {})
        }, { retryUnsafeMethods: true, signal });
        if (!response.ok) throw await shopifyResponseUiError(response, this.t, "configShopifySearchError");
        const page = await response.json() as { variants: ShopifyVariantSearchResult[]; matchedVariantCount?: number; excludedVariantCount?: number; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
        if (!shopifyEditRequestIsCurrent(this, captured)) return [];
        return [page];
        });
        if (!shopifyEditRequestIsCurrent(this, captured)) return;
        const lifecycleState = lifecycle.snapshot();
        if (lifecycleState.phase === "error") throw lifecycleState.error;
        const page = lifecycleState.results[0] as { variants: ShopifyVariantSearchResult[]; matchedVariantCount?: number; excludedVariantCount?: number; pageInfo: { hasNextPage: boolean; endCursor: string | null } } | undefined;
        if (!page) return;
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
        if (isApiRequestAborted(error)) return;
        if (shopifyEditRequestIsCurrent(this, captured)) { this.shopifyEditError = shopifyEditErrorText(error, this.t, "configShopifySearchError"); this.shopifyEditRecovery = shopifyUiErrorRecovery(error); this.shopifyEditErrorOperation = "search"; }
      } finally {
        if (shopifyEditRequestIsOwned(this, captured)) this.shopifyEditLoading = false;
      }
    }
} satisfies Pick<ConfigLotMethodImplementation, | "onShopifyEditQueryChange" | "restoreShopifyEditSelection" | "selectShopifyEditVariant" | "selectShopifyEditLocation" | "searchShopifyEditProducts"> & ThisType<LotConfigurationContext>;
