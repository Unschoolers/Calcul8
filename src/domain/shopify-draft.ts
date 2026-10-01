export interface ShopifyDraftLocation {
  id: string;
  name: string;
}

export interface ShopifyDraftPreview {
  title: string;
  variantTitle: string;
  sku: string;
  price: string;
  currency: string;
  quantity: number;
  locations: ShopifyDraftLocation[];
  previewToken: string;
}

/** A preview token binds creation to an exact server-derived snapshot. */
export function isShopifyDraftPreview(value: unknown): value is ShopifyDraftPreview {
  if (!value || typeof value !== "object") return false;
  const preview = value as Partial<ShopifyDraftPreview>;
  const canonicalPrice = typeof preview.price === "string" &&
    /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(preview.price) && Number(preview.price) > 0;
  return typeof preview.title === "string" &&
    preview.title.trim().length > 0 &&
    typeof preview.variantTitle === "string" &&
    preview.variantTitle.trim().length > 0 &&
    typeof preview.sku === "string" &&
    canonicalPrice &&
    typeof preview.currency === "string" && /^[A-Z]{3}$/.test(preview.currency) &&
    Number.isSafeInteger(preview.quantity) && Number(preview.quantity) >= 0 &&
    Array.isArray(preview.locations) && preview.locations.length > 0 &&
    preview.locations.every(location => Boolean(location) &&
      typeof location.id === "string" && /^gid:\/\/shopify\/Location\/\d+$/.test(location.id) &&
      typeof location.name === "string" && location.name.trim().length > 0) &&
    typeof preview.previewToken === "string" && /^[a-f0-9]{64}$/.test(preview.previewToken);
}
