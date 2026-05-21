import type { GameStageOverlayAnchor } from "../overlay/gameStageOverlayTypes.ts";

type RectLike = Pick<DOMRectReadOnly, "left" | "top" | "width" | "height">;

const MAX_BRACKET_DICE_ANCHOR_SIZE_PX = 88;

function roundAnchorValue(value: number): number {
  return Number(value.toFixed(4));
}

export function createBracketBattleOverlayAnchor(
  surfaceRect: RectLike,
  slotRect: RectLike
): GameStageOverlayAnchor {
  const safeSurfaceWidth = Math.max(surfaceRect.width, 1);
  const safeSurfaceHeight = Math.max(surfaceRect.height, 1);
  const slotCenterX = slotRect.left - surfaceRect.left + slotRect.width / 2;
  const slotCenterY = slotRect.top - surfaceRect.top + slotRect.height / 2;
  const slotSize = Math.min(
    Math.min(slotRect.width, slotRect.height),
    MAX_BRACKET_DICE_ANCHOR_SIZE_PX
  );

  return {
    x: roundAnchorValue(slotCenterX / safeSurfaceWidth),
    y: roundAnchorValue(slotCenterY / safeSurfaceHeight),
    size: roundAnchorValue(slotSize / safeSurfaceWidth)
  };
}
