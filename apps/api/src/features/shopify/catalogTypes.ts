import type { ShopifyVariant } from "./catalogService";

type VariantNode = {
  id: string; title: string; sku: string | null; price: string;
  product: { id: string; title: string };
  inventoryItem: { id: string; tracked: boolean; inventoryLevels: { nodes: {
    location: { id: string; name: string; isActive: boolean }; quantities: { name: string; quantity: number }[];
  }[] } };
};
export type ShopifyVariantNode = VariantNode;
export const variantFields = (locationLimit: 10 | 100 = 100): string => `id title sku price product { id title }
  inventoryItem { id tracked inventoryLevels(first: ${locationLimit}) { nodes {
    location { id name isActive } quantities(names: ["available"]) { name quantity }
  } } }`;

export function normalizeShopifyVariant(node: VariantNode | null | undefined): ShopifyVariant | null {
  if (!node?.inventoryItem?.tracked || !/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(node.id) ||
      !/^gid:\/\/shopify\/Product\/\d+$/.test(node.product?.id) ||
      !/^gid:\/\/shopify\/InventoryItem\/\d+$/.test(node.inventoryItem.id)) return null;
  const locations = node.inventoryItem.inventoryLevels.nodes.flatMap(level => {
    const quantity = level.quantities.find(item => item.name === "available")?.quantity;
    return level.location.isActive && /^gid:\/\/shopify\/Location\/\d+$/.test(level.location.id) && Number.isSafeInteger(quantity)
      ? [{ id: level.location.id, name: level.location.name, available: quantity! }] : [];
  });
  if (!locations.length) return null;
  return { productId: node.product.id, variantId: node.id, title: node.product.title,
    variantTitle: node.title, sku: node.sku ?? "", price: node.price, inventoryItemId: node.inventoryItem.id, locations };
}
