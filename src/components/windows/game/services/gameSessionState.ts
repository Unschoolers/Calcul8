import type { GameSessionStateContext } from "../../../../app-core/context/game.ts";
import { unwrapWindowBridgeContext } from "../../shared/contextBridge.ts";

export type WheelControllerState = GameSessionStateContext;

export function createWheelControllerState(): WheelControllerState {
  return {
    wheelSpinning: false, activeWheelSlots: [], wheelPreviewSlots: [], wheelInventoryWarning: "",
    wheelShowSeed: false, wheelFairnessHistoryOpen: false, wheelHighlightedSlotIndex: -1, wheelCurrentAngle: 0,
    wheelTotalSpins: 0, wheelSpinCounts: [], wheelLastResult: "", wheelSessionUpdatedAt: 0,
    wheelSessionLotSelections: {}, wheelPendingInventoryIssues: [], wheelSessionNetRevenue: null, wheelSessionCostAdjustment: 0,
    wheelFairnessHistory: [], wheelChaseTallyHistory: [], wheelGridLayoutSeed: "", wheelPreviewGridLayoutSeed: "",
    wheelGridReveals: [], wheelPreviewGridReveals: [], wheelPreviewSpinCounts: [], wheelPreviewTotalSpins: 0,
    wheelPreviewFairnessHistory: [], wheelPreviewChaseTallyHistory: [], wheelLastResultColor: "rgb(var(--v-theme-primary))",
    wheelSpinHash: "", wheelSpinSeed: "", wheelSpinClientSeed: "", wheelSpinVerificationUrl: "", wheelSpinAlgorithm: ""
  };
}

export function getWheelController(context: object): WheelControllerState {
  const owner = unwrapWindowBridgeContext(context as Record<string, unknown>);
  const missing = Object.keys(createWheelControllerState()).find((key) => !(key in owner));
  if (missing) throw new Error(`Missing game session field: ${missing}`);
  return owner as unknown as WheelControllerState;
}

/** Explicit compatibility boundary for isolated tests and legacy partial hosts. */
export function ensureWheelControllerState(context: object): WheelControllerState {
  const owner = unwrapWindowBridgeContext(context as Record<string, unknown>);
  for (const [key, value] of Object.entries(createWheelControllerState())) if (!(key in owner)) owner[key] = value;
  return owner as unknown as WheelControllerState;
}
