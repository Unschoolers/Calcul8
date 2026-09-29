import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { getConfig } from "../lib/config";
import { processShopifyOrderWebhook, verifyShopifyWebhook } from "../features/shopify/orderWebhook";

export async function shopifyOrderWebhook(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const config = getConfig();
  if (!config.shopifyClientSecret) return { status: 503 };
  const raw = Buffer.from(await request.arrayBuffer());
  if (!verifyShopifyWebhook(raw, request.headers.get("x-shopify-hmac-sha256"), config.shopifyClientSecret)) return { status: 401 };
  const shop = request.headers.get("x-shopify-shop-domain") ?? "";
  const topic = request.headers.get("x-shopify-topic") ?? "";
  try {
    await processShopifyOrderWebhook(config, shop, topic, JSON.parse(raw.toString("utf8")));
    return { status: 200, jsonBody: { ok: true } };
  } catch (error) {
    context.error("Shopify order webhook failed; Shopify should retry", error);
    return { status: 500 };
  }
}

app.http("shopifyOrderWebhook", {
  methods: ["POST"], authLevel: "anonymous", route: "integrations/shopify/webhooks/orders",
  handler: shopifyOrderWebhook
});
