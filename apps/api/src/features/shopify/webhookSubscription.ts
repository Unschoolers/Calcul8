import type { ApiConfig } from "../../types";
import { getShopifyConnection } from "../../lib/cosmos/shopifyRepository";
import { createShopifyAdminClient } from "./adminClient";
import { getShopifyAccessToken } from "./tokenProvider";

export function shopifyOrderWebhookUri(redirectUri: string): string {
  const url = new URL(redirectUri);
  if (url.protocol !== "https:" || !url.pathname.endsWith("/connect/callback")) {
    throw new Error("Shopify redirect URI cannot determine order webhook endpoint");
  }
  url.pathname = url.pathname.slice(0, -"/connect/callback".length) + "/webhooks/orders";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export async function ensureShopifyOrderWebhooks(config: ApiConfig, scopeKey: string, beforeMutation?: () => Promise<void>): Promise<void> {
  if (!config.shopifyRedirectUri) return;
  const connection = await getShopifyConnection(config, scopeKey);
  if (!connection) return;
  const client = createShopifyAdminClient(connection.shop, () => getShopifyAccessToken(config, scopeKey, connection.shop));
  await client.ensureOrderWebhooks(shopifyOrderWebhookUri(config.shopifyRedirectUri), beforeMutation);
}
