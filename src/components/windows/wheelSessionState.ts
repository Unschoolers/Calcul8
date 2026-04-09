import type { Lot, WheelConfig, WheelFairnessEntry } from "../../types/app.ts";
import type { WheelControllerState } from "./wheelControllerState.ts";
import type { WheelSlot } from "./wheelHelpers.ts";

type WheelTallyHistoryEntry = { tierId: string; label: string; color: string; count: number };

export function clearWheelProofState(controller: WheelControllerState): void {
  controller.spinHash = "";
  controller.spinSeed = "";
  controller.spinClientSeed = "";
  controller.spinVerificationUrl = "";
  controller.spinAlgorithm = "";
  controller.showSeed = false;
}

export function clearWheelChaseDialogState(context: Record<string, unknown>): void {
  context.wheelChaseDialog = false;
  context.wheelChasePreviewMode = false;
  context.wheelChaseReplacementSinglesId = null;
  context.wheelChasePendingTierId = "";
}

export function setWheelResultState(
  context: Record<string, unknown>,
  controller: WheelControllerState,
  resultLabel: string,
  color: string
): void {
  context.wheelLastResult = resultLabel;
  controller.lastResultColor = color;
}

export function getWheelTargetConfig(
  context: Record<string, unknown>,
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
  context: Record<string, unknown>,
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
  context: Record<string, unknown>,
  controller: WheelControllerState
): Record<string, unknown> {
  const slots = ((controller.activeSlots || []) as WheelSlot[]);
  return {
    wheelSpinCounts: context.wheelSpinCounts,
    wheelSlotTiers: slots.map((slot) => slot.tier),
    wheelTotalSpins: context.wheelTotalSpins,
    wheelPreviewSpinCounts: controller.previewSpinCounts,
    wheelPreviewSlotTiers: ((controller.previewSlots || []) as WheelSlot[]).map((slot) => slot.tier),
    wheelPreviewTotalSpins: controller.previewTotalSpins,
    wheelPreviewFairnessHistory: controller.previewFairnessHistory,
    wheelPreviewChaseTallyHistory: controller.previewChaseTallyHistory,
    wheelSessionUpdatedAt: context.wheelSessionUpdatedAt,
    wheelSessionNetRevenue: controller.sessionNetRevenue,
    wheelSessionCostAdjustment: controller.sessionCostAdjustment,
    wheelFairnessHistory: controller.fairnessHistory,
    wheelChaseTallyHistory: controller.chaseTallyHistory,
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
}

export function applyWheelPreviewReset(
  context: Record<string, unknown>,
  controller: WheelControllerState,
  previewSlots: WheelSlot[]
): void {
  controller.previewSpinCounts = new Array(previewSlots.length).fill(0);
  controller.previewTotalSpins = 0;
  controller.previewFairnessHistory = [];
  controller.previewChaseTallyHistory = [];
  controller.inventoryWarning = "";
  controller.lastResultColor = "rgb(var(--v-theme-primary))";
  controller.fairnessHistoryOpen = false;
  clearWheelProofState(controller);
  clearWheelChaseDialogState(context);
  context.wheelLastResult = "";
}

export function applyWheelLiveReset(
  context: Record<string, unknown>,
  controller: WheelControllerState,
  slots: WheelSlot[]
): void {
  context.wheelTotalSpins = 0;
  context.wheelSpinCounts = new Array(slots.length).fill(0);
  controller.previewSlots = [...slots];
  applyWheelPreviewReset(context, controller, slots);
  controller.sessionNetRevenue = 0;
  controller.sessionCostAdjustment = 0;
  controller.fairnessHistory = [];
  controller.chaseTallyHistory = [];
  context.wheelEndingSession = false;
  context.wheelEndSessionReviewActive = false;
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
  session.wheelSpinHash = useRootValue(session.wheelSpinHash as string | undefined, rootForActiveConfig.wheelSpinHash as string | undefined);
  session.wheelSpinSeed = useRootValue(session.wheelSpinSeed as string | undefined, rootForActiveConfig.wheelSpinSeed as string | undefined);
  session.wheelSpinClientSeed = useRootValue(session.wheelSpinClientSeed as string | undefined, rootForActiveConfig.wheelSpinClientSeed as string | undefined);
  session.wheelSpinVerificationUrl = useRootValue(session.wheelSpinVerificationUrl as string | undefined, rootForActiveConfig.wheelSpinVerificationUrl as string | undefined);
  session.wheelSpinAlgorithm = useRootValue(session.wheelSpinAlgorithm as string | undefined, rootForActiveConfig.wheelSpinAlgorithm as string | undefined);
  session.wheelLastResult = useRootValue(session.wheelLastResult as string | undefined, rootForActiveConfig.wheelLastResult as string | undefined);
  session.wheelLastResultColor = useRootValue(session.wheelLastResultColor as string | undefined, rootForActiveConfig.wheelLastResultColor as string | undefined);
  session.wheelCurrentAngle = useRootValue(session.wheelCurrentAngle as number | undefined, rootForActiveConfig.wheelCurrentAngle as number | undefined);
}
