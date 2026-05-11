import assert from "node:assert/strict";
import { test } from "vitest";
import { createTierPrizeGameConfigFromTemplate } from "../src/components/windows/game/services/gameConfigTemplates.ts";
import type { WheelConfig } from "../src/types/app.ts";

test("createTierPrizeGameConfigFromTemplate creates bracket configs without wheel tier state", () => {
  const config = createTierPrizeGameConfigFromTemplate({ currentLotId: 42 }, "bracket");

  assert.equal(config.gameType, "bracket");
  assert.equal(config.name, "New Bracket Battle");
  assert.equal(config.spinPrice, 0);
  assert.equal(config.targetMargin, 0);
  assert.equal(config.outcomeCount, 0);
  assert.equal(config.gridCellCount, 0);
  assert.deepEqual(config.tiers, []);
  assert.equal(config.bracketBattle?.participantCount, 4);
});

test("createTierPrizeGameConfigFromTemplate keeps wheel defaults and binds the current lot", () => {
  const config = createTierPrizeGameConfigFromTemplate({ currentLotId: 42 }, "wheel");

  assert.equal(config.gameType, "wheel");
  assert.equal(config.name, "New Wheel");
  assert.equal(config.tiers.length, 1);
  assert.equal(config.tiers[0]?.boundLotId, 42);
  assert.deepEqual(config.tiers[0]?.boundLotIds, [42]);
  assert.equal(config.bracketBattle, undefined);
});

test("createTierPrizeGameConfigFromTemplate copies only matching game templates", () => {
  const source: WheelConfig = {
    id: 10,
    name: "Original Grid",
    spinPrice: 15,
    targetMargin: 30,
    gameType: "grid",
    outcomeCount: 16,
    gridCellCount: 16,
    createdAt: "2026-05-01T00:00:00.000Z",
    tiers: [{
      id: "tier-original",
      label: "Hit",
      color: "#f59e0b",
      chancePercent: 100,
      slots: 100,
      costPerTier: 10,
      packsCount: 1,
      deductionType: "none",
      sets: []
    }]
  };

  const copy = createTierPrizeGameConfigFromTemplate({ currentLotId: 99 }, "grid", source);

  assert.equal(copy.gameType, "grid");
  assert.equal(copy.name, "Original Grid (copy)");
  assert.equal(copy.outcomeCount, 16);
  assert.equal(copy.gridCellCount, 16);
  assert.notEqual(copy.id, source.id);
  assert.notEqual(copy.tiers[0]?.id, source.tiers[0]?.id);
  assert.equal(source.tiers[0]?.id, "tier-original");
});
