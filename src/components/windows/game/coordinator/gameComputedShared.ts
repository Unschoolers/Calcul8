import { translateAppMessage } from "../../../../app-core/i18n/index.ts";
import { selectGameSessionTrack, type GameSessionTrack } from "../../../../app-core/shared/game-session-aggregate.ts";
import type { Lot, WheelConfig, WheelFairnessEntry } from "../../../../types/app.ts";
import { getWheelController } from "./gameControllerState.ts";
import type { WheelSlot } from "../services/wheelSlots.ts";
import {
  calculateWheelSessionNetRevenue
} from "../services/wheelPricing.ts";
import { readGameSessionAggregate } from "../services/gameSessionAggregateAdapter.ts";

function isWheelOwnerContext(vm: Record<string, unknown>): boolean {
  return Reflect.has(vm, "wheelController")
    || Reflect.has(vm, "wheelMode")
    || Reflect.has(vm, "editingWheelConfig")
    || Reflect.has(vm, "wheelInspectorTab")
    || Reflect.has(vm, "wheelPresentationMode");
}

function resolveWheelSource(vm: Record<string, unknown>): Record<string, unknown> {
  if (isWheelOwnerContext(vm)) {
    return vm;
  }
  const explicitCtx = vm.ctx;
  if (explicitCtx && typeof explicitCtx === "object") {
    return explicitCtx as Record<string, unknown>;
  }
  return vm;
}

export function isWheelPreviewMode(vm: Record<string, unknown>): boolean {
  const source = resolveWheelSource(vm);
  return source.wheelMode === "config";
}

export function calculateWheelSessionMarginPercent(vm: Record<string, unknown>): number | null {
  const cost = getWheelSessionCost(vm);
  if (!cost) return null;
  const profit = getWheelSessionProfit(vm);
  return (profit / cost) * 100;
}

export function getWheelDisplayConfig(vm: Record<string, unknown>): WheelConfig | null {
  const source = resolveWheelSource(vm);
  if (isWheelPreviewMode(vm)) {
    return (source.editingWheelConfig as WheelConfig | null)
      || (source.activeWheelConfig as WheelConfig | null)
      || null;
  }
  return (source.activeWheelConfig as WheelConfig | null) || null;
}

export function getWheelDisplaySlots(vm: Record<string, unknown>): WheelSlot[] {
  const source = resolveWheelSource(vm);
  const controller = getWheelController(source);
  return (((isWheelPreviewMode(vm)
    ? controller.previewSlots
    : controller.activeSlots) || []) as WheelSlot[]);
}

function getWheelDisplaySessionTrack(vm: Record<string, unknown>): GameSessionTrack {
  const source = resolveWheelSource(vm);
  const controller = getWheelController(source);
  const aggregate = readGameSessionAggregate({
    wheelSpinCounts: Array.isArray(source.wheelSpinCounts) ? source.wheelSpinCounts as number[] : [],
    wheelTotalSpins: Number(source.wheelTotalSpins || 0)
  }, controller);
  return selectGameSessionTrack(aggregate, isWheelPreviewMode(vm) ? "preview" : "live");
}

export function getWheelDisplaySpinCounts(vm: Record<string, unknown>): number[] {
  return getWheelDisplaySessionTrack(vm).spinCounts;
}

export function getWheelDisplayTotalSpins(vm: Record<string, unknown>): number {
  return getWheelDisplaySessionTrack(vm).totalSpins;
}

export function getWheelDisplayFairnessHistory(vm: Record<string, unknown>): WheelFairnessEntry[] {
  return getWheelDisplaySessionTrack(vm).fairnessHistory;
}

export function getWheelDisplayFairnessHistoryEntries(vm: Record<string, unknown>): WheelFairnessEntry[] {
  return [...getWheelDisplayFairnessHistory(vm)].reverse();
}

export function getWheelDisplayChaseTallyHistory(
  vm: Record<string, unknown>
): Array<{ tierId: string; label: string; color: string; count: number }> {
  const source = resolveWheelSource(vm);
  const controller = getWheelController(source);
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
  const source = resolveWheelSource(vm);
  const controller = getWheelController(source);
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
  const source = resolveWheelSource(vm);
  const preferredLanguage = String(source.preferredLanguage ?? "");
  const entries = getWheelDisplayFairnessHistoryEntries(vm);
  const latestHistory = entries[0] || null;
  const proofState = getWheelCurrentProofState(vm);
  if (!proofState.spinHash) {
    return latestHistory;
  }

  const currentLabel = String(source.wheelLastResult || "")
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
  const source = resolveWheelSource(vm);
  const controller = getWheelController(source);
  const slots = getWheelDisplaySlots(vm);
  const counts = getWheelDisplaySpinCounts(vm);
  const base = counts.reduce((sum, count, i) => sum + count * (slots[i]?.cost || 0), 0);
  const adjustment = (isWheelPreviewMode(vm)
    ? 0
    : Number(controller.sessionCostAdjustment || 0));
  return base + adjustment;
}

export function getWheelSessionProfit(vm: Record<string, unknown>): number {
  const source = resolveWheelSource(vm);
  const controller = getWheelController(source);
  if (!isWheelPreviewMode(vm)) {
    const storedNetRevenue = controller.sessionNetRevenue as number | null | undefined;
    if (storedNetRevenue != null && Number.isFinite(Number(storedNetRevenue))) {
      return Number(storedNetRevenue) - getWheelSessionCost(vm);
    }
  }

  const config = getWheelDisplayConfig(vm);
  const slots = getWheelDisplaySlots(vm);
  const spinCounts = getWheelDisplaySpinCounts(vm);
  const lots = ((source.lots || []) as Lot[]);
  const netRevenue = calculateWheelSessionNetRevenue(config, slots, spinCounts, source, lots);
  return netRevenue - getWheelSessionCost(vm);
}

