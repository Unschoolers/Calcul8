import type { AuthEntitlementSessionContext } from "../../../context/entitlements.ts";
import { fetchAuthenticatedApiResponse } from "../common/api-client.ts";

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

/** Typed boundary for the Shopify editor's authenticated requests. */
export interface ShopifyEditorClient {
  post(endpoint: ShopifyEditorEndpoint, init: RequestInit, options?: { retryUnsafeMethods?: boolean }): Promise<Response>;
}

export function createShopifyEditorClient(context: AuthEntitlementSessionContext): ShopifyEditorClient {
  return {
    post(endpoint, init, options = {}) {
      return fetchAuthenticatedApiResponse(context, SHOPIFY_EDITOR_ENDPOINTS[endpoint], init, options);
    }
  };
}
