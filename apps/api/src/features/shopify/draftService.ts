import { createHash } from "node:crypto";
import type { SyncLotDto } from "../../../../../shared/sync-contracts";
import { calculateSealedBoxInventory } from "../../shared/box-inventory.cjs";
import type { InventorySale } from "./listingService";
import { ShopifyErrorCode } from "../../shared/shopify-errors.js";
import { normalizeDraftOverrides, type DraftOverrides } from "../../shared/shopify-product-manager";

export type DraftLocation = { id: string; name: string; isActive: boolean };
export type DraftPreviewInput = { scopeKey: string; shop: string; generation: number; lot: Partial<SyncLotDto> & { id: number }; sales: readonly InventorySale[]; locations: readonly DraftLocation[]; shopCurrency: string; price?: number; overrides?: DraftOverrides; variantTitle?: "Sealed box" | "Booster box"; bindingVersion?: string | null };
export type ShopifyDraftPreview = { title: string; variantTitle: "Sealed box" | "Booster box"; sku: string; price: string; currency: string; quantity: number; locations: { id: string; name: string }[]; previewToken: string };

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function shopifyDraftHandle(scopeKey: string, lotId: number): string {
  return `calcul8-created-${hash([scopeKey, lotId]).slice(0, 24)}`;
}

export function buildShopifyDraftPreview(input: DraftPreviewInput): { preview: ShopifyDraftPreview; handle: string; ownershipHash: string } {
  const { lot } = input;
  if (!Number.isSafeInteger(lot.id) || lot.id <= 0 || lot.lotType === "singles") throw Object.assign(new Error("A bulk lot is required"), { code: ShopifyErrorCode.LOT_UNAVAILABLE });
  const overrides = input.overrides ? normalizeDraftOverrides(input.overrides) : undefined;
  if (input.overrides && !overrides) throw new Error("Invalid Shopify title, price or location");
  const price = input.price ?? lot.boxPriceSell;
  const normalizedPrice = overrides?.price ?? (price == null || !Number.isFinite(price) ? "" : price.toFixed(2));
  if (!/^\d+\.\d{2}$/.test(normalizedPrice) || Number(normalizedPrice) <= 0) throw Object.assign(new Error("A positive box selling price is required"), { code: ShopifyErrorCode.PRICE_REQUIRED });
  const currency = String(lot.sellingCurrency || "CAD").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency) || input.shopCurrency.toUpperCase() !== currency) throw Object.assign(new Error("Shop currency must match the lot selling currency"), { code: ShopifyErrorCode.CURRENCY_MISMATCH });
  const inventory = calculateSealedBoxInventory({ boxesPurchased: lot.boxesPurchased ?? NaN, packsPerBox: lot.packsPerBox ?? NaN }, input.sales);
  if (!inventory.valid || !Number.isSafeInteger(inventory.sealedBoxes) || inventory.sealedBoxes < 0 || inventory.sealedBoxes > 2_147_483_647) throw Object.assign(new Error(`Invalid sealed-box inventory: ${inventory.error ?? "unsafe inventory"}`), { code: ShopifyErrorCode.INVENTORY_INVALID });
  const locations = input.locations.filter(location => location.isActive && /^gid:\/\/shopify\/Location\/\d+$/.test(location.id) && location.name.trim()).map(({ id, name }) => ({ id, name })).sort((a, b) => a.id.localeCompare(b.id));
  if (!locations.length) throw Object.assign(new Error("Shopify needs an active inventory location"), { code: ShopifyErrorCode.LOCATION_REQUIRED });
  if (overrides && !locations.some(location => location.id === overrides.locationId)) throw Object.assign(new Error("Choose an active inventory location"), { code: ShopifyErrorCode.LOCATION_REQUIRED });
  const variantTitle = input.variantTitle ?? "Booster box";
  const suffix = variantTitle === "Sealed box" ? "sealed box" : variantTitle;
  const title = overrides?.title ?? (typeof lot.name === "string" && lot.name.trim() ? `${lot.name.trim()} — ${suffix}` : `Lot ${lot.id} — ${suffix}`);
  if (title.length > 255) throw new Error("Shopify title cannot exceed 255 characters");
  const sku = typeof lot.externalSku === "string" && lot.externalSku.trim() ? lot.externalSku.trim() : `CALCUL8-${lot.id}-BOX`;
  const data = { scopeKey: input.scopeKey, shop: input.shop, generation: input.generation, lotId: lot.id, title, variantTitle, sku, price: normalizedPrice, currency, quantity: inventory.sealedBoxes, locations, locationId: overrides?.locationId, bindingVersion: input.bindingVersion };
  return { preview: { title, variantTitle, sku, price: normalizedPrice, currency, quantity: inventory.sealedBoxes, locations, previewToken: hash(data) }, handle: shopifyDraftHandle(input.scopeKey, lot.id), ownershipHash: hash([input.scopeKey, lot.id, "shopify-draft-v1"]) };
}
