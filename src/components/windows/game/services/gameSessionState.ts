import type { GameSessionStateContext } from "../../../../app-core/context/game.ts";
import {
  createGameSessionFeatureState,
  GAME_SESSION_FEATURE_STATE_KEYS
} from "../../../../app-core/feature-state/game-session-state.ts";
import type { GameExecution } from "./gameSessionEngine.ts";
import {
  resetLoadedTierPrizeGameState,
  runWheelSessionReset,
  type WheelSessionResetContext
} from "./wheelSessionState.ts";
import type { WheelSlot } from "./wheelSlots.ts";

export type WheelControllerState = GameSessionStateContext;

export function createWheelControllerState(): WheelControllerState {
  return createGameSessionFeatureState();
}

export function getWheelController(context: object): WheelControllerState {
  const root = context as Record<string, unknown>;
  const featureOwner = root.gameSessionFeatureState;
  const owner = featureOwner && typeof featureOwner === "object"
    ? featureOwner as Record<string, unknown>
    : root;
  const missing = GAME_SESSION_FEATURE_STATE_KEYS.find((key) => !(key in owner));
  if (missing) throw new Error(`Missing game session field: ${missing}`);
  return owner as unknown as WheelControllerState;
}

/** Explicit compatibility boundary for isolated tests and legacy partial hosts. */
export function ensureWheelControllerState(context: object): WheelControllerState {
  const root = context as Record<string, unknown>;
  const featureOwner = root.gameSessionFeatureState;
  const owner = featureOwner && typeof featureOwner === "object"
    ? featureOwner as Record<string, unknown>
    : root;
  for (const [key, value] of Object.entries(createWheelControllerState())) if (!(key in owner)) owner[key] = value;
  return owner as unknown as WheelControllerState;
}

/** Production reset boundary: resolves the focused owner before running the ordered session adapter. */
export function resetGameSessionOwner(
  context: WheelSessionResetContext,
  execution: GameExecution,
  slots: WheelSlot[],
  ports: { persist(): void | Promise<void>; publish(): void | Promise<void> },
  reseedGrid = true
): Promise<unknown> {
  return runWheelSessionReset(context, getWheelController(context), execution, slots, ports, reseedGrid);
}

/** Resets a loaded config through the same owner used by the wheel controller. */
export function resetLoadedGameSessionOwner(context: WheelSessionResetContext, clearSlots: boolean): void {
  resetLoadedTierPrizeGameState(context, getWheelController(context), clearSlots);
}
