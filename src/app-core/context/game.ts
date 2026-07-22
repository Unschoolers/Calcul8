import type { AppState, Sale } from "../../types/app.ts";
import type { ScopedApiContext } from "./api.ts";

export interface GameMethodState {
  addWheelSaleToLot(lotId: number, sale: Sale): void;
  loadWheelFromStorage(): void;
  saveWheelConfigsToStorage(): void;
}

export type GameSessionStateContext = Pick<AppState,
  | "wheelSpinning" | "activeWheelSlots" | "wheelPreviewSlots" | "wheelInventoryWarning"
  | "wheelShowSeed" | "wheelFairnessHistoryOpen" | "wheelHighlightedSlotIndex" | "wheelCurrentAngle"
  | "wheelTotalSpins" | "wheelSpinCounts" | "wheelLastResult" | "wheelSessionUpdatedAt"
  | "wheelSessionLotSelections" | "wheelPendingInventoryIssues" | "wheelSessionNetRevenue" | "wheelSessionCostAdjustment"
  | "wheelFairnessHistory" | "wheelChaseTallyHistory" | "wheelGridLayoutSeed" | "wheelPreviewGridLayoutSeed"
  | "wheelGridReveals" | "wheelPreviewGridReveals" | "wheelPreviewSpinCounts" | "wheelPreviewTotalSpins"
  | "wheelPreviewFairnessHistory" | "wheelPreviewChaseTallyHistory" | "wheelLastResultColor" | "wheelSpinHash"
  | "wheelSpinSeed" | "wheelSpinClientSeed" | "wheelSpinVerificationUrl" | "wheelSpinAlgorithm"
>;

export type GameAuthenticatedContext = Pick<
  ScopedApiContext,
  "googleAuthEpoch" | "hasProAccess"
>;

export type GamePublicSessionContext = GameAuthenticatedContext &
  Pick<AppState, "activeScopeType" | "activeWorkspaceId">;

export type GameBroadcastContext = GameAuthenticatedContext &
  GameSessionStateContext &
  Pick<
    AppState,
    "activeScopeType" | "activeWorkspaceId" | "wheelConfigs" | "activeWheelConfigId"
  >;

/** Root capabilities projected into the game window coordinator. */
export type GameCoordinatorContext = Pick<
  AppState,
  | "currentTab"
  | "wheelConfigs"
  | "activeWheelConfigId"
  | "lots"
  | "currentLotId"
  | "activeScopeType"
  | "activeWorkspaceId"
  | "googleAuthEpoch"
  | "hasProAccess"
> & GameSessionStateContext & Pick<GameMethodState, "addWheelSaleToLot">;
