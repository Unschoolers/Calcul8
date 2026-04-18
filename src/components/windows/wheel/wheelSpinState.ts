import type { WheelFairnessEntry } from "../../../types/app.ts";
import { getWheelDisplaySlots, isWheelPreviewMode } from "./wheelComputedShared.ts";
import { getWheelController } from "./wheelControllerState.ts";
import type { WheelSlot } from "./wheelHelpers.ts";

export type WheelFairnessResult = {
  resultIndex: number;
  hash: string;
  seed: string;
  clientSeed?: string;
  layoutHash?: string;
  verificationUrl?: string;
  algorithm?: string;
};

export function getWheelSpinSlots(context: Record<string, unknown>): WheelSlot[] {
  if (Array.isArray(context.wheelDisplaySlots)) {
    return context.wheelDisplaySlots as WheelSlot[];
  }
  return getWheelDisplaySlots(context);
}

export function shouldRecordWheelLiveSession(
  context: Record<string, unknown>,
  recordSession: boolean
): boolean {
  return recordSession && !isWheelPreviewMode(context);
}

export function applyWheelSpinBlockedReason(context: Record<string, unknown>, blockedReason: string): void {
  getWheelController(context).inventoryWarning = blockedReason;
}

export function beginWheelSpin(
  context: Record<string, unknown>,
  fairnessResult: Pick<WheelFairnessResult, "hash" | "clientSeed" | "algorithm">
): void {
  const controller = getWheelController(context);
  controller.spinSeed = "";
  controller.spinHash = fairnessResult.hash;
  controller.spinClientSeed = fairnessResult.clientSeed || "";
  controller.spinVerificationUrl = "";
  controller.spinAlgorithm = fairnessResult.algorithm || "";
  controller.showSeed = false;
  controller.inventoryWarning = "";
  controller.highlightedSlotIndex = -1;
  controller.lastResultColor = "rgb(var(--v-theme-primary))";
  context.wheelSpinning = true;
  context.wheelLastResult = "Spinning\u2026";
}

export function finalizeWheelSpinProof(
  context: Record<string, unknown>,
  fairnessResult: Pick<WheelFairnessResult, "seed" | "clientSeed" | "verificationUrl" | "algorithm">
): void {
  const controller = getWheelController(context);
  controller.spinSeed = fairnessResult.seed;
  controller.spinClientSeed = fairnessResult.clientSeed || "";
  controller.spinVerificationUrl = fairnessResult.verificationUrl || "";
  controller.spinAlgorithm = fairnessResult.algorithm || "";
  controller.showSeed = true;
}

export function buildWheelReadableVerificationUrl(
  baseUrl: string | undefined,
  params: {
    slotLabel?: string;
    wheelName?: string;
    spinNumber?: number;
    slots?: WheelSlot[];
  }
): string {
  const rawUrl = String(baseUrl ?? "").trim();
  if (!rawUrl) return "";

  try {
    const url = new URL(rawUrl);
    url.searchParams.set("format", "html");
    if (params.slotLabel) {
      url.searchParams.set("slotLabel", params.slotLabel);
    }
    if (params.wheelName) {
      url.searchParams.set("wheelName", params.wheelName);
    }
    if (params.spinNumber != null && Number.isFinite(params.spinNumber) && params.spinNumber > 0) {
      url.searchParams.set("spinNumber", String(Math.floor(params.spinNumber)));
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

export function buildWheelSpinFairnessEntry(
  context: Record<string, unknown>,
  params: {
    fairnessResult: WheelFairnessResult;
    slots: WheelSlot[];
    targetIndex: number;
    shouldRecordLiveSession: boolean;
  }
): WheelFairnessEntry {
  const controller = getWheelController(context);
  return {
    spinNumber: Number(params.shouldRecordLiveSession
      ? (context.wheelTotalSpins || 0)
      : (controller.previewTotalSpins || 0)),
    label: params.slots[params.targetIndex]?.name || "Unknown result",
    color: params.slots[params.targetIndex]?.color || "rgb(var(--v-theme-primary))",
    hash: params.fairnessResult.hash,
    seed: params.fairnessResult.seed,
    clientSeed: params.fairnessResult.clientSeed,
    layoutHash: params.fairnessResult.layoutHash,
    verificationUrl: params.fairnessResult.verificationUrl,
    algorithm: params.fairnessResult.algorithm,
    timestamp: Date.now()
  };
}
