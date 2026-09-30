import type { ShopifyMethodImplementation } from "../../../context/shopify.ts";
import { fetchAuthenticatedApiResponse } from "../common/api-client.ts";

function scopeBody(context: { activeScopeType: string; activeWorkspaceId: string | null }): { workspaceId?: string } {
  return context.activeScopeType === "workspace" && context.activeWorkspaceId
    ? { workspaceId: context.activeWorkspaceId }
    : {};
}

export const uiShopifyMethods = {
  async refreshShopifyStatus(): Promise<void> {
    const requestedScope = JSON.stringify(scopeBody(this));
    const requestedAuthEpoch = this.googleAuthEpoch;
  this.shopifyConnectionShop = null;
  this.shopifyLastSyncedAt = null;
  this.shopifySyncError = null;
    try {
      const response = await fetchAuthenticatedApiResponse(this, "/integrations/shopify/status", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: requestedScope
      }, { expireAuthOn401: false });
      if (!response.ok) throw new Error("Shopify status unavailable");
    const status = await response.json() as { configured?: boolean; connected?: boolean; shop?: string | null; lastSyncedAt?: string | null; syncError?: string | null };
      if (requestedAuthEpoch !== this.googleAuthEpoch || requestedScope !== JSON.stringify(scopeBody(this))) return;
      this.shopifyConnectionStatus = !status.configured ? "unconfigured" : status.connected ? "connected" : "disconnected";
    this.shopifyConnectionShop = status.connected ? status.shop ?? null : null;
    this.shopifyLastSyncedAt = status.connected ? status.lastSyncedAt ?? null : null;
    this.shopifySyncError = status.connected ? status.syncError ?? null : null;
    } catch {
      if (requestedAuthEpoch !== this.googleAuthEpoch || requestedScope !== JSON.stringify(scopeBody(this))) return;
      this.shopifyConnectionStatus = "error";
    this.shopifyConnectionShop = null;
    this.shopifyLastSyncedAt = null;
    this.shopifySyncError = null;
    }
  },

  openShopifyConnectDialog(): void {
    if (this.shopifyConnectionStatus === "unconfigured" || this.shopifyConnectionStatus === "connected") return;
    if (this.activeScopeType !== "personal" && !this.isCurrentWorkspaceOwner) return;
    this.showShopifyConnectDialog = true;
  },

  async connectShopify(): Promise<void> {
    if (this.activeScopeType === "workspace" && !this.isCurrentWorkspaceOwner) return;
    const requestedAuthEpoch = this.googleAuthEpoch;
    const requestedScope = JSON.stringify(scopeBody(this));
    const isCurrent = () => requestedAuthEpoch === this.googleAuthEpoch && requestedScope === JSON.stringify(scopeBody(this));
    const shop = this.shopifyShopDraft.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) return;
    this.shopifyConnectionStatus = "connecting";
    try {
      const response = await fetchAuthenticatedApiResponse(this, "/integrations/shopify/connect/start", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...scopeBody(this), shop, appReturnUrl: window.location.href })
      });
      if (!response.ok) throw new Error("Shopify connection failed");
      const body = await response.json() as { authorizeUrl?: string };
      const url = new URL(body.authorizeUrl ?? "");
      if (url.protocol !== "https:" || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(url.hostname)) throw new Error("Invalid Shopify authorization URL");
      if (!isCurrent()) return;
      this.shopifyShopDraft = "";
      this.shopifyConnectionStatus = "disconnected";
      window.location.assign(url.toString());
    } catch {
      if (isCurrent()) this.shopifyConnectionStatus = "error";
    }
  },

  async disconnectShopify(): Promise<void> {
    if (this.activeScopeType === "workspace" && !this.isCurrentWorkspaceOwner) return;
    const requestedAuthEpoch = this.googleAuthEpoch;
    const requestedScope = JSON.stringify(scopeBody(this));
    const isCurrent = () => requestedAuthEpoch === this.googleAuthEpoch && requestedScope === JSON.stringify(scopeBody(this));
    try {
      const response = await fetchAuthenticatedApiResponse(this, "/integrations/shopify/disconnect", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(scopeBody(this))
      });
      if (!response.ok) throw new Error("Shopify disconnect failed");
      if (!isCurrent()) return;
      this.shopifyConnectionStatus = "disconnected";
    this.shopifyConnectionShop = null;
    this.shopifyLastSyncedAt = null;
    this.shopifySyncError = null;
      this.showShopifyConnectDialog = false;
    } catch { if (isCurrent()) this.shopifyConnectionStatus = "error"; }
  }
} satisfies ShopifyMethodImplementation;
