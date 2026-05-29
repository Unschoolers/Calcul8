import { DEFAULT_VALUES } from "../../constants.ts";
import type { Lot, LotType, SinglesCatalogSource, SinglesPurchaseEntry, SystemPricingDefaults } from "../../types/app.ts";
import { resolveLotBusinessDate } from "../../shared/lot-dates.ts";
import { resolveStoredFeeProfile } from "../shared/fee-profile-presets.ts";
import { getLotType } from "../shared/lot-types.ts";
import { applySystemPricingDefaultsToLot, lotUsesSystemPricingDefaults } from "../shared/system-pricing-defaults.ts";
import { resolveDefaultSinglesMarketValueCurrency } from "../shared/singles-market-value-currency.ts";
import { normalizeSinglesCatalogSource } from "../shared/singles-catalog-source.ts";
import { normalizeSinglesPurchaseEntries, resetSinglesCsvImportState, type SinglesCsvImportStateTarget } from "./config-lots-state.ts";

export type HydratedLotState = {
  newLotType: LotType;
  newLotCatalogSource: SinglesCatalogSource;
  boxPriceCost: number;
  boxesPurchased: number;
  packsPerBox: number;
  spotsPerBox: number;
  costInputMode: "perBox" | "total";
  currency: "CAD" | "USD";
  sellingCurrency: "CAD" | "USD";
  exchangeRate: number;
  purchaseDate: string;
  purchaseShippingCost: number;
  purchaseTaxPercent: number;
  sellingTaxPercent: number;
  sellingShippingPerOrder: number;
  feeProfilePreset: "whatnot" | "none";
  platformFeePercent: number;
  additionalFeePercent: number;
  additionalFeeAppliesTo: "sale_only" | "sale_plus_shipping";
  fixedFeePerOrder: number;
  includeTax: boolean;
  externalSku: string;
  spotPrice: number;
  boxPriceSell: number;
  packPrice: number;
  singlesPurchases: SinglesPurchaseEntry[];
  targetProfitPercent: number;
};

export type LotHydrationTarget = SinglesCsvImportStateTarget & {
  newLotType: LotType;
  newLotCatalogSource: SinglesCatalogSource;
  boxPriceCost?: number;
  boxesPurchased?: number;
  packsPerBox?: number;
  spotsPerBox?: number;
  costInputMode?: "perBox" | "total";
  currency?: "CAD" | "USD";
  sellingCurrency?: "CAD" | "USD";
  exchangeRate?: number;
  purchaseDate?: string;
  purchaseShippingCost?: number;
  purchaseTaxPercent?: number;
  sellingTaxPercent?: number;
  sellingShippingPerOrder?: number;
  feeProfilePreset?: "whatnot" | "none";
  platformFeePercent?: number;
  additionalFeePercent?: number;
  additionalFeeAppliesTo?: "sale_only" | "sale_plus_shipping";
  fixedFeePerOrder?: number;
  includeTax?: boolean;
  externalSku?: string;
  spotPrice?: number;
  boxPriceSell?: number;
  packPrice?: number;
  singlesPurchases: SinglesPurchaseEntry[];
  targetProfitPercent?: number;
};

export function buildHydratedLotState(
  lot: Lot,
  options: {
    hasProAccess: boolean;
    todayDate: string;
    currentNewLotCatalogSource: SinglesCatalogSource;
    systemPricingDefaults?: SystemPricingDefaults | null;
  }
): HydratedLotState {
  const pricingLot = lotUsesSystemPricingDefaults(lot) && options.systemPricingDefaults
    ? applySystemPricingDefaultsToLot(lot, options.systemPricingDefaults)
    : lot;
  const normalizedLotType: LotType = getLotType(lot);
  const normalizedLotCatalogSource = normalizedLotType === "singles"
    ? normalizeSinglesCatalogSource(lot.singlesCatalogSource)
    : options.currentNewLotCatalogSource;
  const parsedTargetProfit = Number(pricingLot.targetProfitPercent);
  const currency = lot.currency === "USD" ? "USD" : "CAD";
  const feeProfile = resolveStoredFeeProfile(pricingLot);

  return {
    newLotType: normalizedLotType,
    newLotCatalogSource: normalizedLotCatalogSource,
    boxPriceCost: lot.boxPriceCost ?? DEFAULT_VALUES.BOX_PRICE,
    boxesPurchased: lot.boxesPurchased ?? DEFAULT_VALUES.BOXES_PURCHASED,
    packsPerBox: lot.packsPerBox ?? DEFAULT_VALUES.PACKS_PER_BOX,
    spotsPerBox: pricingLot.spotsPerBox ?? DEFAULT_VALUES.SPOTS_PER_BOX,
    costInputMode: lot.costInputMode ?? "perBox",
    currency,
    sellingCurrency: pricingLot.sellingCurrency === "USD" ? "USD" : "CAD",
    exchangeRate: lot.exchangeRate ?? DEFAULT_VALUES.EXCHANGE_RATE,
    purchaseDate: resolveLotBusinessDate({
      purchaseDate: lot.purchaseDate,
      createdAt: lot.createdAt,
      lotId: lot.id,
      fallbackDate: options.todayDate
    }) ?? options.todayDate,
    purchaseShippingCost: lot.purchaseShippingCost ?? DEFAULT_VALUES.PURCHASE_SHIPPING_COST,
    purchaseTaxPercent: lot.purchaseTaxPercent ?? DEFAULT_VALUES.PURCHASE_TAX_RATE_PERCENT,
    sellingTaxPercent: pricingLot.sellingTaxPercent ?? DEFAULT_VALUES.SELLING_TAX_RATE_PERCENT,
    sellingShippingPerOrder: pricingLot.sellingShippingPerOrder ?? DEFAULT_VALUES.SELLING_SHIPPING_PER_ORDER,
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
    singlesPurchases: normalizedLotType === "singles"
      ? normalizeSinglesPurchaseEntries(
        lot.singlesPurchases,
        currency,
        resolveDefaultSinglesMarketValueCurrency(normalizedLotCatalogSource, currency)
      )
      : [],
    targetProfitPercent: !options.hasProAccess
      ? 0
      : (Number.isFinite(parsedTargetProfit) && parsedTargetProfit >= 0 ? parsedTargetProfit : 15)
  };
}

export function applyHydratedLotState(target: LotHydrationTarget, state: HydratedLotState): void {
  resetSinglesCsvImportState(target, state.currency);
  target.newLotType = state.newLotType;
  target.newLotCatalogSource = state.newLotCatalogSource;
  target.boxPriceCost = state.boxPriceCost;
  target.boxesPurchased = state.boxesPurchased;
  target.packsPerBox = state.packsPerBox;
  target.spotsPerBox = state.spotsPerBox;
  target.costInputMode = state.costInputMode;
  target.currency = state.currency;
  target.sellingCurrency = state.sellingCurrency;
  target.exchangeRate = state.exchangeRate;
  target.purchaseDate = state.purchaseDate;
  target.purchaseShippingCost = state.purchaseShippingCost;
  target.purchaseTaxPercent = state.purchaseTaxPercent;
  target.sellingTaxPercent = state.sellingTaxPercent;
  target.sellingShippingPerOrder = state.sellingShippingPerOrder;
  target.feeProfilePreset = state.feeProfilePreset;
  target.platformFeePercent = state.platformFeePercent;
  target.additionalFeePercent = state.additionalFeePercent;
  target.additionalFeeAppliesTo = state.additionalFeeAppliesTo;
  target.fixedFeePerOrder = state.fixedFeePerOrder;
  target.includeTax = state.includeTax;
  target.externalSku = state.externalSku;
  target.spotPrice = state.spotPrice;
  target.boxPriceSell = state.boxPriceSell;
  target.packPrice = state.packPrice;
  target.singlesPurchases = state.singlesPurchases;
  target.targetProfitPercent = state.targetProfitPercent;
}
