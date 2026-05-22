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

export type DiceRollMotionOptions = {
  reducedMotion?: boolean;
  scale?: number;
};

export type OverlayDieVisualSpec = {
  dieSize: number;
  pipRadius: number;
  pipInsetDepth: number;
  facePadding: number;
};

export type OverlayDieShadowState = {
  opacity: number;
  scaleX: number;
  scaleY: number;
  offsetY: number;
};

const PIP_OFFSET = 0.34;
const MAX_OVERLAY_DIE_SCREEN_SLOT_SCALE = 1.05;
const ROLL_SPIN_SPEED = 0.5;
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
  return Math.min(MAX_OVERLAY_DIE_SCREEN_SLOT_SCALE, desiredWorldSize / dieSize);
}

export function getOverlayDieShadowState(input: {
  baseY: number;
  currentY: number;
  scale: number;
}): OverlayDieShadowState {
  const scale = Math.max(0.1, Number(input.scale) || 1);
  const lift = Math.max(0, Number(input.currentY) - Number(input.baseY));
  const liftRatio = Math.min(1, lift / Math.max(0.42 * scale, 0.001));
  const opacity = 0.58 - liftRatio * 0.3;

  return {
    opacity: Number(opacity.toFixed(4)),
    scaleX: Number((scale * (1.42 + liftRatio * 0.5)).toFixed(4)),
    scaleY: Number((scale * (0.42 + liftRatio * 0.18)).toFixed(4)),
    offsetY: Number((-scale * 0.64).toFixed(4))
  };
}

export function getOverlayDieBoxFaceValues(): readonly number[] {
  return [...OVERLAY_DIE_BOX_FACE_VALUES];
}

export function sampleDiceRollMotion(progress: number, options: DiceRollMotionOptions = {}): DiceRollMotionSample {
  if (options.reducedMotion) {
    return {
      height: 0,
      driftX: 0,
      driftZ: 0,
      rotation: { x: 0, y: 0, z: 0 }
    };
  }

  const motionScale = Math.min(1, Math.max(0.38, Number(options.scale) || 1));

  const clampedProgress = Math.min(1, Math.max(0, progress));
  if (clampedProgress === 0 || clampedProgress === 1) {
    return {
      height: 0,
      driftX: (clampedProgress === 0 ? -0.27 : 0.27) * motionScale,
      driftZ: 0,
      rotation: {
        x: clampedProgress * Math.PI * 4.25 * ROLL_SPIN_SPEED,
        y: clampedProgress * Math.PI * 5.1 * ROLL_SPIN_SPEED,
        z: clampedProgress * Math.PI * 3.55 * ROLL_SPIN_SPEED
      }
    };
  }

  const settleStart = 0.68;
  const settleProgress = Math.min(1, Math.max(0, (clampedProgress - settleStart) / (1 - settleStart)));
  const rollEase = 1 - (1 - clampedProgress) ** 2.2;
  const singleHop = Math.sin(clampedProgress * Math.PI) * 0.22 * motionScale;

  return {
    height: Number(singleHop.toFixed(4)),
    driftX: (rollEase - 0.5) * 0.54 * motionScale,
    driftZ: Math.sin(clampedProgress * Math.PI * 2.25) * 0.18 * (1 - settleProgress * 0.62) * motionScale,
    rotation: {
      x: rollEase * Math.PI * 4.25 * ROLL_SPIN_SPEED,
      y: rollEase * Math.PI * 5.1 * ROLL_SPIN_SPEED,
      z: rollEase * Math.PI * 3.55 * ROLL_SPIN_SPEED
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
