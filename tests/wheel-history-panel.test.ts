import assert from "node:assert/strict";
import { test } from "vitest";
import { WheelHistoryPanel } from "../src/components/windows/game/inspector/WheelHistoryPanel.ts";
import { ensureWheelControllerState } from "../src/components/windows/game/coordinator/gameControllerState.ts";

function createController(overrides: Record<string, unknown> = {}) {
  return {
    activeWheelSlots: [],
    wheelPreviewSlots: [],
    wheelInventoryWarning: "",
    wheelLastResultColor: "#e74c3c",
    wheelPreviewSpinCounts: [],
    wheelPreviewTotalSpins: 0,
    wheelSpinSeed: "",
    wheelSpinHash: "",
    wheelSpinClientSeed: "",
    wheelSpinVerificationUrl: "",
    wheelSpinAlgorithm: "",
    wheelShowSeed: false,
    wheelFairnessHistoryOpen: false,
    wheelSessionNetRevenue: null,
    wheelSessionCostAdjustment: 0,
    wheelPreviewFairnessHistory: [],
    wheelFairnessHistory: [],
    wheelPreviewChaseTallyHistory: [],
    wheelChaseTallyHistory: [],
    wheelHighlightedSlotIndex: -1,
    ...overrides
  };
}

test("wheelHistoryPanelEntries returns full live history in reverse order", () => {
  const vm = {
    wheelMode: "live",
    ...createController({
      wheelFairnessHistory: [
        { spinNumber: 1, label: "A", color: "#f00", hash: "h1", seed: "s1", timestamp: 1 },
        { spinNumber: 2, label: "B", color: "#0f0", hash: "h2", seed: "s2", timestamp: 2 },
        { spinNumber: 3, label: "C", color: "#00f", hash: "h3", seed: "s3", timestamp: 3 }
      ]
    })
  };

  ensureWheelControllerState(vm);
  const model = WheelHistoryPanel.computed!.wheelHistoryPanelModel.call(vm as never);
  assert.deepEqual(model.entries.map((entry: { spinNumber: number }) => entry.spinNumber), [3, 2, 1]);
});

test("wheelHistoryPanelLatestEntry uses current preview proof fields in config mode", () => {
  const vm = {
    wheelMode: "config",
    preferredLanguage: "en",
    wheelLastResult: "🎉 Preview Prize",
    wheelHistoryPanelEntries: [
      { spinNumber: 2, label: "Older", color: "#0f0", hash: "older-hash", seed: "older-seed", timestamp: 2 }
    ],
    ...createController({
      wheelPreviewTotalSpins: 3,
      wheelSpinHash: "current-hash",
      wheelSpinSeed: "current-seed",
      wheelSpinClientSeed: "current-client-seed",
      wheelSpinVerificationUrl: "https://example.com/verify",
      wheelSpinAlgorithm: "whatfees-wheel-v1",
      wheelLastResultColor: "#ff9900"
    })
  };

  ensureWheelControllerState(vm);
  const latest = WheelHistoryPanel.computed!.wheelHistoryPanelModel.call(vm as never).latestEntry;
  assert.equal(latest?.spinNumber, 3);
  assert.equal(latest?.label, "Preview Prize");
  assert.equal(latest?.hash, "current-hash");
  assert.equal(latest?.seed, "current-seed");
  assert.equal(latest?.clientSeed, "current-client-seed");
  assert.equal(latest?.verificationUrl, "https://example.com/verify");
  assert.equal(latest?.color, "#ff9900");
});

