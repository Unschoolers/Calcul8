import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SHOPIFY_SCOPES = "read_products,write_products,read_inventory,write_inventory,read_locations";
const CALLBACK_MAX_AGE_SECONDS = 600;

export function isShopifyDomain(shop: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) && shop.length <= 253;
}

export function buildShopifyAuthorizeUrl(input: { shop: string; clientId: string; redirectUri: string; state: string }): string {
  if (!isShopifyDomain(input.shop) || !input.clientId || !input.redirectUri || !input.state) throw new Error("Invalid Shopify connection settings");
  const url = new URL(`https://${input.shop}/admin/oauth/authorize`);
  url.search = new URLSearchParams({ client_id: input.clientId, scope: SHOPIFY_SCOPES, redirect_uri: input.redirectUri, state: input.state }).toString();
  return url.toString();
}

export function verifyShopifyCallback(params: URLSearchParams, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  const hmac = params.get("hmac");
  const shop = params.get("shop");
  const timestamp = Number(params.get("timestamp"));
  if (!secret || !hmac || !/^[a-f0-9]{64}$/i.test(hmac) || !shop || !isShopifyDomain(shop)
    || !Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > CALLBACK_MAX_AGE_SECONDS) return false;
  const signed = [...params.entries()]
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const expected = createHmac("sha256", secret).update(signed).digest();
  return timingSafeEqual(expected, Buffer.from(hmac, "hex"));
}

export type ShopifyTokenResponse = { access_token: string; scope: string; expires_in?: number; refresh_token?: string };

export function encryptShopifyToken(secret: string, token: string): string {
  if (!secret || !token) throw new Error("Shopify encryption is not configured");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${encrypted.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
}

export function decryptShopifyToken(secret: string, ciphertext: string): string {
  const [version, ivPart, payloadPart, tagPart, extra] = ciphertext.split(".");
  if (!secret || version !== "v1" || !ivPart || !payloadPart || !tagPart || extra) throw new Error("Invalid Shopify token ciphertext");
  const iv = Buffer.from(ivPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Invalid Shopify token ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(payloadPart, "base64url")), decipher.final()]).toString("utf8");
}

export async function exchangeShopifyCode(
  input: { shop: string; clientId: string; clientSecret: string; code: string },
  fetcher: typeof fetch = fetch
): Promise<ShopifyTokenResponse> {
  if (!isShopifyDomain(input.shop) || !input.clientId || !input.clientSecret || !input.code) throw new Error("Invalid Shopify exchange settings");
  const response = await fetcher(`https://${input.shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: input.clientId, client_secret: input.clientSecret, code: input.code, expiring: 1 })
  });
  if (!response.ok) throw new Error("Shopify connection failed");
  const payload = await response.json() as Partial<ShopifyTokenResponse>;
  if (typeof payload.access_token !== "string" || !payload.access_token) throw new Error("Shopify did not return a token");
  return { access_token: payload.access_token, scope: typeof payload.scope === "string" ? payload.scope : "", expires_in: payload.expires_in, refresh_token: payload.refresh_token };
}

export async function refreshShopifyToken(
  input: { shop: string; clientId: string; clientSecret: string; refreshToken: string },
  fetcher: typeof fetch = fetch
): Promise<ShopifyTokenResponse> {
  if (!isShopifyDomain(input.shop) || !input.clientId || !input.clientSecret || !input.refreshToken) throw new Error("Invalid Shopify refresh settings");
  const response = await fetcher(`https://${input.shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: input.clientId, client_secret: input.clientSecret, grant_type: "refresh_token", refresh_token: input.refreshToken })
  });
  if (!response.ok) throw new Error("Shopify token refresh failed");
  const payload = await response.json() as Partial<ShopifyTokenResponse>;
  if (typeof payload.access_token !== "string" || !payload.access_token || typeof payload.refresh_token !== "string" || !payload.refresh_token) {
    throw new Error("Shopify token refresh response was incomplete");
  }
  return { access_token: payload.access_token, refresh_token: payload.refresh_token, scope: typeof payload.scope === "string" ? payload.scope : "", expires_in: payload.expires_in };
}
