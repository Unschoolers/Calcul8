import { app } from "@azure/functions";
import { shopifyConnectStart, shopifyConnectCallback, shopifyStatus, shopifyDisconnect } from "../features/shopify/handlers";

app.http("shopifyConnectStart", { methods: ["POST", "OPTIONS"], authLevel: "anonymous", route: "integrations/shopify/connect/start", handler: shopifyConnectStart });
app.http("shopifyConnectCallback", { methods: ["GET"], authLevel: "anonymous", route: "integrations/shopify/connect/callback", handler: shopifyConnectCallback });
app.http("shopifyStatus", { methods: ["POST", "OPTIONS"], authLevel: "anonymous", route: "integrations/shopify/status", handler: shopifyStatus });
app.http("shopifyDisconnect", { methods: ["POST", "OPTIONS"], authLevel: "anonymous", route: "integrations/shopify/disconnect", handler: shopifyDisconnect });
