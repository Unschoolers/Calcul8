import assert from "node:assert/strict";
import { test } from "vitest";
import {
  resetLoadedTierPrizeGameSessionState,
  resetLoadedTierPrizeGameState
} from "../src/components/windows/game/services/gameSessionReset.ts";
import { createGameWindowState } from "../src/components/windows/game/coordinator/gameControllerState.ts";

test("resetLoadedTierPrizeGameSessionState clears session and spectator state without dropping slots", () => {
  const state = createGameWindowState() as Record<string, any>;
  state.wheelController.activeSlots = [{ tier: "t1" }];
  state.wheelSpinCounts = [2];
  state.wheelTotalSpins = 2;
  state.wheelLastResult = "Prize";
  state.wheelPendingInventoryIssues = [{ slotTier: "t1" }];
  state.gameSpectatorDialog = true;
  state.gameSpectatorSessionId = "abc123";
  state.gameSpectatorSessionStatus = "live";
  state.gameSpectatorSessionUrl = "https://example.test";
  state.gameSpectatorSessionQrUrl = "qr";
  state.gameSpectatorPublishPending = true;

  resetLoadedTierPrizeGameSessionState(state);

  assert.deepEqual(state.wheelController.activeSlots, [{ tier: "t1" }]);
  assert.deepEqual(state.wheelSpinCounts, []);
  assert.equal(state.wheelTotalSpins, 0);
  assert.equal(state.wheelLastResult, "");
  assert.deepEqual(state.wheelPendingInventoryIssues, []);
  assert.equal(state.gameSpectatorDialog, false);
  assert.equal(state.gameSpectatorSessionId, "");
  assert.equal(state.gameSpectatorSessionStatus, "inactive");
  assert.equal(state.gameSpectatorSessionUrl, "");
  assert.equal(state.gameSpectatorSessionQrUrl, "");
  assert.equal(state.gameSpectatorPublishPending, false);
});

test("resetLoadedTierPrizeGameState clears loaded slots plus session state", () => {
  const state = createGameWindowState() as Record<string, any>;
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
