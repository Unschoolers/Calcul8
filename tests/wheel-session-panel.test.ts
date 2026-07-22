import assert from "node:assert/strict";
import { test } from "vitest";
import { WheelSessionPanel } from "../src/components/windows/game/inspector/WheelSessionPanel.ts";
import { ensureWheelControllerState } from "../src/components/windows/game/coordinator/gameControllerState.ts";

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
    ...{
      wheelSessionNetRevenue: null,
      wheelSessionCostAdjustment: 0,
      activeWheelSlots: [{ tier: "tier-1", label: "1 Pack", color: "#e74c3c", cost: 3 }],
      wheelPreviewSlots: [],
      wheelPreviewSpinCounts: [],
      wheelPreviewTotalSpins: 0,
      wheelPreviewFairnessHistory: [],
      wheelPreviewChaseTallyHistory: [],
      wheelFairnessHistory: [],
      wheelChaseTallyHistory: [],
      wheelSpinHash: "",
      wheelSpinSeed: "",
      wheelSpinClientSeed: "",
      wheelSpinVerificationUrl: "",
      wheelSpinAlgorithm: "",
      wheelShowSeed: false,
      wheelInventoryWarning: "",
      wheelLastResultColor: "rgb(var(--v-theme-primary))",
      wheelFairnessHistoryOpen: false,
      wheelHighlightedSlotIndex: -1
    },
    lots: [],
    platformFeePercent: 8,
    additionalFeePercent: 2.9,
    additionalFeeAppliesTo: "sale_only",
    fixedFeePerOrder: 0.3
  };

  ensureWheelControllerState(vm);
  const result = WheelSessionPanel.computed!.wheelSessionPanelModel.call(vm as never);
  assert.ok(Math.abs(result.profit - 56.1) < 0.001);
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
    ...{
      wheelSessionNetRevenue: 84.65,
      wheelSessionCostAdjustment: 0,
      activeWheelSlots: [{ tier: "tier-1", label: "1 Pack", color: "#e74c3c", cost: 3 }],
      wheelPreviewSlots: [],
      wheelPreviewSpinCounts: [],
      wheelPreviewTotalSpins: 0,
      wheelPreviewFairnessHistory: [],
      wheelPreviewChaseTallyHistory: [],
      wheelFairnessHistory: [],
      wheelChaseTallyHistory: [],
      wheelSpinHash: "",
      wheelSpinSeed: "",
      wheelSpinClientSeed: "",
      wheelSpinVerificationUrl: "",
      wheelSpinAlgorithm: "",
      wheelShowSeed: false,
      wheelInventoryWarning: "",
      wheelLastResultColor: "rgb(var(--v-theme-primary))",
      wheelFairnessHistoryOpen: false,
      wheelHighlightedSlotIndex: -1
    }
  };

  ensureWheelControllerState(vm);
  const result = WheelSessionPanel.computed!.wheelSessionPanelModel.call(vm as never);
  assert.ok(Math.abs(result.profit - 54.65) < 0.001);
});

