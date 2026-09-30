export type ShopifyStockObservation = {
  shop: string;
  variantId: string;
  inventoryItemId: string;
  locationId: string;
  locationName: string;
  available: number;
  onHand: number;
  committed: number;
  observedAt: string;
};

export function isShopifyStockObservation(value: unknown): value is ShopifyStockObservation {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.shop === "string" && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.myshopify\.com$/.test(item.shop) &&
    typeof item.variantId === "string" && /^gid:\/\/shopify\/ProductVariant\/\d+$/.test(item.variantId) &&
    typeof item.inventoryItemId === "string" && /^gid:\/\/shopify\/InventoryItem\/\d+$/.test(item.inventoryItemId) &&
    typeof item.locationId === "string" && /^gid:\/\/shopify\/Location\/\d+$/.test(item.locationId) &&
    typeof item.locationName === "string" && item.locationName.trim().length > 0 &&
    [item.available, item.onHand, item.committed].every((quantity) => typeof quantity === "number" && Number.isSafeInteger(quantity)) &&
    typeof item.observedAt === "string" && Number.isFinite(Date.parse(item.observedAt)) && new Date(item.observedAt).toISOString() === item.observedAt;
}
