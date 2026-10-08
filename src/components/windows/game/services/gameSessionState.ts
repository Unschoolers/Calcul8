import type { GameSessionStateContext } from "../../../../app-core/context/game.ts";
import {
  createGameSessionFeatureState,
  GAME_SESSION_FEATURE_STATE_KEYS
} from "../../../../app-core/feature-state/game-session-state.ts";
import { unwrapWindowBridgeContext } from "../../shared/contextBridge.ts";

export type WheelControllerState = GameSessionStateContext;

export function createWheelControllerState(): WheelControllerState {
  return createGameSessionFeatureState();
}

export function getWheelController(context: object): WheelControllerState {
  const owner = unwrapWindowBridgeContext(context as Record<string, unknown>);
  const missing = GAME_SESSION_FEATURE_STATE_KEYS.find((key) => !(key in owner));
  if (missing) throw new Error(`Missing game session field: ${missing}`);
  return owner as unknown as WheelControllerState;
}

/** Explicit compatibility boundary for isolated tests and legacy partial hosts. */
export function ensureWheelControllerState(context: object): WheelControllerState {
  const owner = unwrapWindowBridgeContext(context as Record<string, unknown>);
  for (const [key, value] of Object.entries(createWheelControllerState())) if (!(key in owner)) owner[key] = value;
  return owner as unknown as WheelControllerState;
}
