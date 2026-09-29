import type { ApiConfig } from "../../types";
import { decryptShopifyToken, encryptShopifyToken, refreshShopifyToken } from "../../lib/shopify";
import { getShopifyConnection, replaceShopifyConnectionIfCurrent } from "../../lib/cosmos/shopifyRepository";

const pending = new Map<string, Promise<string>>();

export async function getShopifyAccessToken(config: ApiConfig, scopeKey: string, shop: string): Promise<string> {
  const current = pending.get(scopeKey);
  if (current) return current;
  const task = resolveToken(config, scopeKey, shop);
  pending.set(scopeKey, task);
  try { return await task; } finally { if (pending.get(scopeKey) === task) pending.delete(scopeKey); }
}

async function resolveToken(config: ApiConfig, scopeKey: string, shop: string): Promise<string> {
  const secret = config.shopifyTokenEncryptionSecret;
  if (!secret || !config.shopifyClientId || !config.shopifyClientSecret) throw new Error("Shopify is not configured");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const connection = await getShopifyConnection(config, scopeKey);
    if (!connection || connection.shop !== shop) throw new Error("Shopify connection is missing");
    if (!connection.tokenExpiresAt || Date.parse(connection.tokenExpiresAt) > Date.now() + 5 * 60_000) {
      return decryptShopifyToken(secret, connection.accessTokenCiphertext);
    }
    if (!connection.refreshTokenCiphertext) throw new Error("Shopify needs to be reconnected");
    try {
      const refreshed = await refreshShopifyToken({
        shop, clientId: config.shopifyClientId, clientSecret: config.shopifyClientSecret,
        refreshToken: decryptShopifyToken(secret, connection.refreshTokenCiphertext)
      });
      const next = {
        ...connection,
        accessTokenCiphertext: encryptShopifyToken(secret, refreshed.access_token),
        refreshTokenCiphertext: encryptShopifyToken(secret, refreshed.refresh_token!),
        tokenExpiresAt: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString() : undefined,
        scopes: refreshed.scope ? refreshed.scope.split(",").filter(Boolean) : connection.scopes,
        updatedAt: new Date().toISOString()
      };
      if (await replaceShopifyConnectionIfCurrent(config, connection, next)) return refreshed.access_token;
    } catch (error) {
      const newer = await getShopifyConnection(config, scopeKey);
      if (!newer || newer.refreshTokenCiphertext === connection.refreshTokenCiphertext) throw error;
    }
  }
  throw new Error("Shopify token refresh is busy; retry shortly");
}
