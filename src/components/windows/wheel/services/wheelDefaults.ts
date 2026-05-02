import type { WheelConfig, WheelTier } from "../../../../types/app.ts";

const TIER_COLORS = [
  "#f0a500", "#8e44ad", "#2e86c1", "#27ae60", "#e67e22",
  "#1abc9c", "#3498db", "#c4ff66", "#16a085", "#e84393",
  "#6c5ce7", "#fd79a8", "#00b894", "#636e72", "#e74c3c",
  "#c0392b",
];

export function generateTierId(): string {
  return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

export function createDefaultTier(index: number, usedColors: string[] = []): WheelTier {
  const usedSet = new Set(usedColors.map((color) => color.toLowerCase()));
  const color = TIER_COLORS.find((candidate) => !usedSet.has(candidate.toLowerCase()))
    ?? TIER_COLORS[index % TIER_COLORS.length]!;
  return {
    id: generateTierId(),
    label: "Tier " + (index + 1),
    color,
    chancePercent: 0,
    slots: 3,
    costPerTier: 5,
    packsCount: 1,
    deductionType: "packs",
    boundLotIds: [],
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
      {
        id: generateTierId(),
        label: "1 Item",
        color: "#f0a500",
        chancePercent: 100,
        slots: 100,
        costPerTier: 4.50,
        packsCount: 1,
        deductionType: "packs",
        boundLotIds: [],
        sets: []
      }
    ],
    createdAt: new Date().toISOString()
  };
}
