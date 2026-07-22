import assert from "node:assert/strict";
import { test } from "vitest";
import { buildWheelFairnessViewModel } from "../src/components/windows/game/services/wheelFairnessViewModel.ts";

test("buildWheelFairnessViewModel derives current proof and history presentation", () => {
  const model = buildWheelFairnessViewModel({
    wheelMode: "live",
    preferredLanguage: "en",
    wheelSpinning: false,
    wheelLastResult: "🎉 Prize",
    ...{
      wheelFairnessHistory: [{ spinNumber: 1, label: "Prize", color: "#f00", hash: "old", seed: "seed", timestamp: 1 }],
      wheelPreviewFairnessHistory: [],
      wheelSpinHash: "hash",
      wheelSpinSeed: "seed",
      wheelSpinClientSeed: "client",
      wheelSpinVerificationUrl: "https://example.com/verify",
      wheelSpinAlgorithm: "whatfees-wheel-v1",
      wheelLastResultColor: "#f00",
      activeWheelSlots: [],
      wheelPreviewSlots: [],
      wheelPreviewSpinCounts: [],
      wheelPreviewTotalSpins: 0,
      wheelPreviewChaseTallyHistory: [],
      wheelChaseTallyHistory: [],
      wheelInventoryWarning: "",
      wheelShowSeed: false,
      wheelFairnessHistoryOpen: false,
      wheelSessionNetRevenue: null,
      wheelSessionCostAdjustment: 0,
      wheelHighlightedSlotIndex: -1
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
