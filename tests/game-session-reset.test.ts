import assert from "node:assert/strict";
import { test } from "vitest";
import {
  resetLoadedTierPrizeGameState,
  type WheelSessionContext
} from "../src/components/windows/game/services/wheelSessionState.ts";
import { createGameWindowState, ensureWheelControllerState } from "../src/components/windows/game/coordinator/gameControllerState.ts";

test("resetLoadedTierPrizeGameSessionState clears session and spectator state without dropping slots", () => {
  const state = createGameWindowState() as Record<string, any>;
  state.activeWheelSlots = [{ tier: "t1" }];
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

  resetLoadedTierPrizeGameState(state as WheelSessionContext, ensureWheelControllerState(state), false);

  assert.deepEqual(state.activeWheelSlots, [{ tier: "t1" }]);
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
  state.activeWheelSlots = [{ tier: "t1" }];
  state.wheelPreviewSlots = [{ tier: "t1" }];
  state.wheelGridLayoutSeed = "live-seed";
  state.wheelPreviewGridLayoutSeed = "preview-seed";
  state.wheelSpinCounts = [1];

  resetLoadedTierPrizeGameState(state as WheelSessionContext, ensureWheelControllerState(state), true);

  assert.deepEqual(state.activeWheelSlots, []);
  assert.deepEqual(state.wheelPreviewSlots, []);
  assert.equal(state.wheelGridLayoutSeed, "");
  assert.equal(state.wheelPreviewGridLayoutSeed, "");
  assert.deepEqual(state.wheelSpinCounts, []);
});
