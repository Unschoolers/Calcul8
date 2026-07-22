import type { WheelFairnessEntry } from "../../../../types/app.ts";
import { getWheelDisplaySlots, isWheelPreviewMode } from "../coordinator/gameComputedShared.ts";
import { getWheelController } from "../coordinator/gameControllerState.ts";
import type { WheelSlot } from "./wheelSlots.ts";

export type WheelFairnessResult = {
  resultIndex: number;
  hash: string;
  seed: string;
  clientSeed?: string;
  layoutHash?: string;
  verificationUrl?: string;
  algorithm?: string;
};

export interface WheelSpinContext {
  wheelDisplaySlots?: WheelSlot[];
  wheelMode?: unknown;
  wheelSpinning?: boolean;
  wheelLastResult?: string;
  wheelTotalSpins?: number;
}

type WheelSpinContextLike = WheelSpinContext | Record<string, unknown>;

export function getWheelSpinSlots(context: WheelSpinContextLike): WheelSlot[] {
  if (Array.isArray(context.wheelDisplaySlots)) {
    return context.wheelDisplaySlots;
  }
  return getWheelDisplaySlots(context as unknown as Record<string, unknown>);
}

export function shouldRecordWheelLiveSession(
  context: WheelSpinContextLike,
  recordSession: boolean
): boolean {
  return recordSession && !isWheelPreviewMode(context as unknown as Record<string, unknown>);
}

export function applyWheelSpinBlockedReason(context: WheelSpinContextLike, blockedReason: string): void {
  getWheelController(context).wheelInventoryWarning = blockedReason;
}

export function beginWheelSpin(
  context: WheelSpinContextLike,
  fairnessResult: Pick<WheelFairnessResult, "hash" | "clientSeed" | "algorithm">
): void {
  const controller = getWheelController(context);
  controller.wheelSpinSeed = "";
  controller.wheelSpinHash = fairnessResult.hash;
  controller.wheelSpinClientSeed = fairnessResult.clientSeed || "";
  controller.wheelSpinVerificationUrl = "";
  controller.wheelSpinAlgorithm = fairnessResult.algorithm || "";
  controller.wheelShowSeed = false;
  controller.wheelInventoryWarning = "";
  controller.wheelHighlightedSlotIndex = -1;
  controller.wheelLastResultColor = "rgb(var(--v-theme-primary))";
  context.wheelSpinning = true;
  context.wheelLastResult = "Spinning\u2026";
}

export function finalizeWheelSpinProof(
  context: WheelSpinContextLike,
  fairnessResult: Pick<WheelFairnessResult, "seed" | "clientSeed" | "verificationUrl" | "algorithm">
): void {
  const controller = getWheelController(context);
  controller.wheelSpinSeed = fairnessResult.seed;
  controller.wheelSpinClientSeed = fairnessResult.clientSeed || "";
  controller.wheelSpinVerificationUrl = fairnessResult.verificationUrl || "";
  controller.wheelSpinAlgorithm = fairnessResult.algorithm || "";
  controller.wheelShowSeed = true;
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
  context: WheelSpinContextLike,
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
      : (controller.wheelPreviewTotalSpins || 0)),
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

