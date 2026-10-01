export const ShopifyProductStatus = {
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  ARCHIVED: "ARCHIVED"
} as const;

export type ShopifyProductStatus = typeof ShopifyProductStatus[keyof typeof ShopifyProductStatus];

const shopifyProductStatuses = new Set<string>(Object.values(ShopifyProductStatus));

export function isShopifyProductStatus(value: unknown): value is ShopifyProductStatus {
  return typeof value === "string" && shopifyProductStatuses.has(value);
}
