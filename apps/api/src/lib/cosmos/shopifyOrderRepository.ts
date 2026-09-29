import type { ApiConfig } from "../../types";
import { getContainers, isConflictError, isNotFoundError, isPreconditionFailedError, withCosmosRetry } from "./core";

export type ShopifyOrderLine = {
  scopeKey: string; shop: string; lotId: number; orderId: string; lineId: string;
  variantId: string; quantity: number; cancelled: boolean; paidAt: string;
};
type OrderDocument = ShopifyOrderLine & { id: string; userId: string; docType: "shopify_order_line"; _etag?: string };
const documentId = (shop: string, orderId: string, lineId: string) => `shopify_order_line:${shop}:${orderId}:${lineId}`;

export async function recordShopifyPaidLine(config: ApiConfig, line: ShopifyOrderLine): Promise<boolean> {
  const { entitlements } = getContainers(config);
  const document: OrderDocument = { ...line, id: documentId(line.shop, line.orderId, line.lineId),
    userId: line.scopeKey, docType: "shopify_order_line" };
  try { await withCosmosRetry(() => entitlements.items.create(document)); return true; }
  catch (error) { if (isConflictError(error)) return false; throw error; }
}

export async function cancelShopifyOrderLine(config: ApiConfig, scopeKey: string, shop: string, orderId: string, lineId: string): Promise<boolean> {
  const { entitlements } = getContainers(config);
  const item = entitlements.item(documentId(shop, orderId, lineId), scopeKey);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let current: OrderDocument | undefined;
    try { ({ resource: current } = await withCosmosRetry(() => item.read<OrderDocument>())); }
    catch (error) { if (isNotFoundError(error)) return false; throw error; }
    if (!current || current.docType !== "shopify_order_line" || current.cancelled) return false;
    if (!current._etag) throw new Error("Shopify order record lacks a version");
    const etag = current._etag;
    try {
      await withCosmosRetry(() => item.replace({ ...current, cancelled: true },
        { accessCondition: { type: "IfMatch", condition: etag } }));
      return true;
    } catch (error) { if (!isPreconditionFailedError(error)) throw error; }
  }
  throw new Error("Shopify order cancellation conflicted; retry delivery");
}

export async function listShopifyOrderLines(config: ApiConfig, scopeKey: string, lotId: number): Promise<ShopifyOrderLine[]> {
  const { entitlements } = getContainers(config);
  const iterator = entitlements.items.query<OrderDocument>({
    query: "SELECT * FROM c WHERE c.docType = @type AND c.userId = @scope AND c.lotId = @lot AND c.cancelled = false",
    parameters: [{ name: "@type", value: "shopify_order_line" }, { name: "@scope", value: scopeKey }, { name: "@lot", value: lotId }]
  }, { partitionKey: scopeKey });
  const { resources } = await withCosmosRetry(() => iterator.fetchAll());
  return (resources ?? []).filter((line) => line.scopeKey === scopeKey && !line.cancelled);
}
