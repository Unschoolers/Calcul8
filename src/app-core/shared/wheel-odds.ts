import type { WheelTier } from "../../types/app.ts";

const CHANCE_TOTAL_PERCENT = 100;
export const DEFAULT_WHEEL_OUTCOME_COUNT = 100;
export const MIN_WHEEL_OUTCOME_COUNT = 4;
export const MAX_WHEEL_OUTCOME_COUNT = 200;

type WheelOddsTier = Pick<WheelTier, "id" | "slots" | "chancePercent">;

function clampChancePercent(value: unknown): number {
  const chance = Number(value);
  if (!Number.isFinite(chance)) return 0;
  return Math.min(CHANCE_TOTAL_PERCENT, Math.max(0, chance));
}

function roundChancePercent(value: number): number {
  return Math.round(value);
}

function getLegacySlotWeight(tier: WheelOddsTier): number {
  const weight = Math.floor(Number(tier.slots) || 0);
  return Number.isFinite(weight) ? Math.max(0, weight) : 0;
}

export function getTierChancePercent(tier: WheelOddsTier): number {
  if (Number.isFinite(Number(tier.chancePercent))) {
    return clampChancePercent(tier.chancePercent);
  }
  return getLegacySlotWeight(tier);
}

export function normalizeWheelOutcomeCount(value: unknown): number {
  const count = Math.floor(Number(value));
  if (!Number.isFinite(count)) return DEFAULT_WHEEL_OUTCOME_COUNT;
  if (count < MIN_WHEEL_OUTCOME_COUNT) return DEFAULT_WHEEL_OUTCOME_COUNT;
  return Math.min(MAX_WHEEL_OUTCOME_COUNT, count);
}

export function getWheelOutcomeCount(config: {
  outcomeCount?: unknown;
  gridCellCount?: unknown;
} | null | undefined): number {
  return normalizeWheelOutcomeCount(config?.outcomeCount ?? config?.gridCellCount);
}

export function getWheelChanceTotal(tiers: WheelOddsTier[]): number {
  return roundChancePercent(tiers.reduce((sum, tier) => sum + getTierChancePercent(tier), 0));
}

export function normalizeWheelTierChances<T extends WheelOddsTier>(tiers: T[]): T[] {
  if (!tiers.length) return tiers;

  const hasExplicitChance = tiers.some((tier) => Number.isFinite(Number(tier.chancePercent)));
  const weights = tiers.map((tier) => (
    hasExplicitChance ? clampChancePercent(tier.chancePercent) : getLegacySlotWeight(tier)
  ));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const fallbackChance = CHANCE_TOTAL_PERCENT / tiers.length;

  let allocatedTotal = 0;
  for (let index = 0; index < tiers.length; index += 1) {
    const tier = tiers[index]!;
    const rawChance = totalWeight > 0
      ? (weights[index]! / totalWeight) * CHANCE_TOTAL_PERCENT
      : fallbackChance;
    const chance = index === tiers.length - 1
      ? roundChancePercent(CHANCE_TOTAL_PERCENT - allocatedTotal)
      : roundChancePercent(rawChance);
    tier.chancePercent = chance;
    tier.slots = Math.max(0, Math.round(chance));
    allocatedTotal = roundChancePercent(allocatedTotal + chance);
  }

  return tiers;
}

export function setWheelTierChancePercent<T extends WheelOddsTier>(
  tiers: T[],
  tierId: string,
  nextChance: unknown
): void {
  if (!tiers.length) return;
  if (tiers.length === 1) {
    tiers[0]!.chancePercent = CHANCE_TOTAL_PERCENT;
    tiers[0]!.slots = CHANCE_TOTAL_PERCENT;
    return;
  }

  const target = tiers.find((tier) => tier.id === tierId);
  if (!target) return;

  const targetChance = roundChancePercent(clampChancePercent(nextChance));
  const remainingChance = roundChancePercent(CHANCE_TOTAL_PERCENT - targetChance);
  const otherTiers = tiers.filter((tier) => tier.id !== tierId);
  const otherTotal = otherTiers.reduce((sum, tier) => sum + getTierChancePercent(tier), 0);
  const fallbackShare = otherTiers.length > 0 ? remainingChance / otherTiers.length : 0;

  target.chancePercent = targetChance;
  target.slots = Math.max(0, Math.round(targetChance));

  let allocatedOtherChance = 0;
  for (let index = 0; index < otherTiers.length; index += 1) {
    const tier = otherTiers[index]!;
    const rawChance = otherTotal > 0
      ? (getTierChancePercent(tier) / otherTotal) * remainingChance
      : fallbackShare;
    const chance = index === otherTiers.length - 1
      ? roundChancePercent(remainingChance - allocatedOtherChance)
      : roundChancePercent(rawChance);
    tier.chancePercent = chance;
    tier.slots = Math.max(0, Math.round(chance));
    allocatedOtherChance = roundChancePercent(allocatedOtherChance + chance);
  }
}

export function allocateTierCountsByChance(
  tiers: WheelOddsTier[],
  totalCount: number
): Map<string, number> {
  const targetCount = Math.max(0, Math.floor(Number(totalCount) || 0));
  const weightedTiers = tiers
    .map((tier, index) => ({
      tier,
      index,
      chance: getTierChancePercent(tier)
    }))
    .filter((entry) => entry.chance > 0);

  const totalChance = weightedTiers.reduce((sum, entry) => sum + entry.chance, 0);
  if (targetCount <= 0 || totalChance <= 0) return new Map();

  const allocations = weightedTiers.map((entry) => {
    const exactCount = (entry.chance / totalChance) * targetCount;
    const count = Math.floor(exactCount);
    return {
      ...entry,
      count,
      remainder: exactCount - count
    };
  });

  let remaining = targetCount - allocations.reduce((sum, entry) => sum + entry.count, 0);
  const byRemainder = [...allocations].sort((a, b) => (
    b.remainder - a.remainder
    || b.chance - a.chance
    || a.index - b.index
  ));

  for (let index = 0; remaining > 0 && byRemainder.length > 0; index += 1, remaining -= 1) {
    byRemainder[index % byRemainder.length]!.count += 1;
  }

  return new Map(allocations.map((entry) => [entry.tier.id, entry.count] as const));
}
