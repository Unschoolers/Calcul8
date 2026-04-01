import { calculateNetFromGross, type FeeProfileInput } from "../../domain/calculations.ts";
import type { Lot, Sale, WheelConfig, WheelTier } from "../../types/app.ts";

export interface WheelSlot {
  name: string;
  color: string;
  cost: number;
  tier: string;
  packsCount: number;
  deductionType: "packs" | "singles" | "none";
  isChase: boolean;
}

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

function calculateWheelSaleNetRevenue(config: WheelConfig, lot: Lot | undefined): number {
  return calculateNetFromGross(
    Number(config.spinPrice) || 0,
    Number(lot?.sellingTaxPercent) || 0,
    Number(lot?.sellingShippingPerOrder) || 0,
    1,
    getLotFeeProfileInput(lot)
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
  let totalSlots = 0;

  for (const tier of config.tiers) {
    const slots = Math.max(0, Number(tier.slots) || 0);
    if (slots <= 0) continue;
    shippingTotal += slots * getTierShippingPerOrder(tier, lots);
    totalSlots += slots;
  }

  return totalSlots > 0 ? shippingTotal / totalSlots : 0;
}

export function calculateAverageWheelSellingTaxPercent(
  config: WheelConfig,
  lots: Lot[] = []
): number {
  let taxTotal = 0;
  let totalSlots = 0;

  for (const tier of config.tiers) {
    const slots = Math.max(0, Number(tier.slots) || 0);
    if (slots <= 0) continue;
    taxTotal += slots * getLotSellingTaxPercent(tier.boundLotId, lots);
    totalSlots += slots;
  }

  return totalSlots > 0 ? taxTotal / totalSlots : 0;
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
  "#e74c3c", "#f0a500", "#2e86c1", "#8e44ad", "#27ae60",
  "#e67e22", "#1abc9c", "#c0392b", "#3498db", "#c4ff66",
  "#16a085", "#e84393", "#6c5ce7", "#fd79a8", "#00b894", "#636e72"
];

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
    tiers: [
      { id: generateTierId(), label: "1 Item", color: "#e74c3c", slots: 3, costPerTier: 4.50, packsCount: 1, deductionType: "packs", sets: [] }
    ],
    createdAt: new Date().toISOString()
  };
}

export function buildSlotsFromConfig(config: WheelConfig): WheelSlot[] {
  // Build per-tier slot arrays
  const groups: { tier: string; slots: WheelSlot[] }[] = [];
  for (const tier of config.tiers) {
    const arr: WheelSlot[] = [];
    for (let i = 0; i < tier.slots; i++) {
      const setLabel = tier.sets.length > 0 ? tier.sets[i % tier.sets.length]! : "";
      arr.push({
        name: setLabel ? `${tier.label} — ${setLabel}` : tier.label,
        color: tier.color,
        cost: tier.costPerTier,
        tier: tier.id,
        packsCount: tier.packsCount,
        deductionType: tier.deductionType,
        isChase: tier.isChase === true
      });
    }
    if (arr.length > 0) groups.push({ tier: tier.id, slots: arr });
  }

  const totalSlots = groups.reduce((sum, g) => sum + g.slots.length, 0);
  if (totalSlots === 0) return [];

  groups.sort((a, b) => b.slots.length - a.slots.length);

  const result: (WheelSlot | null)[] = new Array(totalSlots).fill(null);

  for (const group of groups) {
    const count = group.slots.length;
    const emptyPositions: number[] = [];
    for (let i = 0; i < totalSlots; i++) {
      if (result[i] === null) emptyPositions.push(i);
    }
    const step = emptyPositions.length / count;
    for (let i = 0; i < count; i++) {
      const idx = emptyPositions[Math.floor(i * step)]!;
      result[idx] = group.slots[i]!;
    }
  }

  return result.filter((s): s is WheelSlot => s !== null);
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

export function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

export function generateCryptoSeed(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashSeed(seed: string): Promise<string> {
  const encoded = new TextEncoder().encode(seed);
  const buffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function seedToIndex(seed: string, slotCount: number): number {
  // Use first 8 hex chars (32 bits) of the seed to pick a slot
  const value = parseInt(seed.substring(0, 8), 16);
  return value % slotCount;
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
  let totalSlots = 0;
  for (const tier of config.tiers) {
    totalCost += tier.slots * tier.costPerTier;
    totalSlots += tier.slots;
  }
  if (!totalSlots || !config.spinPrice) return { margin: null };
  const avgCost = totalCost / totalSlots;
  const grossPerSpin = config.spinPrice;
  const buyerShippingPerSpin = calculateAverageWheelBuyerShippingPerSpin(config, lots);
  const sellingTaxPerSpin = calculateAverageWheelSellingTaxPercent(config, lots);
  const netPerSpin = calculateWheelNetFromGross(grossPerSpin, feeProfileInput, 1, buyerShippingPerSpin, sellingTaxPerSpin);
  const margin = ((netPerSpin - avgCost) / grossPerSpin) * 100;
  return { margin };
}
