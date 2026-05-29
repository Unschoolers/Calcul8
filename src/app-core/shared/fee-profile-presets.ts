import { DEFAULT_FEE_PROFILE_FIELDS, FEE_PROFILE_PRESETS } from "../../constants.ts";
import type {
  AdditionalFeeAppliesTo,
  FeeProfilePreset,
  FeeProfileFields
} from "../../types/app.ts";

type FeeFieldValues = Pick<
  FeeProfileFields,
  "platformFeePercent" |
  "additionalFeePercent" |
  "additionalFeeAppliesTo" |
  "fixedFeePerOrder"
>;

type StoredFeeProfileLike = Partial<Record<keyof FeeProfileFields, unknown>> & {
  feeProfilePreset?: unknown;
};

export function normalizeFeeProfilePreset(value: unknown): FeeProfilePreset {
  return value === "none" ? "none" : "whatnot";
}

export function normalizeAdditionalFeeAppliesTo(value: unknown): AdditionalFeeAppliesTo {
  return value === "sale_plus_shipping" ? "sale_plus_shipping" : "sale_only";
}

export function getFeeProfilePreset(presetValue: unknown = "whatnot"): FeeProfileFields {
  const normalizedPreset = normalizeFeeProfilePreset(presetValue);
  const preset = normalizedPreset === "none"
    ? FEE_PROFILE_PRESETS.none
    : FEE_PROFILE_PRESETS.whatnot;
  return { ...preset };
}

export function getDefaultFeeProfileFields(): FeeFieldValues {
  return { ...DEFAULT_FEE_PROFILE_FIELDS };
}

export function detectFeeProfilePreset(input?: Partial<Record<keyof FeeFieldValues, unknown>> | null): FeeProfilePreset | null {
  const platformFeePercent = Number(input?.platformFeePercent);
  const additionalFeePercent = Number(input?.additionalFeePercent);
  const fixedFeePerOrder = Number(input?.fixedFeePerOrder);
  const additionalFeeAppliesTo = normalizeAdditionalFeeAppliesTo(input?.additionalFeeAppliesTo);

  if (
    Number.isFinite(platformFeePercent)
    && Number.isFinite(additionalFeePercent)
    && Number.isFinite(fixedFeePerOrder)
  ) {
    const whatnot = FEE_PROFILE_PRESETS.whatnot;
    if (
      platformFeePercent === whatnot.platformFeePercent
      && additionalFeePercent === whatnot.additionalFeePercent
      && fixedFeePerOrder === whatnot.fixedFeePerOrder
      && additionalFeeAppliesTo === whatnot.additionalFeeAppliesTo
    ) {
      return "whatnot";
    }

    const none = FEE_PROFILE_PRESETS.none;
    if (
      platformFeePercent === none.platformFeePercent
      && additionalFeePercent === none.additionalFeePercent
      && fixedFeePerOrder === none.fixedFeePerOrder
      && additionalFeeAppliesTo === none.additionalFeeAppliesTo
    ) {
      return "none";
    }
  }

  return null;
}

export function resolveStoredFeeProfile(input?: StoredFeeProfileLike | null): FeeProfileFields {
  const matchedPreset = detectFeeProfilePreset(input);
  const preset = getFeeProfilePreset(input?.feeProfilePreset ?? matchedPreset ?? "whatnot");
  const platformFeeCandidate = Number(input?.platformFeePercent);
  const additionalFeeCandidate = Number(input?.additionalFeePercent);
  const fixedFeeCandidate = Number(input?.fixedFeePerOrder);

  return {
    feeProfilePreset: matchedPreset ?? preset.feeProfilePreset,
    platformFeePercent: Number.isFinite(platformFeeCandidate) ? Math.max(0, platformFeeCandidate) : preset.platformFeePercent,
    additionalFeePercent: Number.isFinite(additionalFeeCandidate) ? Math.max(0, additionalFeeCandidate) : preset.additionalFeePercent,
    additionalFeeAppliesTo: normalizeAdditionalFeeAppliesTo(input?.additionalFeeAppliesTo ?? preset.additionalFeeAppliesTo),
    fixedFeePerOrder: Number.isFinite(fixedFeeCandidate) ? Math.max(0, fixedFeeCandidate) : preset.fixedFeePerOrder
  };
}
