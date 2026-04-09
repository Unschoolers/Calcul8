import { translateAppMessage } from "../../app-core/i18n/index.ts";
import type { Lot, WheelConfig, WheelFairnessEntry } from "../../types/app.ts";
import { getWheelController } from "./wheelControllerState.ts";
import type { WheelSlot } from "./wheelHelpers.ts";
import {
  calculateAverageWheelSellingTaxPercent,
  calculateWheelBuyerShippingTotal,
  calculateWheelNetFromGross
} from "./wheelHelpers.ts";

export function isWheelPreviewMode(vm: Record<string, unknown>): boolean {
  return vm.wheelMode === "config";
}

export function calculateWheelSessionMarginPercent(vm: Record<string, unknown>): number | null {
  const cost = getWheelSessionCost(vm);
  if (!cost) return null;
  const profit = getWheelSessionProfit(vm);
  return (profit / cost) * 100;
}

export function getWheelDisplayConfig(vm: Record<string, unknown>): WheelConfig | null {
  if (isWheelPreviewMode(vm)) {
    return (vm.editingWheelConfig as WheelConfig | null)
      || (vm.activeWheelConfig as WheelConfig | null)
      || null;
  }
  return (vm.activeWheelConfig as WheelConfig | null) || null;
}

export function getWheelDisplaySlots(vm: Record<string, unknown>): WheelSlot[] {
  const controller = getWheelController(vm);
  return (((isWheelPreviewMode(vm)
    ? controller.previewSlots
    : controller.activeSlots) || []) as WheelSlot[]);
}

export function getWheelDisplaySpinCounts(vm: Record<string, unknown>): number[] {
  const controller = getWheelController(vm);
  return ((isWheelPreviewMode(vm)
    ? controller.previewSpinCounts
    : vm.wheelSpinCounts || []) as number[]);
}

export function getWheelDisplayTotalSpins(vm: Record<string, unknown>): number {
  const controller = getWheelController(vm);
  return Number((isWheelPreviewMode(vm)
    ? controller.previewTotalSpins
    : vm.wheelTotalSpins) || 0);
}

export function getWheelDisplayFairnessHistory(vm: Record<string, unknown>): WheelFairnessEntry[] {
  const controller = getWheelController(vm);
  return (((isWheelPreviewMode(vm)
    ? controller.previewFairnessHistory
    : controller.fairnessHistory) || []) as WheelFairnessEntry[]);
}

export function getWheelDisplayFairnessHistoryEntries(vm: Record<string, unknown>): WheelFairnessEntry[] {
  return [...getWheelDisplayFairnessHistory(vm)].reverse();
}

export function getWheelDisplayChaseTallyHistory(
  vm: Record<string, unknown>
): Array<{ tierId: string; label: string; color: string; count: number }> {
  const controller = getWheelController(vm);
  return ((isWheelPreviewMode(vm)
    ? controller.previewChaseTallyHistory
    : controller.chaseTallyHistory) || []) as Array<{ tierId: string; label: string; color: string; count: number }>;
}

export function getWheelCurrentProofState(vm: Record<string, unknown>): {
  spinHash: string;
  spinSeed: string;
  spinClientSeed: string;
  spinVerificationUrl: string;
  spinAlgorithm: string;
  lastResultColor: string;
} {
  const controller = getWheelController(vm);
  return {
    spinHash: String(controller.spinHash || ""),
    spinSeed: String(controller.spinSeed || ""),
    spinClientSeed: String(controller.spinClientSeed || ""),
    spinVerificationUrl: String(controller.spinVerificationUrl || ""),
    spinAlgorithm: String(controller.spinAlgorithm || ""),
    lastResultColor: String(controller.lastResultColor || "rgb(var(--v-theme-primary))")
  };
}

export function getWheelLatestFairnessEntry(vm: Record<string, unknown>): WheelFairnessEntry | null {
  const preferredLanguage = String(vm.preferredLanguage ?? "");
  const entries = getWheelDisplayFairnessHistoryEntries(vm);
  const latestHistory = entries[0] || null;
  const proofState = getWheelCurrentProofState(vm);
  if (!proofState.spinHash) {
    return latestHistory;
  }

  const currentLabel = String(vm.wheelLastResult || "")
    .replace(/^🎉\s*/, "")
    .trim();
  const currentSpinNumber = getWheelDisplayTotalSpins(vm) || Number(latestHistory?.spinNumber || 0);

  return {
    spinNumber: currentSpinNumber > 0 ? currentSpinNumber : (latestHistory?.spinNumber || 1),
    label: currentLabel || latestHistory?.label || translateAppMessage(preferredLanguage, "wheelFairnessLatestSpinLabel"),
    color: proofState.lastResultColor || latestHistory?.color || "rgb(var(--v-theme-primary))",
    hash: proofState.spinHash,
    seed: proofState.spinSeed || (latestHistory?.hash === proofState.spinHash ? latestHistory.seed : ""),
    clientSeed: proofState.spinClientSeed || (latestHistory?.hash === proofState.spinHash ? latestHistory.clientSeed : undefined),
    verificationUrl: proofState.spinVerificationUrl || (latestHistory?.hash === proofState.spinHash ? latestHistory.verificationUrl : undefined),
    algorithm: proofState.spinAlgorithm || (latestHistory?.hash === proofState.spinHash ? latestHistory.algorithm : undefined),
    timestamp: latestHistory?.timestamp || Date.now()
  };
}

export function getWheelSessionRevenue(vm: Record<string, unknown>): number {
  const config = getWheelDisplayConfig(vm);
  const totalSpins = getWheelDisplayTotalSpins(vm);
  return totalSpins * Number(config?.spinPrice || 0);
}

export function getWheelSessionCost(vm: Record<string, unknown>): number {
  const controller = getWheelController(vm);
  const slots = getWheelDisplaySlots(vm);
  const counts = getWheelDisplaySpinCounts(vm);
  const base = counts.reduce((sum, count, i) => sum + count * (slots[i]?.cost || 0), 0);
  const adjustment = (isWheelPreviewMode(vm)
    ? 0
    : Number(controller.sessionCostAdjustment || 0));
  return base + adjustment;
}

export function getWheelSessionProfit(vm: Record<string, unknown>): number {
  const controller = getWheelController(vm);
  if (!isWheelPreviewMode(vm)) {
    const storedNetRevenue = controller.sessionNetRevenue as number | null | undefined;
    if (storedNetRevenue != null && Number.isFinite(Number(storedNetRevenue))) {
      return Number(storedNetRevenue) - getWheelSessionCost(vm);
    }
  }

  const config = getWheelDisplayConfig(vm);
  const slots = getWheelDisplaySlots(vm);
  const spinCounts = getWheelDisplaySpinCounts(vm);
  const lots = ((vm.lots || []) as Lot[]);
  const grossRevenue = getWheelSessionRevenue(vm);
  const totalSpins = getWheelDisplayTotalSpins(vm);
  const shippingTotal = calculateWheelBuyerShippingTotal(config, slots, spinCounts, lots);
  const buyerShippingPerOrder = totalSpins > 0 ? (shippingTotal / totalSpins) : 0;
  const sellingTaxPercent = config ? calculateAverageWheelSellingTaxPercent(config, lots) : 0;
  const netRevenue = calculateWheelNetFromGross(
    grossRevenue,
    vm,
    totalSpins,
    buyerShippingPerOrder,
    sellingTaxPercent
  );
  return netRevenue - getWheelSessionCost(vm);
}
