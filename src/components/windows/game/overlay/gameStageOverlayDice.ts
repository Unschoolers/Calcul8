export type DicePipPoint = {
  x: number;
  y: number;
};

export type DiceRollMotionSample = {
  height: number;
  driftX: number;
  driftZ: number;
  rotation: {
    x: number;
    y: number;
    z: number;
  };
};

export type OverlayDieVisualSpec = {
  dieSize: number;
  pipRadius: number;
  pipInsetDepth: number;
  facePadding: number;
};

const PIP_OFFSET = 0.34;
const OVERLAY_DIE_BOX_FACE_VALUES = [2, 5, 3, 4, 1, 6] as const;
const OVERLAY_DIE_VISUAL_SPEC: OverlayDieVisualSpec = {
  dieSize: 0.6,
  pipRadius: 0.044,
  pipInsetDepth: 0.024,
  facePadding: 0.016
};

const DICE_PIP_LAYOUTS: Record<number, DicePipPoint[]> = {
  1: [{ x: 0, y: 0 }],
  2: [
    { x: -PIP_OFFSET, y: PIP_OFFSET },
    { x: PIP_OFFSET, y: -PIP_OFFSET }
  ],
  3: [
    { x: -PIP_OFFSET, y: PIP_OFFSET },
    { x: 0, y: 0 },
    { x: PIP_OFFSET, y: -PIP_OFFSET }
  ],
  4: [
    { x: -PIP_OFFSET, y: PIP_OFFSET },
    { x: PIP_OFFSET, y: PIP_OFFSET },
    { x: -PIP_OFFSET, y: -PIP_OFFSET },
    { x: PIP_OFFSET, y: -PIP_OFFSET }
  ],
  5: [
    { x: -PIP_OFFSET, y: PIP_OFFSET },
    { x: PIP_OFFSET, y: PIP_OFFSET },
    { x: 0, y: 0 },
    { x: -PIP_OFFSET, y: -PIP_OFFSET },
    { x: PIP_OFFSET, y: -PIP_OFFSET }
  ],
  6: [
    { x: -PIP_OFFSET, y: PIP_OFFSET },
    { x: PIP_OFFSET, y: PIP_OFFSET },
    { x: -PIP_OFFSET, y: 0 },
    { x: PIP_OFFSET, y: 0 },
    { x: -PIP_OFFSET, y: -PIP_OFFSET },
    { x: PIP_OFFSET, y: -PIP_OFFSET }
  ]
};

export function clampDieValue(value: unknown): number {
  const numeric = Math.round(Number(value));
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  return Math.min(6, Math.max(1, numeric));
}

export function getDicePipLayout(value: number): DicePipPoint[] {
  return DICE_PIP_LAYOUTS[clampDieValue(value)] ?? DICE_PIP_LAYOUTS[1]!;
}

export function getOverlayDieVisualSpec(): OverlayDieVisualSpec {
  return { ...OVERLAY_DIE_VISUAL_SPEC };
}

export function getOverlayDieScaleForScreenSlot(input: {
  slotSizePx: number;
  viewportHeightPx: number;
  cameraDistance: number;
  cameraFovDegrees: number;
  dieSize: number;
  fillRatio?: number;
}): number {
  const slotSizePx = Math.max(input.slotSizePx, 1);
  const viewportHeightPx = Math.max(input.viewportHeightPx, 1);
  const cameraDistance = Math.max(input.cameraDistance, 0.001);
  const dieSize = Math.max(input.dieSize, 0.001);
  const fillRatio = Math.min(1, Math.max(0.1, input.fillRatio ?? 0.82));
  const fovRadians = (input.cameraFovDegrees * Math.PI) / 180;
  const visibleWorldHeight = 2 * Math.tan(fovRadians / 2) * cameraDistance;
  const desiredWorldSize = (slotSizePx * fillRatio / viewportHeightPx) * visibleWorldHeight;
  return desiredWorldSize / dieSize;
}

export function getOverlayDieBoxFaceValues(): readonly number[] {
  return [...OVERLAY_DIE_BOX_FACE_VALUES];
}

export function sampleDiceRollMotion(progress: number): DiceRollMotionSample {
  const clampedProgress = Math.min(1, Math.max(0, progress));
  const arc = clampedProgress === 0 || clampedProgress === 1
    ? 0
    : Math.sin(clampedProgress * Math.PI);

  return {
    height: arc * 0.72,
    driftX: (clampedProgress - 0.5) * 0.54,
    driftZ: Math.sin(clampedProgress * Math.PI * 2) * 0.18,
    rotation: {
      x: clampedProgress * Math.PI * 4,
      y: clampedProgress * Math.PI * 4.75,
      z: clampedProgress * Math.PI * 3.25
    }
  };
}

export function getDieTopFaceRotation(value: number): { x: number; y: number; z: number } {
  switch (clampDieValue(value)) {
    case 1:
      return { x: -Math.PI / 2, y: 0, z: 0 };
    case 2:
      return { x: 0, y: 0, z: Math.PI / 2 };
    case 3:
      return { x: 0, y: 0, z: 0 };
    case 4:
      return { x: Math.PI, y: 0, z: 0 };
    case 5:
      return { x: 0, y: 0, z: -Math.PI / 2 };
    case 6:
      return { x: Math.PI / 2, y: 0, z: 0 };
    default:
      return { x: 0, y: 0, z: 0 };
  }
}

export function getDieDisplayRotation(value: number): { x: number; y: number; z: number } {
  switch (clampDieValue(value)) {
    case 1:
      return { x: -0.16, y: 0.2, z: 0 };
    case 2:
      return { x: -0.16, y: -Math.PI / 2 + 0.08, z: 0 };
    case 3:
      return { x: Math.PI / 2 - 0.18, y: 0.12, z: 0 };
    case 4:
      return { x: -Math.PI / 2 - 0.02, y: 0.14, z: 0 };
    case 5:
      return { x: -0.16, y: Math.PI / 2 - 0.08, z: 0 };
    case 6:
      return { x: -0.16, y: Math.PI - 0.18, z: 0 };
    default:
      return { x: -0.16, y: 0.2, z: 0 };
  }
}
