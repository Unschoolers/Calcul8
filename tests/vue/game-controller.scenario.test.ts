import { fireEvent, screen } from "@testing-library/vue";
import { defineComponent, h, provide, reactive } from "vue";
import { expect, test, vi } from "vitest";
import { createGameController } from "../../src/components/windows/game/coordinator/gameControllerState.ts";
import { gameControllerKey, useGameController } from "../../src/components/windows/game/coordinator/gameContext.ts";
import { createGameSessionFeatureState } from "../../src/app-core/feature-state/game-session-state.ts";
import { renderWithApp } from "./render.ts";

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

test("mounted nested game action uses the injected typed controller", async () => {
  const session = reactive(createGameSessionFeatureState());
  const revealMysteryGridCell = vi.fn(async (index: number) => {
    session.wheelPreviewTotalSpins += index;
  });
  const controller = createGameController({
    gameSessionFeatureState: session,
    revealMysteryGridCell,
    spinWheel: vi.fn(async () => undefined),
    requestWheelSessionEnd: vi.fn()
  } as never);
  const Child = defineComponent({
    setup() {
      return { game: useGameController() };
    },
    template: `<button aria-label="reveal cell" @click="game.commands.revealMysteryGridCell(3)">reveal</button>`
  });
  const Harness = defineComponent({
    setup() {
      provide(gameControllerKey, controller);
      return () => h(Child);
    }
  });

  renderWithApp(Harness);
  await fireEvent.click(screen.getByRole("button", { name: "reveal cell" }));

  expect(revealMysteryGridCell).toHaveBeenCalledWith(3);
  expect(session.wheelPreviewTotalSpins).toBe(3);
});
