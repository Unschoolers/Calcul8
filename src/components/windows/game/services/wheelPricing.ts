import { getTierChancePercent, normalizeWheelTierChances } from "../../../../app-core/shared/wheel-odds.ts";
import { getWheelTierSourceLotIds, isWheelTierMultiLot } from "../../../../app-core/shared/wheel-tier-sources.ts";
import { calculateNetFromGross, type FeeProfileInput } from "../../../../domain/calculations.ts";
import { calculateTotalCaseCost } from "../../../../domain/calculations-fees.ts";
import { resolveEffectiveWhatnotFeeInput, type WhatnotFeePeriodSummary } from "../../../../app-core/shared/whatnot-fee-summary.ts";
import type { Lot, WheelConfig, WheelTier } from "../../../../types/app.ts";
import type { WheelSlot } from "./wheelSlots.ts";

export type WheelPackCostInput = {
  boxesPurchased?: number;
  packsPerBox?: number;
  boxPriceCost?: number;
  purchaseShippingCost?: number;
  purchaseTaxPercent?: number;
  includeTax?: boolean;
  currency?: "CAD" | "USD";
};

export function calculateWheelLotCostPerPack(input: WheelPackCostInput): number {
  const boxesPurchased = Number(input.boxesPurchased) || 0;
  const totalPacks = boxesPurchased * (Number(input.packsPerBox) || 16);
  if (totalPacks <= 0) return 0;
  return calculateTotalCaseCost({
    boxesPurchased,
    pricePerBoxCad: Number(input.boxPriceCost) || 0,
    purchaseShippingCad: Number(input.purchaseShippingCost) || 0,
    purchaseTaxPercent: Number(input.purchaseTaxPercent) || 0,
    includeTax: input.includeTax ?? false,
    currency: input.currency || "CAD"
  }) / totalPacks;
}

function calculateAverageTierNetRevenue(
  config: WheelConfig,
  tier: WheelTier,
  lots: Lot[],
  fallback?: FeeProfileInput,
  summary?: Pick<WhatnotFeePeriodSummary, "currentTier" | "periodStart"> | null,
  fallbackLot?: Lot
): number {
  const lotIds = isWheelTierMultiLot(tier) ? getWheelTierSourceLotIds(tier) : [];
  if (!lotIds.length) {
    const lot = tier.boundLotId == null ? undefined : lots.find((entry) => entry.id === tier.boundLotId);
    const unboundFallbackLot = tier.boundLotId == null ? fallbackLot : undefined;
    return calculateWheelNetFromGross(
      Number(config.spinPrice) || 0,
      resolveWheelFeeInput(lot, unboundFallbackLot, summary, fallback),
      1,
      Number(lot?.sellingShippingPerOrder) || 0,
      Number(lot?.sellingTaxPercent) || 0
    );
  }
  const total = lotIds.reduce((sum, id) => {
    const lot = lots.find((entry) => entry.id === id);
    return sum + calculateWheelNetFromGross(
      Number(config.spinPrice) || 0,
      resolveWheelFeeInput(lot, undefined, summary, fallback),
      1,
      Number(lot?.sellingShippingPerOrder) || 0,
      Number(lot?.sellingTaxPercent) || 0
    );
  }, 0);
  return total / lotIds.length;
}

function getResolvedLotFeeProfileInput(
  lot: FeeProfileInput | undefined,
  fallback?: FeeProfileInput
): FeeProfileInput | undefined {
  if (!lot) return fallback;

  const hasPlatformFee = Number.isFinite(Number(lot.platformFeePercent));
  const hasAdditionalFee = Number.isFinite(Number(lot.additionalFeePercent));
  const hasFixedFee = Number.isFinite(Number(lot.fixedFeePerOrder));
  const hasAdditionalFeeScope = lot.additionalFeeAppliesTo === "sale_only"
    || lot.additionalFeeAppliesTo === "sale_plus_shipping";

  if (!hasPlatformFee && !hasAdditionalFee && !hasFixedFee && !hasAdditionalFeeScope) {
    return fallback;
  }

  const fallbackObject = (typeof fallback === "object" && fallback) ? fallback : undefined;
  return {
    platformFeePercent: hasPlatformFee ? Number(lot.platformFeePercent) || 0 : fallbackObject?.platformFeePercent,
    additionalFeePercent: hasAdditionalFee ? Number(lot.additionalFeePercent) || 0 : fallbackObject?.additionalFeePercent,
    additionalFeeAppliesTo: hasAdditionalFeeScope ? lot.additionalFeeAppliesTo : fallbackObject?.additionalFeeAppliesTo,
    fixedFeePerOrder: hasFixedFee ? Number(lot.fixedFeePerOrder) || 0 : fallbackObject?.fixedFeePerOrder
  };
}

function resolveWheelFeeInput(
  lot: Lot | undefined,
  fallbackLot: Lot | undefined,
  summary: Pick<WhatnotFeePeriodSummary, "currentTier" | "periodStart"> | null | undefined,
  fallback: FeeProfileInput | undefined
): FeeProfileInput | undefined {
  const feeLot = lot ?? fallbackLot;
  return getResolvedLotFeeProfileInput(
    feeLot ? resolveEffectiveWhatnotFeeInput(feeLot, summary) : undefined,
    fallback
  );
}

function getNormalizedChanceTiers(config: WheelConfig): WheelTier[] {
  return normalizeWheelTierChances(config.tiers.map((tier) => ({ ...tier })));
}

export function calculateWheelNetFromGross(
  grossRevenue: number,
  feeProfileInput?: FeeProfileInput,
  orderCount = 1,
  buyerShippingPerOrder = 0,
  sellingTaxPercent = 0
): number {
  return calculateNetFromGross(grossRevenue, sellingTaxPercent, buyerShippingPerOrder, orderCount, feeProfileInput);
}

export function calculateWheelTierNetRevenuePerSpin(
  config: WheelConfig,
  tier: WheelTier,
  lots: Lot[] = [],
  fallback?: FeeProfileInput,
  summary?: Pick<WhatnotFeePeriodSummary, "currentTier" | "periodStart"> | null,
  fallbackLot?: Lot
): number {
  if (isWheelTierMultiLot(tier)) {
    return calculateAverageTierNetRevenue(config, tier, lots, fallback, summary, fallbackLot);
  }
  const lot = tier.boundLotId == null ? undefined : lots.find((entry) => entry.id === tier.boundLotId);
  const unboundFallbackLot = tier.boundLotId == null ? fallbackLot : undefined;
  return calculateWheelNetFromGross(
    Number(config.spinPrice) || 0,
    resolveWheelFeeInput(lot, unboundFallbackLot, summary, fallback),
    1,
    Number(lot?.sellingShippingPerOrder) || 0,
    Number(lot?.sellingTaxPercent) || 0
  );
}

export function calculateWheelSaleNetRevenue(
  config: WheelConfig,
  lot: Lot | undefined,
  summary?: Pick<WhatnotFeePeriodSummary, "currentTier" | "periodStart"> | null
): number {
  return calculateNetFromGross(
    Number(config.spinPrice) || 0,
    Number(lot?.sellingTaxPercent) || 0,
    Number(lot?.sellingShippingPerOrder) || 0,
    1,
    lot ? resolveEffectiveWhatnotFeeInput(lot, summary) : undefined
  );
}

export function computeExpectedMargin(
  config: WheelConfig,
  feeProfileInput?: FeeProfileInput,
  lots: Lot[] = [],
  summary?: Pick<WhatnotFeePeriodSummary, "currentTier" | "periodStart"> | null,
  fallbackLot?: Lot
): { margin: number | null } {
  let totalCost = 0;
  let totalNetRevenue = 0;
  let totalChance = 0;
  for (const tier of getNormalizedChanceTiers(config)) {
    const chance = getTierChancePercent(tier);
    if (chance <= 0) continue;
    totalCost += chance * Number(tier.costPerTier || 0);
    totalNetRevenue += chance * calculateAverageTierNetRevenue(config, tier, lots, feeProfileInput, summary, fallbackLot);
    totalChance += chance;
  }
  if (!totalChance || !config.spinPrice) return { margin: null };
  const avgCost = totalCost / totalChance;
  if (avgCost <= 0) return { margin: null };
  const netPerSpin = totalNetRevenue / totalChance;
  const margin = ((netPerSpin - avgCost) / avgCost) * 100;
  return { margin };
}

export function calculateWheelSessionNetRevenue(
  config: WheelConfig | null,
  slots: WheelSlot[],
  spinCounts: number[],
  feeProfileInput?: FeeProfileInput,
  lots: Lot[] = [],
  summary?: Pick<WhatnotFeePeriodSummary, "currentTier" | "periodStart"> | null,
  fallbackLot?: Lot
): number {
  if (!config) return 0;

  const tiersById = new Map(config.tiers.map((tier) => [tier.id, tier] as const));

  return spinCounts.reduce((sum, rawCount, index) => {
    const count = Math.max(0, Number(rawCount) || 0);
    if (count <= 0) return sum;

    const slot = slots[index];
    if (!slot) return sum;

    const tier = tiersById.get(slot.tier);
    if (tier && isWheelTierMultiLot(tier)) {
      return sum + (calculateAverageTierNetRevenue(config, tier, lots, feeProfileInput, summary, fallbackLot) * count);
    }
    const lot = tier?.boundLotId == null ? undefined : lots.find((entry) => entry.id === tier.boundLotId);
    const unboundFallbackLot = tier?.boundLotId == null ? fallbackLot : undefined;

    return sum + calculateWheelNetFromGross(
      (Number(config.spinPrice) || 0) * count,
      resolveWheelFeeInput(lot, unboundFallbackLot, summary, feeProfileInput),
      count,
      Number(lot?.sellingShippingPerOrder) || 0,
      Number(lot?.sellingTaxPercent) || 0
    );
  }, 0);
}
