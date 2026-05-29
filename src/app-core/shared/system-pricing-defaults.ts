import { DEFAULT_VALUES } from "../../constants.ts";
import type {
  FeeProfileFields,
  Lot,
  LotSetup,
  SystemPricingDefaults
} from "../../types/app.ts";
import { getFeeProfilePreset, resolveStoredFeeProfile } from "./fee-profile-presets.ts";
import { isSinglesLot, type LotTypeSource } from "./lot-types.ts";

export type SystemPricingDefaultsInput = Partial<Record<keyof SystemPricingDefaults, unknown>>;

const DEFAULT_TARGET_PROFIT_PERCENT = 15;

function normalizeNonNegativeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed >= 0 ? parsed : 0;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeSellingCurrency(value: unknown, fallback: SystemPricingDefaults["sellingCurrency"]): SystemPricingDefaults["sellingCurrency"] {
  if (value === "USD") return "USD";
  if (value === "CAD") return "CAD";
  return fallback;
}

export function createDefaultSystemPricingDefaults(targetProfitPercent = DEFAULT_TARGET_PROFIT_PERCENT): SystemPricingDefaults {
  const feeProfile = getFeeProfilePreset("whatnot");
  return {
    sellingCurrency: "CAD",
    sellingTaxPercent: DEFAULT_VALUES.SELLING_TAX_RATE_PERCENT,
    sellingShippingPerOrder: DEFAULT_VALUES.SELLING_SHIPPING_PER_ORDER,
    targetProfitPercent: Math.max(0, Number(targetProfitPercent) || 0),
    spotsPerBox: DEFAULT_VALUES.SPOTS_PER_BOX,
    ...feeProfile
  };
}

export function normalizeSystemPricingDefaults(
  input?: SystemPricingDefaultsInput | null,
  fallback: SystemPricingDefaults = createDefaultSystemPricingDefaults()
): SystemPricingDefaults {
  const raw = input && typeof input === "object" ? input : {};
  const baseFeeProfile = raw.feeProfilePreset == null
    ? fallback
    : getFeeProfilePreset(raw.feeProfilePreset);
  const feeProfile = resolveStoredFeeProfile({
    feeProfilePreset: raw.feeProfilePreset ?? fallback.feeProfilePreset,
    platformFeePercent: raw.platformFeePercent ?? baseFeeProfile.platformFeePercent,
    additionalFeePercent: raw.additionalFeePercent ?? baseFeeProfile.additionalFeePercent,
    additionalFeeAppliesTo: raw.additionalFeeAppliesTo ?? baseFeeProfile.additionalFeeAppliesTo,
    fixedFeePerOrder: raw.fixedFeePerOrder ?? baseFeeProfile.fixedFeePerOrder
  });

  return {
    sellingCurrency: normalizeSellingCurrency(raw.sellingCurrency, fallback.sellingCurrency),
    sellingTaxPercent: normalizeNonNegativeNumber(raw.sellingTaxPercent, fallback.sellingTaxPercent),
    sellingShippingPerOrder: normalizeNonNegativeNumber(raw.sellingShippingPerOrder, fallback.sellingShippingPerOrder),
    targetProfitPercent: normalizeNonNegativeNumber(raw.targetProfitPercent, fallback.targetProfitPercent),
    spotsPerBox: normalizePositiveInteger(raw.spotsPerBox, fallback.spotsPerBox),
    ...feeProfile
  };
}

export function lotUsesSystemPricingDefaults(lot?: Pick<Lot, "usesSystemPricingDefaults"> | null): boolean {
  return lot?.usesSystemPricingDefaults === true;
}

export function pickSystemPricingFields(defaults: SystemPricingDefaults): Pick<
  LotSetup,
  | "sellingCurrency"
  | "sellingTaxPercent"
  | "sellingShippingPerOrder"
  | "targetProfitPercent"
  | "spotsPerBox"
> & FeeProfileFields {
  const normalized = normalizeSystemPricingDefaults(defaults);
  return {
    sellingCurrency: normalized.sellingCurrency,
    sellingTaxPercent: normalized.sellingTaxPercent,
    sellingShippingPerOrder: normalized.sellingShippingPerOrder,
    targetProfitPercent: normalized.targetProfitPercent,
    spotsPerBox: normalized.spotsPerBox,
    feeProfilePreset: normalized.feeProfilePreset,
    platformFeePercent: normalized.platformFeePercent,
    additionalFeePercent: normalized.additionalFeePercent,
    additionalFeeAppliesTo: normalized.additionalFeeAppliesTo,
    fixedFeePerOrder: normalized.fixedFeePerOrder
  };
}

export type SystemPricingFieldsForLot = Pick<
  LotSetup,
  | "sellingCurrency"
  | "sellingTaxPercent"
  | "sellingShippingPerOrder"
  | "targetProfitPercent"
> & FeeProfileFields & Partial<Pick<LotSetup, "spotsPerBox">>;

export function pickSystemPricingFieldsForLot(
  lot: LotTypeSource,
  defaults: SystemPricingDefaults
): SystemPricingFieldsForLot {
  const fields = pickSystemPricingFields(defaults);
  if (!isSinglesLot(lot)) {
    return fields;
  }

  return {
    sellingCurrency: fields.sellingCurrency,
    sellingTaxPercent: fields.sellingTaxPercent,
    sellingShippingPerOrder: fields.sellingShippingPerOrder,
    targetProfitPercent: fields.targetProfitPercent,
    feeProfilePreset: fields.feeProfilePreset,
    platformFeePercent: fields.platformFeePercent,
    additionalFeePercent: fields.additionalFeePercent,
    additionalFeeAppliesTo: fields.additionalFeeAppliesTo,
    fixedFeePerOrder: fields.fixedFeePerOrder
  };
}

export function applySystemPricingDefaultsToLot(lot: Lot, defaults: SystemPricingDefaults): Lot {
  if (!lotUsesSystemPricingDefaults(lot)) {
    return { ...lot };
  }

  return {
    ...lot,
    ...pickSystemPricingFieldsForLot(lot, defaults),
    usesSystemPricingDefaults: true
  };
}

export function buildSystemPricingDefaultsFromSetup(setup: Pick<
  LotSetup,
  | "sellingCurrency"
  | "sellingTaxPercent"
  | "sellingShippingPerOrder"
  | "targetProfitPercent"
  | "spotsPerBox"
  | "feeProfilePreset"
  | "platformFeePercent"
  | "additionalFeePercent"
  | "additionalFeeAppliesTo"
  | "fixedFeePerOrder"
>): SystemPricingDefaults {
  return normalizeSystemPricingDefaults(setup as SystemPricingDefaultsInput);
}
