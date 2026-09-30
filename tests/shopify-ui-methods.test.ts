import { beforeEach, expect, it, vi } from "vitest";

const { fetchAuthenticatedApiResponse } = vi.hoisted(() => ({ fetchAuthenticatedApiResponse: vi.fn() }));
vi.mock("../src/app-core/methods/ui/common/api-client.ts", () => ({ fetchAuthenticatedApiResponse }));

import { uiShopifyMethods } from "../src/app-core/methods/ui/shopify/shopify.ts";
import { resetShopifySignedOutState } from "../src/app-core/methods/ui/shopify/shopify-state.ts";

function context() {
  return {
    activeScopeType: "personal", activeWorkspaceId: null, googleAuthEpoch: 0, isCurrentWorkspaceOwner: false,
    shopifyConnectionStatus: "unconfigured", shopifyConnectionShop: null,
    shopifyLastSyncedAt: null as string | null, shopifySyncError: null as string | null,
    shopifyShopDraft: "mine.myshopify.com", showShopifyConnectDialog: true,
    notify: vi.fn()
  };
}

beforeEach(() => fetchAuthenticatedApiResponse.mockReset());

it("shows connected shop status without keeping an access token in UI state", async () => {
  const app = context();
  fetchAuthenticatedApiResponse.mockResolvedValue(new Response(JSON.stringify({ configured: true, connected: true, shop: "mine.myshopify.com", lastSyncedAt: "2026-09-29T12:00:00Z", syncError: null }), { status: 200 }));
  await uiShopifyMethods.refreshShopifyStatus.call(app as never);
  expect(app.shopifyConnectionStatus).toBe("connected");
  expect(app.shopifyConnectionShop).toBe("mine.myshopify.com");
  expect(app.shopifyLastSyncedAt).toBe("2026-09-29T12:00:00Z");
  expect(app.shopifySyncError).toBeNull();
  expect(JSON.stringify(app)).not.toContain("access_token");
});

it("connects through a full-page Shopify authorization redirect", async () => {
  const app = context();
  fetchAuthenticatedApiResponse.mockResolvedValue(new Response(JSON.stringify({ authorizeUrl: "https://mine.myshopify.com/admin/oauth/authorize?state=abc" }), { status: 200 }));
  let statusAtRedirect: string | undefined;
  const assign = vi.fn(() => { statusAtRedirect = app.shopifyConnectionStatus; });
  const original = globalThis.window;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "https://app.example.com", href: "https://app.example.com/config", assign } } });
  try {
    await uiShopifyMethods.connectShopify.call(app as never);
    expect(assign).toHaveBeenCalledWith("https://mine.myshopify.com/admin/oauth/authorize?state=abc");
    expect(fetchAuthenticatedApiResponse.mock.calls[0]?.[1]).toBe("/integrations/shopify/connect/start");
    expect(statusAtRedirect).toBe("disconnected");
    expect(app.shopifyConnectionStatus).toBe("disconnected");
  } finally { Object.defineProperty(globalThis, "window", { configurable: true, value: original }); }
});

it("clears the previous account's shop on sign-out", () => {
  const app = context();
  app.shopifyConnectionStatus = "connected";
  app.shopifyConnectionShop = "previous.myshopify.com";
  app.shopifyLastSyncedAt = "2026-09-28T12:00:00Z";
  app.shopifySyncError = "Failed to sync";
  resetShopifySignedOutState(app as never);
  expect(app.shopifyConnectionShop).toBeNull();
  expect(app.shopifyLastSyncedAt).toBeNull();
  expect(app.shopifySyncError).toBeNull();
  expect(app.shopifyShopDraft).toBe("");
  expect(app.showShopifyConnectDialog).toBe(false);
});

it("ignores an old personal-scope response after switching to a workspace", async () => {
  const app = context() as ReturnType<typeof context> & { activeWorkspaceId: string | null };
  let finishFirst!: (value: Response) => void;
  fetchAuthenticatedApiResponse.mockReturnValueOnce(new Promise<Response>(resolve => { finishFirst = resolve; }));
  fetchAuthenticatedApiResponse.mockResolvedValueOnce(new Response(JSON.stringify({ configured: true, connected: true, shop: "workspace.myshopify.com", lastSyncedAt: "2026-09-29T12:00:00Z", syncError: null }), { status: 200 }));
  const first = uiShopifyMethods.refreshShopifyStatus.call(app as never);
  app.activeScopeType = "workspace";
  app.activeWorkspaceId = "team";
  await uiShopifyMethods.refreshShopifyStatus.call(app as never);
  finishFirst(new Response(JSON.stringify({ configured: true, connected: true, shop: "personal.myshopify.com", lastSyncedAt: null, syncError: "Old error" }), { status: 200 }));
  await first;
  expect(app.shopifyConnectionShop).toBe("workspace.myshopify.com");
  expect(app.shopifyLastSyncedAt).toBe("2026-09-29T12:00:00Z");
  expect(app.shopifySyncError).toBeNull();
});

it("ignores a status response from a previous signed-in account", async () => {
  const app = context();
  let finish!: (value: Response) => void;
  fetchAuthenticatedApiResponse.mockReturnValueOnce(new Promise<Response>((resolve) => { finish = resolve; }));
  const pending = uiShopifyMethods.refreshShopifyStatus.call(app as never);
  app.googleAuthEpoch += 1;
  app.shopifyConnectionStatus = "disconnected";
  finish(new Response(JSON.stringify({ configured: true, connected: true, shop: "previous.myshopify.com" }), { status: 200 }));
  await pending;
  expect(app.shopifyConnectionStatus).toBe("disconnected");
  expect(app.shopifyConnectionShop).toBeNull();
});

it("ignores a disconnect response after the signed-in account changes", async () => {
  const app = context();
  let finish!: (value: Response) => void;
  fetchAuthenticatedApiResponse.mockReturnValueOnce(new Promise<Response>(resolve => { finish = resolve; }));
  const pending = uiShopifyMethods.disconnectShopify.call(app as never);
  app.googleAuthEpoch++;
  app.shopifyConnectionStatus = "connected";
  app.shopifyConnectionShop = "new.myshopify.com";
  app.showShopifyConnectDialog = true;
  finish(new Response(null, { status: 200 }));
  await pending;
  expect(app.shopifyConnectionStatus).toBe("connected");
  expect(app.shopifyConnectionShop).toBe("new.myshopify.com");
  expect(app.showShopifyConnectDialog).toBe(true);
});

it("does not redirect for a connect response after the signed-in account changes", async () => {
  const app = context();
  app.shopifyShopDraft = "mine.myshopify.com";
  const assign = vi.fn();
  const original = globalThis.window;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "https://app.example.com", href: "https://app.example.com/config", assign } } });
  try {
    let finish!: (value: Response) => void;
    fetchAuthenticatedApiResponse.mockReturnValueOnce(new Promise<Response>(resolve => { finish = resolve; }));
    const pending = uiShopifyMethods.connectShopify.call(app as never);
    app.googleAuthEpoch++;
    app.shopifyConnectionStatus = "connected";
    finish(new Response(JSON.stringify({ authorizeUrl: "https://mine.myshopify.com/admin/oauth/authorize" }), { status: 200 }));
    await pending;
    expect(assign).not.toHaveBeenCalled();
    expect(app.shopifyConnectionStatus).toBe("connected");
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: original });
  }
});
