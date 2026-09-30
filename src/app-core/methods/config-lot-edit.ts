import type { ShopifyEditListing, ShopifyVariantSearchResult } from "../../types/app.ts";
import { normalizeWhatnotVertical } from "../../domain/whatnot-fees.ts";
import type { ConfigLotMethodImplementation, LotConfigurationContext } from "../context/commerce.ts";
import { isSinglesLot } from "../shared/lot-types.ts";
import { validateRenameLotName } from "./config-lot-crud.ts";
import { fetchAuthenticatedApiResponse } from "./ui/common/api-client.ts";
import { queueCloudConfigSyncPush, queueWorkspaceConfigSyncPush } from "./ui/workspace/workspace-config-sync.ts";

const shopifyEditSearchTimers = new WeakMap<object, ReturnType<typeof setTimeout>>();

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
function closeShopifyEditState(context: { shopifyEditRequestRevision: number; shopifyEditLoading: boolean; shopifyEditSaving: boolean; shopifyEditSearchResults: ShopifyVariantSearchResult[]; shopifyEditSearchCompleted: boolean; shopifyEditSelectedVariantId: string | null; shopifyEditSelectedLocationId: string | null; shopifyEditError: string | null; shopifyEditListingStatus: "idle" | "loading" | "loaded" | "error"; showRenameLotModal: boolean }): void {
  context.shopifyEditRequestRevision += 1;
  context.shopifyEditLoading = false;
  context.shopifyEditSaving = false;
  context.shopifyEditSearchResults = [];
  context.shopifyEditSearchCompleted = false;
  context.shopifyEditSelectedVariantId = null;
  context.shopifyEditSelectedLocationId = null;
  context.shopifyEditError = null;
  context.shopifyEditListingStatus = "idle";
  context.showRenameLotModal = false;
}
function shopifyEditErrorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
async function shopifyResponseError(response: Response, conflict: string, fallback: string): Promise<string> {
  try {
    const body = await response.json() as { error?: unknown; message?: unknown };
    const message = typeof body.error === "string" ? body.error : typeof body.message === "string" ? body.message : "";
    if (message) return message;
  } catch { /* Use the localized fallback when the error response has no JSON detail. */ }
  return response.status === 409 ? conflict : fallback;
}


export const configLotEditMethods = {
  openRenameLotModal(): void {
    cancelShopifyEditSearchTimer(this);
    if (!this.currentLotId) {
      this.notify("Select a lot first", "warning");
      return;
    }
    const lot = this.lots.find((p) => p.id === this.currentLotId);
    if (!lot) return;
    this.renameLotName = lot.name;
    this.renameLotWhatnotVertical = normalizeWhatnotVertical(lot.whatnotVertical);
    this.renameLotExternalSku = typeof lot.externalSku === "string" ? lot.externalSku : "";
    this.renameLotShopifyEnabled = lot.shopifyEnabled === true;
    this.shopifyEditListing = null;
    this.shopifyEditSearchQuery = "";
    this.shopifyEditSearchResults = [];
    this.shopifyEditSearchCursor = null;
    this.shopifyEditSearchHasMore = false;
    this.shopifyEditSearchCompleted = false;
    this.shopifyEditSelectedVariantId = null;
    this.shopifyEditSelectedLocationId = null;
    this.shopifyEditError = null;
    this.shopifyEditRequestRevision += 1;
    this.shopifyEditSessionAuthEpoch = this.googleAuthEpoch;
    this.shopifyEditSessionScope = JSON.stringify(shopifyEditScopeBody(this));
    this.shopifyEditSessionLotId = lot.id;
    this.shopifyEditLoading = false;
    this.shopifyEditSaving = false;
    this.shopifyEditListingStatus = "idle";
    this.showRenameLotModal = true;
    if (this.shopifyConnectionStatus === "connected" && !isSinglesLot(lot)) void this.refreshShopifyEditListing();
  },

  async refreshShopifyEditListing(): Promise<void> {
    if (this.shopifyEditListingStatus === "loading" || this.shopifyConnectionStatus !== "connected" ||
      !shopifyEditSessionIsCurrent(this) || this.currentLotType === "singles") return;
    this.shopifyEditListingStatus = "loading";
    this.shopifyEditError = null;
    this.shopifyEditRequestRevision += 1;
    const captured = { auth: this.googleAuthEpoch, scope: JSON.stringify(shopifyEditScopeBody(this)), lotId: this.currentLotId, revision: this.shopifyEditRequestRevision, shop: this.shopifyConnectionShop };
    try {
      const response = await fetchAuthenticatedApiResponse(this, "/integrations/shopify/products/listing", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...shopifyEditScopeBody(this), lotId: this.currentLotId })
      });
      if (!response.ok) throw new Error(this.t("configShopifyListingLoadError"));
      const payload = await response.json() as { listing?: ShopifyEditListing | null };
      if (shopifyEditRequestIsCurrent(this, captured)) {
        this.shopifyEditListing = payload.listing ?? null;
        this.shopifyEditListingStatus = "loaded";
      }
    } catch (error) {
      if (shopifyEditRequestIsCurrent(this, captured)) {
        this.shopifyEditListingStatus = "error";
        this.shopifyEditError = shopifyEditErrorText(error, this.t("configShopifyListingLoadError"));
      }
    } finally {
      if (shopifyEditRequestIsOwned(this, captured) && !shopifyEditRequestIsCurrent(this, captured)) {
        this.shopifyEditListingStatus = "error";
        this.shopifyEditError = this.t("configShopifyListingLoadError");
      }
    }
  },

  closeRenameLotModal(): void {
    cancelShopifyEditSearchTimer(this);
    closeShopifyEditState(this);
  },

  onShopifyEditQueryChange(value: string): void {
    if (this.shopifyEditSearchResults.some((result) => value === shopifyVariantLabel(result, this.t("configShopifyNoSku")))) return;
    cancelShopifyEditSearchTimer(this);
    this.shopifyEditSearchQuery = value;
    this.shopifyEditError = null;
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
          void configLotEditMethods.searchShopifyEditProducts.call(this, false);
        }
      }, 300));
    }
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
    this.shopifyEditLoading = true;
    this.shopifyEditRequestRevision += 1;
    const captured = { auth: this.googleAuthEpoch, scope: JSON.stringify(shopifyEditScopeBody(this)), lotId: this.currentLotId, revision: this.shopifyEditRequestRevision, shop: this.shopifyConnectionShop };
    try {
      const response = await fetchAuthenticatedApiResponse(this, "/integrations/shopify/products/search", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...shopifyEditScopeBody(this), query, ...(loadMore && this.shopifyEditSearchCursor ? { after: this.shopifyEditSearchCursor } : {}) })
      });
      if (!response.ok) throw new Error(await shopifyResponseError(response, this.t("configShopifyConflictError"), this.t("configShopifySearchError")));
      const page = await response.json() as { variants: ShopifyVariantSearchResult[]; matchedVariantCount?: number; excludedVariantCount?: number; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
      if (!shopifyEditRequestIsCurrent(this, captured)) return;
      this.shopifyEditSearchResults = loadMore ? [...this.shopifyEditSearchResults, ...page.variants] : page.variants;
      this.shopifyEditSearchHasMore = page.pageInfo.hasNextPage;
      this.shopifyEditSearchCursor = page.pageInfo.endCursor;
      this.shopifyEditSearchCompleted = true;
      if (!this.shopifyEditSearchResults.length && (page.matchedVariantCount ?? 0) > 0 && page.excludedVariantCount === page.matchedVariantCount) {
        this.shopifyEditError = this.t("configShopifyNoEligibleResults");
      }
    } catch (error) {
      if (shopifyEditRequestIsCurrent(this, captured)) this.shopifyEditError = shopifyEditErrorText(error, this.t("configShopifySearchError"));
    } finally {
      if (shopifyEditRequestIsOwned(this, captured)) this.shopifyEditLoading = false;
    }
  },

  async renameCurrentLot(): Promise<void> {
    if (this.shopifyEditSaving) return;
    if (this.shopifyEditSessionLotId != null && (!this.showRenameLotModal || !shopifyEditSessionIsCurrent(this))) {
      this.shopifyEditError = this.t("configShopifyStaleLotError");
      return;
    }
    if (!this.currentLotId) {
      this.notify("Select a lot first", "warning");
      return;
    }
    const lot = this.lots.find((p) => p.id === this.currentLotId);
    if (!lot) return;
    const renameResult = validateRenameLotName(this.lots, lot, this.renameLotName);
    if (!renameResult.ok) {
      this.notify(renameResult.message, "warning");
      return;
    }
    const nextVertical = normalizeWhatnotVertical(this.renameLotWhatnotVertical);
    const nextSku = (this.renameLotExternalSku ?? "").trim();
    const nextShopifyEnabled = this.renameLotShopifyEnabled === true;
    const categoryChanged = normalizeWhatnotVertical(lot.whatnotVertical) !== nextVertical;
    const skuChanged = (lot.externalSku ?? "") !== nextSku;
    const publishChanged = (lot.shopifyEnabled === true) !== nextShopifyEnabled;
    if (this.shopifyEditSelectedVariantId) {
      if (this.shopifyEditListingStatus !== "loaded" || this.shopifyEditListing) {
        this.shopifyEditError = this.t("configShopifyListingLoadError");
        return;
      }
      const selected = this.shopifyEditSearchResults.find((item) => item.variantId === this.shopifyEditSelectedVariantId);
      const locationId = this.shopifyEditSelectedLocationId;
      if (!selected || !locationId || !selected.locations.some((location) => location.id === locationId)) {
        this.shopifyEditError = this.t("configShopifyChooseLocation");
        return;
      }
      this.shopifyEditSaving = true;
      this.shopifyEditError = null;
      this.shopifyEditRequestRevision += 1;
      const captured = { auth: this.googleAuthEpoch, scope: JSON.stringify(shopifyEditScopeBody(this)), lotId: lot.id, revision: this.shopifyEditRequestRevision, shop: this.shopifyConnectionShop };
      try {
        const response = await fetchAuthenticatedApiResponse(this, "/integrations/shopify/products/link", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...shopifyEditScopeBody(this), lotId: lot.id, variantId: selected.variantId, locationId })
        });
        if (!response.ok) throw new Error(await shopifyResponseError(response, this.t("configShopifyConflictError"), this.t("configShopifyLinkError")));
        const payload = await response.json() as { listing: ShopifyEditListing };
        if (!shopifyEditRequestIsCurrent(this, captured)) return;
        this.shopifyEditListing = payload.listing;
      } catch (error) {
        if (shopifyEditRequestIsCurrent(this, captured)) this.shopifyEditError = shopifyEditErrorText(error, this.t("configShopifyLinkError"));
        return;
      } finally {
        if (shopifyEditRequestIsOwned(this, captured)) this.shopifyEditSaving = false;
      }
    }
    if (!renameResult.changed && !categoryChanged && !skuChanged && !publishChanged) {
      closeShopifyEditState(this);
      return;
    }
    if (renameResult.changed) lot.name = renameResult.nextName;
    lot.whatnotVertical = nextVertical;
    lot.externalSku = nextSku;
    lot.shopifyEnabled = nextShopifyEnabled;
    this.externalSku = nextSku;
    this.shopifyEnabled = nextShopifyEnabled;
    this.whatnotVertical = nextVertical;
    this.saveLotsToStorage();
    queueWorkspaceConfigSyncPush(this);
    if (categoryChanged || skuChanged || publishChanged) queueCloudConfigSyncPush(this);
    closeShopifyEditState(this);
    this.renameLotName = "";
    this.renameLotWhatnotVertical = nextVertical;
    if (this.currentTab === "portfolio") void this.$nextTick(() => this.initPortfolioChart());
    if (renameResult.changed) this.notify("Lot renamed", "success");
  },

} satisfies Pick<ConfigLotMethodImplementation,
  | "openRenameLotModal"
  | "closeRenameLotModal"
  | "refreshShopifyEditListing"
  | "onShopifyEditQueryChange"
  | "selectShopifyEditVariant"
  | "selectShopifyEditLocation"
  | "searchShopifyEditProducts"
  | "renameCurrentLot"
> & ThisType<LotConfigurationContext>;
