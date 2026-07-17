import assert from "node:assert/strict";
import { test } from "vitest";
import { buildWheelSessionViewModel } from "../src/components/windows/game/services/wheelSessionViewModel.ts";

test("buildWheelSessionViewModel derives financial and inventory presentation once", () => {
  const context = {
    wheelMode: "live",
    preferredLanguage: "en",
    activeWheelConfig: {
      id: 1,
      name: "Wheel",
      spinPrice: 10,
      targetMargin: 40,
      createdAt: "",
      tiers: [{
        id: "tier-1",
        label: "One pack",
        color: "#f00",
        slots: 1,
        chancePercent: 100,
        costPerTier: 3,
        packsCount: 1,
        deductionType: "packs",
        boundLotId: 7,
        sets: []
      }]
    },
    wheelTotalSpins: 2,
    wheelSpinCounts: [2],
    lots: [{ id: 7, name: "Booster box", boxesPurchased: 1, packsPerBox: 10 }],
    wheelController: {
      sessionNetRevenue: 18,
      sessionCostAdjustment: 0,
      activeSlots: [{ tier: "tier-1", name: "One pack", color: "#f00", cost: 3, packsCount: 1, deductionType: "packs" }],
      previewSlots: [],
      previewSpinCounts: [],
      previewTotalSpins: 0,
      previewFairnessHistory: [],
      previewChaseTallyHistory: [],
      fairnessHistory: [],
      chaseTallyHistory: [],
      inventoryWarning: "",
      lastResultColor: "",
      spinSeed: "",
      spinHash: "",
      spinClientSeed: "",
      spinVerificationUrl: "",
      spinAlgorithm: "",
      showSeed: false,
      fairnessHistoryOpen: false,
      highlightedSlotIndex: -1
    }
  };

  const model = buildWheelSessionViewModel(context);

  assert.equal(model.totalSpins, 2);
  assert.equal(model.revenue, 20);
  assert.equal(model.cost, 6);
  assert.equal(model.profit, 12);
  assert.equal(model.marginDisplay, "200.0%");
  assert.equal(model.sourceGroups[0]?.label, "Booster box");
  assert.equal(model.sourceGroups[0]?.tiers[0]?.count, 2);
});
