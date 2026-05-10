import type { GameStageOverlaySceneHandle } from "./gameStageOverlayScene.ts";
import type { GameStageOverlayCommand } from "./gameStageOverlayTypes.ts";

export type GameStageOverlayController = {
  mount(): void;
  dispatch(command: GameStageOverlayCommand): void;
  unmount(): void;
};

export function createGameStageOverlayController(input: {
  scene: GameStageOverlaySceneHandle;
}): GameStageOverlayController {
  let mounted = false;

  return {
    mount() {
      if (mounted) {
        return;
      }

      mounted = true;
      input.scene.clear();
    },
    dispatch(command) {
      if (!mounted) {
        return;
      }

      switch (command.type) {
        case "enterIdle":
          input.scene.enterIdle();
          return;
        case "clear":
          input.scene.clear();
          return;
        case "stageEnter":
          input.scene.stageEnter(command);
          return;
        case "anchorUpdate":
          input.scene.updateAnchors(command);
          return;
        case "stageExit":
          input.scene.stageExit(command);
          return;
        case "rollMatchStart":
          input.scene.startRoll(command);
          return;
        case "rollMatchResolve":
          input.scene.resolveRoll(command);
          return;
      }
    },
    unmount() {
      if (!mounted) {
        return;
      }

      mounted = false;
      input.scene.dispose();
    }
  };
}
