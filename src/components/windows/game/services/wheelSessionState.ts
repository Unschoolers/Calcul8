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

export type WheelSessionResetContext = Record<string, unknown> & Partial<WheelSessionContext>;

type WheelTallyHistoryEntry = { tierId: string; label: string; color: string; count: number };
export type WheelSessionTrack = {
  spinCounts: number[];
  totalSpins: number;
  fairnessHistory: WheelFairnessEntry[];
};

export function clearWheelProofState(controller: WheelControllerState): void {
  controller.wheelSpinHash = "";
  controller.wheelSpinSeed = "";
  controller.wheelSpinClientSeed = "";
  controller.wheelSpinVerificationUrl = "";
  controller.wheelSpinAlgorithm = "";
  controller.wheelShowSeed = false;
}

export function clearWheelChaseDialogState(context: WheelSessionResetContext): void {
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
  controller.wheelLastResultColor = color;
}

export function getWheelTargetConfig(
  context: WheelSessionResetContext,
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
  const slots = ((controller.activeWheelSlots || []) as WheelSlot[]);
  const snapshot = {
    wheelSpinCounts: context.wheelSpinCounts,
    wheelSlotTiers: slots.map((slot) => slot.tier),
    wheelTotalSpins: context.wheelTotalSpins,
    wheelPreviewSpinCounts: controller.wheelPreviewSpinCounts,
    wheelPreviewSlotTiers: ((controller.wheelPreviewSlots || []) as WheelSlot[]).map((slot) => slot.tier),
    wheelPreviewTotalSpins: controller.wheelPreviewTotalSpins,
    wheelPreviewFairnessHistory: controller.wheelPreviewFairnessHistory,
    wheelPreviewChaseTallyHistory: controller.wheelPreviewChaseTallyHistory,
    wheelPreviewGridReveals: controller.wheelPreviewGridReveals,
    wheelPreviewGridLayoutSeed: controller.wheelPreviewGridLayoutSeed,
    wheelSessionUpdatedAt: context.wheelSessionUpdatedAt,
    wheelSessionNetRevenue: controller.wheelSessionNetRevenue,
    wheelSessionCostAdjustment: controller.wheelSessionCostAdjustment,
    wheelFairnessHistory: controller.wheelFairnessHistory,
    wheelChaseTallyHistory: controller.wheelChaseTallyHistory,
    wheelGridReveals: controller.wheelGridReveals,
    wheelGridLayoutSeed: controller.wheelGridLayoutSeed,
    wheelPendingInventoryIssues: context.wheelPendingInventoryIssues,
    wheelCurrentAngle: context.wheelCurrentAngle,
    wheelLastResult: context.wheelLastResult,
    wheelLastResultColor: controller.wheelLastResultColor,
    wheelSpinHash: controller.wheelSpinHash,
    wheelSpinSeed: controller.wheelSpinSeed,
    wheelSpinClientSeed: controller.wheelSpinClientSeed,
    wheelSpinVerificationUrl: controller.wheelSpinVerificationUrl,
    wheelSpinAlgorithm: controller.wheelSpinAlgorithm
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
        spinCounts: controller.wheelPreviewSpinCounts,
        totalSpins: controller.wheelPreviewTotalSpins,
        fairnessHistory: controller.wheelPreviewFairnessHistory
      }
    : {
        spinCounts: context.wheelSpinCounts,
        totalSpins: context.wheelTotalSpins,
        fairnessHistory: controller.wheelFairnessHistory
      };
}

function writeWheelSessionTrack(
  context: WheelSessionResetContext,
  controller: WheelControllerState,
  execution: GameExecution,
  track: WheelSessionTrack
): void {
  if (execution === "preview") {
    controller.wheelPreviewSpinCounts = track.spinCounts;
    controller.wheelPreviewTotalSpins = track.totalSpins;
    controller.wheelPreviewFairnessHistory = track.fairnessHistory;
    return;
  }
  context.wheelSpinCounts = track.spinCounts;
  context.wheelTotalSpins = track.totalSpins;
  controller.wheelFairnessHistory = track.fairnessHistory;
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
  context: WheelSessionResetContext;
  controller: WheelControllerState;
  slots: WheelSlot[];
  reseedGrid: boolean;
};

function resetWheelPreview(state: WheelResetState): WheelResetState {
  const { context, controller } = state;
  let previewSlots = state.slots;
  const config = state.reseedGrid ? getWheelTargetConfig(context, { preview: true }) : null;
  if (config?.gameType === "grid") {
    controller.wheelPreviewGridLayoutSeed = createWheelGridLayoutSeed();
    previewSlots = buildSlotsFromConfig(config, { layoutSeed: controller.wheelPreviewGridLayoutSeed });
    controller.wheelPreviewSlots = previewSlots;
  }
  writeWheelSessionTrack(context, controller, "preview", emptyWheelSessionTrack(previewSlots.length));
  controller.wheelPreviewChaseTallyHistory = [];
  controller.wheelPreviewGridReveals = [];
  controller.wheelInventoryWarning = "";
  controller.wheelLastResultColor = "rgb(var(--v-theme-primary))";
  controller.wheelFairnessHistoryOpen = false;
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
  const config = state.reseedGrid ? getWheelTargetConfig(context) : null;
  if (config?.gameType === "grid") {
    controller.wheelGridLayoutSeed = createWheelGridLayoutSeed();
    slots = buildSlotsFromConfig(config, { layoutSeed: controller.wheelGridLayoutSeed });
    controller.activeWheelSlots = slots;
    controller.wheelPreviewGridLayoutSeed = controller.wheelGridLayoutSeed;
  }
  writeWheelSessionTrack(context, controller, "live", emptyWheelSessionTrack(slots.length));
  controller.wheelPreviewSlots = [...slots];
  resetWheelPreview({ ...state, slots });
  controller.wheelSessionNetRevenue = 0;
  controller.wheelSessionCostAdjustment = 0;
  controller.wheelFairnessHistory = [];
  controller.wheelChaseTallyHistory = [];
  controller.wheelGridReveals = [];
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
  context: WheelSessionResetContext,
  controller: WheelControllerState,
  clearSlots: boolean
): void {
  resetWheelLive({ context, controller, slots: [], reseedGrid: false });
  controller.wheelSessionNetRevenue = null;
  controller.wheelHighlightedSlotIndex = -1;
  context.gameSpectatorDialog = false;
  context.gameSpectatorSessionId = "";
  context.gameSpectatorSessionStatus = "inactive";
  context.gameSpectatorSessionUrl = "";
  context.gameSpectatorSessionQrUrl = "";
  if (clearSlots) {
    controller.activeWheelSlots = [];
    controller.wheelPreviewSlots = [];
    controller.wheelGridLayoutSeed = "";
    controller.wheelPreviewGridLayoutSeed = "";
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

