import { fireEvent, screen } from "@testing-library/vue";
import { defineComponent, h, reactive } from "vue";
import { expect, test, vi } from "vitest";
import WheelInspector from "../../src/components/windows/game/inspector/WheelInspector.vue";
import { gameControllerKey } from "../../src/components/windows/game/coordinator/gameContext.ts";
import type { FocusedGameCommands, FocusedGameView, GameController } from "../../src/components/windows/game/gamePorts.ts";
import WheelActionRail from "../../src/components/windows/game/stage/WheelActionRail.vue";
import WheelStageTopbar from "../../src/components/windows/game/stage/WheelStageTopbar.vue";
import { createWheelControllerState } from "../../src/components/windows/game/services/gameSessionState.ts";
import { renderWithApp } from "./render.ts";

const translations: Record<string, string> = {
  wheelConfigModeLabel: "Config",
  wheelLiveModeLabel: "Live",
  wheelInspectorActiveWheelLabel: "Game",
  wheelInspectorNewGameAction: "New game",
  wheelInspectorEditWheelAction: "Edit game",
  wheelEffectsControlsLabel: "Effects",
  wheelEffectsToggleTitle: "Toggle sound",
  wheelPresentationToggleTitle: "Presentation",
  wheelGameActionsLabel: "Game actions",
  wheelStageSlotsLabel: "9 slots",
  wheelStageSpinPriceLabel: "$5 per spin",
  gameSpectatorActionLabel: "Spectator"
};

function makeGameContext(overrides: { activeWheelConfig?: { id: number; name: string; spinPrice: number; tiers: never[] } | null; wheelConfigItems?: Array<{ title: string; value: number }> } = {}) {
  const context = reactive({
    ...createWheelControllerState(),
    wheelPresentationMode: false,
    wheelMode: "config" as "config" | "live",
    wheelIsCompactLayout: false,
    wheelStageSlotsLabel: "9 slots",
    wheelStageSpinPriceLabel: "$5 per spin",
    wheelStageTitle: "Lucky draw",
    wheelCompactStageSummaryLabel: "",
    wheelCompactStageSummaryValue: "",
    wheelCompactStageSummaryColor: "",
    wheelConfigItems: overrides.wheelConfigItems ?? [{ title: "Lucky draw", value: 11 }],
    activeWheelConfigId: 11,
    activeWheelConfig: { id: 11, name: "Lucky draw", spinPrice: 5, tiers: [] } as { id: number; name: string; spinPrice: number; tiers: never[] } | null,
    wheelDisplayConfig: null,
    wheelSoundEnabled: true,
    wheelReducedMotion: false,
    wheelSoundToggleTitle: "Toggle sound",
    wheelMotionToggleTitle: "Toggle motion",
    gameSpectatorSessionId: null,
    gameSpectatorSessionStatus: "inactive",
    gameSpectatorActionLabel: "Spectator",
    t: (key: string) => translations[key] ?? key,
    openWheelCreateDialog: vi.fn(),
    openWheelManageDialog: vi.fn(),
    toggleWheelSound: vi.fn(),
    toggleWheelReducedMotion: vi.fn(),
    handleWheelModeChange: vi.fn<(mode: "config" | "live") => void>(),
    openGameSpectatorDialog: vi.fn(),
  });
  if (overrides.activeWheelConfig !== undefined) context.activeWheelConfig = overrides.activeWheelConfig;
  context.handleWheelModeChange.mockImplementation((mode) => { context.wheelMode = mode; });
  return context;
}

function makeController(context: object, commands: Partial<FocusedGameCommands> = {}): GameController {
  const ports: FocusedGameCommands = {
    applyWheelConfig: vi.fn(),
    canTierBeChase: vi.fn(() => false),
    getSinglesItemsForTier: vi.fn(() => []),
    getTierInventoryMeta: vi.fn(() => null),
    handleWheelModeChange: vi.fn(),
    isBoundLotSingles: vi.fn(() => false),
    onTierMultiLotChange: vi.fn(),
    onTierPacksChange: vi.fn(),
    onTierSinglesChange: vi.fn(),
    openGameSpectatorDialog: vi.fn(),
    openWheelCreateDialog: vi.fn(),
    openWheelManageDialog: vi.fn(),
    removeTier: vi.fn(),
    toggleTierChase: vi.fn(),
    toggleWheelReducedMotion: vi.fn(),
    toggleWheelSound: vi.fn(),
    ...commands
  };
  return {
    session: createWheelControllerState(),
    view: context as unknown as FocusedGameView,
    commands: ports
  };
}

function renderTopbar(context: ReturnType<typeof makeGameContext>) {
  return renderWithApp(WheelStageTopbar, {
    global: { provide: { [gameControllerKey]: makeController(context, {
      handleWheelModeChange: context.handleWheelModeChange,
      openGameSpectatorDialog: context.openGameSpectatorDialog,
      openWheelCreateDialog: context.openWheelCreateDialog,
      openWheelManageDialog: context.openWheelManageDialog,
      toggleWheelReducedMotion: context.toggleWheelReducedMotion,
      toggleWheelSound: context.toggleWheelSound
    }) } }
  });
}

test("stage mode buttons switch the active mode through the game command", async () => {
  const context = makeGameContext();
  renderTopbar(context);

  await fireEvent.click(screen.getByRole("button", { name: "Live" }));
  expect(context.handleWheelModeChange).toHaveBeenCalledWith("live");
  expect(context.wheelMode).toBe("live");

  await fireEvent.click(screen.getByRole("button", { name: "Config" }));
  expect(context.handleWheelModeChange).toHaveBeenLastCalledWith("config");
  expect(context.wheelMode).toBe("config");
});

test("selecting another stage game updates the active id and displayed game name", async () => {
  const context = makeGameContext({
    wheelConfigItems: [
      { title: "Lucky draw", value: 11 },
      { title: "Mystery grid", value: 12 }
    ]
  });
  const view = renderTopbar(context);

  const gameSelect = screen.getByRole("combobox", { name: "Game" });
  await fireEvent.mouseDown(gameSelect);
  await fireEvent.click(gameSelect);
  await fireEvent.keyDown(gameSelect, { key: "ArrowDown" });
  await fireEvent.click(await screen.findByRole("option", { name: "Mystery grid" }));

  expect(context.activeWheelConfigId).toBe(12);
  expect(view.container.querySelector(".v-select__selection-text")).toHaveTextContent("Mystery grid");
});

test("stage game actions open create and edit flows, with edit disabled when there is no active game", async () => {
  const context = makeGameContext();
  const rendered = renderTopbar(context);

  await fireEvent.click(screen.getByRole("button", { name: "New game" }));
  await fireEvent.click(screen.getByRole("button", { name: "Edit game" }));
  expect(context.openWheelCreateDialog).toHaveBeenCalledOnce();
  expect(context.openWheelManageDialog).toHaveBeenCalledOnce();
  rendered.unmount();

  const noGame = makeGameContext({ activeWheelConfig: null });
  renderTopbar(noGame);
  expect(screen.getByRole("button", { name: "Edit game" })).toBeDisabled();
});

test("stage effects and spectator controls reach their commands and presentation toggle updates its view", async () => {
  const context = makeGameContext();
  const view = renderTopbar(context);

  await fireEvent.click(screen.getByRole("button", { name: "Toggle sound" }));
  await fireEvent.click(screen.getByRole("button", { name: "Toggle motion" }));
  await fireEvent.click(screen.getByRole("button", { name: "Spectator" }));
  await fireEvent.click(view.container.querySelector(".wheel-presentation-toggle")!);

  expect(context.toggleWheelSound).toHaveBeenCalledOnce();
  expect(context.toggleWheelReducedMotion).toHaveBeenCalledOnce();
  expect(context.openGameSpectatorDialog).toHaveBeenCalledOnce();
  expect(context.wheelPresentationMode).toBe(true);
  expect(screen.getByText("Lucky draw")).toBeVisible();
});

test("action rail invokes spin and reset only when their controls are enabled", async () => {
  const onSpin = vi.fn();
  const onReset = vi.fn();
  const Harness = defineComponent({
    setup() {
      return () => h(WheelActionRail, {
        primaryDisabled: false,
        primaryIcon: "mdi-play",
        primaryLabel: "Spin",
        resetDisabled: false,
        resetLabel: "Reset",
        showSecondary: false,
        onPrimarySpin: onSpin,
        onResetSession: onReset
      });
    }
  });
  const view = renderWithApp(Harness);
  await fireEvent.click(screen.getByRole("button", { name: "Spin" }));
  await fireEvent.click(screen.getByRole("button", { name: "Reset" }));
  expect(onSpin).toHaveBeenCalledOnce();
  expect(onReset).toHaveBeenCalledOnce();
  view.unmount();

  const blockedSpin = vi.fn();
  const blockedReset = vi.fn();
  const blockedAutospin = vi.fn();
  const BlockedHarness = defineComponent({
    setup() {
      return () => h(WheelActionRail, {
        primaryDisabled: true,
        primaryIcon: "mdi-play",
        primaryLabel: "Spin",
        resetDisabled: true,
        resetLabel: "Reset",
        showSecondary: true,
        secondaryDisabled: true,
        secondaryIcon: "mdi-autorenew",
        secondaryLabel: "Autospin",
        onPrimarySpin: blockedSpin,
        onResetSession: blockedReset,
        onSecondaryAction: blockedAutospin
      });
    }
  });
  const blocked = renderWithApp(BlockedHarness);
  (screen.getByRole("button", { name: "Spin" }) as HTMLButtonElement).click();
  (screen.getByRole("button", { name: "Reset" }) as HTMLButtonElement).click();
  (screen.getByRole("button", { name: "Autospin" }) as HTMLButtonElement).click();
  expect(screen.getByRole("button", { name: "Spin" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Autospin" })).toBeDisabled();
  expect(blockedSpin).not.toHaveBeenCalled();
  expect(blockedReset).not.toHaveBeenCalled();
  expect(blockedAutospin).not.toHaveBeenCalled();
  blocked.unmount();
});

function makeInspectorFixture(tabItems = [
  { id: "config", icon: "mdi-tune", label: "Builder" },
  { id: "session", icon: "mdi-chart-box-outline", label: "Session" },
  { id: "history", icon: "mdi-history", label: "History" }
]) {
  const config = {
    id: 11,
    name: "Lucky draw",
    gameType: "wheel" as const,
    outcomeCount: 9,
    spinPrice: 5,
    targetMargin: 20,
    createdAt: "",
    tiers: []
  };
  const context = reactive({
    ...createWheelControllerState(),
    wheelIsCompactLayout: false,
    wheelMobileInspectorOpen: false,
    wheelInspectorTab: "config",
    wheelInspectorPanelMeta: { icon: "mdi-tune", title: "Game config", subtitle: "Edit it" },
    wheelInspectorTabItems: tabItems,
    wheelDisplayConfig: config,
    editingWheelConfig: config,
    preferredLanguage: "en",
    lots: [],
    addTier: vi.fn(),
    t: (key: string) => ({
      wheelInspectorSpinPriceLabel: "Price per play",
      wheelInspectorOutcomeCountLabel: "Outcomes",
      wheelInspectorWheelTiersTitle: "Tiers",
      wheelOddsSubtitle: "Odds",
      wheelInspectorEmptyState: "Choose a game"
    }[key] ?? key),
    focusWheelInspector: vi.fn<(tab: "config" | "session" | "history") => void>(),
    closeWheelInspector: vi.fn(),
    requestWheelReset: vi.fn(),
    requestWheelSessionEnd: vi.fn()
  });
  context.focusWheelInspector.mockImplementation((tab) => { context.wheelInspectorTab = tab; });
  return { context, config };
}

function renderInspector(context: ReturnType<typeof makeInspectorFixture>["context"]) {
  return renderWithApp(WheelInspector, {
    props: { ctx: context },
    global: {
      provide: { [gameControllerKey]: makeController(context) },
      stubs: {
        WheelTierCard: { template: "<div />", props: ["tier", "tierIndex"] },
        WheelSessionPanel: { template: "<div data-testid='session-panel'>Session details</div>" },
        WheelHistoryPanel: { template: "<div data-testid='history-panel'>Spin history</div>" },
        BracketBattleBuilder: { template: "<div />" }
      }
    }
  });
}

test("inspector session and history tabs select their panels and dispatch focus commands", async () => {
  const { context } = makeInspectorFixture();
  renderInspector(context);

  await fireEvent.click(screen.getByRole("button", { name: "Session" }));
  expect(context.focusWheelInspector).toHaveBeenCalledWith("session");
  expect(screen.getByTestId("session-panel")).toBeVisible();
  await fireEvent.click(screen.getByRole("button", { name: "History" }));
  expect(context.focusWheelInspector).toHaveBeenLastCalledWith("history");
  expect(screen.getByTestId("history-panel")).toBeVisible();
});

test("inspector builder inputs update the selected game configuration", async () => {
  const { context } = makeInspectorFixture([]);
  renderInspector(context);

  await fireEvent.update(screen.getByRole("spinbutton", { name: "Price per play" }), "7.5");
  await fireEvent.update(screen.getByRole("spinbutton", { name: "Outcomes" }), "12");
  expect(context.editingWheelConfig.spinPrice).toBe(7.5);
  expect(context.editingWheelConfig.outcomeCount).toBe(12);
});
