import assert from "node:assert/strict";
import { test } from "vitest";
import {
  buildGameOutcomeSlots,
  buildMysteryGridCellStates,
  createMysteryGridRevealPlan,
  getMysteryGridOutcomeCount,
  pickUnrevealedMysteryGridCellIndex
} from "../src/app-core/shared/game-domain.ts";
import type { WheelConfig } from "../src/types/app.ts";

function createConfig(overrides: Partial<WheelConfig> = {}): WheelConfig {
  return {
    id: 10,
    name: "Game",
    spinPrice: 10,
    targetMargin: 40,
    gameType: "grid",
    outcomeCount: 25,
    gridCellCount: 25,
    createdAt: "",
    tiers: [
      {
        id: "floor",
        label: "Floor",
        color: "#2563eb",
        chancePercent: 80,
        slots: 80,
        costPerTier: 4,
        packsCount: 1,
        deductionType: "packs",
        sets: []
      },
      {
        id: "hit",
        label: "Hit",
        color: "#f59e0b",
        chancePercent: 20,
        slots: 20,
        costPerTier: 20,
        packsCount: 1,
        deductionType: "none",
        sets: [],
        isChase: true
      }
    ],
    ...overrides
  };
}

test("game domain builds fixed grid outcomes from tier chances and outcome count", () => {
  const slots = buildGameOutcomeSlots(createConfig());

  assert.equal(slots.length, 25);
  assert.equal(slots.filter((slot) => slot.tier === "floor").length, 20);
  assert.equal(slots.filter((slot) => slot.tier === "hit").length, 5);
});

test("game domain keeps wheel outcomes based on legacy slot weights when chances are absent", () => {
  const slots = buildGameOutcomeSlots(createConfig({
    gameType: "wheel",
    outcomeCount: 100,
    tiers: [
      {
        id: "a",
        label: "A",
        color: "#2563eb",
        slots: 3,
        costPerTier: 4,
        packsCount: 1,
        deductionType: "packs",
        sets: []
      },
      {
        id: "b",
        label: "B",
        color: "#f59e0b",
        slots: 1,
        costPerTier: 20,
        packsCount: 1,
        deductionType: "none",
        sets: []
      }
    ]
  }));

  assert.equal(slots.length, 4);
  assert.equal(slots.filter((slot) => slot.tier === "a").length, 3);
  assert.equal(slots.filter((slot) => slot.tier === "b").length, 1);
});

test("game domain builds mystery grid cell state from reveal history", () => {
  const cells = buildMysteryGridCellStates({
    cellCount: 4,
    reveals: [
      {
        cellIndex: 2,
        slotIndex: 2,
        label: "Hit",
        color: "#f59e0b",
        tier: "hit",
        spinNumber: 1,
        timestamp: 123
      }
    ]
  });

  assert.equal(cells.length, 4);
  assert.equal(cells[2]?.revealed, true);
  assert.equal(cells[2]?.label, "Hit");
  assert.equal(cells[0]?.revealed, false);
});

test("game domain picks only unrevealed grid cells", () => {
  const cells = buildMysteryGridCellStates({
    cellCount: 5,
    reveals: [
      { cellIndex: 0, slotIndex: 0, label: "A", color: "#000", tier: "a", spinNumber: 1, timestamp: 1 },
      { cellIndex: 3, slotIndex: 3, label: "B", color: "#111", tier: "b", spinNumber: 2, timestamp: 2 }
    ]
  });

  assert.equal(pickUnrevealedMysteryGridCellIndex(cells, () => 0), 1);
  assert.equal(pickUnrevealedMysteryGridCellIndex(cells, () => 0.5), 2);
  assert.equal(pickUnrevealedMysteryGridCellIndex(cells, () => 0.999), 4);
});

test("game domain returns typed reveal plans for valid grid cells", () => {
  const slots = buildGameOutcomeSlots(createConfig({ outcomeCount: 4, gridCellCount: 4 }));
  const plan = createMysteryGridRevealPlan(2, slots);

  assert.equal(plan?.cellIndex, 2);
  assert.equal(plan?.slotIndex, 2);
  assert.equal(plan?.slot, slots[2]);
  assert.equal(createMysteryGridRevealPlan(99, slots), null);
});

test("game domain normalizes mystery grid outcome count", () => {
  assert.equal(getMysteryGridOutcomeCount(createConfig({ outcomeCount: 36 })), 36);
  assert.equal(getMysteryGridOutcomeCount(createConfig({ outcomeCount: 1 })), 100);
});
