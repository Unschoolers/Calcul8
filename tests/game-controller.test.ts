import { expect, test, vi } from "vitest";
import { createGameController } from "../src/components/windows/game/coordinator/gameControllerState.ts";
import { createGameSessionFeatureState } from "../src/app-core/feature-state/game-session-state.ts";

test("game controller exposes the feature-owned session and awaits its explicit commands", async () => {
  const session = createGameSessionFeatureState();
  const root = {
    gameSessionFeatureState: session,
    spinWheel: vi.fn(async () => {
      session.wheelPreviewTotalSpins += 1;
    }),
    revealMysteryGridCell: vi.fn(async () => "settled"),
    startBracketBattle: vi.fn(async () => undefined)
  };

  const controller = createGameController(root as never);
  expect(controller.session).toBe(session);

  await controller.commands.spinWheel();
  await expect(controller.commands.revealMysteryGridCell(2)).resolves.toBe("settled");

  expect(session.wheelPreviewTotalSpins).toBe(1);
  expect(root.spinWheel).toHaveBeenCalledOnce();
  expect(root.revealMysteryGridCell).toHaveBeenCalledWith(2);
});
