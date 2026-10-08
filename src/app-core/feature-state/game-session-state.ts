import type { GameSessionStateContext } from "../context/game.ts";

export const GAME_SESSION_FEATURE_STATE_KEYS = [
  "wheelSpinning", "activeWheelSlots", "wheelPreviewSlots", "wheelInventoryWarning", "wheelShowSeed",
  "wheelFairnessHistoryOpen", "wheelHighlightedSlotIndex", "wheelCurrentAngle", "wheelTotalSpins", "wheelSpinCounts",
  "wheelLastResult", "wheelSessionUpdatedAt", "wheelSessionLotSelections", "wheelPendingInventoryIssues",
  "wheelSessionNetRevenue", "wheelSessionCostAdjustment", "wheelFairnessHistory", "wheelChaseTallyHistory",
  "wheelGridLayoutSeed", "wheelPreviewGridLayoutSeed", "wheelGridReveals", "wheelPreviewGridReveals",
  "wheelPreviewSpinCounts", "wheelPreviewTotalSpins", "wheelPreviewFairnessHistory", "wheelPreviewChaseTallyHistory",
  "wheelLastResultColor", "wheelSpinHash", "wheelSpinSeed", "wheelSpinClientSeed", "wheelSpinVerificationUrl",
  "wheelSpinAlgorithm"
] as const satisfies readonly (keyof GameSessionStateContext)[];

export type GameSessionFeatureState = GameSessionStateContext;

export function createGameSessionFeatureState(): GameSessionFeatureState {
  return {
    wheelSpinning: false,
    activeWheelSlots: [],
    wheelPreviewSlots: [],
    wheelInventoryWarning: "",
    wheelShowSeed: false,
    wheelFairnessHistoryOpen: false,
    wheelHighlightedSlotIndex: -1,
    wheelCurrentAngle: 0,
    wheelTotalSpins: 0,
    wheelSpinCounts: [],
    wheelLastResult: "",
    wheelSessionUpdatedAt: 0,
    wheelSessionLotSelections: {},
    wheelPendingInventoryIssues: [],
    wheelSessionNetRevenue: null,
    wheelSessionCostAdjustment: 0,
    wheelFairnessHistory: [],
    wheelChaseTallyHistory: [],
    wheelGridLayoutSeed: "",
    wheelPreviewGridLayoutSeed: "",
    wheelGridReveals: [],
    wheelPreviewGridReveals: [],
    wheelPreviewSpinCounts: [],
    wheelPreviewTotalSpins: 0,
    wheelPreviewFairnessHistory: [],
    wheelPreviewChaseTallyHistory: [],
    wheelLastResultColor: "rgb(var(--v-theme-primary))",
    wheelSpinHash: "",
    wheelSpinSeed: "",
    wheelSpinClientSeed: "",
    wheelSpinVerificationUrl: "",
    wheelSpinAlgorithm: ""
  };
}
