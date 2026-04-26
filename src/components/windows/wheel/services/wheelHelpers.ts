import { buildGameOutcomeSlots, type GameOutcomeSlot } from "../../../../app-core/shared/game-domain.ts";
export { easeOutQuart } from "../../../../app-core/shared/game-spin.ts";
import { getTierChancePercent, normalizeWheelTierChances } from "../../../../app-core/shared/wheel-odds.ts";
import { calculateNetFromGross, type FeeProfileInput } from "../../../../domain/calculations.ts";
import type { Lot, Sale, WheelConfig, WheelTier } from "../../../../types/app.ts";
export {
  generateCryptoSeed,
  hashSeed,
  hashWheelLayoutForFairness,
  seedToIndex,
  serializeWheelLayoutForFairness
} from "./wheelFairnessLayout.ts";

export type WheelSlot = GameOutcomeSlot;

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

function getLotFeeProfileInput(lot: Lot | undefined): FeeProfileInput | undefined {
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
  const hasAdditionalFeeScope = lot.additionalFeeAppliesTo === "sale_only" || lot.additionalFeeAppliesTo === "sale_plus_shipping";

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

function calculateWheelSaleNetRevenue(config: WheelConfig, lot: Lot | undefined): number {
  return calculateNetFromGross(
    Number(config.spinPrice) || 0,
    Number(lot?.sellingTaxPercent) || 0,
    Number(lot?.sellingShippingPerOrder) || 0,
    1,
    getLotFeeProfileInput(lot)
  );
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

export function calculateWheelNetFromGross(
  grossRevenue: number,
  feeProfileInput?: FeeProfileInput,
  orderCount = 1,
  buyerShippingPerOrder = 0,
  sellingTaxPercent = 0
): number {
  return calculateNetFromGross(grossRevenue, sellingTaxPercent, buyerShippingPerOrder, orderCount, feeProfileInput);
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

const TIER_COLORS = [
  "#f0a500", "#8e44ad", "#2e86c1", "#27ae60", "#e67e22",
  "#1abc9c", "#3498db", "#c4ff66", "#16a085", "#e84393",
  "#6c5ce7", "#fd79a8", "#00b894", "#636e72", "#e74c3c",
  "#c0392b",
];

function getNormalizedChanceTiers(config: WheelConfig): WheelTier[] {
  return normalizeWheelTierChances(config.tiers.map((tier) => ({ ...tier })));
}

export function generateTierId(): string {
  return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

export function createDefaultTier(index: number, usedColors: string[] = []): WheelTier {
  const usedSet = new Set(usedColors.map((c) => c.toLowerCase()));
  const color = TIER_COLORS.find((c) => !usedSet.has(c.toLowerCase())) ?? TIER_COLORS[index % TIER_COLORS.length]!;
  return {
    id: generateTierId(),
    label: "Tier " + (index + 1),
    color,
    chancePercent: 0,
    slots: 3,
    costPerTier: 5,
    packsCount: 1,
    deductionType: "packs",
    sets: []
  };
}

export function createDefaultWheelConfig(): WheelConfig {
  return {
    id: Date.now(),
    name: "New Wheel",
    spinPrice: 10,
    targetMargin: 40,
    gameType: "wheel",
    outcomeCount: 100,
    gridCellCount: 100,
    tiers: [
      { id: generateTierId(), label: "1 Item", color: "#f0a500", chancePercent: 100, slots: 100, costPerTier: 4.50, packsCount: 1, deductionType: "packs", sets: [] }
    ],
    createdAt: new Date().toISOString()
  };
}

export function buildSlotsFromConfig(config: WheelConfig): WheelSlot[] {
  return buildGameOutcomeSlots(config);
}

export function remapSpinCountsByTier(oldTierIds: string[], oldCounts: number[], newSlots: WheelSlot[]): number[] {
  const totalByTier: Record<string, number> = {};
  const limit = Math.min(oldTierIds.length, oldCounts.length);
  for (let i = 0; i < limit; i++) {
    const tierId = oldTierIds[i];
    if (!tierId) continue;
    totalByTier[tierId] = (totalByTier[tierId] || 0) + (oldCounts[i] || 0);
  }

  const slotCountByTier: Record<string, number> = {};
  for (const slot of newSlots) {
    slotCountByTier[slot.tier] = (slotCountByTier[slot.tier] || 0) + 1;
  }

  const seenByTier: Record<string, number> = {};
  return newSlots.map((slot) => {
    const total = totalByTier[slot.tier] || 0;
    const totalSlots = slotCountByTier[slot.tier] || 1;
    const seen = seenByTier[slot.tier] || 0;
    seenByTier[slot.tier] = seen + 1;
    if (!total) return 0;
    const base = Math.floor(total / totalSlots);
    const remainder = total % totalSlots;
    return base + (seen < remainder ? 1 : 0);
  });
}

export function createWheelSale(opts: {
  config: WheelConfig;
  tier: string;
  cost: number;
  packsCount: number;
  deductionType: "packs" | "singles" | "none";
  label: string;
  lotId: number;
  lots: Lot[];
  singlesEntryId?: number | null;
  spinNumber?: number;
}): Sale {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const lot = opts.lots.find((l) => l.id === opts.lotId);
  const netRevenue = calculateWheelSaleNetRevenue(opts.config, lot);
  return {
    id: Date.now() + (opts.spinNumber ?? 0),
    type: "wheel",
    quantity: opts.deductionType === "singles" ? 1 : (opts.packsCount || 1),
    packsCount: opts.packsCount,
    price: opts.config.spinPrice,
    buyerShipping: lot?.sellingShippingPerOrder ?? 0,
    date: dateStr,
    memo: opts.spinNumber ? `Wheel spin #${opts.spinNumber}: ${opts.label}` : `Wheel spin: ${opts.label}`,
    linkedWheelId: opts.config.id,
    winningTierId: opts.tier,
    costOfWinningTier: opts.cost,
    netRevenue,
    ...(opts.singlesEntryId != null ? { singlesPurchaseEntryId: opts.singlesEntryId } : {})
  };
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
