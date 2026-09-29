import { app, type InvocationContext, type Timer } from "@azure/functions";
import { getConfig } from "../lib/config";
import { listShopifyConnectionScopes } from "../lib/cosmos/shopifyRepository";
import { ensureShopifyOrderWebhooks } from "../features/shopify/webhookSubscription";
import { reconcileShopifyScope } from "../features/shopify/reconcileService";

export async function shopifyReconcileTimer(_timer: Timer, context: InvocationContext): Promise<void> {
  const config = getConfig();
  if (!config.shopifyClientId || !config.shopifyTokenEncryptionSecret) return;
  const scopeKeys = await listShopifyConnectionScopes(config);
  for (const scopeKey of scopeKeys) {
    try { await ensureShopifyOrderWebhooks(config, scopeKey); await reconcileShopifyScope(config, scopeKey); }
    catch (error) { context.warn("Shopify reconciliation failed; next scheduled run will retry", { scopeKey, error }); }
  }
}

app.timer("shopifyReconcile", { schedule: "0 */5 * * * *", handler: shopifyReconcileTimer });
