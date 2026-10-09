import type { ShopifyBindingMethodImplementation } from "../../../context/shopify.ts";
import { isBindingSummary } from "../../../../domain/shopify-binding-summary.ts";
import { fetchAuthenticatedApiResponse, isApiRequestAborted } from "../common/api-client.ts";
import {
  beginShopifyBindingsRequest,
  finishShopifyBindingsRequest,
  invalidateShopifyBindingsRequest,
  isCurrentShopifyBindingsRequest
} from "../../../feature-state/integration-state.ts";

type Scope = { googleAuthEpoch: number; activeScopeType: string; activeWorkspaceId: string | null };
export const shopifyBindingsScopeKey = (context: Scope): string => `${context.googleAuthEpoch}:${context.activeScopeType}:${context.activeWorkspaceId ?? ""}`;
export const shopifyBindingMethods = {
  resetShopifyBindings(): void {
    invalidateShopifyBindingsRequest(this);
    this.shopifyBindingsSummary = null; this.shopifyBindingsStatus = "idle";
    this.shopifyBindingsStale = false; this.shopifyBindingsScope = "";
  },
  async refreshShopifyBindings(): Promise<void> {
    const scope = shopifyBindingsScopeKey(this);
    if (this.shopifyBindingsScope !== scope) {
      this.shopifyBindingsSummary = null; this.shopifyBindingsStale = false; this.shopifyBindingsScope = scope;
    }
    if (this.shopifyConnectionShop && this.shopifyBindingsSummary?.shop !== this.shopifyConnectionShop) this.shopifyBindingsSummary = null;
    const shop = this.shopifyConnectionShop;
    const previousStatus = this.shopifyBindingsStatus;
    const previousStale = this.shopifyBindingsStale;
    const token = {}; beginShopifyBindingsRequest(this, token);
    this.shopifyBindingsStatus = "loading";
    this.shopifyBindingsStale = Boolean(this.shopifyBindingsSummary);
    const current = () => scope === shopifyBindingsScopeKey(this) && isCurrentShopifyBindingsRequest(this, token) &&
      !(this.shopifyConnectionShop && this.shopifyConnectionShop !== shop);
    try {
      const response = await fetchAuthenticatedApiResponse(this, "/integrations/shopify/products/bindings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.activeScopeType === "workspace" ? { workspaceId: this.activeWorkspaceId } : {})
      }, { expireAuthOn401: false, retryUnsafeMethods: true });
      if (!response.ok) throw new Error("Shopify bindings unavailable");
      const payload: unknown = await response.json();
      if (!current()) return;
      const summary = payload && typeof payload === "object" && "summary" in payload ? payload.summary : null;
      if (!isBindingSummary(summary) || !summary.complete ||
        (this.activeScopeType === "workspace" && summary.scopeKey !== `ws:${this.activeWorkspaceId}`) ||
        (this.shopifyConnectionShop && summary.shop !== this.shopifyConnectionShop)) throw new Error("Incomplete or mismatched Shopify bindings");
      this.shopifyBindingsSummary = summary; this.shopifyBindingsStatus = "loaded";
      this.shopifyBindingsStale = !summary.connected || this.shopifyConnectionStatus !== "connected";
    } catch (error) {
      if (!current()) return;
      if (isApiRequestAborted(error)) {
        this.shopifyBindingsStatus = previousStatus;
        this.shopifyBindingsStale = previousStale;
        return;
      }
      this.shopifyBindingsStatus = "error"; this.shopifyBindingsStale = Boolean(this.shopifyBindingsSummary);
    } finally {
      finishShopifyBindingsRequest(this, token);
    }
  }
} satisfies ShopifyBindingMethodImplementation;
