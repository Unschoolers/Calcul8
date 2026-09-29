import { randomUUID } from "node:crypto";
import type { ShopifyListingClient } from "./listingService";
import { isShopifyDomain } from "../../lib/shopify";

// Shopify's latest stable release at implementation time. Pinning keeps mutations predictable.
const API_VERSION = "2026-07";
type GraphqlResponse = { data?: Record<string, unknown>; errors?: { message: string }[] };
type Fetcher = typeof fetch;

export function createShopifyAdminClient(shop: string, getToken: () => Promise<string>, fetcher: Fetcher = fetch): ShopifyListingClient {
  if (!isShopifyDomain(shop)) throw new Error("Invalid Shopify shop domain");
  const graphql = async <T>(query: string, variables: Record<string, unknown>): Promise<T> => {
    const response = await fetcher(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": await getToken() },
      body: JSON.stringify({ query, variables })
    });
    if (!response.ok) throw new Error(`Shopify Admin API returned ${response.status}`);
    const body = await response.json() as GraphqlResponse;
    if (body.errors?.length) throw new Error(body.errors.map((error) => error.message).join("; "));
    if (!body.data) throw new Error("Shopify returned no data");
    return body.data as T;
  };
  const checkErrors = (payload: { userErrors?: { message: string }[] } | null | undefined): void => {
    if (!payload) throw new Error("Shopify returned no mutation result");
    if (payload.userErrors?.length) throw new Error(payload.userErrors.map((error) => error.message).join("; "));
  };
  return {
    async upsertBoxProduct(input) {
      let locationId = input.locationId;
      if (!locationId) {
        const locations = await graphql<{ locations?: { nodes?: { id: string; isActive: boolean }[] } }>(
          `query { locations(first: 20) { nodes { id isActive } } }`, {});
        locationId = locations.locations?.nodes?.find((item) => item.isActive)?.id;
        if (!locationId) throw new Error("Shopify needs an active inventory location");
      }
      const variant = {
        ...(input.variantId ? { id: input.variantId } : {}),
        optionValues: [{ optionName: "Format", name: "Sealed box" }],
        sku: input.sku, price: input.price, inventoryPolicy: "DENY",
        inventoryItem: { tracked: true },
        ...(!input.id ? { inventoryQuantities: [{ locationId, name: "available", quantity: 0 }] } : {})
      };
      const data = await graphql<{ productSet?: {
        product?: { id: string; variants?: { nodes?: { id: string; inventoryItem?: { id: string } }[] } };
        userErrors?: { message: string }[];
      } }>(`mutation BoxProduct($input: ProductSetInput!, $identifier: ProductSetIdentifiers) {
        productSet(input: $input, identifier: $identifier, synchronous: true) {
          product { id variants(first: 2) { nodes { id inventoryItem { id } } } }
          userErrors { message }
        }
      }`, {
        identifier: input.id ? { id: input.id } : { handle: input.handle },
        input: { title: input.title, handle: input.handle, status: input.active ? "ACTIVE" : "DRAFT",
          productType: "Sealed box", vendor: "Calcul8",
          productOptions: [{ name: "Format", position: 1, values: [{ name: "Sealed box" }] }], variants: [variant] }
      });
      checkErrors(data.productSet);
      const product = data.productSet?.product;
      const onlyVariant = product?.variants?.nodes;
      if (!product?.id || onlyVariant?.length !== 1 || !onlyVariant[0]?.id || !onlyVariant[0].inventoryItem?.id) {
        throw new Error("Shopify box product has no unique tracked variant");
      }
      return { productId: product.id, variantId: onlyVariant[0].id,
        inventoryItemId: onlyVariant[0].inventoryItem.id, locationId };
    },
    async activateProduct(productId) {
      const data = await graphql<{ productUpdate?: { userErrors?: { message: string }[] } }>(
        `mutation ActivateBox($product: ProductUpdateInput!) { productUpdate(product: $product) { userErrors { message } } }`,
        { product: { id: productId, status: "ACTIVE" } });
      checkErrors(data.productUpdate);
      const publications = await graphql<{ publications?: { nodes?: { id: string; name: string }[] } }>(
        `query { publications(first: 50) { nodes { id name } } }`, {});
      const onlineStore = publications.publications?.nodes?.find((item) => item.name === "Online Store");
      if (!onlineStore) throw new Error("Shopify Online Store publication is unavailable");
      const published = await graphql<{ publishablePublish?: { userErrors?: { message: string }[] } }>(
        `mutation PublishBox($id: ID!, $input: [PublicationInput!]!) {
          publishablePublish(id: $id, input: $input) { userErrors { message } }
        }`, { id: productId, input: [{ publicationId: onlineStore.id }] });
      checkErrors(published.publishablePublish);
    },
    async pauseProduct(productId) {
      const data = await graphql<{ productUpdate?: { userErrors?: { message: string }[] } }>(
        `mutation PauseBox($product: ProductUpdateInput!) { productUpdate(product: $product) { userErrors { message } } }`,
        { product: { id: productId, status: "DRAFT" } });
      checkErrors(data.productUpdate);
    },
    async ensureOrderWebhooks(callbackUrl) {
      const existing = await graphql<{ webhookSubscriptions?: { nodes?: { topic: string; uri: string }[] } }>(
        `query OrderWebhooks($uri: String!) { webhookSubscriptions(first: 50, uri: $uri) { nodes { topic uri } } }`,
        { uri: callbackUrl });
      for (const topic of ["ORDERS_PAID", "ORDERS_CANCELLED"] as const) {
        if (existing.webhookSubscriptions?.nodes?.some((item) => item.topic === topic && item.uri === callbackUrl)) continue;
        const result = await graphql<{ webhookSubscriptionCreate?: { userErrors?: { message: string }[] } }>(
          `mutation SubscribeOrders($topic: WebhookSubscriptionTopic!, $input: WebhookSubscriptionInput!) {
            webhookSubscriptionCreate(topic: $topic, webhookSubscription: $input) { userErrors { message } }
          }`, { topic, input: { uri: callbackUrl, format: "JSON" } });
        checkErrors(result.webhookSubscriptionCreate);
      }
    },
    async setAvailable({ inventoryItemId, locationId, quantity, previousQuantity }) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const stock = await graphql<{ inventoryItem?: { inventoryLevel?: { quantities?: { quantity: number }[] } } }>(
          `query BoxStock($id: ID!, $locationId: ID!) {
            inventoryItem(id: $id) { inventoryLevel(locationId: $locationId) { quantities(names: ["available"]) { quantity } } }
          }`, { id: inventoryItemId, locationId });
        const actual = stock.inventoryItem?.inventoryLevel?.quantities?.[0]?.quantity;
        if (typeof actual !== "number" || !Number.isSafeInteger(actual)) throw new Error("Shopify inventory location is not active");
        if (actual === quantity) return;
        // A Shopify sale can decrement stock before its order is imported. Never silently restore it.
        if (actual < previousQuantity && quantity > actual) throw new Error("Shopify has an unimported sale; inventory increase postponed");
        const data = await graphql<{ inventorySetQuantities?: { userErrors?: { message: string; code?: string }[] } }>(
          `mutation SetBoxStock($input: InventorySetQuantitiesInput!, $key: String!) {
            inventorySetQuantities(input: $input) @idempotent(key: $key) { userErrors { code message } }
          }`, { key: randomUUID(), input: { name: "available", reason: "correction",
            referenceDocumentUri: `calcul8://shopify/inventory/${encodeURIComponent(inventoryItemId)}`,
            quantities: [{ inventoryItemId, locationId, quantity, compareQuantity: actual }] } });
        const errors = data.inventorySetQuantities?.userErrors;
        if (!errors?.length) return;
        if (!errors.every((error) => error.code === "CHANGE_FROM_QUANTITY_STALE" || error.code === "COMPARE_QUANTITY_STALE") || attempt === 2) {
          checkErrors(data.inventorySetQuantities);
        }
      }
    }
  };
}
