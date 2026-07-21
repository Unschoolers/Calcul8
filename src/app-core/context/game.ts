import type { AppState, Sale } from "../../types/app.ts";
import type { RootWheelSessionStateContext } from "../shared/wheel-root-session-state.ts";
import type { ScopedApiContext } from "./api.ts";

export interface GameMethodState {
  addWheelSaleToLot(lotId: number, sale: Sale): void;
  loadWheelFromStorage(): void;
  saveWheelConfigsToStorage(): void;
  saveWheelSessionToStorage(): void;
}

export type GameAuthenticatedContext = Pick<
  ScopedApiContext,
  "googleAuthEpoch" | "hasProAccess"
>;

export type GamePublicSessionContext = GameAuthenticatedContext &
  Pick<AppState, "activeScopeType" | "activeWorkspaceId">;

export type GameBroadcastContext = GameAuthenticatedContext &
  RootWheelSessionStateContext &
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
  | "wheelSpinCounts"
  | "wheelTotalSpins"
  | "lots"
  | "currentLotId"
  | "activeScopeType"
  | "activeWorkspaceId"
  | "googleAuthEpoch"
  | "hasProAccess"
  | "wheelLastResult"
  | "wheelSessionUpdatedAt"
  | "wheelPendingInventoryIssues"
  | "wheelSkippedDeductions"
  | "wheelSessionLotSelections"
> & Pick<GameMethodState, "addWheelSaleToLot">;
