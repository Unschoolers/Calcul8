import type { ShopifyBindingMethodImplementation } from "../../../context/shopify.ts";
import { isBindingSummary } from "../../../../domain/shopify-binding-summary.ts";
import { fetchAuthenticatedApiResponse } from "../common/api-client.ts";

type Scope = { googleAuthEpoch: number; activeScopeType: string; activeWorkspaceId: string | null };
export const shopifyBindingsScopeKey = (context: Scope): string => `${context.googleAuthEpoch}:${context.activeScopeType}:${context.activeWorkspaceId ?? ""}`;
const requests = new WeakMap<object, object>();

export const shopifyBindingMethods = {
  resetShopifyBindings(): void {
    requests.delete(this);
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
    const token = {}; requests.set(this, token);
    this.shopifyBindingsStatus = "loading";
    this.shopifyBindingsStale = Boolean(this.shopifyBindingsSummary);
    const current = () => scope === shopifyBindingsScopeKey(this) && requests.get(this) === token &&
      !(this.shopifyConnectionShop && this.shopifyConnectionShop !== shop);
    try {
      const response = await fetchAuthenticatedApiResponse(this, "/integrations/shopify/products/bindings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.activeScopeType === "workspace" ? { workspaceId: this.activeWorkspaceId } : {})
      }, { expireAuthOn401: false });
      if (!response.ok) throw new Error("Shopify bindings unavailable");
      const payload: unknown = await response.json();
      if (!current()) return;
      const summary = payload && typeof payload === "object" && "summary" in payload ? payload.summary : null;
      if (!isBindingSummary(summary) || !summary.complete ||
        (this.activeScopeType === "workspace" && summary.scopeKey !== `ws:${this.activeWorkspaceId}`) ||
        (this.shopifyConnectionShop && summary.shop !== this.shopifyConnectionShop)) throw new Error("Incomplete or mismatched Shopify bindings");
      this.shopifyBindingsSummary = summary; this.shopifyBindingsStatus = "loaded";
      this.shopifyBindingsStale = !summary.connected || this.shopifyConnectionStatus !== "connected";
    } catch {
      if (!current()) return;
      this.shopifyBindingsStatus = "error"; this.shopifyBindingsStale = Boolean(this.shopifyBindingsSummary);
    } finally {
      if (requests.get(this) === token) requests.delete(this);
    }
  }
} satisfies ShopifyBindingMethodImplementation;
