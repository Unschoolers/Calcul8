import type { AuthEntitlementSessionContext } from "../../../context/entitlements.ts";
import { fetchAuthenticatedApiResponse } from "../common/api-client.ts";
import type { BindingMutation, DraftCreateMutation, DraftOverrides, ProductDetailsMutation } from "../../../../../shared/shopify-product-manager.ts";

const SHOPIFY_EDITOR_ENDPOINTS = {
  createPreview: "/integrations/shopify/products/create-preview",
  create: "/integrations/shopify/products/create",
  binding: "/integrations/shopify/products/binding",
  details: "/integrations/shopify/products/details",
  stock: "/integrations/shopify/products/stock",
  listing: "/integrations/shopify/products/listing",
  search: "/integrations/shopify/products/search"
} as const;

export type ShopifyEditorEndpoint = keyof typeof SHOPIFY_EDITOR_ENDPOINTS;

type ShopifyScope = { workspaceId?: string };
export type ShopifyEditorRequests = {
  createPreview: ShopifyScope & { lotId: number | null; manager: true; expectedVersion: string | null; generation: number; overrides?: DraftOverrides };
  create: ShopifyScope & DraftCreateMutation;
  binding: ShopifyScope & BindingMutation;
  details: ShopifyScope & ProductDetailsMutation;
  stock: ShopifyScope & { lotId: number | null };
  listing: ShopifyScope & { lotId: number | null; manager: true };
  search: ShopifyScope & { query: string; after?: string };
};

/** Typed boundary for the Shopify editor's authenticated requests. */
export interface ShopifyEditorClient {
  post<K extends ShopifyEditorEndpoint>(endpoint: K, payload: ShopifyEditorRequests[K], options?: { retryUnsafeMethods?: boolean; signal?: AbortSignal }): Promise<Response>;
}

export function createShopifyEditorClient(context: AuthEntitlementSessionContext): ShopifyEditorClient {
  return {
    post(endpoint, payload, options = {}) {
      return fetchAuthenticatedApiResponse(context, SHOPIFY_EDITOR_ENDPOINTS[endpoint], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload), signal: options.signal
      }, options);
    }
  };
}
