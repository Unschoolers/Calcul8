import assert from "node:assert/strict";
import { test } from "vitest";
import { WheelSessionPanel } from "../src/components/windows/game/inspector/WheelSessionPanel.ts";

test("wheelSessionPanelProfit falls back to fee calculation when live session net revenue is missing", () => {
  const vm = {
    wheelMode: "live",
    activeWheelConfig: {
      id: 1,
      name: "Wheel",
      spinPrice: 10,
      targetMargin: 15,
      createdAt: "",
      tiers: [
        {
          id: "tier-1",
          label: "1 Pack",
          color: "#e74c3c",
          slots: 1,
          costPerTier: 3,
          packsCount: 1,
          deductionType: "packs",
          sets: []
        }
      ]
    },
    wheelTotalSpins: 10,
    wheelSpinCounts: [10],
    wheelController: {
      sessionNetRevenue: null,
      sessionCostAdjustment: 0,
      activeSlots: [{ tier: "tier-1", label: "1 Pack", color: "#e74c3c", cost: 3 }],
      previewSlots: [],
      previewSpinCounts: [],
      previewTotalSpins: 0,
      previewFairnessHistory: [],
      previewChaseTallyHistory: [],
      fairnessHistory: [],
      chaseTallyHistory: [],
      spinHash: "",
      spinSeed: "",
      spinClientSeed: "",
      spinVerificationUrl: "",
      spinAlgorithm: "",
      showSeed: false,
      inventoryWarning: "",
      lastResultColor: "rgb(var(--v-theme-primary))",
      fairnessHistoryOpen: false,
      highlightedSlotIndex: -1
    },
    lots: [],
    platformFeePercent: 8,
    additionalFeePercent: 2.9,
    additionalFeeAppliesTo: "sale_only",
    fixedFeePerOrder: 0.3
  };

  const result = WheelSessionPanel.computed!.wheelSessionPanelProfit.call(vm as never);
  assert.ok(Math.abs(result - 56.1) < 0.001);
});

test("wheelSessionPanelProfit uses stored live session net revenue when present", () => {
  const vm = {
    wheelMode: "live",
    activeWheelConfig: {
      id: 1,
      name: "Wheel",
      spinPrice: 10,
      targetMargin: 15,
      createdAt: "",
      tiers: [
        {
          id: "tier-1",
          label: "1 Pack",
          color: "#e74c3c",
          slots: 1,
          costPerTier: 3,
          packsCount: 1,
          deductionType: "packs",
          sets: []
        }
      ]
    },
    wheelTotalSpins: 10,
    wheelSpinCounts: [10],
    wheelController: {
      sessionNetRevenue: 84.65,
      sessionCostAdjustment: 0,
      activeSlots: [{ tier: "tier-1", label: "1 Pack", color: "#e74c3c", cost: 3 }],
      previewSlots: [],
      previewSpinCounts: [],
      previewTotalSpins: 0,
      previewFairnessHistory: [],
      previewChaseTallyHistory: [],
      fairnessHistory: [],
      chaseTallyHistory: [],
      spinHash: "",
      spinSeed: "",
      spinClientSeed: "",
      spinVerificationUrl: "",
      spinAlgorithm: "",
      showSeed: false,
      inventoryWarning: "",
      lastResultColor: "rgb(var(--v-theme-primary))",
      fairnessHistoryOpen: false,
      highlightedSlotIndex: -1
    }
  };

  const result = WheelSessionPanel.computed!.wheelSessionPanelProfit.call(vm as never);
  assert.ok(Math.abs(result - 54.65) < 0.001);
});

