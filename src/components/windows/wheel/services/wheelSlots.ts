import { buildGameOutcomeSlots, type GameOutcomeSlot } from "../../../../app-core/shared/game-domain.ts";
import type { WheelConfig } from "../../../../types/app.ts";

export type WheelSlot = GameOutcomeSlot;

export function buildSlotsFromConfig(config: WheelConfig): WheelSlot[] {
  return buildGameOutcomeSlots(config);
}
