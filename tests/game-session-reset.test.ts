import assert from "node:assert/strict";
import { test, vi } from "vitest";
import {
  resetLoadedTierPrizeGameState,
  runWheelSessionReset,
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

test("manual live reset preserves persisted sale and required lot-selection obligations", async () => {
  const state = createGameWindowState() as Record<string, any>;
  const controller = ensureWheelControllerState(state);
  const slots = [{ tier: "tier-a", name: "Pack", color: "#2563eb", cost: 4, packsCount: 1, deductionType: "packs" as const, isChase: false }];
  const pendingIssues = [
    {
      slotName: "Failed pack sale",
      slotColor: "#2563eb",
      slotCost: 4,
      slotTier: "tier-a",
      slotPacksCount: 1,
      slotDeductionType: "packs",
      slotIndex: 0,
      selectedLotId: 10,
      spinNumber: 1,
      pendingSale: { id: 101, type: "wheel" },
      pendingSaleLotId: 10
    },
    {
      slotName: "Multi-lot pack",
      slotColor: "#f59e0b",
      slotCost: 4,
      slotTier: "tier-b",
      slotPacksCount: 1,
      slotDeductionType: "packs",
      slotIndex: 1,
      selectedLotId: null,
      spinNumber: 2,
      candidateLotIds: [10, 20],
      requiresLotSelection: true
    }
  ];
  state.wheelPendingInventoryIssues = pendingIssues;
  state.wheelSpinCounts = [3];
  state.wheelTotalSpins = 3;
  controller.activeWheelSlots = slots;
  const persist = vi.fn();
  const publish = vi.fn();

  await runWheelSessionReset(
    state as WheelSessionContext,
    controller,
    "live",
    slots as never,
    { persist, publish }
  );

  assert.deepEqual(state.wheelPendingInventoryIssues, pendingIssues);
  assert.deepEqual(state.wheelSpinCounts, [3]);
  assert.equal(state.wheelTotalSpins, 3);
  assert.equal(controller.activeWheelSlots, slots);
  assert.equal(persist.mock.calls.length, 0);
  assert.equal(publish.mock.calls.length, 0);
});
