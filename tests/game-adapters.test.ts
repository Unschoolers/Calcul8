import assert from "node:assert/strict";
import { test } from "vitest";
import { getTierPrizeGameAdapter, tierPrizeGameAdapters } from "../src/components/windows/game/services/gameAdapters.ts";
import type { WheelConfig } from "../src/types/app.ts";

function createConfig(gameType: "wheel" | "grid"): WheelConfig {
  return {
    id: 1,
    name: "Game",
    spinPrice: 10,
    targetMargin: 20,
    gameType,
    outcomeCount: gameType === "grid" ? 25 : undefined,
    gridCellCount: gameType === "grid" ? 25 : undefined,
    createdAt: "",
    tiers: []
  };
}

test("tier-prize game registry exposes explicit wheel and grid adapters", () => {
  assert.equal(tierPrizeGameAdapters.wheel.gameType, "wheel");
  assert.equal(tierPrizeGameAdapters.grid.gameType, "grid");
  assert.equal(tierPrizeGameAdapters.wheel.isBoardGame, false);
  assert.equal(tierPrizeGameAdapters.grid.isBoardGame, true);
});

test("tier-prize game adapter resolves display behavior from game type", () => {
  const wheelAdapter = getTierPrizeGameAdapter(createConfig("wheel"));
  const gridAdapter = getTierPrizeGameAdapter(createConfig("grid"));

  assert.equal(wheelAdapter.primaryActionIcon({ wheelMode: "live" }, null), "mdi-lightning-bolt");
  assert.equal(gridAdapter.primaryActionIcon({ wheelMode: "live" }, null), "mdi-grid");
  assert.match(wheelAdapter.stageSlotsLabel({ wheelDisplaySlots: [{ name: "A" } as never] }, createConfig("wheel")), /1/);
  assert.match(gridAdapter.stageSlotsLabel({}, createConfig("grid")), /25/);
});

