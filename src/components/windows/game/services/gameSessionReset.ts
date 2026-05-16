import { assignWheelPendingInventoryIssues } from "../../../../app-core/shared/wheel-session-compat.ts";
import { getWheelController } from "../coordinator/gameControllerState.ts";

export function resetLoadedTierPrizeGameSessionState(context: Record<string, unknown>): void {
  const controller = getWheelController(context);
  context.wheelSpinCounts = [];
  context.wheelTotalSpins = 0;
  context.wheelLastResult = "";
  controller.inventoryWarning = "";
  controller.lastResultColor = "rgb(var(--v-theme-primary))";
  controller.sessionCostAdjustment = 0;
  controller.sessionNetRevenue = null;
  assignWheelPendingInventoryIssues(context, []);
  context.wheelEndingSession = false;
  context.wheelChaseDialog = false;
  context.wheelChaseReplacementSinglesId = null;
  context.wheelChasePendingTierId = "";
  context.wheelChasePreviewMode = false;
  controller.chaseTallyHistory = [];
  controller.gridReveals = [];
  controller.fairnessHistory = [];
  controller.previewSpinCounts = [];
  controller.previewTotalSpins = 0;
  controller.previewFairnessHistory = [];
  controller.previewChaseTallyHistory = [];
  controller.previewGridReveals = [];
  controller.spinHash = "";
  controller.spinSeed = "";
  controller.spinClientSeed = "";
  controller.spinVerificationUrl = "";
  controller.spinAlgorithm = "";
  controller.showSeed = false;
  controller.fairnessHistoryOpen = false;
  controller.highlightedSlotIndex = -1;
  context.gameSpectatorDialog = false;
  context.gameSpectatorSessionId = "";
  context.gameSpectatorSessionStatus = "inactive";
  context.gameSpectatorSessionUrl = "";
  context.gameSpectatorSessionQrUrl = "";
  context.gameSpectatorPublishPending = false;
}

export function resetLoadedTierPrizeGameState(context: Record<string, unknown>): void {
  const controller = getWheelController(context);
  controller.activeSlots = [];
  controller.previewSlots = [];
  controller.gridLayoutSeed = "";
  controller.previewGridLayoutSeed = "";
  resetLoadedTierPrizeGameSessionState(context);
}
