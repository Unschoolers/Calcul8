import type { Lot, MysteryGridReveal, PendingWheelInventoryIssue, WheelConfig, WheelFairnessEntry } from "../../../../types/app.ts";
import { assignWheelPendingInventoryIssues } from "../../../../app-core/shared/wheel-session-compat.ts";
import type { WheelControllerState } from "../coordinator/gameControllerState.ts";
import type { WheelSlot } from "./wheelSlots.ts";
import {
  runGameSessionReset,
  type GameExecution,
  type GameSessionEngineAdapter,
  type GameSessionEnginePorts
} from "./gameSessionEngine.ts";
import { writeGameSpectatorSessionStorageState } from "./gameSpectatorSessionStorage.ts";
import { buildSlotsFromConfig, createWheelGridLayoutSeed } from "./wheelSlots.ts";

/** Minimal context interface shared by wheel session helpers. */
export interface WheelSessionContext extends Record<string, unknown> {
  wheelConfigs: WheelConfig[];
  activeWheelConfigId: number | null;
  editingWheelConfig: WheelConfig | null;
  lots: Lot[];
  wheelSpinCounts: number[];
  wheelTotalSpins: number;
  wheelLastResult: string;
  wheelCurrentAngle: number;
  wheelSessionUpdatedAt: number;
  wheelPendingInventoryIssues: PendingWheelInventoryIssue[];
  wheelEndingSession: boolean;
  wheelEndSessionReviewActive: boolean;
  gameSpectatorPublishPending: boolean;
  gameSpectatorSessionId: string;
  gameSpectatorSessionStatus: string;
  gameSpectatorSessionUrl: string;
  gameSpectatorSessionQrUrl: string;
  wheelGridHighlightCellIndex: number;
  wheelGridRevealAnimating: boolean;
  wheelGridResetAnimating: boolean;
  wheelChaseDialog: boolean;
  wheelChasePreviewMode: boolean;
  wheelChaseReplacementSinglesId: number | null;
  wheelChasePendingTierId: string;
  gameSpectatorDialog?: boolean;
}

type WheelTallyHistoryEntry = { tierId: string; label: string; color: string; count: number };
export type WheelSessionTrack = {
  spinCounts: number[];
  totalSpins: number;
  fairnessHistory: WheelFairnessEntry[];
};

export function clearWheelProofState(controller: WheelControllerState): void {
  controller.spinHash = "";
  controller.spinSeed = "";
  controller.spinClientSeed = "";
  controller.spinVerificationUrl = "";
  controller.spinAlgorithm = "";
  controller.showSeed = false;
}

export function clearWheelChaseDialogState(context: WheelSessionContext): void {
  context.wheelChaseDialog = false;
  context.wheelChasePreviewMode = false;
  context.wheelChaseReplacementSinglesId = null;
  context.wheelChasePendingTierId = "";
}

export function setWheelResultState(
  context: WheelSessionContext,
  controller: WheelControllerState,
  resultLabel: string,
  color: string
): void {
  context.wheelLastResult = resultLabel;
  controller.lastResultColor = color;
}

export function getWheelTargetConfig(
  context: WheelSessionContext,
  options: { preview?: boolean } = {}
): WheelConfig | null {
  const configs = (context.wheelConfigs || []) as WheelConfig[];
  const activeId = context.activeWheelConfigId as number | null;
  const activeConfig = activeId != null ? configs.find((entry) => entry.id === activeId) : null;
  if (options.preview === true) {
    return (context.editingWheelConfig as WheelConfig | null) || activeConfig || null;
  }
  return activeConfig || null;
}

export function getWheelTierLotContext(
  context: WheelSessionContext,
  tierId: string,
  options: { preview?: boolean } = {}
): {
  config: WheelConfig | null;
  tier: WheelConfig["tiers"][number] | undefined;
  lot: Lot | undefined;
} {
  const config = getWheelTargetConfig(context, options);
  const tier = config?.tiers.find((entry) => entry.id === tierId);
  const lots = (context.lots || []) as Lot[];
  const lot = tier?.boundLotId != null ? lots.find((entry) => entry.id === tier.boundLotId) : undefined;
  return { config, tier, lot };
}

export function createWheelSessionSnapshot(
  context: WheelSessionContext,
  controller: WheelControllerState
) {
  const slots = ((controller.activeSlots || []) as WheelSlot[]);
  const snapshot = {
    wheelSpinCounts: context.wheelSpinCounts,
    wheelSlotTiers: slots.map((slot) => slot.tier),
    wheelTotalSpins: context.wheelTotalSpins,
    wheelPreviewSpinCounts: controller.previewSpinCounts,
    wheelPreviewSlotTiers: ((controller.previewSlots || []) as WheelSlot[]).map((slot) => slot.tier),
    wheelPreviewTotalSpins: controller.previewTotalSpins,
    wheelPreviewFairnessHistory: controller.previewFairnessHistory,
    wheelPreviewChaseTallyHistory: controller.previewChaseTallyHistory,
    wheelPreviewGridReveals: controller.previewGridReveals,
    wheelPreviewGridLayoutSeed: controller.previewGridLayoutSeed,
    wheelSessionUpdatedAt: context.wheelSessionUpdatedAt,
    wheelSessionNetRevenue: controller.sessionNetRevenue,
    wheelSessionCostAdjustment: controller.sessionCostAdjustment,
    wheelFairnessHistory: controller.fairnessHistory,
    wheelChaseTallyHistory: controller.chaseTallyHistory,
    wheelGridReveals: controller.gridReveals,
    wheelGridLayoutSeed: controller.gridLayoutSeed,
    wheelPendingInventoryIssues: context.wheelPendingInventoryIssues,
    wheelSkippedDeductions: context.wheelPendingInventoryIssues,
    wheelCurrentAngle: context.wheelCurrentAngle,
    wheelLastResult: context.wheelLastResult,
    wheelLastResultColor: controller.lastResultColor,
    wheelSpinHash: controller.spinHash,
    wheelSpinSeed: controller.spinSeed,
    wheelSpinClientSeed: controller.spinClientSeed,
    wheelSpinVerificationUrl: controller.spinVerificationUrl,
    wheelSpinAlgorithm: controller.spinAlgorithm
  };
  writeGameSpectatorSessionStorageState(snapshot, context);
  return snapshot;
}

export function readWheelSessionTrack(
  context: Pick<WheelSessionContext, "wheelSpinCounts" | "wheelTotalSpins">,
  controller: WheelControllerState,
  execution: GameExecution
): WheelSessionTrack {
  return execution === "preview"
    ? {
        spinCounts: controller.previewSpinCounts,
        totalSpins: controller.previewTotalSpins,
        fairnessHistory: controller.previewFairnessHistory
      }
    : {
        spinCounts: context.wheelSpinCounts,
        totalSpins: context.wheelTotalSpins,
        fairnessHistory: controller.fairnessHistory
      };
}

function writeWheelSessionTrack(
  context: WheelSessionContext,
  controller: WheelControllerState,
  execution: GameExecution,
  track: WheelSessionTrack
): void {
  if (execution === "preview") {
    controller.previewSpinCounts = track.spinCounts;
    controller.previewTotalSpins = track.totalSpins;
    controller.previewFairnessHistory = track.fairnessHistory;
    return;
  }
  context.wheelSpinCounts = track.spinCounts;
  context.wheelTotalSpins = track.totalSpins;
  controller.fairnessHistory = track.fairnessHistory;
}

export function recordWheelSessionSpin(
  context: WheelSessionContext,
  controller: WheelControllerState,
  execution: GameExecution,
  slotIndex: number,
  slotCount: number
): void {
  const track = readWheelSessionTrack(context, controller, execution);
  const count = Math.max(0, Math.floor(Number(slotCount) || 0));
  const index = Math.floor(Number(slotIndex));
  if (!Number.isFinite(index) || index < 0 || index >= count) return;
  const spinCounts = track.spinCounts.length === count ? [...track.spinCounts] : new Array(count).fill(0);
  spinCounts[index] = (spinCounts[index] || 0) + 1;
  writeWheelSessionTrack(context, controller, execution, {
    ...track,
    spinCounts,
    totalSpins: track.totalSpins + 1
  });
}

export function recordWheelSessionFairness(
  context: WheelSessionContext,
  controller: WheelControllerState,
  execution: GameExecution,
  entry: WheelFairnessEntry
): void {
  const track = readWheelSessionTrack(context, controller, execution);
  writeWheelSessionTrack(context, controller, execution, {
    ...track,
    fairnessHistory: [...track.fairnessHistory, entry].slice(-20)
  });
}

function emptyWheelSessionTrack(slotCount: number): WheelSessionTrack {
  return { spinCounts: new Array(slotCount).fill(0), totalSpins: 0, fairnessHistory: [] };
}

type WheelResetState = {
  context: WheelSessionContext;
  controller: WheelControllerState;
  slots: WheelSlot[];
  reseedGrid: boolean;
};

function resetWheelPreview(state: WheelResetState): WheelResetState {
  const { context, controller } = state;
  let previewSlots = state.slots;
  const config = getWheelTargetConfig(context, { preview: true });
  if (state.reseedGrid && config?.gameType === "grid") {
    controller.previewGridLayoutSeed = createWheelGridLayoutSeed();
    previewSlots = buildSlotsFromConfig(config, { layoutSeed: controller.previewGridLayoutSeed });
    controller.previewSlots = previewSlots;
  }
  writeWheelSessionTrack(context, controller, "preview", emptyWheelSessionTrack(previewSlots.length));
  controller.previewChaseTallyHistory = [];
  controller.previewGridReveals = [];
  controller.inventoryWarning = "";
  controller.lastResultColor = "rgb(var(--v-theme-primary))";
  controller.fairnessHistoryOpen = false;
  clearWheelProofState(controller);
  clearWheelChaseDialogState(context);
  context.wheelGridHighlightCellIndex = -1;
  context.wheelGridRevealAnimating = false;
  context.wheelGridResetAnimating = false;
  context.wheelLastResult = "";
  return { ...state, slots: previewSlots };
}

function resetWheelLive(state: WheelResetState): WheelResetState {
  const { context, controller } = state;
  let { slots } = state;
  const config = getWheelTargetConfig(context);
  if (state.reseedGrid && config?.gameType === "grid") {
    controller.gridLayoutSeed = createWheelGridLayoutSeed();
    slots = buildSlotsFromConfig(config, { layoutSeed: controller.gridLayoutSeed });
    controller.activeSlots = slots;
    controller.previewGridLayoutSeed = controller.gridLayoutSeed;
  }
  writeWheelSessionTrack(context, controller, "live", emptyWheelSessionTrack(slots.length));
  controller.previewSlots = [...slots];
  resetWheelPreview({ ...state, slots });
  controller.sessionNetRevenue = 0;
  controller.sessionCostAdjustment = 0;
  controller.fairnessHistory = [];
  controller.chaseTallyHistory = [];
  controller.gridReveals = [];
  context.wheelEndingSession = false;
  context.wheelEndSessionReviewActive = false;
  context.gameSpectatorPublishPending = false;
  assignWheelPendingInventoryIssues(context, []);
  return { ...state, slots };
}

const wheelSessionEngineAdapter: GameSessionEngineAdapter<WheelResetState> = {
  reset: (state, execution) => execution === "preview" ? resetWheelPreview(state) : resetWheelLive(state),
  shouldPublish: (execution) => execution === "live"
};

export function runWheelSessionReset(
  context: WheelSessionContext,
  controller: WheelControllerState,
  execution: GameExecution,
  slots: WheelSlot[],
  ports: GameSessionEnginePorts<WheelResetState>,
  reseedGrid = true
): Promise<WheelResetState> {
  return runGameSessionReset(
    { context, controller, slots, reseedGrid },
    execution,
    wheelSessionEngineAdapter,
    ports
  );
}

export function resetLoadedTierPrizeGameState(
  context: WheelSessionContext,
  controller: WheelControllerState,
  clearSlots: boolean
): void {
  resetWheelLive({ context, controller, slots: [], reseedGrid: false });
  controller.sessionNetRevenue = null;
  controller.highlightedSlotIndex = -1;
  context.gameSpectatorDialog = false;
  context.gameSpectatorSessionId = "";
  context.gameSpectatorSessionStatus = "inactive";
  context.gameSpectatorSessionUrl = "";
  context.gameSpectatorSessionQrUrl = "";
  if (clearSlots) {
    controller.activeSlots = [];
    controller.previewSlots = [];
    controller.gridLayoutSeed = "";
    controller.previewGridLayoutSeed = "";
  }
}

export function mergeWheelSessionRootFallback(
  session: Record<string, unknown>,
  rootForActiveConfig: Record<string, unknown> | null
): void {
  const useRootValue = (currentValue: unknown, fallbackValue: unknown): unknown => {
    if (Array.isArray(currentValue)) {
      return currentValue.length > 0 ? currentValue : fallbackValue;
    }
    if (typeof currentValue === "string") {
      return currentValue.trim() ? currentValue : fallbackValue;
    }
    if (typeof currentValue === "number") {
      return currentValue !== 0 && Number.isFinite(currentValue) ? currentValue : fallbackValue;
    }
    if (currentValue == null) {
      return fallbackValue;
    }
    return currentValue;
  };

  if (!rootForActiveConfig) return;
  const fallbackFields = [
    "wheelPreviewSpinCounts", "wheelPreviewTotalSpins", "wheelPreviewFairnessHistory",
    "wheelPreviewChaseTallyHistory", "wheelPreviewGridReveals", "wheelPreviewGridLayoutSeed",
    "wheelGridReveals", "wheelGridLayoutSeed", "wheelSpinHash", "wheelSpinSeed",
    "wheelSpinClientSeed", "wheelSpinVerificationUrl", "wheelSpinAlgorithm", "wheelLastResult",
    "wheelLastResultColor", "wheelCurrentAngle"
  ] as const;
  for (const field of fallbackFields) {
    session[field] = useRootValue(session[field], rootForActiveConfig[field]);
  }
}

