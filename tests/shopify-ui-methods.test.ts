import { beforeEach, expect, it, vi } from "vitest";

const { fetchAuthenticatedApiResponse } = vi.hoisted(() => ({ fetchAuthenticatedApiResponse: vi.fn() }));
vi.mock("../src/app-core/methods/ui/common/api-client.ts", () => ({ fetchAuthenticatedApiResponse }));

import { uiShopifyMethods } from "../src/app-core/methods/ui/shopify/shopify.ts";
import { resetShopifySignedOutState } from "../src/app-core/methods/ui/shopify/shopify-state.ts";

function context() {
  return {
    activeScopeType: "personal", activeWorkspaceId: null, isCurrentWorkspaceOwner: false,
    shopifyConnectionStatus: "unconfigured", shopifyConnectionShop: null,
    shopifyShopDraft: "mine.myshopify.com", showShopifyConnectDialog: true,
    notify: vi.fn()
  };
}

beforeEach(() => fetchAuthenticatedApiResponse.mockReset());

it("shows connected shop status without keeping an access token in UI state", async () => {
  const app = context();
  fetchAuthenticatedApiResponse.mockResolvedValue(new Response(JSON.stringify({ configured: true, connected: true, shop: "mine.myshopify.com" }), { status: 200 }));
  await uiShopifyMethods.refreshShopifyStatus.call(app as never);
  expect(app.shopifyConnectionStatus).toBe("connected");
  expect(app.shopifyConnectionShop).toBe("mine.myshopify.com");
  expect(JSON.stringify(app)).not.toContain("access_token");
});

it("connects through a full-page Shopify authorization redirect", async () => {
  const app = context();
  fetchAuthenticatedApiResponse.mockResolvedValue(new Response(JSON.stringify({ authorizeUrl: "https://mine.myshopify.com/admin/oauth/authorize?state=abc" }), { status: 200 }));
  const assign = vi.fn();
  const original = globalThis.window;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "https://app.example.com", href: "https://app.example.com/config", assign } } });
  try {
    await uiShopifyMethods.connectShopify.call(app as never);
    expect(assign).toHaveBeenCalledWith("https://mine.myshopify.com/admin/oauth/authorize?state=abc");
    expect(fetchAuthenticatedApiResponse.mock.calls[0]?.[1]).toBe("/integrations/shopify/connect/start");
  } finally { Object.defineProperty(globalThis, "window", { configurable: true, value: original }); }
});

it("clears the previous account's shop on sign-out", () => {
  const app = context();
  app.shopifyConnectionStatus = "connected";
  app.shopifyConnectionShop = "previous.myshopify.com";
  resetShopifySignedOutState(app as never);
  expect(app.shopifyConnectionShop).toBeNull();
  expect(app.shopifyShopDraft).toBe("");
  expect(app.showShopifyConnectDialog).toBe(false);
});

it("ignores an old personal-scope response after switching to a workspace", async () => {
  const app = context() as ReturnType<typeof context> & { activeWorkspaceId: string | null };
  let finishFirst!: (value: Response) => void;
  fetchAuthenticatedApiResponse.mockReturnValueOnce(new Promise<Response>(resolve => { finishFirst = resolve; }));
  fetchAuthenticatedApiResponse.mockResolvedValueOnce(new Response(JSON.stringify({ configured: true, connected: true, shop: "workspace.myshopify.com" }), { status: 200 }));
  const first = uiShopifyMethods.refreshShopifyStatus.call(app as never);
  app.activeScopeType = "workspace";
  app.activeWorkspaceId = "team";
  await uiShopifyMethods.refreshShopifyStatus.call(app as never);
  finishFirst(new Response(JSON.stringify({ configured: true, connected: true, shop: "personal.myshopify.com" }), { status: 200 }));
  await first;
  expect(app.shopifyConnectionShop).toBe("workspace.myshopify.com");
});
