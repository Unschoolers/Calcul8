import type { LotType, Sale, ShopifyEditErrorOperation, ShopifyEditListing, ShopifyVariantSearchResult, WhatnotConnectionStatus } from "../types/app.ts";
import type { ShopifyDraftPreview } from "./shopify-draft.ts";
import type { Recovery } from "./shopify-ui-error.ts";
import type { ShopifyStockObservation } from "../../shared/shopify-stock.ts";

export type ShopifyLotIntegrationProps = {
  state: {
    listing: ShopifyEditListing | null;
    listingStatus: "idle" | "loading" | "loaded" | "error";
    error: string | null;
    errorOperation: ShopifyEditErrorOperation;
    recovery: Recovery;
    saving: boolean;
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
    loadPreview: () => Promise<ShopifyDraftPreview>;
    createDraft: (locationId: string, previewToken: string) => Promise<void>;
    refreshListing: () => Promise<void>;
    loadStock: () => Promise<ShopifyStockObservation>;
  };
};
