export const WHEEL_COMPACT_LAYOUT_BREAKPOINT = 1100;

export interface WheelCanvasTargetSizeInput {
  panelWidth?: number | null;
  viewportWidth?: number | null;
  viewportHeight?: number | null;
  presentationMode: boolean;
}

export type WheelLayoutMode = "compact" | "expanded";

function toFiniteNumber(value: unknown): number | null {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : null;
}

export function isWheelCompactViewport(viewportWidth?: number | null): boolean {
  const nextWidth = toFiniteNumber(viewportWidth);
  return nextWidth !== null && nextWidth <= WHEEL_COMPACT_LAYOUT_BREAKPOINT;
}

export function resolveWheelLayoutMode(viewportWidth?: number | null): WheelLayoutMode {
  return isWheelCompactViewport(viewportWidth) ? "compact" : "expanded";
}

export function resolveWheelCanvasTargetSize(input: WheelCanvasTargetSizeInput): number {
  const isCompact = isWheelCompactViewport(input.viewportWidth);
  const maxSize = input.presentationMode
    ? (isCompact ? 460 : 720)
    : (isCompact ? 420 : 520);

  const panelWidth = toFiniteNumber(input.panelWidth);
  if (panelWidth == null || panelWidth <= 0) {
    return maxSize;
  }

  const horizontalInset = input.presentationMode
    ? (isCompact ? 56 : 40)
    : (isCompact ? 54 : 28);
  const availableWidth = Math.max(220, panelWidth - horizontalInset);
  let targetSize = Math.min(availableWidth, maxSize);

  const viewportHeight = toFiniteNumber(input.viewportHeight);
  if (isCompact && viewportHeight != null) {
    const verticalInset = input.presentationMode ? 320 : 420;
    const availableHeight = Math.max(220, viewportHeight - verticalInset);
    targetSize = Math.min(targetSize, availableHeight);
  }

  return targetSize;
}
