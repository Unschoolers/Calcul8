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

it("keeps a same-scope mutation pending when passive status refresh completes", async () => {
  const app = context(); app.shopifyConnectionStatus = "connected";
  const original = globalThis.window; Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { href: "https://app.example.com/", assign: vi.fn() } } });
  let finishMutation!: (value: Response) => void;
  fetchAuthenticatedApiResponse.mockReturnValueOnce(new Promise<Response>(resolve => { finishMutation = resolve; }));
  const connect = uiShopifyMethods.connectShopify.call(app as never);
  expect(app.shopifyConnectionStatus).toBe("connecting");
  fetchAuthenticatedApiResponse.mockResolvedValueOnce(new Response(JSON.stringify({ configured: true, connected: false }), { status: 200 }));
  await uiShopifyMethods.refreshShopifyStatus.call(app as never);
  expect(app.shopifyConnectionStatus).toBe("connecting");
  fetchAuthenticatedApiResponse.mockResolvedValueOnce(new Response(JSON.stringify({ authorizeUrl: "https://mine.myshopify.com/admin/oauth/authorize" }), { status: 200 }));
  finishMutation(new Response(JSON.stringify({ authorizeUrl: "https://mine.myshopify.com/admin/oauth/authorize" }), { status: 200 }));
  await connect; Object.defineProperty(globalThis, "window", { configurable: true, value: original });
});

it("deduplicates same-scope connect requests", async () => {
  const app = context(); let finish!: (response: Response) => void;
  const original = globalThis.window; Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { href: "https://app.example.com/", assign: vi.fn() } } });
  fetchAuthenticatedApiResponse.mockReturnValueOnce(new Promise<Response>(resolve => { finish = resolve; }));
  const first = uiShopifyMethods.connectShopify.call(app as never);
  await uiShopifyMethods.connectShopify.call(app as never);
  expect(fetchAuthenticatedApiResponse).toHaveBeenCalledTimes(1);
  finish(new Response(JSON.stringify({ authorizeUrl: "https://mine.myshopify.com/admin/oauth/authorize" }), { status: 200 })); await first;
  Object.defineProperty(globalThis, "window", { configurable: true, value: original });
});

it("rejects a redirect to another Shopify store", async () => {
  const app = context();
  fetchAuthenticatedApiResponse.mockResolvedValue(new Response(JSON.stringify({ authorizeUrl: "https://attacker.myshopify.com/admin/oauth/authorize" }), { status: 200 }));
  const original = globalThis.window; Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { href: "https://app.example.com/", assign: vi.fn() } } });
  try { await uiShopifyMethods.connectShopify.call(app as never); expect(window.location.assign).not.toHaveBeenCalled(); expect(app.shopifyConnectionStatus).toBe("error"); }
  finally { Object.defineProperty(globalThis, "window", { configurable: true, value: original }); }
});

it("preserves same-scope connection details when a status retry fails", async () => {
  const app = context(); app.shopifyConnectionStatus = "connected"; app.shopifyConnectionShop = "mine.myshopify.com"; app.shopifyLastSyncedAt = "then";
  fetchAuthenticatedApiResponse.mockResolvedValue(new Response(null, { status: 503 }));
  await uiShopifyMethods.refreshShopifyStatus.call(app as never);
  expect(app.shopifyConnectionStatus).toBe("error"); expect(app.shopifyConnectionShop).toBe("mine.myshopify.com"); expect(app.shopifyLastSyncedAt).toBe("then");
});

it("does not issue status reads during disconnect or let one reapply connected state afterward", async () => {
  const app = context(); app.shopifyConnectionStatus = "connected"; app.shopifyConnectionShop = "mine.myshopify.com";
  let finish!: (response: Response) => void;
  fetchAuthenticatedApiResponse.mockReturnValueOnce(new Promise<Response>(resolve => { finish = resolve; }));
  const disconnect = uiShopifyMethods.disconnectShopify.call(app as never);
  expect(app.shopifyConnectionStatus).toBe("connecting");
  await uiShopifyMethods.refreshShopifyStatus.call(app as never);
  expect(fetchAuthenticatedApiResponse).toHaveBeenCalledTimes(1);
  finish(new Response(null, { status: 200 })); await disconnect;
  expect(app.shopifyConnectionStatus).toBe("disconnected");
  expect(app.shopifyConnectionShop).toBeNull();
});

it("clears prior-scope shop details when the new-scope status read fails during an old connect", async () => {
  const app = context(); app.shopifyConnectionStatus = "connected"; app.shopifyConnectionShop = "personal.myshopify.com"; app.shopifyLastSyncedAt = "old";
  const original = globalThis.window; Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { href: "https://app.example.com/", assign: vi.fn() } } });
  let finishConnect!: (response: Response) => void;
  fetchAuthenticatedApiResponse.mockReturnValueOnce(new Promise<Response>(resolve => { finishConnect = resolve; }));
  const connect = uiShopifyMethods.connectShopify.call(app as never);
  app.activeScopeType = "workspace"; app.activeWorkspaceId = "new-team";
  fetchAuthenticatedApiResponse.mockResolvedValueOnce(new Response(null, { status: 503 }));
  await uiShopifyMethods.refreshShopifyStatus.call(app as never);
  expect(app.shopifyConnectionShop).toBeNull(); expect(app.shopifyLastSyncedAt).toBeNull();
  finishConnect(new Response(JSON.stringify({ authorizeUrl: "https://mine.myshopify.com/admin/oauth/authorize" }), { status: 200 })); await connect;
  expect(app.shopifyConnectionShop).toBeNull();
  Object.defineProperty(globalThis, "window", { configurable: true, value: original });
});

it("invalidates a status read that began before connect and keeps a newer scope mutation locked", async () => {
  const app = context(); const original = globalThis.window;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { href: "https://app.example.com/", assign: vi.fn() } } });
  let finishStatus!: (response: Response) => void; let finishOld!: (response: Response) => void; let finishNew!: (response: Response) => void;
  fetchAuthenticatedApiResponse.mockReturnValueOnce(new Promise<Response>(resolve => { finishStatus = resolve; }));
  const oldStatus = uiShopifyMethods.refreshShopifyStatus.call(app as never);
  fetchAuthenticatedApiResponse.mockReturnValueOnce(new Promise<Response>(resolve => { finishOld = resolve; }));
  const oldConnect = uiShopifyMethods.connectShopify.call(app as never);
  app.activeScopeType = "workspace"; app.activeWorkspaceId = "team"; app.isCurrentWorkspaceOwner = true;
  fetchAuthenticatedApiResponse.mockReturnValueOnce(new Promise<Response>(resolve => { finishNew = resolve; }));
  const newConnect = uiShopifyMethods.connectShopify.call(app as never);
  finishOld(new Response(null, { status: 503 })); await oldConnect;
  await uiShopifyMethods.refreshShopifyStatus.call(app as never);
  expect(fetchAuthenticatedApiResponse).toHaveBeenCalledTimes(3);
  finishStatus(new Response(JSON.stringify({ configured: true, connected: true, shop: "stale.myshopify.com" }), { status: 200 })); await oldStatus;
  expect(app.shopifyConnectionStatus).toBe("connecting");
  finishNew(new Response(null, { status: 503 })); await newConnect;
  Object.defineProperty(globalThis, "window", { configurable: true, value: original });
});

it("releases an abandoned scope lock so returning A after B can mutate again", async () => {
  const app = context(); const original = globalThis.window;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { href: "https://app.example.com/", assign: vi.fn() } } });
  let finishA!: (response: Response) => void;
  fetchAuthenticatedApiResponse.mockReturnValueOnce(new Promise<Response>(resolve => { finishA = resolve; }));
  const operationA = uiShopifyMethods.disconnectShopify.call(app as never);
  app.activeScopeType = "workspace"; app.activeWorkspaceId = "team";
  fetchAuthenticatedApiResponse.mockResolvedValueOnce(new Response(JSON.stringify({ configured: true, connected: false }), { status: 200 }));
  await uiShopifyMethods.refreshShopifyStatus.call(app as never);
  finishA(new Response(null, { status: 503 })); await operationA;
  app.activeScopeType = "personal"; app.activeWorkspaceId = null;
  fetchAuthenticatedApiResponse.mockResolvedValueOnce(new Response(JSON.stringify({ authorizeUrl: "https://mine.myshopify.com/admin/oauth/authorize" }), { status: 200 }));
  await uiShopifyMethods.connectShopify.call(app as never);
  expect(fetchAuthenticatedApiResponse).toHaveBeenCalledTimes(3);
  expect(window.location.assign).toHaveBeenCalledOnce();
  Object.defineProperty(globalThis, "window", { configurable: true, value: original });
});

it.each(["connect", "disconnect"] as const)("clears prior-scope metadata before a failed new-scope %s", async operation => {
  const app = context();
  fetchAuthenticatedApiResponse.mockResolvedValueOnce(new Response(JSON.stringify({ configured: true, connected: true, shop: "personal.myshopify.com", lastSyncedAt: "old", syncError: "old failure" }), { status: 200 }));
  await uiShopifyMethods.refreshShopifyStatus.call(app as never);
  const original = globalThis.window; Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { href: "https://app.example.com/", assign: vi.fn() } } });
  app.activeScopeType = "workspace"; app.activeWorkspaceId = "team"; app.isCurrentWorkspaceOwner = true;
  fetchAuthenticatedApiResponse.mockResolvedValueOnce(new Response(null, { status: 503 }));
  await uiShopifyMethods[operation === "connect" ? "connectShopify" : "disconnectShopify"].call(app as never);
  expect(app.shopifyConnectionShop).toBeNull(); expect(app.shopifyLastSyncedAt).toBeNull(); expect(app.shopifySyncError).toBeNull();
  Object.defineProperty(globalThis, "window", { configurable: true, value: original });
});

it("successful status and disconnect refresh the batched link cache; failed mutations do not", async () => {
  const app = { ...context(), refreshShopifyBindings: vi.fn(async () => {}), resetShopifyBindings: vi.fn() };
  fetchAuthenticatedApiResponse.mockResolvedValueOnce(new Response(JSON.stringify({ configured: true, connected: true, shop: "mine.myshopify.com" })));
  await uiShopifyMethods.refreshShopifyStatus.call(app as never);
  expect(app.refreshShopifyBindings).toHaveBeenCalledTimes(1);
  fetchAuthenticatedApiResponse.mockResolvedValueOnce(new Response(null, { status: 503 }));
  await uiShopifyMethods.disconnectShopify.call(app as never);
  expect(app.refreshShopifyBindings).toHaveBeenCalledTimes(1);
  fetchAuthenticatedApiResponse.mockResolvedValueOnce(new Response(null, { status: 200 }));
  await uiShopifyMethods.disconnectShopify.call(app as never);
  expect(app.refreshShopifyBindings).toHaveBeenCalledTimes(2);
});
