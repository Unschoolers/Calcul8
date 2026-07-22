import { inject, type InjectionKey } from "vue";
import { createCapabilityPorts } from "../../../../app-core/context/capabilityPorts.ts";
import type { GameCoordinatorContext } from "../../../../app-core/context/game.ts";

const gameCoordinatorPortKeys = [
  "currentTab", "wheelConfigs", "activeWheelConfigId", "wheelRealtimeApplyRevision", "lots", "currentLotId",
  "activeScopeType", "activeWorkspaceId", "googleAuthEpoch", "hasProAccess", "wheelSpinning", "activeWheelSlots",
  "wheelPreviewSlots", "wheelInventoryWarning", "wheelShowSeed", "wheelFairnessHistoryOpen",
  "wheelHighlightedSlotIndex", "wheelCurrentAngle", "wheelTotalSpins", "wheelSpinCounts", "wheelLastResult",
  "wheelSessionUpdatedAt", "wheelSessionLotSelections", "wheelPendingInventoryIssues", "wheelSessionNetRevenue",
  "wheelSessionCostAdjustment", "wheelFairnessHistory", "wheelChaseTallyHistory", "wheelGridLayoutSeed",
  "wheelPreviewGridLayoutSeed", "wheelGridReveals", "wheelPreviewGridReveals", "wheelPreviewSpinCounts",
  "wheelPreviewTotalSpins", "wheelPreviewFairnessHistory", "wheelPreviewChaseTallyHistory", "wheelLastResultColor",
  "wheelSpinHash", "wheelSpinSeed", "wheelSpinClientSeed", "wheelSpinVerificationUrl", "wheelSpinAlgorithm",
  "addWheelSaleToLot"
] as const;

export type GameCoordinatorPorts = Pick<GameCoordinatorContext, typeof gameCoordinatorPortKeys[number]>;
export const gameCoordinatorPortsKey: InjectionKey<GameCoordinatorPorts> = Symbol("gameCoordinatorPorts");

export function createGameCoordinatorPorts(source: GameCoordinatorPorts): GameCoordinatorPorts {
  return createCapabilityPorts(source, gameCoordinatorPortKeys);
}

export function useGameCoordinatorPorts(): GameCoordinatorPorts {
  const ports = inject(gameCoordinatorPortsKey, null);
  if (!ports) throw new Error("Game coordinator capabilities were not provided.");
  return ports;
}
