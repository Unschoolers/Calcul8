import { DEFAULT_VALUES } from "../../constants.ts";
import type { Lot, LotType, SinglesCatalogSource, SinglesPurchaseEntry } from "../../types/app.ts";
import { resolveLotBusinessDate } from "../../shared/lot-dates.ts";
import { resolveStoredFeeProfile } from "../shared/fee-profile-presets.ts";
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
  }
): HydratedLotState {
  const normalizedLotType: LotType = lot.lotType === "singles" ? "singles" : "bulk";
  const normalizedLotCatalogSource = normalizedLotType === "singles"
    ? normalizeSinglesCatalogSource(lot.singlesCatalogSource)
    : options.currentNewLotCatalogSource;
  const legacyTax = lot.taxRatePercent;
  const parsedTargetProfit = Number(lot.targetProfitPercent);
  const currency = lot.currency === "USD" ? "USD" : "CAD";
  const feeProfile = resolveStoredFeeProfile(lot);

  return {
    newLotType: normalizedLotType,
    newLotCatalogSource: normalizedLotCatalogSource,
    boxPriceCost: lot.boxPriceCost ?? DEFAULT_VALUES.BOX_PRICE,
    boxesPurchased: lot.boxesPurchased ?? DEFAULT_VALUES.BOXES_PURCHASED,
    packsPerBox: lot.packsPerBox ?? DEFAULT_VALUES.PACKS_PER_BOX,
    spotsPerBox: lot.spotsPerBox ?? DEFAULT_VALUES.SPOTS_PER_BOX,
    costInputMode: lot.costInputMode ?? "perBox",
    currency,
    sellingCurrency: lot.sellingCurrency === "USD" ? "USD" : "CAD",
    exchangeRate: lot.exchangeRate ?? DEFAULT_VALUES.EXCHANGE_RATE,
    purchaseDate: resolveLotBusinessDate({
      purchaseDate: lot.purchaseDate,
      createdAt: lot.createdAt,
      lotId: lot.id,
      fallbackDate: options.todayDate
    }) ?? options.todayDate,
    purchaseShippingCost: lot.purchaseShippingCost ?? DEFAULT_VALUES.PURCHASE_SHIPPING_COST,
    purchaseTaxPercent:
      lot.purchaseTaxPercent ??
      legacyTax ??
      DEFAULT_VALUES.PURCHASE_TAX_RATE_PERCENT,
    sellingTaxPercent:
      lot.sellingTaxPercent ??
      legacyTax ??
      DEFAULT_VALUES.SELLING_TAX_RATE_PERCENT,
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
    singlesPurchases: normalizedLotType === "singles"
      ? normalizeSinglesPurchaseEntries(lot.singlesPurchases, currency)
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
