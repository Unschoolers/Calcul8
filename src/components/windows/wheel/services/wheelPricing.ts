import { getTierChancePercent, normalizeWheelTierChances } from "../../../../app-core/shared/wheel-odds.ts";
import { calculateNetFromGross, type FeeProfileInput } from "../../../../domain/calculations.ts";
import type { Lot, WheelConfig, WheelTier } from "../../../../types/app.ts";
import type { WheelSlot } from "./wheelSlots.ts";

function getLotShippingPerOrder(lotId: number | null | undefined, lots: Lot[]): number {
  if (lotId == null) return 0;
  const lot = lots.find((entry) => entry.id === lotId);
  return Number(lot?.sellingShippingPerOrder) || 0;
}

function getLotSellingTaxPercent(lotId: number | null | undefined, lots: Lot[]): number {
  if (lotId == null) return 0;
  const lot = lots.find((entry) => entry.id === lotId);
  return Number(lot?.sellingTaxPercent) || 0;
}

function getTierShippingPerOrder(tier: WheelTier, lots: Lot[]): number {
  return getLotShippingPerOrder(tier.boundLotId, lots);
}

export function getLotFeeProfileInput(lot: Lot | undefined): FeeProfileInput | undefined {
  if (!lot) return undefined;
  return {
    platformFeePercent: Number(lot.platformFeePercent) || 0,
    additionalFeePercent: Number(lot.additionalFeePercent) || 0,
    additionalFeeAppliesTo: lot.additionalFeeAppliesTo,
    fixedFeePerOrder: Number(lot.fixedFeePerOrder) || 0
  };
}

function getResolvedLotFeeProfileInput(
  lot: Lot | undefined,
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
  fallback?: FeeProfileInput
): number {
  const lot = tier.boundLotId == null ? undefined : lots.find((entry) => entry.id === tier.boundLotId);
  return calculateWheelNetFromGross(
    Number(config.spinPrice) || 0,
    getResolvedLotFeeProfileInput(lot, fallback),
    1,
    Number(lot?.sellingShippingPerOrder) || 0,
    Number(lot?.sellingTaxPercent) || 0
  );
}

export function calculateWheelSaleNetRevenue(config: WheelConfig, lot: Lot | undefined): number {
  return calculateNetFromGross(
    Number(config.spinPrice) || 0,
    Number(lot?.sellingTaxPercent) || 0,
    Number(lot?.sellingShippingPerOrder) || 0,
    1,
    getLotFeeProfileInput(lot)
  );
}

export function calculateAverageWheelBuyerShippingPerSpin(
  config: WheelConfig,
  lots: Lot[] = []
): number {
  let shippingTotal = 0;
  let totalChance = 0;

  for (const tier of getNormalizedChanceTiers(config)) {
    const chance = getTierChancePercent(tier);
    if (chance <= 0) continue;
    shippingTotal += chance * getTierShippingPerOrder(tier, lots);
    totalChance += chance;
  }

  return totalChance > 0 ? shippingTotal / totalChance : 0;
}

export function calculateAverageWheelSellingTaxPercent(
  config: WheelConfig,
  lots: Lot[] = []
): number {
  let taxTotal = 0;
  let totalChance = 0;

  for (const tier of getNormalizedChanceTiers(config)) {
    const chance = getTierChancePercent(tier);
    if (chance <= 0) continue;
    taxTotal += chance * getLotSellingTaxPercent(tier.boundLotId, lots);
    totalChance += chance;
  }

  return totalChance > 0 ? taxTotal / totalChance : 0;
}

export function calculateWheelBuyerShippingTotal(
  config: WheelConfig | null,
  slots: WheelSlot[],
  spinCounts: number[],
  lots: Lot[] = []
): number {
  if (!config) return 0;

  const shippingByTier = new Map(
    config.tiers.map((tier) => [tier.id, getTierShippingPerOrder(tier, lots)] as const)
  );

  return slots.reduce((sum, slot, index) => (
    sum + ((Number(spinCounts[index]) || 0) * (shippingByTier.get(slot.tier) ?? 0))
  ), 0);
}

export function computeExpectedMargin(
  config: WheelConfig,
  feeProfileInput?: FeeProfileInput,
  lots: Lot[] = []
): { margin: number | null } {
  let totalCost = 0;
  let totalNetRevenue = 0;
  let totalChance = 0;
  for (const tier of getNormalizedChanceTiers(config)) {
    const chance = getTierChancePercent(tier);
    if (chance <= 0) continue;
    const lot = tier.boundLotId == null ? undefined : lots.find((entry) => entry.id === tier.boundLotId);
    totalCost += chance * Number(tier.costPerTier || 0);
    totalNetRevenue += chance * calculateWheelNetFromGross(
      Number(config.spinPrice) || 0,
      getResolvedLotFeeProfileInput(lot, feeProfileInput),
      1,
      Number(lot?.sellingShippingPerOrder) || 0,
      Number(lot?.sellingTaxPercent) || 0
    );
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
  lots: Lot[] = []
): number {
  if (!config) return 0;

  const tiersById = new Map(config.tiers.map((tier) => [tier.id, tier] as const));

  return spinCounts.reduce((sum, rawCount, index) => {
    const count = Math.max(0, Number(rawCount) || 0);
    if (count <= 0) return sum;

    const slot = slots[index];
    if (!slot) return sum;

    const tier = tiersById.get(slot.tier);
    const lot = tier?.boundLotId == null ? undefined : lots.find((entry) => entry.id === tier.boundLotId);

    return sum + calculateWheelNetFromGross(
      (Number(config.spinPrice) || 0) * count,
      getResolvedLotFeeProfileInput(lot, feeProfileInput),
      count,
      Number(lot?.sellingShippingPerOrder) || 0,
      Number(lot?.sellingTaxPercent) || 0
    );
  }, 0);
}
