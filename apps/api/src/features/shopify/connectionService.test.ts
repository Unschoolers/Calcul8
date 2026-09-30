import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test, vi } from "vitest";
import { beginShopifyConnection, completeShopifyConnection, type ShopifyConnectionStore } from "./connectionService";

function callback(shop: string, state: string, secret: string): URLSearchParams {
  const params = new URLSearchParams({ shop, state, code: "code", timestamp: String(Math.floor(Date.now() / 1000)) });
  params.set("hmac", createHmac("sha256", secret).update([...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("&")).digest("hex"));
  return params;
}

test.each(["mine.myshopify.com", "julesarena.myshopify.com"])("connect accepts %s and stores encrypted credentials for Shopify's canonical domain", async (requestedShop) => {
  const canonicalShop = requestedShop === "julesarena.myshopify.com" ? "uhpe0b-9f.myshopify.com" : requestedShop;
  const states = new Map<string, Awaited<ReturnType<ShopifyConnectionStore["consumeState"]>> >();
  const putConnection = vi.fn();
  const store: ShopifyConnectionStore = {
    createState: async state => { states.set(state.state, state); },
    consumeState: async state => { const found = states.get(state) ?? null; states.delete(state); return found; },
    getGeneration: async () => 0,
    getConnection: async () => null,
    putConnection
  };
  const config = { shopifyClientId: "id", shopifyClientSecret: "secret", shopifyRedirectUri: "https://api.example.com/callback", shopifyTokenEncryptionSecret: "encryption", allowedOrigins: ["https://app.example.com"] };
  const resolveScope = vi.fn(async () => ({ partitionKey: "user:42", scopeType: "user" as const, scopeId: "42" }));
  const url = await beginShopifyConnection(config, store, resolveScope, { actorUserId: "42", shop: requestedShop, appReturnUrl: "https://app.example.com/config" });
  const state = new URL(url).searchParams.get("state")!;
  assert.ok(state);
  const fetcher = vi.fn(async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => new Response(JSON.stringify({ access_token: "top-secret", scope: "write_products,write_inventory" }), { status: 200 }));
  const result = await completeShopifyConnection(config, store, resolveScope, callback(canonicalShop, state, "secret"), fetcher);
  assert.equal(fetcher.mock.calls[0]![0], `https://${canonicalShop}/admin/oauth/access_token`);
  assert.equal(result.redirectUrl, "https://app.example.com/config");
  assert.equal(putConnection.mock.calls.length, 1);
  assert.equal(putConnection.mock.calls[0]![1], 0);
  const stored = putConnection.mock.calls[0]![0];
  assert.equal(stored.shop, canonicalShop);
  assert.equal(stored.scopeKey, "user:42");
  assert.ok(!JSON.stringify(stored).includes("top-secret"));
  await assert.rejects(() => completeShopifyConnection(config, store, resolveScope, callback(canonicalShop, state, "secret"), fetcher));
  assert.equal(fetcher.mock.calls.length, 1);
});

test("callback rejects tampered shop and code before token exchange", async () => {
const storedState = { state: "one-use", shop: "mine.myshopify.com", actorUserId: "42", scopeKey: "user:42", scopeType: "user" as const, scopeId: "42", generation: 0, appReturnUrl: "https://app.example.com/", expiresAt: new Date(Date.now() + 60_000).toISOString() };
const store: ShopifyConnectionStore = { createState: async () => {}, consumeState: async () => storedState, getGeneration: async () => 0, getConnection: async () => null, putConnection: async () => {} };
  const config = { shopifyClientId: "id", shopifyClientSecret: "secret", shopifyRedirectUri: "https://api.example.com/callback", shopifyTokenEncryptionSecret: "encryption", allowedOrigins: ["https://app.example.com"] };
  const resolveScope = vi.fn(async () => ({ partitionKey: "user:42", scopeType: "user" as const, scopeId: "42" }));
  const fetcher = vi.fn();
  const changedShop = callback("mine.myshopify.com", "one-use", "secret");
  changedShop.set("shop", "other.myshopify.com");
  await assert.rejects(() => completeShopifyConnection(config, store, resolveScope, changedShop, fetcher));
  const tampered = callback("mine.myshopify.com", "one-use", "secret");
  tampered.set("code", "different");
  await assert.rejects(() => completeShopifyConnection(config, store, resolveScope, tampered, fetcher));
  assert.equal(fetcher.mock.calls.length, 0);
});

test("a merchant cancellation returns to the trusted app without exchanging a token", async () => {
  const storedState = { state: "one-use", shop: "mine.myshopify.com", actorUserId: "42", scopeKey: "user:42", scopeType: "user" as const, scopeId: "42", generation: 0, appReturnUrl: "https://app.example.com/config", expiresAt: new Date(Date.now() + 60_000).toISOString() };
  const store: ShopifyConnectionStore = { createState: async () => {}, consumeState: async () => storedState, getGeneration: async () => 0, getConnection: async () => null, putConnection: async () => { throw new Error("should not store"); } };
  const config = { shopifyClientId: "id", shopifyClientSecret: "secret", shopifyRedirectUri: "https://api.example.com/callback", shopifyTokenEncryptionSecret: "encryption", allowedOrigins: ["https://app.example.com"] };
  const resolveScope = vi.fn(async () => ({ partitionKey: "user:42", scopeType: "user" as const, scopeId: "42" }));
  const params = callback("mine.myshopify.com", "one-use", "secret");
  params.delete("code");
  params.set("error", "access_denied");
  params.delete("hmac");
  params.set("hmac", createHmac("sha256", "secret").update([...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("&")).digest("hex"));
  const result = await completeShopifyConnection(config, store, resolveScope, params, vi.fn());
  assert.equal(new URL(result.redirectUrl).searchParams.get("shopify"), "cancelled");
});

test("callback refuses a different store already connected to the same scope before token exchange", async () => {
  const storedState = { state: "one-use", shop: "other.myshopify.com", actorUserId: "42", scopeKey: "user:42", scopeType: "user" as const, scopeId: "42", generation: 0, appReturnUrl: "https://app.example.com/", expiresAt: new Date(Date.now() + 60_000).toISOString() };
  const putConnection = vi.fn();
  const store: ShopifyConnectionStore = {
    createState: async () => {}, consumeState: async () => storedState, getGeneration: async () => 0,
    getConnection: async () => ({ scopeKey: "user:42", scopeType: "user", scopeId: "42", shop: "mine.myshopify.com", accessTokenCiphertext: "ciphertext", scopes: [], connectedByUserId: "42", updatedAt: "2026-09-28T00:00:00Z" }),
    putConnection
  };
  const config = { shopifyClientId: "id", shopifyClientSecret: "secret", shopifyRedirectUri: "https://api.example.com/callback", shopifyTokenEncryptionSecret: "encryption", allowedOrigins: ["https://app.example.com"] };
  const resolveScope = vi.fn(async () => ({ partitionKey: "user:42", scopeType: "user" as const, scopeId: "42" }));
  const fetcher = vi.fn();
  await assert.rejects(() => completeShopifyConnection(config, store, resolveScope, callback("other.myshopify.com", "one-use", "secret"), fetcher), { status: 409 });
  assert.equal(fetcher.mock.calls.length, 0);
  assert.equal(putConnection.mock.calls.length, 0);
});
