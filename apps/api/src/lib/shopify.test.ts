import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test, vi } from "vitest";
import { buildShopifyAuthorizeUrl, decryptShopifyToken, encryptShopifyToken, exchangeShopifyCode, isShopifyDomain, refreshShopifyToken, verifyShopifyCallback } from "./shopify";

test("Shopify shop input must be a canonical myshopify domain", () => {
  assert.equal(isShopifyDomain("my-store.myshopify.com"), true);
  assert.equal(isShopifyDomain("my-store.myshopify.com.evil.test"), false);
  assert.equal(isShopifyDomain("https://my-store.myshopify.com"), false);
  assert.equal(isShopifyDomain("localhost"), false);
});

test("authorization URL carries the exact shop, callback, scopes and one-use state", () => {
  const url = new URL(buildShopifyAuthorizeUrl({ shop: "my-store.myshopify.com", clientId: "app-id", redirectUri: "https://api.example.com/callback", state: "opaque" }));
  assert.equal(url.origin, "https://my-store.myshopify.com");
  assert.equal(url.searchParams.get("client_id"), "app-id");
  assert.equal(url.searchParams.get("redirect_uri"), "https://api.example.com/callback");
  assert.equal(url.searchParams.get("state"), "opaque");
  assert.match(url.searchParams.get("scope") ?? "", /write_inventory/);
});

test("Shopify callback requires valid HMAC and recent timestamp", () => {
  const params = new URLSearchParams({ shop: "my-store.myshopify.com", code: "secret-code", state: "opaque", timestamp: "1780000000" });
  const message = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("&");
  params.set("hmac", createHmac("sha256", "app-secret").update(message).digest("hex"));
  assert.equal(verifyShopifyCallback(params, "app-secret", 1780000000), true);
  params.set("code", "tampered");
  assert.equal(verifyShopifyCallback(params, "app-secret", 1780000000), false);
  params.set("timestamp", "1");
  assert.equal(verifyShopifyCallback(params, "app-secret", 1780000000), false);
});

test("exchanges a code only with the canonical shop over HTTPS", async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ access_token: "private-token", scope: "read_products,write_products,write_inventory" }), { status: 200 }));
  const result = await exchangeShopifyCode({ shop: "my-store.myshopify.com", clientId: "app-id", clientSecret: "app-secret", code: "one-time-code" }, fetcher);
  assert.equal(result.access_token, "private-token");
  assert.equal(fetcher.mock.calls[0]?.[0], "https://my-store.myshopify.com/admin/oauth/access_token");
  assert.equal(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).expiring, 1);
  await assert.rejects(() => exchangeShopifyCode({ shop: "localhost", clientId: "app-id", clientSecret: "app-secret", code: "x" }, fetcher));
});

test("Shopify access tokens are encrypted with authenticated, randomized ciphertext", () => {
  const first = encryptShopifyToken("encryption-secret", "private-token");
  const second = encryptShopifyToken("encryption-secret", "private-token");
  assert.notEqual(first, second);
  assert.ok(!first.includes("private-token"));
  assert.equal(decryptShopifyToken("encryption-secret", first), "private-token");
  assert.throws(() => decryptShopifyToken("wrong-secret", first));
  assert.throws(() => decryptShopifyToken("encryption-secret", `${first}x`));
});

test("an expiring offline token can be refreshed without another merchant install", async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600, scope: "write_inventory" }), { status: 200 }));
  const token = await refreshShopifyToken({ shop: "my-store.myshopify.com", clientId: "id", clientSecret: "secret", refreshToken: "old-refresh" }, fetcher);
  assert.equal(token.access_token, "new-access");
  const request = fetcher.mock.calls[0];
  assert.equal(request?.[0], "https://my-store.myshopify.com/admin/oauth/access_token");
  const body = new URLSearchParams(request?.[1]?.body as string);
  assert.equal(body.get("grant_type"), "refresh_token");
  assert.equal(body.get("refresh_token"), "old-refresh");
});
