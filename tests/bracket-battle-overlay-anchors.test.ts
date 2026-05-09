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
