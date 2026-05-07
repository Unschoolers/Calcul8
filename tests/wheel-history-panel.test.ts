import assert from "node:assert/strict";
import { test } from "vitest";
import { WheelHistoryPanel } from "../src/components/windows/game/inspector/WheelHistoryPanel.ts";

function createController(overrides: Record<string, unknown> = {}) {
  return {
    activeSlots: [],
    previewSlots: [],
    inventoryWarning: "",
    lastResultColor: "#e74c3c",
    previewSpinCounts: [],
    previewTotalSpins: 0,
    spinSeed: "",
    spinHash: "",
    spinClientSeed: "",
    spinVerificationUrl: "",
    spinAlgorithm: "",
    showSeed: false,
    fairnessHistoryOpen: false,
    sessionNetRevenue: null,
    sessionCostAdjustment: 0,
    previewFairnessHistory: [],
    fairnessHistory: [],
    previewChaseTallyHistory: [],
    chaseTallyHistory: [],
    highlightedSlotIndex: -1,
    ...overrides
  };
}

test("wheelHistoryPanelEntries returns full live history in reverse order", () => {
  const vm = {
    wheelMode: "live",
    wheelController: createController({
      fairnessHistory: [
        { spinNumber: 1, label: "A", color: "#f00", hash: "h1", seed: "s1", timestamp: 1 },
        { spinNumber: 2, label: "B", color: "#0f0", hash: "h2", seed: "s2", timestamp: 2 },
        { spinNumber: 3, label: "C", color: "#00f", hash: "h3", seed: "s3", timestamp: 3 }
      ]
    })
  };

  const entries = WheelHistoryPanel.computed!.wheelHistoryPanelEntries.call(vm as never);
  assert.deepEqual(entries.map((entry: { spinNumber: number }) => entry.spinNumber), [3, 2, 1]);
});

test("wheelHistoryPanelLatestEntry uses current preview proof fields in config mode", () => {
  const vm = {
    wheelMode: "config",
    preferredLanguage: "en",
    wheelLastResult: "🎉 Preview Prize",
    wheelHistoryPanelEntries: [
      { spinNumber: 2, label: "Older", color: "#0f0", hash: "older-hash", seed: "older-seed", timestamp: 2 }
    ],
    wheelController: createController({
      previewTotalSpins: 3,
      spinHash: "current-hash",
      spinSeed: "current-seed",
      spinClientSeed: "current-client-seed",
      spinVerificationUrl: "https://example.com/verify",
      spinAlgorithm: "whatfees-wheel-v1",
      lastResultColor: "#ff9900"
    })
  };

  const latest = WheelHistoryPanel.computed!.wheelHistoryPanelLatestEntry.call(vm as never);
  assert.equal(latest?.spinNumber, 3);
  assert.equal(latest?.label, "Preview Prize");
  assert.equal(latest?.hash, "current-hash");
  assert.equal(latest?.seed, "current-seed");
  assert.equal(latest?.clientSeed, "current-client-seed");
  assert.equal(latest?.verificationUrl, "https://example.com/verify");
  assert.equal(latest?.color, "#ff9900");
});

