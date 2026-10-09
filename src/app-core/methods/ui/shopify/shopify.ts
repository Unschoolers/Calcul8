import type { ShopifyMethodImplementation } from "../../../context/shopify.ts";
import { fetchAuthenticatedApiResponse, isApiRequestAborted } from "../common/api-client.ts";

function scopeBody(context: { activeScopeType: string; activeWorkspaceId: string | null }): { workspaceId?: string } {
  return context.activeScopeType === "workspace" && context.activeWorkspaceId ? { workspaceId: context.activeWorkspaceId } : {};
}
type ShopifyContext = {
  googleAuthEpoch: number;
  activeScopeType: string;
  activeWorkspaceId: string | null;
  shopifyConnectionStatus: string;
  shopifyConnectionShop: string | null;
  shopifyLastSyncedAt: string | null;
  shopifySyncError: string | null;
};
type Ownership = { token: object; statusRevision: number; seenKey: string; pendingKey?: string };
const ownership = new WeakMap<object, Ownership>();
function keyOf(c: ShopifyContext): string { return `${c.googleAuthEpoch}:${c.activeScopeType}:${JSON.stringify(scopeBody(c))}`; }
function record(c: object & ShopifyContext): Ownership {
  let value = ownership.get(c);
  if (!value) {
    value = { token: {}, statusRevision: 0, seenKey: keyOf(c) };
    ownership.set(c, value);
  }
  return value;
}
function enterScope(context: object & ShopifyContext, owner = record(context)): Ownership {
  const key = keyOf(context);
  if (owner.seenKey === key) return owner;
  owner.seenKey = key;
  owner.pendingKey = undefined;
  owner.token = {};
  ++owner.statusRevision;
  context.shopifyConnectionShop = null;
  context.shopifyLastSyncedAt = null;
  context.shopifySyncError = null;
  context.shopifyConnectionStatus = "disconnected";
  (context as ShopifyContext & { resetShopifyBindings?: () => void }).resetShopifyBindings?.();
  return owner;
}
function beginMutation(context: object & ShopifyContext): { current: () => boolean; release: () => void } | null {
  const owner = enterScope(context); const key = keyOf(context);
  if (owner.pendingKey === key) return null;
  const token = {};
  owner.seenKey = key;
  owner.pendingKey = key;
  owner.token = token;
  ++owner.statusRevision;
  return {
    current: () => key === keyOf(context) && owner.token === token,
    release: () => {
      if (owner.token !== token) return;
      owner.pendingKey = undefined;
      owner.token = {};
    }
  };
}
const validShop = (s: string) => /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s);

export const uiShopifyMethods = {
  async refreshShopifyStatus(): Promise<void> {
    const owner = enterScope(this); const key = keyOf(this);
    if (owner.pendingKey === key) return;
    const revision = ++owner.statusRevision;
    try {
      const response = await fetchAuthenticatedApiResponse(this, "/integrations/shopify/status", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(scopeBody(this))
      }, { expireAuthOn401: false, retryUnsafeMethods: true });
      if (!response.ok) throw new Error("Shopify status unavailable");
      const status = await response.json() as { configured?: boolean; connected?: boolean; shop?: string | null; lastSyncedAt?: string | null; syncError?: string | null };
      if (key !== keyOf(this) || revision !== owner.statusRevision || owner.pendingKey === key) return;
      this.shopifyConnectionStatus = !status.configured ? "unconfigured" : status.connected ? "connected" : "disconnected";
      this.shopifyConnectionShop = status.connected ? status.shop ?? null : null;
      this.shopifyLastSyncedAt = status.connected ? status.lastSyncedAt ?? null : null;
      this.shopifySyncError = status.connected ? status.syncError ?? null : null;
      void this.refreshShopifyBindings?.();
    } catch (error) {
      if (isApiRequestAborted(error)) return;
      if (key !== keyOf(this) || revision !== owner.statusRevision || owner.pendingKey === key) return;
      this.shopifyConnectionStatus = "error";
    }
  },
  openShopifyConnectDialog(): void {
    if (this.shopifyConnectionStatus === "unconfigured" || this.shopifyConnectionStatus === "connected" || this.shopifyConnectionStatus === "connecting") return;
    if (this.activeScopeType !== "personal" && !this.isCurrentWorkspaceOwner) return;
    this.showShopifyConnectDialog = true;
  },
  async connectShopify(): Promise<void> {
    if (this.activeScopeType === "workspace" && !this.isCurrentWorkspaceOwner) return;
    const mutation = beginMutation(this); if (!mutation) return;
    const { current, release } = mutation;
    const previousStatus = this.shopifyConnectionStatus;
    const shop = this.shopifyShopDraft.trim().toLowerCase(); if (!validShop(shop)) { release(); return; }
    this.shopifyConnectionStatus = "connecting";
    try {
      const response = await fetchAuthenticatedApiResponse(this, "/integrations/shopify/connect/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...scopeBody(this), shop, appReturnUrl: window.location.href }) });
      if (!response.ok) throw new Error("Shopify connection failed");
      const body = await response.json() as { authorizeUrl?: string }; const url = new URL(body.authorizeUrl ?? "");
      if (url.origin !== `https://${shop}` || url.pathname !== "/admin/oauth/authorize") throw new Error("Invalid Shopify authorization URL");
      if (!current()) return;
      this.shopifyShopDraft = ""; this.shopifyConnectionStatus = "disconnected"; window.location.assign(url.toString());
    } catch (error) {
      if (!current()) return;
      this.shopifyConnectionStatus = isApiRequestAborted(error) ? previousStatus : "error";
    }
    finally { release(); }
  },
  async disconnectShopify(): Promise<void> {
    if (this.activeScopeType === "workspace" && !this.isCurrentWorkspaceOwner) return;
    const mutation = beginMutation(this); if (!mutation) return;
    const { current, release } = mutation;
    const previousStatus = this.shopifyConnectionStatus;
    this.shopifyConnectionStatus = "connecting";
    try {
      const response = await fetchAuthenticatedApiResponse(this, "/integrations/shopify/disconnect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(scopeBody(this)) });
      if (!response.ok) throw new Error("Shopify disconnect failed");
      if (!current()) return;
      this.shopifyConnectionStatus = "disconnected"; this.shopifyConnectionShop = null; this.shopifyLastSyncedAt = null; this.shopifySyncError = null; this.showShopifyConnectDialog = false;
      void this.refreshShopifyBindings?.();
    } catch (error) {
      if (!current()) return;
      this.shopifyConnectionStatus = isApiRequestAborted(error) ? previousStatus : "error";
    }
    finally { release(); }
  }
} satisfies ShopifyMethodImplementation;
