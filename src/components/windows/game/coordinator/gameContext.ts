import { inject, type InjectionKey } from "vue";
import type { GameController } from "./gameControllerState.ts";

export const gameControllerKey: InjectionKey<GameController> = Symbol("gameController");

export function useGameController(): GameController {
  const controller = inject(gameControllerKey, null);
  if (!controller) throw new Error("Game controller was not provided by GameWindow");
  return controller;
}

export function setupTypedGameContext() {
  return { game: useGameController() };
}
