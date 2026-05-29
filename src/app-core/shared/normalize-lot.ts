import { DEFAULT_VALUES } from "../../constants.ts";
import type { Lot } from "../../types/app.ts";
import { resolveLotBusinessDate, resolveLotCreatedDate } from "../../shared/lot-dates.ts";
import { resolveStoredFeeProfile } from "./fee-profile-presets.ts";
import { getLotType } from "./lot-types.ts";
import { resolveDefaultSinglesMarketValueCurrency } from "./singles-market-value-currency.ts";
import { normalizeSinglesCatalogSource } from "./singles-catalog-source.ts";
import { normalizeSinglesPurchaseEntries } from "../methods/config-lots-state.ts";

export function normalizeStoredLot(lot: Lot, todayDate: string): Lot {
  const lotType = getLotType(lot);
  const normalizedSinglesCatalogSource = lotType === "singles"
    ? normalizeSinglesCatalogSource(lot.singlesCatalogSource)
    : undefined;
  const normalizedCurrency = lot.currency === "USD" ? "USD" : "CAD";
  const feeProfile = resolveStoredFeeProfile(lot);
  return {
    ...lot,
    isComplete: lot.isComplete === true,
    lotType,
    boxPriceCost: lot.boxPriceCost ?? DEFAULT_VALUES.BOX_PRICE,
    boxesPurchased: lot.boxesPurchased ?? DEFAULT_VALUES.BOXES_PURCHASED,
    packsPerBox: lot.packsPerBox ?? DEFAULT_VALUES.PACKS_PER_BOX,
    spotsPerBox: lot.spotsPerBox ?? DEFAULT_VALUES.SPOTS_PER_BOX,
    costInputMode: lot.costInputMode ?? "perBox",
    currency: normalizedCurrency,
    sellingCurrency: lot.sellingCurrency ?? "CAD",
    exchangeRate: lot.exchangeRate ?? DEFAULT_VALUES.EXCHANGE_RATE,
    purchaseShippingCost: lot.purchaseShippingCost ?? DEFAULT_VALUES.PURCHASE_SHIPPING_COST,
    sellingShippingPerOrder: lot.sellingShippingPerOrder ?? DEFAULT_VALUES.SELLING_SHIPPING_PER_ORDER,
    feeProfilePreset: feeProfile.feeProfilePreset,
    platformFeePercent: feeProfile.platformFeePercent,
    additionalFeePercent: feeProfile.additionalFeePercent,
    additionalFeeAppliesTo: feeProfile.additionalFeeAppliesTo,
    fixedFeePerOrder: feeProfile.fixedFeePerOrder,
    includeTax: lot.includeTax ?? true,
    externalSku: typeof lot.externalSku === "string" ? lot.externalSku.trim() : "",
    spotPrice: lot.spotPrice ?? DEFAULT_VALUES.SPOT_PRICE,
    boxPriceSell: lot.boxPriceSell ?? DEFAULT_VALUES.BOX_PRICE_SELL,
    packPrice: lot.packPrice ?? DEFAULT_VALUES.PACK_PRICE,
    targetProfitPercent: Number.isFinite(Number(lot.targetProfitPercent))
      ? Math.max(0, Number(lot.targetProfitPercent))
      : 0,
    singlesCatalogSource: normalizedSinglesCatalogSource,
    singlesPurchases: lotType === "singles"
      ? normalizeSinglesPurchaseEntries(
        lot.singlesPurchases,
        normalizedCurrency,
        resolveDefaultSinglesMarketValueCurrency(normalizedSinglesCatalogSource, normalizedCurrency)
      )
      : lot.singlesPurchases,
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
    purchaseTaxPercent: lot.purchaseTaxPercent ?? DEFAULT_VALUES.PURCHASE_TAX_RATE_PERCENT,
    sellingTaxPercent: lot.sellingTaxPercent ?? DEFAULT_VALUES.SELLING_TAX_RATE_PERCENT
  };
}

