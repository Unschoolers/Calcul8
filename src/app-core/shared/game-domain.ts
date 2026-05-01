import type { MysteryGridReveal, WheelConfig, WheelTier } from "../../types/app.ts";
import {
  allocateTierCountsByChance,
  getWheelOutcomeCount,
  normalizeWheelTierChances
} from "./wheel-odds.ts";

export interface GameOutcomeSlot {
  name: string;
  color: string;
  cost: number;
  tier: string;
  packsCount: number;
  deductionType: "packs" | "singles" | "none";
  isChase: boolean;
  celebrationEmoji?: string;
}

export interface MysteryGridCellState {
  index: number;
  label: string;
  color: string;
  revealed: boolean;
  reveal: MysteryGridReveal | null;
}

export interface MysteryGridRevealPlan {
  cellIndex: number;
  slotIndex: number;
  slot: GameOutcomeSlot;
}

function getTierSlotWeight(tier: WheelTier): number {
  const weight = Math.floor(Number(tier.slots) || 0);
  return Number.isFinite(weight) ? Math.max(0, weight) : 0;
}

function getNormalizedChanceTiers(config: WheelConfig): WheelTier[] {
  return normalizeWheelTierChances(config.tiers.map((tier) => ({ ...tier })));
}

function hasExplicitTierChance(config: WheelConfig): boolean {
  return config.tiers.some((tier) => Number.isFinite(Number(tier.chancePercent)));
}

export function countGameOutcomeSlotsByTier(config: WheelConfig): Map<string, number> {
  const shouldBuildFromOdds = config.gameType === "grid" || hasExplicitTierChance(config);
  if (shouldBuildFromOdds) {
    return allocateTierCountsByChance(getNormalizedChanceTiers(config), getWheelOutcomeCount(config));
  }

  return new Map(config.tiers.map((tier) => [tier.id, getTierSlotWeight(tier)] as const));
}

function hashStringToUint32(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed: string): () => number {
  let state = hashStringToUint32(seed) || 0x9e3779b9;
  return () => {
    state += 0x6d2b79f5;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function buildGridShuffleSeed(config: WheelConfig): string {
  const tierSeed = config.tiers
    .map((tier) => [
      tier.id,
      tier.label,
      tier.color,
      Number.isFinite(Number(tier.chancePercent)) ? Number(tier.chancePercent) : "",
      Number.isFinite(Number(tier.slots)) ? Number(tier.slots) : ""
    ].join(":"))
    .join("|");
  return [
    "mystery-grid-layout-v1",
    String(config.id),
    String(config.name || ""),
    String(getWheelOutcomeCount(config)),
    tierSeed
  ].join("::");
}

function shuffleSlotsDeterministically<T>(slots: T[], seed: string): T[] {
  const random = createSeededRandom(seed);
  const shuffled = [...slots];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
  }
  return shuffled;
}

export function buildGameOutcomeSlots(config: WheelConfig): GameOutcomeSlot[] {
  const tierCounts = countGameOutcomeSlotsByTier(config);

  const groups: { tier: string; slots: GameOutcomeSlot[] }[] = [];
  for (const tier of config.tiers) {
    const slots: GameOutcomeSlot[] = [];
    const slotCount = tierCounts.get(tier.id) ?? 0;
    for (let index = 0; index < slotCount; index += 1) {
      const setLabel = tier.sets.length > 0 ? tier.sets[index % tier.sets.length]! : "";
      slots.push({
        name: setLabel ? `${tier.label} — ${setLabel}` : tier.label,
        color: tier.color,
        cost: tier.costPerTier,
        tier: tier.id,
        packsCount: tier.packsCount,
        deductionType: tier.deductionType,
        isChase: tier.isChase === true,
        celebrationEmoji: tier.celebrationEmoji || undefined
      });
    }
    if (slots.length > 0) groups.push({ tier: tier.id, slots });
  }

  const totalSlots = groups.reduce((sum, group) => sum + group.slots.length, 0);
  if (totalSlots === 0) return [];

  groups.sort((a, b) => b.slots.length - a.slots.length);

  const spacedSlots: (GameOutcomeSlot | null)[] = new Array(totalSlots).fill(null);

  for (const group of groups) {
    const count = group.slots.length;
    const emptyPositions: number[] = [];
    for (let index = 0; index < totalSlots; index += 1) {
      if (spacedSlots[index] === null) emptyPositions.push(index);
    }
    const step = emptyPositions.length / count;
    for (let index = 0; index < count; index += 1) {
      const spacedIndex = emptyPositions[Math.floor(index * step)]!;
      spacedSlots[spacedIndex] = group.slots[index]!;
    }
  }

  const slots = spacedSlots.filter((slot): slot is GameOutcomeSlot => slot !== null);
  return config.gameType === "grid"
    ? shuffleSlotsDeterministically(slots, buildGridShuffleSeed(config))
    : slots;
}

export function getMysteryGridOutcomeCount(config: WheelConfig | null | undefined): number {
  return getWheelOutcomeCount(config);
}

export function buildMysteryGridCellStates(params: {
  cellCount: number;
  reveals: MysteryGridReveal[];
  fallbackColor?: string;
}): MysteryGridCellState[] {
  const revealsByCell = new Map(params.reveals.map((entry) => [entry.cellIndex, entry]));
  const cellCount = Math.max(0, Math.floor(Number(params.cellCount) || 0));
  return Array.from({ length: cellCount }, (_, index) => {
    const reveal = revealsByCell.get(index) ?? null;
    return {
      index,
      label: reveal?.label || "",
      color: reveal?.color || params.fallbackColor || "rgb(var(--v-theme-primary))",
      revealed: reveal != null,
      reveal
    };
  });
}

export function pickUnrevealedMysteryGridCellIndex(
  cells: Pick<MysteryGridCellState, "index" | "revealed">[],
  random: () => number = Math.random
): number {
  const unrevealedCells = cells.filter((cell) => !cell.revealed);
  if (!unrevealedCells.length) return -1;
  const randomIndex = Math.min(
    unrevealedCells.length - 1,
    Math.max(0, Math.floor(random() * unrevealedCells.length))
  );
  return unrevealedCells[randomIndex]?.index ?? -1;
}

export function resolveMysteryGridSlotIndex(cellIndex: number, slots: GameOutcomeSlot[]): number {
  const normalizedCellIndex = Math.floor(Number(cellIndex));
  if (!Number.isFinite(normalizedCellIndex) || normalizedCellIndex < 0) return -1;
  return normalizedCellIndex < slots.length ? normalizedCellIndex : -1;
}

export function createMysteryGridRevealPlan(
  cellIndex: number,
  slots: GameOutcomeSlot[]
): MysteryGridRevealPlan | null {
  const slotIndex = resolveMysteryGridSlotIndex(cellIndex, slots);
  const slot = slotIndex >= 0 ? slots[slotIndex] : undefined;
  if (!slot) return null;
  return {
    cellIndex: Math.floor(Number(cellIndex)),
    slotIndex,
    slot
  };
}
