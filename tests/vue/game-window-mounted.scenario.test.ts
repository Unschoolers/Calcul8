import { fireEvent, screen, waitFor, within } from "@testing-library/vue";
import { defineComponent, h, nextTick, reactive, type Component } from "vue";
import { afterEach, expect, test, vi } from "vitest";
import { createInitialState } from "../../src/app-core/state.ts";
import { createGameWindowState } from "../../src/components/windows/game/coordinator/gameControllerState.ts";
import { gameCoordinatorPortsKey, createGameCoordinatorPorts } from "../../src/components/windows/game/coordinator/gameCoordinatorPorts.ts";
import GameWindow from "../../src/components/windows/game/GameWindow.vue";
import { translateAppMessage } from "../../src/app-core/i18n/index.ts";
import { createShellActionPresence, shellActionPresenceKey } from "../../src/components/shell/shellActionPresence.ts";
import { renderWithApp } from "./render.ts";
import type { WheelConfig } from "../../src/types/app.ts";
import { buildSlotsFromConfig } from "../../src/components/windows/game/services/wheelSlots.ts";
import { vuetify } from "../../src/vuetify.ts";

const shellActionZone = document.createElement("div");
shellActionZone.className = "app-shell-action-zone";
document.body.append(shellActionZone);
const originalViewportWidth = window.innerWidth;

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: originalViewportWidth });
  vuetify.display.update();
  vi.unstubAllGlobals();
});

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

function renderGameWindow(gameType: "wheel" | "grid" | "bracket", language = "en", autospinEnabled = false, realTranslations = false, compactFeeFixture = false) {
  const vueWarnings: string[] = [];
  const vueErrors: string[] = [];
  const config = gameConfig(gameType);
  const context = reactive({
    ...createInitialState(),
    preferredLanguage: language,
    currentTab: "config",
    currentLotId: 1,
    hasLotSelected: true,
    lots: [{
      id: 1,
      name: "Bulk lot",
      lotType: "bulk" as const,
      boxesPurchased: 1,
      packsPerBox: 9,
      ...(compactFeeFixture ? {
        feeProfilePreset: "whatnot" as const,
        platformFeePercent: 8,
        additionalFeePercent: 2.9,
        additionalFeeAppliesTo: "sale_only" as const,
        fixedFeePerOrder: 0.3,
        sellingShippingPerOrder: 0,
        sellingTaxPercent: 0
      } : {})
    }],
    wheelConfigs: [config],
    activeWheelConfigId: 91,
    visibleShellContextActionIds: [] as string[],
    t: (key: string, params?: Record<string, string | number | null | undefined>) =>
      language === "en" && !realTranslations ? key : translateAppMessage(language, key as never, params)
  });
  const mountedGameWindow = defineComponent({
    extends: GameWindow,
    setup: GameWindow.setup,
    data: () => ({
      ...createGameWindowState(),
      editingWheelConfig: config,
      wheelAutospinEnabled: autospinEnabled,
      wheelViewportWidth: window.innerWidth,
      wheelConfigSavedSnackbar: false
    }),
    methods: {
      drawWheel: vi.fn(),
      refreshWheelCanvas: vi.fn()
    }
  }) as Component;

  let gameWindowInstance: Record<string, unknown> | null = null;
  const Host = defineComponent({
    setup() {
      return () => h(mountedGameWindow, {
        ref: (instance: unknown) => { if (instance) gameWindowInstance = instance as Record<string, unknown>; }
      });
    }
  });
  const view = renderWithApp(Host, {
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
  return { view, context, vueWarnings, vueErrors, gameWindowInstance: () => gameWindowInstance };
}

test("mounted GameWindow uses its provided controller for the wheel toolbar and create-game chooser", async () => {
  const { view, vueWarnings, vueErrors } = renderGameWindow("wheel");

  expect(view.container.querySelector(".wheel-stage-game-toolbar")).not.toBeNull();
  expect(view.container.querySelector(".wheel-outer")).not.toBeNull();
  expect(view.container.querySelector(".wheel-tier-card")).not.toBeNull();
  const mobileEntryActions = view.container.querySelector(".wheel-stage-mobile-entry-actions");
  expect(mobileEntryActions).not.toBeNull();
  await fireEvent.click(within(mobileEntryActions as HTMLElement).getByRole("button", { name: "wheelInspectorNewGameAction" }));
  expect(await screen.findByRole("dialog", { name: "wheelCreateGameTitle" })).toBeTruthy();

  expect(vueWarnings).toEqual([]);
  expect(vueErrors).toEqual([]);
});

test("mounted GameWindow uses French mode copy and applies the requested live switch", async () => {
  const { view } = renderGameWindow("wheel", "fr-CA");

  expect(view.getByText("Configuration")).toBeVisible();
  expect(view.getByText("Aperçu du jeu sans enregistrer de ventes")).toBeVisible();
  await fireEvent.click(view.getByRole("button", { name: "En direct" }));
  const confirmation = await screen.findByRole("dialog", { name: "Passer en direct?" });
  expect(within(confirmation).getByText("Passez en direct pour suivre la progression de la session et enregistrer les ventes.")).toBeVisible();

  await fireEvent.click(within(confirmation).getByRole("button", { name: "Passer en direct" }));
  await waitFor(() => expect(view.container.querySelector(".wheel-layout--live")).not.toBeNull());
  expect(view.getByText("Jouez en direct et enregistrez les ventes.")).toBeVisible();
});

test.each([["en", "New game"], ["", "New game"]] as const)("mounted GameWindow renders localized %s copy with the real translator", (language, expectedLabel) => {
  const { view } = renderGameWindow("wheel", language, false, true);
  expect(view.getAllByRole("button", { name: expectedLabel })[0]).toBeVisible();
});

test.each([["fr-CA", "Profit/coût", "En direct", "Passer en direct?", "Passer en direct"], ["en", "Margin", "Live", "Go live?", "Go live"]] as const)("mounted compact wheel KPI renders %s copy and config/live values", async (language, expectedLabel, modeLabel, dialogTitle, confirmLabel) => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 700 });
  window.dispatchEvent(new Event("resize"));
  vuetify.display.update();

  const { view, gameWindowInstance } = renderGameWindow("wheel", language, false, true, true);
  try {
    await nextTick();
    const pill = view.container.querySelector(".wheel-stage-pill--kpi");
    expect(pill).not.toBeNull();
    expect(within(pill as HTMLElement).getByText(expectedLabel)).toBeVisible();
    expect(within(pill as HTMLElement).getByText("330.5%")).toBeVisible();

    await fireEvent.click(view.getByRole("button", { name: modeLabel }));
    const confirmation = await screen.findByRole("dialog", { name: dialogTitle });
    await fireEvent.click(within(confirmation).getByRole("button", { name: confirmLabel }));
    await waitFor(() => expect(view.container.querySelector(".wheel-layout--live")).not.toBeNull());
    const liveState = gameWindowInstance()!;
    liveState.wheelTotalSpins = 1;
    liveState.wheelSpinCounts = [1];
    liveState.wheelSessionNetRevenue = 10;
    liveState.activeWheelSlots = [{ tier: "tier-1", cost: 2 }];
    await nextTick();
    const livePill = view.container.querySelector(".wheel-stage-pill--kpi");
    expect(livePill).not.toBeNull();
    expect(within(livePill as HTMLElement).getByText(expectedLabel)).toBeVisible();
    expect(within(livePill as HTMLElement).getByText("400.0%")).toBeVisible();
  } finally {
    view.unmount();
  }
});

test.each(["wheel", "grid"] as const)("mounted %s action rail labels automatic preview start and stop", async (gameType) => {
  const start = renderGameWindow(gameType, "fr-CA");
  expect(start.view.getByRole("button", { name: "Démarrer l’aperçu automatique" })).toBeVisible();
  start.view.unmount();

  const stop = renderGameWindow(gameType, "fr-CA", true);
  expect(stop.view.getByRole("button", { name: "Arrêter l’aperçu automatique" })).toBeVisible();
  stop.view.unmount();
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

test("mounted GameWindow renders the French chase decision and its future-game explanation", async () => {
  const { view, context, gameWindowInstance } = renderGameWindow("wheel", "fr-CA", false, true);
  const game = gameWindowInstance()!;
  const config = context.wheelConfigs[0] as WheelConfig;
  config.tiers[0] = {
    ...config.tiers[0]!,
    deductionType: "singles",
    boundLotId: 1,
    boundSinglesId: 17,
    isChase: true
  };
  context.lots = [{
    id: 1,
    name: "Singles lot",
    lotType: "singles",
    singlesPurchases: [{ id: 17, item: "Linked card", quantity: 2, cost: 2 }]
  }] as unknown as typeof context.lots;
  context.wheelPreviewSlots = buildSlotsFromConfig(config);
  const gameContext = (game.getWindowComponentContext as () => Record<string, unknown>)();
  gameContext.editingWheelConfig = config;
  (game.landOnSlot as (slotIndex: number, options: { recordSession: boolean }) => void)(0, { recordSession: false });
  await nextTick();

  expect(view.container.querySelectorAll(".wheel-lot-select-card").length).toBeGreaterThan(0);
  expect(view.getByText("Prix vedette obtenu.")).toBeVisible();
  expect(view.getByText("Ce choix détermine le prix proposé aux prochaines parties.")).toBeVisible();
  expect(view.getByRole("button", { name: "Garder" })).toBeEnabled();
  expect(view.getByRole("button", { name: "Remplacer" })).toBeVisible();
  view.unmount();
});
