import type { WheelFairnessEntry } from "../../types/app.ts";
import { getWheelController } from "./wheelControllerState.ts";
import type { WheelSlot } from "./wheelHelpers.ts";

export function calculateWheelSessionMarginPercent(vm: Record<string, unknown>): number | null {
  const cost = Number(vm.wheelSessionCost || 0);
  if (!cost) return null;
  const profit = Number(vm.wheelSessionProfit || 0);
  return (profit / cost) * 100;
}

export function getWheelDisplaySlots(vm: Record<string, unknown>): WheelSlot[] {
  const controller = getWheelController(vm);
  return (((vm.wheelMode === "config"
    ? controller.previewSlots
    : controller.activeSlots) || []) as WheelSlot[]);
}

export function getWheelDisplaySpinCounts(vm: Record<string, unknown>): number[] {
  const controller = getWheelController(vm);
  return ((vm.wheelMode === "config"
    ? controller.previewSpinCounts
    : vm.wheelSpinCounts || []) as number[]);
}

export function getWheelDisplayTotalSpins(vm: Record<string, unknown>): number {
  const controller = getWheelController(vm);
  return Number((vm.wheelMode === "config"
    ? controller.previewTotalSpins
    : vm.wheelTotalSpins) || 0);
}

export function getWheelDisplayFairnessHistory(vm: Record<string, unknown>): WheelFairnessEntry[] {
  const controller = getWheelController(vm);
  return (((vm.wheelMode === "config"
    ? controller.previewFairnessHistory
    : controller.fairnessHistory) || []) as WheelFairnessEntry[]);
}

export function getWheelDisplayChaseTallyHistory(
  vm: Record<string, unknown>
): Array<{ tierId: string; label: string; color: string; count: number }> {
  const controller = getWheelController(vm);
  return ((vm.wheelMode === "config"
    ? controller.previewChaseTallyHistory
    : controller.chaseTallyHistory) || []) as Array<{ tierId: string; label: string; color: string; count: number }>;
}
