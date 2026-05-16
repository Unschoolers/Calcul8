import type { GameSpectatorSpinAnimation } from "../../types/app.ts";

const FULL_TURN_RADIANS = 2 * Math.PI;

export interface WheelSpinPlanInput {
  slotCount: number;
  targetIndex: number;
  currentAngle: number;
  extraRotations: number;
  durationMs: number;
  startedAt: number;
  spinIdSeed?: string;
}

export interface WheelSpinPlan {
  sliceAngle: number;
  targetIndex: number;
  startAngle: number;
  endAngle: number;
  durationMs: number;
  spectatorAnimation: GameSpectatorSpinAnimation;
}

export function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

export function calculateWheelSpinEndAngle(params: {
  currentAngle: number;
  targetIndex: number;
  sliceAngle: number;
  extraRotations: number;
}): number {
  return params.currentAngle
    - (params.targetIndex * params.sliceAngle + params.sliceAngle / 2)
    - (params.currentAngle % FULL_TURN_RADIANS)
    + params.extraRotations;
}

export function createWheelSpinPlan(input: WheelSpinPlanInput): WheelSpinPlan | null {
  const slotCount = Math.floor(Number(input.slotCount));
  const targetIndex = Math.floor(Number(input.targetIndex));
  if (!Number.isFinite(slotCount) || slotCount <= 0) return null;
  if (!Number.isFinite(targetIndex) || targetIndex < 0 || targetIndex >= slotCount) return null;

  const sliceAngle = FULL_TURN_RADIANS / slotCount;
  const startAngle = Number.isFinite(Number(input.currentAngle)) ? Number(input.currentAngle) : 0;
  const extraRotations = Math.max(0, Number(input.extraRotations) || 0);
  const durationMs = Math.max(0, Number(input.durationMs) || 0);
  const endAngle = calculateWheelSpinEndAngle({
    currentAngle: startAngle,
    targetIndex,
    sliceAngle,
    extraRotations
  });
  const spinIdSeed = input.spinIdSeed || String(input.startedAt);

  return {
    sliceAngle,
    targetIndex,
    startAngle,
    endAngle,
    durationMs,
    spectatorAnimation: {
      spinId: `${spinIdSeed}-${targetIndex}-${Math.round(endAngle * 1000)}`,
      startedAt: Math.max(0, Math.floor(Number(input.startedAt) || 0)),
      durationMs: Math.round(durationMs),
      startAngle,
      endAngle,
      targetIndex
    }
  };
}

export function chooseWheelPreviewTargetIndex(
  slotCount: number,
  randomValue: number
): number {
  const count = Math.max(0, Math.floor(Number(slotCount) || 0));
  if (count <= 0) return -1;
  return Math.min(count - 1, Math.max(0, Math.floor(randomValue * count)));
}

export function resolveWheelPreviewExtraRotations(randomValue: number): number {
  return Math.floor(3 + Math.max(0, Math.min(0.999999, randomValue)) * 3) * FULL_TURN_RADIANS;
}

export function resolveWheelLiveExtraRotations(randomValue: number): number {
  return Math.floor(5 + Math.max(0, Math.min(0.999999, randomValue)) * 4) * FULL_TURN_RADIANS;
}

export function resolveWheelPreviewDurationMs(randomValue: number): number {
  return 2200 + Math.max(0, Math.min(1, randomValue)) * 900;
}

export function resolveWheelLiveDurationMs(randomValue: number): number {
  return 4000 + Math.max(0, Math.min(1, randomValue)) * 1500;
}
