import { buildGameOutcomeSlots, type GameOutcomeSlot } from "../../../../app-core/shared/game-domain.ts";
import type { WheelConfig } from "../../../../types/app.ts";

export type WheelSlot = GameOutcomeSlot;

export function createWheelGridLayoutSeed(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function buildSlotsFromConfig(config: WheelConfig, options: { layoutSeed?: string } = {}): WheelSlot[] {
  return buildGameOutcomeSlots(config, options);
}
