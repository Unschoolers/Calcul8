import { inject, type InjectionKey } from "vue";
import { createCapabilityPorts } from "../../../../app-core/context/capabilityPorts.ts";
import type { GameCoordinatorContext } from "../../../../app-core/context/game.ts";

const gameCoordinatorPortKeys = [
  "currentTab", "preferredLanguage", "t", "wheelConfigs", "activeWheelConfigId", "wheelRealtimeApplyRevision", "lots", "currentLotId", "sales", "salesByLotId",
  "activeScopeType", "activeWorkspaceId", "googleAuthEpoch", "hasProAccess", "wheelSpinning", "activeWheelSlots",
  "wheelPreviewSlots", "wheelInventoryWarning", "wheelShowSeed", "wheelFairnessHistoryOpen",
  "wheelHighlightedSlotIndex", "wheelCurrentAngle", "wheelTotalSpins", "wheelSpinCounts", "wheelLastResult",
  "wheelSessionUpdatedAt", "wheelSessionLotSelections", "wheelPendingInventoryIssues", "wheelSessionNetRevenue",
  "wheelSessionCostAdjustment", "wheelFairnessHistory", "wheelChaseTallyHistory", "wheelGridLayoutSeed",
  "wheelPreviewGridLayoutSeed", "wheelGridReveals", "wheelPreviewGridReveals", "wheelPreviewSpinCounts",
  "wheelPreviewTotalSpins", "wheelPreviewFairnessHistory", "wheelPreviewChaseTallyHistory", "wheelLastResultColor",
  "wheelSpinHash", "wheelSpinSeed", "wheelSpinClientSeed", "wheelSpinVerificationUrl", "wheelSpinAlgorithm", "singlesSoldCountByPurchaseId",
  "getSalesCacheEntry", "loadSalesForLotId",
  "addWheelSaleToLot"
] as const satisfies readonly (keyof GameCoordinatorContext)[];

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
