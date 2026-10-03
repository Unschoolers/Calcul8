import { shopifyProductSearch, shopifyProductLink, shopifyProductListing } from "../features/shopify/catalogHandlers";
import { shopifyProductBinding } from "../features/shopify/bindingHandlers";
import { shopifyProductDetails } from "../features/shopify/productDetailsHandlers";
import { shopifyBindingSummary } from "../features/shopify/bindingSummaryHandlers";
import { shopifyProductCreatePreview, shopifyProductCreate } from "../features/shopify/draftHandlers";
import { shopifyProductStock } from "../features/shopify/stockHandlers";
import { app } from "@azure/functions";
import { shopifyConnectStart, shopifyConnectCallback, shopifyStatus, shopifyDisconnect } from "../features/shopify/handlers";

app.http("shopifyConnectStart", { methods: ["POST", "OPTIONS"], authLevel: "anonymous", route: "integrations/shopify/connect/start", handler: shopifyConnectStart });
app.http("shopifyConnectCallback", { methods: ["GET"], authLevel: "anonymous", route: "integrations/shopify/connect/callback", handler: shopifyConnectCallback });
app.http("shopifyStatus", { methods: ["POST", "OPTIONS"], authLevel: "anonymous", route: "integrations/shopify/status", handler: shopifyStatus });
app.http("shopifyDisconnect", { methods: ["POST", "OPTIONS"], authLevel: "anonymous", route: "integrations/shopify/disconnect", handler: shopifyDisconnect });

app.http("shopifyProductSearch", { methods: ["POST", "OPTIONS"], authLevel: "anonymous", route: "integrations/shopify/products/search", handler: shopifyProductSearch });
app.http("shopifyProductLink", { methods: ["POST", "OPTIONS"], authLevel: "anonymous", route: "integrations/shopify/products/link", handler: shopifyProductLink });
app.http("shopifyProductBinding", { methods: ["POST", "OPTIONS"], authLevel: "anonymous", route: "integrations/shopify/products/binding", handler: shopifyProductBinding });
app.http("shopifyProductDetails", { methods: ["POST", "OPTIONS"], authLevel: "anonymous", route: "integrations/shopify/products/details", handler: shopifyProductDetails });
app.http("shopifyBindingSummary", { methods: ["POST", "OPTIONS"], authLevel: "anonymous", route: "integrations/shopify/products/bindings", handler: shopifyBindingSummary });
app.http("shopifyProductCreatePreview", { methods: ["POST", "OPTIONS"], authLevel: "anonymous", route: "integrations/shopify/products/create-preview", handler: shopifyProductCreatePreview });
app.http("shopifyProductCreate", { methods: ["POST", "OPTIONS"], authLevel: "anonymous", route: "integrations/shopify/products/create", handler: shopifyProductCreate });
app.http("shopifyProductListing", { methods: ["POST", "OPTIONS"], authLevel: "anonymous", route: "integrations/shopify/products/listing", handler: shopifyProductListing });
app.http("shopifyProductStock", { methods: ["POST", "OPTIONS"], authLevel: "anonymous", route: "integrations/shopify/products/stock", handler: shopifyProductStock });
