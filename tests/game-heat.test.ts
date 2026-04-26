import assert from "node:assert/strict";
import { test } from "vitest";
import {
  resolveFeaturedGameHeatCandidate,
  resolveGameTierHeat,
  shiftHeatLevel
} from "../src/app-core/shared/game-heat.ts";

test("resolveGameTierHeat only starts at medium when the tier loses money for the operator", () => {
  assert.equal(resolveGameTierHeat({
    id: "loss",
    label: "Loss",
    chance: 10,
    totalChance: 100,
    totalPlays: 0,
    hitCount: 0,
    spinsSinceHit: 0,
    profitPerPlay: -2,
    remainingHits: null
  }).heat, "very_low");

  assert.equal(resolveGameTierHeat({
    id: "profit",
    label: "Profit",
    chance: 10,
    totalChance: 100,
    totalPlays: 100,
    hitCount: 0,
    spinsSinceHit: 100,
    profitPerPlay: 4,
    remainingHits: null
  }).heat, "very_low");
});

test("resolveGameTierHeat rises when a client-favorable tier is statistically overdue", () => {
  const heat = resolveGameTierHeat({
    id: "sweat",
    label: "Sweat",
    chance: 10,
    totalChance: 100,
    totalPlays: 30,
    hitCount: 0,
    spinsSinceHit: 30,
    profitPerPlay: -4,
    remainingHits: null
  });

  assert.equal(heat.clientFavorable, true);
  assert.equal(heat.heat, "very_high");
  assert.ok(heat.dueProbability > 0.94);
  assert.ok(heat.underHitGap >= 2);
});

test("resolveGameTierHeat applies recent-hit cooldown without hiding remaining pressure", () => {
  const heat = resolveGameTierHeat({
    id: "sweat",
    label: "Sweat",
    chance: 20,
    totalChance: 100,
    totalPlays: 20,
    hitCount: 1,
    spinsSinceHit: 0,
    profitPerPlay: -6,
    remainingHits: null
  });

  assert.equal(heat.recentlyHit, true);
  assert.equal(heat.heat, "low");
});

test("resolveFeaturedGameHeatCandidate models multiple client-favorable tiers together", () => {
  const result = resolveFeaturedGameHeatCandidate([
    {
      id: "a",
      label: "A",
      chance: 15,
      totalChance: 100,
      totalPlays: 40,
      hitCount: 0,
      spinsSinceHit: 40,
      profitPerPlay: -4,
      remainingHits: null
    },
    {
      id: "b",
      label: "B",
      chance: 10,
      totalChance: 100,
      totalPlays: 40,
      hitCount: 0,
      spinsSinceHit: 40,
      profitPerPlay: -6,
      remainingHits: null
    },
    {
      id: "c",
      label: "C",
      chance: 75,
      totalChance: 100,
      totalPlays: 40,
      hitCount: 40,
      spinsSinceHit: 1,
      profitPerPlay: 3,
      remainingHits: null
    }
  ]);

  assert.equal(result.label, "2 client-favorable tiers");
  assert.equal(result.heat, "very_high");
  assert.equal(result.tiers.filter((tier) => tier.clientFavorable).length, 2);
});

test("resolveFeaturedGameHeatCandidate ignores sold-out tiers and falls back to profitable candidates", () => {
  const result = resolveFeaturedGameHeatCandidate([
    {
      id: "sold",
      label: "Sold Out",
      chance: 10,
      totalChance: 100,
      totalPlays: 50,
      hitCount: 0,
      spinsSinceHit: 50,
      profitPerPlay: -10,
      remainingHits: 0
    },
    {
      id: "available",
      label: "Available",
      chance: 90,
      totalChance: 100,
      totalPlays: 50,
      hitCount: 45,
      spinsSinceHit: 1,
      profitPerPlay: 4,
      remainingHits: null
    }
  ]);

  assert.equal(result.label, "Available");
  assert.equal(result.heat, "very_low");
  assert.equal(result.tiers.length, 1);
});

test("shiftHeatLevel clamps within the public heat scale", () => {
  assert.equal(shiftHeatLevel("very_low", -10), "very_low");
  assert.equal(shiftHeatLevel("medium", 1), "high");
  assert.equal(shiftHeatLevel("high", 10), "very_high");
});
