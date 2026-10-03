import type { LotType, Sale, ShopifyEditErrorOperation, ShopifyEditListing, ShopifyVariantSearchResult, WhatnotConnectionStatus } from "../types/app.ts";
import type { ShopifyDraftPreview } from "./shopify-draft.ts";
import type { Recovery } from "./shopify-ui-error.ts";
import type { ShopifyStockObservation } from "../../shared/shopify-stock.ts";
import type { BindingAction, BindingMutation, BindingResult, DraftCreateMutation, DraftOverrides, ProductDetailsDraft, ProductDetailsMutation, ProductDetailsResult } from "../../shared/shopify-product-manager.ts";

export interface CreateShopifyDraftCallback {
  (overrides: DraftOverrides, previewToken: string): Promise<void | BindingResult>;
  (locationId: string, previewToken: string): Promise<void>;
}

export type ShopifyLotIntegrationProps = {
  state: {
    listing: ShopifyEditListing | null;
    listingStatus: "idle" | "loading" | "loaded" | "error";
    error: string | null;
    errorOperation: ShopifyEditErrorOperation;
    recovery: Recovery;
    saving: boolean;
    bindingVersion?: string | null;
    generation?: number | null;
    detailsOutcome?: ProductDetailsResult["outcome"] | null;
    pendingBindingMutation?: BindingMutation | null;
    pendingDetailsMutation?: ProductDetailsMutation | null;
    pendingCreateMutation?: DraftCreateMutation | null;
    search: {
      query: string;
      results: ShopifyVariantSearchResult[];
      loading: boolean;
      completed: boolean;
      hasMore: boolean;
      selectedVariantId: string | null;
      selectedLocationId: string | null;
    };
  };
  lot: {
    type: LotType;
    saved?: { name: string; externalSku?: string };
    draftName: string;
    draftSku: string;
    boxesPurchased: number;
    packsPerBox: number;
    sales: Sale[];
  };
  connection: { status: WhatnotConnectionStatus; shop: string | null; offline: boolean; canManage: boolean };
  language: string;
  t: (key: string) => string;
  callbacks: {
    loadPreview: (overrides?: Partial<DraftOverrides>) => Promise<ShopifyDraftPreview>;
    createDraft: CreateShopifyDraftCallback;
    saveBinding: (action: BindingAction, selection?: { variantId?: string; locationId?: string; confirmTransfer?: boolean }) => Promise<BindingResult>;
    saveDetails: (draft: ProductDetailsDraft) => Promise<ProductDetailsResult>;
    refreshListing: () => Promise<void>;
    loadStock: () => Promise<ShopifyStockObservation>;
  };
};
