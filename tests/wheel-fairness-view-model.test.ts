import assert from "node:assert/strict";
import { test } from "vitest";
import { buildWheelFairnessViewModel } from "../src/components/windows/game/services/wheelFairnessViewModel.ts";

test("buildWheelFairnessViewModel derives current proof and history presentation", () => {
  const model = buildWheelFairnessViewModel({
    wheelMode: "live",
    preferredLanguage: "en",
    wheelSpinning: false,
    wheelLastResult: "🎉 Prize",
    wheelController: {
      fairnessHistory: [{ spinNumber: 1, label: "Prize", color: "#f00", hash: "old", seed: "seed", timestamp: 1 }],
      previewFairnessHistory: [],
      spinHash: "hash",
      spinSeed: "seed",
      spinClientSeed: "client",
      spinVerificationUrl: "https://example.com/verify",
      spinAlgorithm: "whatfees-wheel-v1",
      lastResultColor: "#f00",
      activeSlots: [],
      previewSlots: [],
      previewSpinCounts: [],
      previewTotalSpins: 0,
      previewChaseTallyHistory: [],
      chaseTallyHistory: [],
      inventoryWarning: "",
      showSeed: false,
      fairnessHistoryOpen: false,
      sessionNetRevenue: null,
      sessionCostAdjustment: 0,
      highlightedSlotIndex: -1
    }
  });

  assert.equal(model.entries.length, 1);
  assert.equal(model.hasEntries, true);
  assert.equal(model.spinHash, "hash");
  assert.equal(model.lastResultClean, "Prize");
  assert.equal(model.icon, "mdi-shield-check");
  assert.equal(model.iconColor, "success");
  assert.match(model.title, /server/i);
});
