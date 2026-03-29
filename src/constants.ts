declare const __APP_VERSION__: string;

export const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

export const DEFAULT_FEE_PROFILE_FIELDS = {
  platformFeePercent: 8,
  additionalFeePercent: 2.9,
  additionalFeeAppliesTo: "sale_plus_shipping",
  fixedFeePerOrder: 0.3
} as const;

export const FEE_PROFILE_PRESETS = {
  whatnot: {
    feeProfilePreset: "whatnot",
    ...DEFAULT_FEE_PROFILE_FIELDS
  },
  none: {
    feeProfilePreset: "none",
    platformFeePercent: 0,
    additionalFeePercent: 0,
    additionalFeeAppliesTo: "sale_only",
    fixedFeePerOrder: 0
  }
} as const;

export const TAX_RATES = {
  SALES_TAX: 0.15, // 15% sales tax
  CUSTOMS: 0.05 // 5% customs (USD only)
};

export const DEFAULT_VALUES = {
  BOX_PRICE: 70,
  BOXES_PURCHASED: 16,
  PACKS_PER_BOX: 16,
  SPOTS_PER_BOX: 5,
  SPOT_PRICE: 25,
  BOX_PRICE_SELL: 100,
  PACK_PRICE: 7,
  EXCHANGE_RATE: 1.4,
  PURCHASE_TAX_RATE_PERCENT: 15,
  SELLING_TAX_RATE_PERCENT: 15,
  PURCHASE_SHIPPING_COST: 0,
  SELLING_SHIPPING_PER_ORDER: 0
};

export const UNITS_PER_CASE = {
  SPOT: 80,
  BOX: 16
};
