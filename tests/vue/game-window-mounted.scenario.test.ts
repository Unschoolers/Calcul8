import { fireEvent, screen, waitFor } from "@testing-library/vue";
import { defineComponent, reactive, type Component } from "vue";
import { afterEach, expect, test, vi } from "vitest";
import { createInitialState } from "../../src/app-core/state.ts";
import { gameCoordinatorPortsKey, createGameCoordinatorPorts } from "../../src/components/windows/game/coordinator/gameCoordinatorPorts.ts";
import GameWindow from "../../src/components/windows/game/GameWindow.vue";
import { createShellActionPresence, shellActionPresenceKey } from "../../src/components/shell/shellActionPresence.ts";
import { renderWithApp } from "./render.ts";
import type { WheelConfig } from "../../src/types/app.ts";

const shellActionZone = document.createElement("div");
shellActionZone.className = "app-shell-action-zone";
document.body.append(shellActionZone);

afterEach(() => vi.restoreAllMocks());

function gameConfig(gameType: "wheel" | "grid" | "bracket"): WheelConfig {
  return {
    id: 91,
    name: `${gameType} game`,
    gameType,
    spinPrice: 10,
    targetMargin: 40,
    createdAt: "",
    tiers: [{
      id: "tier-1",
      label: "Prize",
      color: "#ff0000",
      slots: gameType === "grid" ? 100 : 1,
      costPerTier: 2,
      packsCount: 1,
      deductionType: "packs",
      sets: []
    }],
    ...(gameType === "grid" ? { outcomeCount: 100, gridCellCount: 100 } : {})
  };
}

function renderGameWindow(gameType: "wheel" | "grid" | "bracket") {
  const vueWarnings: string[] = [];
  const vueErrors: string[] = [];
  const config = gameConfig(gameType);
  const context = reactive({
    ...createInitialState(),
    currentTab: "config",
    currentLotId: 1,
    hasLotSelected: true,
    lots: [{ id: 1, name: "Bulk lot", lotType: "bulk" as const, boxesPurchased: 1, packsPerBox: 9 }],
    wheelConfigs: [config],
    activeWheelConfigId: 91,
    visibleShellContextActionIds: [] as string[],
    t: (key: string) => key
  });
  const mountedGameWindow = defineComponent({
    extends: GameWindow,
    setup: GameWindow.setup,
    data: () => ({ editingWheelConfig: config }),
    methods: {
      drawWheel: vi.fn(),
      refreshWheelCanvas: vi.fn()
    }
  }) as Component;

  const view = renderWithApp(mountedGameWindow, {
    global: {
      config: {
        warnHandler: (message, _instance, trace) => vueWarnings.push(`${message}\n${trace}`),
        errorHandler: (error, _instance, info) => vueErrors.push(`${String(error)} (${info})`)
      },
      provide: {
        [gameCoordinatorPortsKey as symbol]: createGameCoordinatorPorts(context as never),
        [shellActionPresenceKey as symbol]: createShellActionPresence(context)
      }
    }
  });
  return { view, context, vueWarnings, vueErrors };
}

test("mounted GameWindow uses its provided controller for the wheel toolbar and create-game chooser", async () => {
  const { view, vueWarnings, vueErrors } = renderGameWindow("wheel");

  expect(view.container.querySelector(".wheel-stage-game-toolbar")).not.toBeNull();
  expect(view.container.querySelector(".wheel-outer")).not.toBeNull();
  expect(view.container.querySelector(".wheel-tier-card")).not.toBeNull();
  await fireEvent.click(view.getByRole("button", { name: "wheelInspectorNewGameAction" }));
  expect(await screen.findByRole("dialog", { name: "wheelCreateGameTitle" })).toBeTruthy();

  expect(vueWarnings).toEqual([]);
  expect(vueErrors).toEqual([]);
});

test.each([
  ["grid", ".mystery-grid-stage"],
  ["bracket", ".bracket-battle-setup"]
] as const)("mounted GameWindow renders the real %s child tree", async (gameType, selector) => {
  const { view, vueWarnings, vueErrors } = renderGameWindow(gameType);
  expect(view.container.querySelector(selector)).not.toBeNull();
  if (gameType === "bracket") {
    expect(view.container.querySelector(".bracket-battle-builder")).not.toBeNull();
    expect(view.getByText("bracketBattleTitle")).toBeTruthy();
    expect(view.getAllByText("bracketBattleSetupTitle").length).toBeGreaterThan(0);
  } else {
    expect(view.container.querySelectorAll(".mystery-grid-cell")).toHaveLength(100);
    const firstCell = view.getByRole("button", { name: "1" });
    expect(firstCell).toBeEnabled();
    await fireEvent.click(firstCell);
    await waitFor(() => expect(firstCell).toHaveTextContent("Prize"));
  }
  expect(vueWarnings).toEqual([]);
  expect(vueErrors).toEqual([]);
});
