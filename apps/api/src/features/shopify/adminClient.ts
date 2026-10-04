import { uploadLotImage, type StagedImageTarget } from "./lotImageUpload";
import type { ShopifyCatalogClient } from "./catalogService";
import { normalizeShopifyVariant, variantFields, type ShopifyVariantNode } from "./catalogTypes";
import { randomUUID } from "node:crypto";
import type { ShopifyListingClient } from "./listingService";
import { isShopifyDomain } from "../../lib/shopify";

// Shopify's latest stable release at implementation time. Pinning keeps mutations predictable.
const API_VERSION = "2026-07";
type GraphqlResponse = { data?: Record<string, unknown>; errors?: { message: string }[] };
type Fetcher = typeof fetch;
export type ShopifyLinkedDraftClient = {
  listActiveLocations(): Promise<{ id: string; name: string; isActive: boolean }[]>;
  getShopCurrency(): Promise<string>;
  findOwnedDraft(handle: string, ownershipHash: string, locationId: string, options?: { variantTitle: "Sealed box" | "Booster box" }): Promise<{ productId: string; variantId: string; inventoryItemId: string; available: number } | null>;
  createLinkedDraft(input: { handle: string; ownershipHash: string; title: string; sku: string; price: string; locationId: string; quantity: number; variantTitle?: "Sealed box" | "Booster box"; image?: string; beforeMutation?: () => Promise<void> }): Promise<{ productId: string; variantId: string; inventoryItemId: string }>;
};
export type ShopifyProductDetailsClient = {
  updateProductTitle(productId: string, title: string, beforeMutation?: () => Promise<void>): Promise<void>;
  updateVariantPrice(productId: string, variantId: string, price: string, beforeMutation?: () => Promise<void>): Promise<void>;
};

function buildVariantSearchQuery(input: string): string {
  return input.trim().split(/\s+/).filter(Boolean).map((rawTerm) => {
    // Shopify treats these uppercase words as connectives/modifiers. Search case-insensitively
    // while lowering the reserved forms so user text can never become query syntax.
    const term = /^(AND|OR|NOT)$/i.test(rawTerm) ? rawTerm.toLowerCase() : rawTerm;
    return `${term.replace(/[\\:()"'*\-]/g, (character) => `\\${character}`)}*`;
  }).join(" ");
}

export function createShopifyAdminClient(shop: string, getToken: () => Promise<string>, fetcher: Fetcher = fetch): ShopifyListingClient & ShopifyCatalogClient & ShopifyLinkedDraftClient & ShopifyProductDetailsClient {
  if (!isShopifyDomain(shop)) throw new Error("Invalid Shopify shop domain");
  const graphql = async <T>(query: string, variables: Record<string, unknown>, beforeMutation?: () => Promise<void>): Promise<T> => {
    const token = await getToken();
    await beforeMutation?.();
    const response = await fetcher(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(30_000)
    });
    if (!response.ok) throw new Error(`Shopify Admin API returned ${response.status}`);
    const body = await response.json() as GraphqlResponse;
    if (body.errors?.length) throw new Error(body.errors.map((error) => error.message).join("; "));
    if (!body.data) throw new Error("Shopify returned no data");
    return body.data as T;
  };
  const checkErrors = (payload: { userErrors?: { message: string }[] } | null | undefined): void => {
    if (!payload) throw new Error("Shopify returned no mutation result");
    if (payload.userErrors?.length) throw Object.assign(new Error(payload.userErrors.map((error) => error.message).join("; ")), { definitive: true });
  };
  return {
    async updateProductTitle(productId, title, beforeMutation) {
      const data = await graphql<{ productUpdate?: { product?: { id: string }; userErrors?: { message: string }[] } }>(
        `mutation UpdateLinkedTitle($product: ProductUpdateInput!) { productUpdate(product: $product) { product { id } userErrors { message } } }`,
        { product: { id: productId, title } }, beforeMutation);
      checkErrors(data.productUpdate);
      if (data.productUpdate?.product?.id !== productId) throw new Error("Shopify product identity mismatch");
    },
    async updateVariantPrice(productId, variantId, price, beforeMutation) {
      const data = await graphql<{ productVariantsBulkUpdate?: { product?: { id: string }; productVariants?: { id: string }[]; userErrors?: { message: string }[] } }>(
        `mutation UpdateLinkedPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $productId, variants: $variants, allowPartialUpdates: false) { product { id } productVariants { id } userErrors { message } } }`,
        { productId, variants: [{ id: variantId, price }] }, beforeMutation);
      checkErrors(data.productVariantsBulkUpdate);
      if (data.productVariantsBulkUpdate?.product?.id !== productId || data.productVariantsBulkUpdate.productVariants?.length !== 1 ||
        data.productVariantsBulkUpdate.productVariants[0]?.id !== variantId) throw new Error("Shopify variant identity mismatch");
    },
    async listActiveLocations() {
      const locations: { id: string; name: string; isActive: boolean }[] = [];
      let after: string | null = null;
      do {
        type LocationPage = { locations?: { nodes?: { id: string; name: string; isActive: boolean }[]; pageInfo?: { hasNextPage: boolean; endCursor: string | null } } };
        const data: LocationPage = await graphql<LocationPage>(
          `query ActiveShopLocations($after: String) { locations(first: 100, after: $after) { nodes { id name isActive } pageInfo { hasNextPage endCursor } } }`, { after });
        const page: NonNullable<LocationPage["locations"]> | undefined = data.locations;
        if (!page) throw new Error("Shopify returned no locations");
        locations.push(...page.nodes!.filter(item => item.isActive && item.name.trim()));
        after = page.pageInfo?.hasNextPage ? page.pageInfo.endCursor : null;
        if (page.pageInfo?.hasNextPage && !after) throw new Error("Shopify returned an invalid location cursor");
      } while (after);
      return locations;
    },
    async getShopCurrency() {
      const data = await graphql<{ shop?: { currencyCode?: string } }>(`query ShopCurrency { shop { currencyCode } }`, {});
      const currency = data.shop?.currencyCode;
      if (!currency || !/^[A-Z]{3}$/.test(currency)) throw new Error("Shopify returned an invalid store currency");
      return currency;
    },
    async findOwnedDraft(handle, ownershipHash, locationId, options) {
      const data = await graphql<{ product?: { id: string; handle: string; metafield?: { value: string } | null; variants?: { nodes?: { id: string; title: string; inventoryItem?: { id: string; tracked: boolean; inventoryLevel?: { location?: { id: string; isActive: boolean } | null; quantities?: { name: string; quantity: number }[] } | null } }[] } | null } | null }>(
        `query DraftByHandle($identifier: ProductIdentifierInput!, $locationId: ID!) { product: productByIdentifier(identifier: $identifier) { id handle metafield(namespace: "calcul8", key: "draft_owner") { value } variants(first: 2) { nodes { id title inventoryItem { id tracked inventoryLevel(locationId: $locationId) { location { id isActive } quantities(names: ["available"]) { name quantity } } } } } } }`, { identifier: { handle }, locationId });
      if (data.product === undefined) throw new Error("Shopify returned no product lookup result");
      if (data.product === null) return null;
      const product = data.product;
      if (product.handle !== handle || product.metafield?.value !== ownershipHash) throw new Error("Shopify draft handle belongs to another product");
      const variants = product.variants?.nodes ?? [];
      if (variants.length !== 1 || variants[0]?.title !== (options?.variantTitle ?? "Sealed box") || !variants[0]?.inventoryItem?.tracked ||
        !/^gid:\/\/shopify\/Product\/\d+$/.test(product.id) || !/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(variants[0]?.id ?? "") ||
        !/^gid:\/\/shopify\/InventoryItem\/\d+$/.test(variants[0]?.inventoryItem?.id ?? "")) throw new Error("Shopify draft does not match the sealed-box product");
      const location = variants[0]!.inventoryItem!.inventoryLevel?.location;
      if (location?.id !== locationId || !location.isActive) throw new Error("Shopify draft is not stocked at the selected active location");
      const available = variants[0]!.inventoryItem!.inventoryLevel?.quantities?.find(quantity => quantity.name === "available")?.quantity;
      if (!Number.isSafeInteger(available)) throw new Error("Shopify draft returned invalid available stock");
      return { productId: product.id, variantId: variants[0]!.id, inventoryItemId: variants[0]!.inventoryItem!.id, available: available! };
    },
    async createLinkedDraft(input) {
      const variantTitle = input.variantTitle ?? "Sealed box";
      const imageSource = input.image ? await uploadLotImage({ image: input.image, filename: input.handle, fetcher, assertCurrent: input.beforeMutation,
        stage: async (mimeType, filename) => {
          const staged = await graphql<{ stagedUploadsCreate?: { stagedTargets?: StagedImageTarget[]; userErrors?: { message: string }[] } }>(
            `mutation StageLotImage($input: [StagedUploadInput!]!) { stagedUploadsCreate(input: $input) { stagedTargets { url resourceUrl parameters { name value } } userErrors { message } } }`,
            { input: [{ filename, mimeType, resource: "PRODUCT_IMAGE", httpMethod: "POST" }] }, input.beforeMutation);
          checkErrors(staged.stagedUploadsCreate);
          const targets = staged.stagedUploadsCreate?.stagedTargets;
          if (targets?.length !== 1 || !targets[0]) throw new Error("Shopify returned no image upload target");
          return targets[0];
        }
      }) : undefined;
      const data = await graphql<{ productSet?: { product?: { id: string; variants?: { nodes?: { id: string; title: string; inventoryItem?: { id: string; tracked: boolean } }[] } }; userErrors?: { message: string }[] } }>(
        `mutation CreateLinkedDraft($input: ProductSetInput!, $identifier: ProductSetIdentifiers) { productSet(input: $input, identifier: $identifier, synchronous: true) { product { id variants(first: 2) { nodes { id title inventoryItem { id tracked } } } } userErrors { message } } }`, {
          identifier: { handle: input.handle }, input: { ...(imageSource ? { files: [{ originalSource: imageSource, contentType: "IMAGE", alt: input.title }] } : {}), title: input.title, handle: input.handle, status: "DRAFT", productType: "Sealed box", vendor: "Calcul8",
            metafields: [{ namespace: "calcul8", key: "draft_owner", type: "single_line_text_field", value: input.ownershipHash }],
            productOptions: [{ name: "Format", position: 1, values: [{ name: variantTitle }] }], variants: [{ optionValues: [{ optionName: "Format", name: variantTitle }], sku: input.sku, price: input.price, inventoryPolicy: "DENY", inventoryItem: { tracked: true }, inventoryQuantities: [{ locationId: input.locationId, name: "available", quantity: input.quantity }] }] }
        }, input.beforeMutation);
      checkErrors(data.productSet);
      const product = data.productSet?.product, variant = product?.variants?.nodes;
      if (!/^gid:\/\/shopify\/Product\/\d+$/.test(product?.id ?? "") || variant?.length !== 1 || variant[0]?.title !== variantTitle || !/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(variant[0]?.id ?? "") || !variant[0]?.inventoryItem?.tracked || !/^gid:\/\/shopify\/InventoryItem\/\d+$/.test(variant[0]?.inventoryItem?.id ?? "")) throw new Error("Shopify did not create a single tracked sealed-box variant");
      return { productId: product!.id, variantId: variant![0]!.id, inventoryItemId: variant![0]!.inventoryItem!.id };
    },
    async searchVariants(query, after) {
      // Treat text as literal search terms, never as caller-supplied Shopify filter syntax.
      const search = buildVariantSearchQuery(query);
      const data = await graphql<{ productVariants?: { nodes: ShopifyVariantNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }>(
        `query SearchVariants($query: String!, $after: String) {
          productVariants(first: 20, query: $query, after: $after) { nodes { ${variantFields(10)} } pageInfo { hasNextPage endCursor } }
        }`, { query: search, after: after ?? null });
      if (!data.productVariants) throw new Error("Shopify returned no variant search results");
      const variants = data.productVariants.nodes.flatMap(node => { const variant = normalizeShopifyVariant(node); return variant ? [variant] : []; });
      return { variants, matchedVariantCount: data.productVariants.nodes.length,
        excludedVariantCount: data.productVariants.nodes.length - variants.length, pageInfo: data.productVariants.pageInfo };
    },
    async getVariant(variantId) {
      if (!/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(variantId)) throw new Error("Invalid Shopify variant ID");
      const data = await graphql<{ productVariant?: ShopifyVariantNode | null }>(
        `query LinkedVariant($id: ID!) { productVariant(id: $id) { ${variantFields()} } }`, { id: variantId });
      return normalizeShopifyVariant(data.productVariant);
    },
    async getStock(inventoryItemId, locationId) {
      if (!/^gid:\/\/shopify\/InventoryItem\/\d+$/.test(inventoryItemId)) throw new Error("Invalid Shopify inventory item ID");
      if (!/^gid:\/\/shopify\/Location\/\d+$/.test(locationId)) throw new Error("Invalid Shopify inventory location ID");
      const data = await graphql<{ inventoryItem?: { tracked?: boolean; inventoryLevel?: {
        location?: { id: string; name: string; isActive: boolean } | null;
        quantities?: { name: string; quantity: number }[];
      } | null } | null }>(`query LinkedStock($id: ID!, $locationId: ID!) {
        inventoryItem(id: $id) { tracked inventoryLevel(locationId: $locationId) {
          location { id name isActive } quantities(names: ["available", "on_hand", "committed"]) { name quantity }
        } }
      }`, { id: inventoryItemId, locationId });
      const item = data.inventoryItem;
      const level = item?.inventoryLevel;
      if (!item || !item.tracked) throw new Error("Shopify inventory item is not tracked");
      if (!level?.location || level.location.id !== locationId || !level.location.isActive) throw new Error("Shopify inventory location is not active");
      const quantities = new Map((level.quantities ?? []).map(({ name, quantity }) => [name, quantity]));
      const available = quantities.get("available"), onHand = quantities.get("on_hand"), committed = quantities.get("committed");
      if (![available, onHand, committed].every((quantity) => typeof quantity === "number" && Number.isSafeInteger(quantity))) {
        throw new Error("Shopify returned invalid inventory quantities");
      }
      if (!level.location.name.trim()) throw new Error("Shopify returned an invalid inventory location");
      return { locationId: level.location.id, locationName: level.location.name, available: available!, onHand: onHand!, committed: committed! };
    },
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
  }, input.beforeMutation);
      checkErrors(data.productSet);
      const product = data.productSet?.product;
      const onlyVariant = product?.variants?.nodes;
      if (!product?.id || onlyVariant?.length !== 1 || !onlyVariant[0]?.id || !onlyVariant[0].inventoryItem?.id) {
        throw new Error("Shopify box product has no unique tracked variant");
      }
      return { productId: product.id, variantId: onlyVariant[0].id,
        inventoryItemId: onlyVariant[0].inventoryItem.id, locationId };
    },
async activateProduct(productId, beforeMutation) {
      const data = await graphql<{ productUpdate?: { userErrors?: { message: string }[] } }>(
        `mutation ActivateBox($product: ProductUpdateInput!) { productUpdate(product: $product) { userErrors { message } } }`,
    { product: { id: productId, status: "ACTIVE" } }, beforeMutation);
      checkErrors(data.productUpdate);
      const publications = await graphql<{ publications?: { nodes?: { id: string; name: string }[] } }>(
        `query { publications(first: 50) { nodes { id name } } }`, {});
      const onlineStore = publications.publications?.nodes?.find((item) => item.name === "Online Store");
      if (!onlineStore) throw new Error("Shopify Online Store publication is unavailable");
      const published = await graphql<{ publishablePublish?: { userErrors?: { message: string }[] } }>(
        `mutation PublishBox($id: ID!, $input: [PublicationInput!]!) {
          publishablePublish(id: $id, input: $input) { userErrors { message } }
    }`, { id: productId, input: [{ publicationId: onlineStore.id }] }, beforeMutation);
      checkErrors(published.publishablePublish);
    },
async pauseProduct(productId, beforeMutation) {
      const data = await graphql<{ productUpdate?: { userErrors?: { message: string }[] } }>(
        `mutation PauseBox($product: ProductUpdateInput!) { productUpdate(product: $product) { userErrors { message } } }`,
    { product: { id: productId, status: "DRAFT" } }, beforeMutation);
      checkErrors(data.productUpdate);
    },
    async ensureOrderWebhooks(callbackUrl, beforeMutation) {
      const existing = await graphql<{ webhookSubscriptions?: { nodes?: { topic: string; uri: string }[] } }>(
        `query OrderWebhooks($uri: String!) { webhookSubscriptions(first: 50, uri: $uri) { nodes { topic uri } } }`,
        { uri: callbackUrl });
      for (const topic of ["ORDERS_PAID", "ORDERS_CANCELLED"] as const) {
        if (existing.webhookSubscriptions?.nodes?.some((item) => item.topic === topic && item.uri === callbackUrl)) continue;
        const result = await graphql<{ webhookSubscriptionCreate?: { userErrors?: { message: string }[] } }>(
          `mutation SubscribeOrders($topic: WebhookSubscriptionTopic!, $input: WebhookSubscriptionInput!) {
            webhookSubscriptionCreate(topic: $topic, webhookSubscription: $input) { userErrors { message } }
          }`, { topic, input: { uri: callbackUrl, format: "JSON" } }, beforeMutation);
        checkErrors(result.webhookSubscriptionCreate);
      }
    },
    async setAvailable({ inventoryItemId, locationId, quantity, previousQuantity, beforeMutation }) {
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
            quantities: [{ inventoryItemId, locationId, quantity, changeFromQuantity: actual }] } }, beforeMutation);
        const errors = data.inventorySetQuantities?.userErrors;
        if (!errors?.length) return;
        // A different writer won the compare-quantity race. Rebuild desired stock from current source data;
        // retrying this caller's old target could raise inventory over a newer sale.
        if (errors.every((error) => error.code === "CHANGE_FROM_QUANTITY_STALE" || error.code === "COMPARE_QUANTITY_STALE")) {
          throw new Error("Shopify inventory changed; retry reconciliation from current sales");
        }
        if (!errors.every((error) => error.code === "CHANGE_FROM_QUANTITY_STALE" || error.code === "COMPARE_QUANTITY_STALE") || attempt === 2) {
          checkErrors(data.inventorySetQuantities);
        }
      }
    }
  };
}
