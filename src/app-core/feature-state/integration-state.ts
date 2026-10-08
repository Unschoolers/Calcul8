import type { AppState } from "../../types/app.ts";

export const INTEGRATION_FEATURE_STATE_KEYS = [
  "whatnotFeeDateOnly", "whatnotConnectionStatus", "whatnotSyncStatus", "whatnotConnectionSummary",
  "whatnotCallbackStatus", "whatnotCallbackMessage", "whatnotCsvRawInput", "whatnotCsvSellerAccountId",
  "whatnotCsvHeaders", "whatnotCsvRows", "whatnotCsvMapExternalSaleId", "whatnotCsvMapOrderId",
  "whatnotCsvMapOrderItemId", "whatnotCsvMapSellerAccountId", "whatnotCsvMapTitle", "whatnotCsvMapListingTitle",
  "whatnotCsvMapBuyerName", "whatnotCsvMapOrderPlacedAt", "whatnotCsvMapOriginalItemPrice", "whatnotCsvMapSku",
  "whatnotCsvMapProductCategory", "whatnotCsvMapQuantity", "whatnotCsvMapPrice", "whatnotCsvMapBuyerShipping",
  "whatnotCsvMapDate", "whatnotCsvMapOrderStatus", "whatnotReviewBatchId", "whatnotReviewRows",
  "isConfirmingWhatnotImport", "whatnotConfirmationRetryPayload", "showWhatnotReviewDialog", "showWhatnotCsvImportDialog",
  "shopifyConnectionStatus", "shopifyConnectionShop", "shopifyLastSyncedAt", "shopifySyncError", "shopifyShopDraft",
  "showShopifyConnectDialog", "shopifyBindingsSummary", "shopifyBindingsStatus", "shopifyBindingsStale", "shopifyBindingsScope",
  "shopifyEditListing", "shopifyEditSearchQuery", "shopifyEditSearchResults", "shopifyEditSearchCursor",
  "shopifyEditSearchHasMore", "shopifyEditSearchCompleted", "shopifyEditSelectedVariantId", "shopifyEditSelectedLocationId",
  "shopifyEditLoading", "shopifyEditSaving", "shopifyEditError", "shopifyEditRecovery", "shopifyEditErrorOperation",
  "shopifyEditRequestRevision", "shopifyEditListingStatus", "shopifyEditSessionAuthEpoch", "shopifyEditSessionScope",
  "shopifyEditSessionLotId", "shopifyEditBindingVersion", "shopifyEditGeneration", "shopifyEditOperationId",
  "shopifyEditPendingOwnerScope", "shopifyEditPendingBindingMutation", "shopifyEditPendingDetailsMutation",
  "shopifyEditPendingCreateMutation", "shopifyEditDetailsOutcome", "shopifyEditManagerOpen"
] as const satisfies readonly (keyof AppState)[];

export type IntegrationFeatureState = Pick<AppState, (typeof INTEGRATION_FEATURE_STATE_KEYS)[number]>;

const shopifyBindingsRequests = new WeakMap<object, object>();

export function beginShopifyBindingsRequest(context: object, token: object): void {
  shopifyBindingsRequests.set(context, token);
}

export function isCurrentShopifyBindingsRequest(context: object, token: object): boolean {
  return shopifyBindingsRequests.get(context) === token;
}

export function finishShopifyBindingsRequest(context: object, token: object): void {
  if (isCurrentShopifyBindingsRequest(context, token)) shopifyBindingsRequests.delete(context);
}

export function invalidateShopifyBindingsRequest(context: object): void {
  shopifyBindingsRequests.delete(context);
}

export function createIntegrationFeatureState(todayDate: string): IntegrationFeatureState {
  return {
    whatnotFeeDateOnly: todayDate,
    whatnotConnectionStatus: "unconfigured",
    whatnotSyncStatus: "idle",
    whatnotConnectionSummary: null,
    whatnotCallbackStatus: null,
    whatnotCallbackMessage: "",
    whatnotCsvRawInput: "",
    whatnotCsvSellerAccountId: "",
    whatnotCsvHeaders: [],
    whatnotCsvRows: [],
    whatnotCsvMapExternalSaleId: null,
    whatnotCsvMapOrderId: null,
    whatnotCsvMapOrderItemId: null,
    whatnotCsvMapSellerAccountId: null,
    whatnotCsvMapTitle: null,
    whatnotCsvMapListingTitle: null,
    whatnotCsvMapBuyerName: null,
    whatnotCsvMapOrderPlacedAt: null,
    whatnotCsvMapOriginalItemPrice: null,
    whatnotCsvMapSku: null,
    whatnotCsvMapProductCategory: null,
    whatnotCsvMapQuantity: null,
    whatnotCsvMapPrice: null,
    whatnotCsvMapBuyerShipping: null,
    whatnotCsvMapDate: null,
    whatnotCsvMapOrderStatus: null,
    whatnotReviewBatchId: null,
    whatnotReviewRows: [],
    isConfirmingWhatnotImport: false,
    whatnotConfirmationRetryPayload: null,
    showWhatnotReviewDialog: false,
    showWhatnotCsvImportDialog: false,
    shopifyConnectionStatus: "unconfigured",
    shopifyConnectionShop: null,
    shopifyLastSyncedAt: null,
    shopifySyncError: null,
    shopifyShopDraft: "",
    showShopifyConnectDialog: false,
    shopifyBindingsSummary: null,
    shopifyBindingsStatus: "idle",
    shopifyBindingsStale: false,
    shopifyBindingsScope: "",
    shopifyEditListing: null,
    shopifyEditSearchQuery: "",
    shopifyEditSearchResults: [],
    shopifyEditSearchCursor: null,
    shopifyEditSearchHasMore: false,
    shopifyEditSearchCompleted: false,
    shopifyEditSelectedVariantId: null,
    shopifyEditSelectedLocationId: null,
    shopifyEditLoading: false,
    shopifyEditSaving: false,
    shopifyEditError: null,
    shopifyEditRecovery: "none",
    shopifyEditErrorOperation: null,
    shopifyEditRequestRevision: 0,
    shopifyEditListingStatus: "idle",
    shopifyEditSessionAuthEpoch: null,
    shopifyEditSessionScope: "",
    shopifyEditSessionLotId: null,
    shopifyEditBindingVersion: null,
    shopifyEditGeneration: null,
    shopifyEditOperationId: null,
    shopifyEditPendingOwnerScope: null,
    shopifyEditPendingBindingMutation: null,
    shopifyEditPendingDetailsMutation: null,
    shopifyEditPendingCreateMutation: null,
    shopifyEditDetailsOutcome: null,
    shopifyEditManagerOpen: false
  };
}

type WhatnotCsvReset = Pick<IntegrationFeatureState,
  | "whatnotCsvRawInput" | "whatnotCsvSellerAccountId" | "whatnotCsvHeaders" | "whatnotCsvRows"
  | "whatnotCsvMapExternalSaleId" | "whatnotCsvMapOrderId" | "whatnotCsvMapOrderItemId" | "whatnotCsvMapSellerAccountId"
  | "whatnotCsvMapTitle" | "whatnotCsvMapListingTitle" | "whatnotCsvMapBuyerName" | "whatnotCsvMapOrderPlacedAt"
  | "whatnotCsvMapOriginalItemPrice" | "whatnotCsvMapSku" | "whatnotCsvMapProductCategory" | "whatnotCsvMapQuantity"
  | "whatnotCsvMapPrice" | "whatnotCsvMapBuyerShipping" | "whatnotCsvMapDate" | "whatnotCsvMapOrderStatus"
>;

type WhatnotReviewReset = Pick<IntegrationFeatureState,
  "whatnotReviewBatchId" | "whatnotReviewRows" | "isConfirmingWhatnotImport" | "whatnotConfirmationRetryPayload"
>;

export function resetWhatnotCsvImportState(state: WhatnotCsvReset): void {
  Object.assign(state, {
    whatnotCsvRawInput: "", whatnotCsvSellerAccountId: "", whatnotCsvHeaders: [], whatnotCsvRows: [],
    whatnotCsvMapExternalSaleId: null, whatnotCsvMapOrderId: null, whatnotCsvMapOrderItemId: null,
    whatnotCsvMapSellerAccountId: null, whatnotCsvMapTitle: null, whatnotCsvMapListingTitle: null,
    whatnotCsvMapBuyerName: null, whatnotCsvMapOrderPlacedAt: null, whatnotCsvMapOriginalItemPrice: null,
    whatnotCsvMapSku: null, whatnotCsvMapProductCategory: null, whatnotCsvMapQuantity: null,
    whatnotCsvMapPrice: null, whatnotCsvMapBuyerShipping: null, whatnotCsvMapDate: null, whatnotCsvMapOrderStatus: null
  } satisfies WhatnotCsvReset);
}

export function resetWhatnotReviewState(state: WhatnotReviewReset): void {
  Object.assign(state, {
    whatnotReviewBatchId: null,
    whatnotReviewRows: [],
    isConfirmingWhatnotImport: false,
    whatnotConfirmationRetryPayload: null
  } satisfies WhatnotReviewReset);
}

type WhatnotTransientReset = WhatnotCsvReset & WhatnotReviewReset & Pick<IntegrationFeatureState,
  | "whatnotConnectionStatus" | "whatnotConnectionSummary" | "whatnotSyncStatus" | "whatnotCallbackStatus" | "whatnotCallbackMessage"
  | "showWhatnotCsvImportDialog" | "showWhatnotReviewDialog"
>;

export function resetWhatnotTransientUiState(state: WhatnotTransientReset): void {
  state.showWhatnotCsvImportDialog = false;
  state.showWhatnotReviewDialog = false;
  resetWhatnotCsvImportState(state);
  resetWhatnotReviewState(state);
}

export function resetWhatnotSignedOutState(state: WhatnotTransientReset): void {
  state.whatnotConnectionStatus = "unconfigured";
  state.whatnotSyncStatus = "idle";
  state.whatnotConnectionSummary = null;
  state.whatnotCallbackStatus = null;
  state.whatnotCallbackMessage = "";
  resetWhatnotTransientUiState(state);
}

export type ShopifySignedOutReset = Pick<IntegrationFeatureState,
  | "shopifyConnectionStatus" | "shopifyConnectionShop" | "shopifyLastSyncedAt" | "shopifySyncError" | "shopifyShopDraft"
  | "showShopifyConnectDialog" | "shopifyBindingsSummary" | "shopifyBindingsStatus" | "shopifyBindingsStale" | "shopifyBindingsScope"
>;

export function resetShopifySignedOutState(state: ShopifySignedOutReset): void {
  state.shopifyConnectionStatus = "unconfigured";
  state.shopifyConnectionShop = null;
  state.shopifyLastSyncedAt = null;
  state.shopifySyncError = null;
  state.shopifyShopDraft = "";
  state.showShopifyConnectDialog = false;
  state.shopifyBindingsSummary = null;
  state.shopifyBindingsStatus = "idle";
  state.shopifyBindingsStale = false;
  state.shopifyBindingsScope = "";
}

export type IntegrationScopeReset = WhatnotTransientReset & Pick<IntegrationFeatureState,
  "shopifyBindingsSummary" | "shopifyBindingsStatus" | "shopifyBindingsStale" | "shopifyBindingsScope"
>;

export type ShopifyBindingsScopeReset = Pick<IntegrationFeatureState,
  "shopifyBindingsSummary" | "shopifyBindingsStatus" | "shopifyBindingsStale" | "shopifyBindingsScope"
>;

/** Invalidate the scoped Shopify bindings cache and any read currently in flight. */
export function resetShopifyBindingsForScope(state: ShopifyBindingsScopeReset): void {
  invalidateShopifyBindingsRequest(state);
  state.shopifyBindingsSummary = null;
  state.shopifyBindingsStatus = "idle";
  state.shopifyBindingsStale = false;
  state.shopifyBindingsScope = "";
}

/** Reset all transient provider state when the active workspace/personal scope changes. */
export function resetIntegrationScopeState(state: IntegrationScopeReset, options: { resetWhatnot?: boolean } = {}): void {
  resetShopifyBindingsForScope(state);
  if (options.resetWhatnot !== false) resetWhatnotTransientUiState(state);
}
