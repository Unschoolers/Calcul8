export function shopifyAdminProductUrl(shop: unknown, productId: unknown): string | null {
  if (typeof shop !== "string" || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.myshopify\.com$/i.test(shop)) return null;
  if (typeof productId !== "string" || !/^gid:\/\/shopify\/Product\/\d+$/.test(productId)) return null;
  const numericId = productId.slice("gid://shopify/Product/".length);
  return `https://${shop.toLowerCase()}/admin/products/${numericId}`;
}
