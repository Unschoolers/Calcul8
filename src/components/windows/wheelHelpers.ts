import { WHATNOT_FEES } from "../../constants.ts";
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

const TIER_COLORS = [
  "#e74c3c", "#f0a500", "#2e86c1", "#8e44ad", "#27ae60",
  "#e67e22", "#1abc9c", "#c0392b", "#3498db", "#d4ac0d",
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
    ...(opts.singlesEntryId != null ? { singlesPurchaseEntryId: opts.singlesEntryId } : {})
  };
}

export function computeExpectedMargin(config: WheelConfig): { margin: number | null } {
  let totalCost = 0;
  let totalSlots = 0;
  for (const tier of config.tiers) {
    totalCost += tier.slots * tier.costPerTier;
    totalSlots += tier.slots;
  }
  if (!totalSlots || !config.spinPrice) return { margin: null };
  const avgCost = totalCost / totalSlots;
  const grossPerSpin = config.spinPrice;
  const commission = grossPerSpin * WHATNOT_FEES.COMMISSION;
  const processing = grossPerSpin * WHATNOT_FEES.PROCESSING;
  const netPerSpin = grossPerSpin - commission - processing - WHATNOT_FEES.FIXED;
  const margin = ((netPerSpin - avgCost) / grossPerSpin) * 100;
  return { margin };
}
