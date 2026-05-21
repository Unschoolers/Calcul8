import assert from "node:assert/strict";
import { test } from "vitest";
import { createBracketBattleOverlayAnchor } from "../src/components/windows/game/bracket/bracketBattleOverlayAnchors.ts";

test("overlay anchor size stays stable when the panel height changes", () => {
  const slotRect = {
    left: 128,
    top: 122,
    width: 160,
    height: 104
  };

  const compactSurface = {
    left: 100,
    top: 40,
    width: 600,
    height: 300
  };
  const tallSurface = {
    left: 100,
    top: 40,
    width: 600,
    height: 520
  };

  const compactAnchor = createBracketBattleOverlayAnchor(compactSurface, slotRect);
  const tallAnchor = createBracketBattleOverlayAnchor(tallSurface, slotRect);

  assert.equal(compactAnchor.size, tallAnchor.size);
  assert.equal(compactAnchor.x, tallAnchor.x);
  assert.notEqual(compactAnchor.y, tallAnchor.y);
});

test("overlay anchor size is capped for large mobile roll slots", () => {
  const surfaceRect = {
    left: 0,
    top: 0,
    width: 840,
    height: 1480
  };
  const stackedMobileSlotRect = {
    left: 120,
    top: 520,
    width: 640,
    height: 260
  };

  const anchor = createBracketBattleOverlayAnchor(surfaceRect, stackedMobileSlotRect);

  assert.equal(anchor.x, 0.5238);
  assert.equal(anchor.y, 0.4392);
  assert.equal(anchor.size, 0.1048);
});
