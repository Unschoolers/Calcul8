import type { WheelControllerState } from "./gameControllerState.ts";

export const GAME_CONTROLLER_LEGACY_ALIAS_MAP = {
  activeWheelSlots: "activeSlots",
  wheelPreviewSlots: "previewSlots",
  wheelInventoryWarning: "inventoryWarning",
  wheelLastResultColor: "lastResultColor",
  wheelPreviewSpinCounts: "previewSpinCounts",
  wheelPreviewTotalSpins: "previewTotalSpins",
  wheelSpinSeed: "spinSeed",
  wheelSpinHash: "spinHash",
  wheelSpinClientSeed: "spinClientSeed",
  wheelSpinVerificationUrl: "spinVerificationUrl",
  wheelSpinAlgorithm: "spinAlgorithm",
  wheelShowSeed: "showSeed",
  wheelFairnessHistoryOpen: "fairnessHistoryOpen",
  wheelSessionNetRevenue: "sessionNetRevenue",
  wheelSessionCostAdjustment: "sessionCostAdjustment",
  wheelPreviewFairnessHistory: "previewFairnessHistory",
  wheelFairnessHistory: "fairnessHistory",
  wheelPreviewChaseTallyHistory: "previewChaseTallyHistory",
  wheelChaseTallyHistory: "chaseTallyHistory",
  wheelGridReveals: "gridReveals",
  wheelPreviewGridReveals: "previewGridReveals",
  wheelGridLayoutSeed: "gridLayoutSeed",
  wheelPreviewGridLayoutSeed: "previewGridLayoutSeed",
  wheelHighlightedSlotIndex: "highlightedSlotIndex"
} as const satisfies Record<string, keyof WheelControllerState>;
