import { DEFAULT_VALUES } from "../../constants.ts";
import type { Lot } from "../../types/app.ts";
import { resolveLotBusinessDate, resolveLotCreatedDate } from "../../shared/lot-dates.ts";
import { normalizeSinglesCatalogSource } from "./singles-catalog-source.ts";

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
    externalSku: typeof lot.externalSku === "string" ? lot.externalSku.trim() : "",
    spotPrice: lot.spotPrice ?? DEFAULT_VALUES.SPOT_PRICE,
    boxPriceSell: lot.boxPriceSell ?? DEFAULT_VALUES.BOX_PRICE_SELL,
    packPrice: lot.packPrice ?? DEFAULT_VALUES.PACK_PRICE,
    targetProfitPercent: Number.isFinite(Number(lot.targetProfitPercent))
      ? Math.max(0, Number(lot.targetProfitPercent))
      : 0,
    singlesCatalogSource: lotType === "singles"
      ? normalizeSinglesCatalogSource(lot.singlesCatalogSource)
      : undefined,
    purchaseDate: resolveLotBusinessDate({
      purchaseDate: lot.purchaseDate,
      createdAt: lot.createdAt,
      lotId: lot.id,
      fallbackDate: todayDate
    }) ?? todayDate,
    createdAt: resolveLotCreatedDate({
      createdAt: lot.createdAt,
      purchaseDate: lot.purchaseDate,
      lotId: lot.id,
      fallbackDate: todayDate
    }) ?? todayDate,
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

