import assert from "node:assert/strict";
import { test } from "vitest";
import {
  resetLoadedTierPrizeGameSessionState,
  resetLoadedTierPrizeGameState
} from "../src/components/windows/game/services/gameSessionReset.ts";
import { createGameWindowState } from "../src/components/windows/game/coordinator/gameControllerState.ts";

test("resetLoadedTierPrizeGameSessionState clears session and spectator state without dropping slots", () => {
  const state = createGameWindowState() as Record<string, unknown>;
  state.wheelController.activeSlots = [{ tier: "t1" }];
  state.wheelSpinCounts = [2];
  state.wheelTotalSpins = 2;
  state.wheelLastResult = "Prize";
  state.wheelPendingInventoryIssues = [{ slotTier: "t1" }];
  state.wheelSpectatorDialog = true;
  state.wheelSpectatorSessionId = "abc123";
  state.wheelSpectatorSessionStatus = "live";
  state.wheelSpectatorSessionUrl = "https://example.test";
  state.wheelSpectatorSessionQrUrl = "qr";
  state.wheelSpectatorPublishPending = true;

  resetLoadedTierPrizeGameSessionState(state);

  assert.deepEqual(state.wheelController.activeSlots, [{ tier: "t1" }]);
  assert.deepEqual(state.wheelSpinCounts, []);
  assert.equal(state.wheelTotalSpins, 0);
  assert.equal(state.wheelLastResult, "");
  assert.deepEqual(state.wheelPendingInventoryIssues, []);
  assert.equal(state.wheelSpectatorDialog, false);
  assert.equal(state.wheelSpectatorSessionId, "");
  assert.equal(state.wheelSpectatorSessionStatus, "inactive");
  assert.equal(state.wheelSpectatorSessionUrl, "");
  assert.equal(state.wheelSpectatorSessionQrUrl, "");
  assert.equal(state.wheelSpectatorPublishPending, false);
});

test("resetLoadedTierPrizeGameState clears loaded slots plus session state", () => {
  const state = createGameWindowState() as Record<string, unknown>;
  state.wheelController.activeSlots = [{ tier: "t1" }];
  state.wheelController.previewSlots = [{ tier: "t1" }];
  state.wheelController.gridLayoutSeed = "live-seed";
  state.wheelController.previewGridLayoutSeed = "preview-seed";
  state.wheelSpinCounts = [1];

  resetLoadedTierPrizeGameState(state);

  assert.deepEqual(state.wheelController.activeSlots, []);
  assert.deepEqual(state.wheelController.previewSlots, []);
  assert.equal(state.wheelController.gridLayoutSeed, "");
  assert.equal(state.wheelController.previewGridLayoutSeed, "");
  assert.deepEqual(state.wheelSpinCounts, []);
});
