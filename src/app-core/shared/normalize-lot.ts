import { DEFAULT_VALUES } from "../../constants.ts";
import type { Lot } from "../../types/app.ts";
import { normalizeSinglesCatalogSource } from "./singles-catalog-source.ts";

function toDateOnly(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

function inferDateFromLotId(value: unknown): string | null {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  if (year < 2000 || year > 2100) return null;
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeStoredLot(lot: Lot, todayDate: string): Lot {
  const legacyTax = lot.taxRatePercent;
  const lotType = lot.lotType === "singles" ? "singles" : "bulk";
  return {
    ...lot,
    isComplete: lot.isComplete === true,
    lotType,
    boxPriceCost: lot.boxPriceCost ?? DEFAULT_VALUES.BOX_PRICE,
    boxesPurchased: lot.boxesPurchased ?? DEFAULT_VALUES.BOXES_PURCHASED,
    packsPerBox: lot.packsPerBox ?? DEFAULT_VALUES.PACKS_PER_BOX,
    spotsPerBox: lot.spotsPerBox ?? DEFAULT_VALUES.SPOTS_PER_BOX,
    costInputMode: lot.costInputMode ?? "perBox",
    currency: lot.currency ?? "CAD",
    sellingCurrency: lot.sellingCurrency ?? "CAD",
    exchangeRate: lot.exchangeRate ?? DEFAULT_VALUES.EXCHANGE_RATE,
    purchaseShippingCost: lot.purchaseShippingCost ?? DEFAULT_VALUES.PURCHASE_SHIPPING_COST,
    sellingShippingPerOrder: lot.sellingShippingPerOrder ?? DEFAULT_VALUES.SELLING_SHIPPING_PER_ORDER,
    includeTax: lot.includeTax ?? true,
    spotPrice: lot.spotPrice ?? DEFAULT_VALUES.SPOT_PRICE,
    boxPriceSell: lot.boxPriceSell ?? DEFAULT_VALUES.BOX_PRICE_SELL,
    packPrice: lot.packPrice ?? DEFAULT_VALUES.PACK_PRICE,
    targetProfitPercent: Number.isFinite(Number(lot.targetProfitPercent))
      ? Math.max(0, Number(lot.targetProfitPercent))
      : 0,
    singlesCatalogSource: lotType === "singles"
      ? normalizeSinglesCatalogSource(lot.singlesCatalogSource)
      : undefined,
    purchaseDate:
      toDateOnly(lot.purchaseDate) ??
      toDateOnly(lot.createdAt) ??
      inferDateFromLotId(lot.id) ??
      todayDate,
    createdAt:
      toDateOnly(lot.createdAt) ??
      toDateOnly(lot.purchaseDate) ??
      inferDateFromLotId(lot.id) ??
      todayDate,
    purchaseTaxPercent:
      lot.purchaseTaxPercent ??
      legacyTax ??
      DEFAULT_VALUES.PURCHASE_TAX_RATE_PERCENT,
    sellingTaxPercent:
      lot.sellingTaxPercent ??
      legacyTax ??
      DEFAULT_VALUES.SELLING_TAX_RATE_PERCENT
  };
}
