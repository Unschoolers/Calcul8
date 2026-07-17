import type { Lot, MysteryGridReveal, PendingWheelInventoryIssue, WheelConfig, WheelFairnessEntry } from "../../../../types/app.ts";
import type { WheelControllerState } from "../coordinator/gameControllerState.ts";
import type { WheelSlot } from "./wheelSlots.ts";
import type { GameSessionEffect } from "../../../../app-core/shared/game-session-aggregate.ts";
import { dispatchGameSessionCommand } from "./gameSessionAggregateAdapter.ts";
import { writeGameSpectatorSessionStorageState } from "./gameSpectatorSessionStorage.ts";
import { buildSlotsFromConfig, createWheelGridLayoutSeed } from "./wheelSlots.ts";

/** Minimal context interface shared by wheel session helpers. */
export interface WheelSessionContext {
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
}

type WheelTallyHistoryEntry = { tierId: string; label: string; color: string; count: number };

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
): Record<string, unknown> {
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

export function applyWheelPreviewReset(
  context: WheelSessionContext,
  controller: WheelControllerState,
  previewSlots: WheelSlot[]
): GameSessionEffect[] {
  const config = getWheelTargetConfig(context, { preview: true });
  let nextPreviewSlots = previewSlots;
  if (config?.gameType === "grid") {
    controller.previewGridLayoutSeed = createWheelGridLayoutSeed();
    nextPreviewSlots = buildSlotsFromConfig(config, { layoutSeed: controller.previewGridLayoutSeed });
    controller.previewSlots = nextPreviewSlots;
  }
  const effects = dispatchGameSessionCommand(context, controller, {
    type: "session-reset",
    execution: "preview",
    slotCount: nextPreviewSlots.length
  });
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
  return effects;
}

export function applyWheelLiveReset(
  context: WheelSessionContext,
  controller: WheelControllerState,
  slots: WheelSlot[]
): GameSessionEffect[] {
  const config = getWheelTargetConfig(context);
  if (config?.gameType === "grid") {
    controller.gridLayoutSeed = createWheelGridLayoutSeed();
    slots = buildSlotsFromConfig(config, { layoutSeed: controller.gridLayoutSeed });
    controller.activeSlots = slots;
    controller.previewGridLayoutSeed = controller.gridLayoutSeed;
  }
  const effects = dispatchGameSessionCommand(context, controller, {
    type: "session-reset",
    execution: "live",
    slotCount: slots.length
  });
  controller.previewSlots = [...slots];
  effects.push(...applyWheelPreviewReset(context, controller, slots));
  controller.sessionNetRevenue = 0;
  controller.sessionCostAdjustment = 0;
  controller.fairnessHistory = [];
  controller.chaseTallyHistory = [];
  controller.gridReveals = [];
  context.wheelEndingSession = false;
  context.wheelEndSessionReviewActive = false;
  context.gameSpectatorPublishPending = false;
  return effects;
}

export function mergeWheelSessionRootFallback(
  session: Record<string, unknown>,
  rootForActiveConfig: Record<string, unknown> | null
): void {
  const useRootValue = <T>(currentValue: T, fallbackValue: T): T => {
    if (Array.isArray(currentValue)) {
      return (currentValue.length > 0 ? currentValue : fallbackValue) as T;
    }
    if (typeof currentValue === "string") {
      return ((currentValue.trim() ? currentValue : fallbackValue) as T);
    }
    if (typeof currentValue === "number") {
      return (((currentValue !== 0 && Number.isFinite(currentValue)) ? currentValue : fallbackValue) as T);
    }
    if (currentValue == null) {
      return fallbackValue;
    }
    return currentValue;
  };

  if (!rootForActiveConfig) return;
  session.wheelPreviewSpinCounts = useRootValue(session.wheelPreviewSpinCounts as number[] | undefined, rootForActiveConfig.wheelPreviewSpinCounts as number[] | undefined);
  session.wheelPreviewTotalSpins = useRootValue(session.wheelPreviewTotalSpins as number | undefined, rootForActiveConfig.wheelPreviewTotalSpins as number | undefined);
  session.wheelPreviewFairnessHistory = useRootValue(session.wheelPreviewFairnessHistory as WheelFairnessEntry[] | undefined, rootForActiveConfig.wheelPreviewFairnessHistory as WheelFairnessEntry[] | undefined);
  session.wheelPreviewChaseTallyHistory = useRootValue(session.wheelPreviewChaseTallyHistory as WheelTallyHistoryEntry[] | undefined, rootForActiveConfig.wheelPreviewChaseTallyHistory as WheelTallyHistoryEntry[] | undefined);
  session.wheelPreviewGridReveals = useRootValue(session.wheelPreviewGridReveals as MysteryGridReveal[] | undefined, rootForActiveConfig.wheelPreviewGridReveals as MysteryGridReveal[] | undefined);
  session.wheelPreviewGridLayoutSeed = useRootValue(session.wheelPreviewGridLayoutSeed as string | undefined, rootForActiveConfig.wheelPreviewGridLayoutSeed as string | undefined);
  session.wheelGridReveals = useRootValue(session.wheelGridReveals as MysteryGridReveal[] | undefined, rootForActiveConfig.wheelGridReveals as MysteryGridReveal[] | undefined);
  session.wheelGridLayoutSeed = useRootValue(session.wheelGridLayoutSeed as string | undefined, rootForActiveConfig.wheelGridLayoutSeed as string | undefined);
  session.wheelSpinHash = useRootValue(session.wheelSpinHash as string | undefined, rootForActiveConfig.wheelSpinHash as string | undefined);
  session.wheelSpinSeed = useRootValue(session.wheelSpinSeed as string | undefined, rootForActiveConfig.wheelSpinSeed as string | undefined);
  session.wheelSpinClientSeed = useRootValue(session.wheelSpinClientSeed as string | undefined, rootForActiveConfig.wheelSpinClientSeed as string | undefined);
  session.wheelSpinVerificationUrl = useRootValue(session.wheelSpinVerificationUrl as string | undefined, rootForActiveConfig.wheelSpinVerificationUrl as string | undefined);
  session.wheelSpinAlgorithm = useRootValue(session.wheelSpinAlgorithm as string | undefined, rootForActiveConfig.wheelSpinAlgorithm as string | undefined);
  session.wheelLastResult = useRootValue(session.wheelLastResult as string | undefined, rootForActiveConfig.wheelLastResult as string | undefined);
  session.wheelLastResultColor = useRootValue(session.wheelLastResultColor as string | undefined, rootForActiveConfig.wheelLastResultColor as string | undefined);
  session.wheelCurrentAngle = useRootValue(session.wheelCurrentAngle as number | undefined, rootForActiveConfig.wheelCurrentAngle as number | undefined);
}

