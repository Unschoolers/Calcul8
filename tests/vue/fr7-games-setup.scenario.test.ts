import { readFileSync } from "node:fs";
import { fireEvent, screen, within } from "@testing-library/vue";
import { expect, test } from "vitest";
import { defineComponent, h, nextTick, provide, reactive } from "vue";
import { translateAppMessage } from "../../src/app-core/i18n/index.ts";
import { GameWindow } from "../../src/components/windows/game/GameWindow.ts";
import { wheelConfigMethods } from "../../src/components/windows/game/commands/wheelConfigMethods.ts";
import { createGameController } from "../../src/components/windows/game/coordinator/gameControllerState.ts";
import { gameStageComputeds } from "../../src/components/windows/game/stage/gameStageComputeds.ts";
import WheelStageSummary from "../../src/components/windows/game/stage/WheelStageSummary.vue";
import WheelSessionPanel from "../../src/components/windows/game/inspector/WheelSessionPanel.vue";
import { wheelConfigComputeds } from "../../src/components/windows/game/inspector/wheelConfigComputeds.ts";
import { wheelSessionComputeds } from "../../src/components/windows/game/inspector/wheelSessionComputeds.ts";
import { gameControllerKey } from "../../src/components/windows/game/coordinator/gameContext.ts";
import WheelTierCard from "../../src/components/windows/game/inspector/WheelTierCard.vue";
import { createGameHostState } from "../../src/components/windows/game/services/gameHostState.ts";
import { createWheelControllerState } from "../../src/components/windows/game/services/gameSessionState.ts";
import { getWheelTierInventoryMeta } from "../../src/components/windows/game/services/wheelSaleSupport.ts";
import type { Lot, WheelTier } from "../../src/types/app.ts";
import { renderWithApp } from "./render.ts";

const frCopy = {
  wheelBuilderLabel: "Configuration",
  wheelInspectorBuilderTabLabel: "Configuration",
  wheelBuilderPendingHelp: "Reconstruisez le jeu pour appliquer les modifications.",
  wheelBuilderReadyHelp: "La configuration est prête à être appliquée.",
  wheelAutospinStartAction: "Démarrer l’aperçu automatique",
  wheelAutospinStopAction: "Arrêter l’aperçu automatique",
  wheelCloseDetailsAction: "Fermer les détails du jeu",
  wheelConfigModeLabel: "Configuration",
  wheelLiveModeLabel: "En direct",
  wheelCreateGridBody: "Révélez des cases cachées à partir des mêmes prix et probabilités que la roue.",
  wheelCreateWheelBody: "Définissez les prix et leurs probabilités, puis faites tourner la roue.",
  wheelGameTypeGridLabel: "Grille mystère",
  wheelGoLiveAction: "Passer en direct",
  wheelGoLiveTitle: "Passer en direct?",
  wheelGoLiveBody: "Passez en direct pour suivre la progression de la session et enregistrer les ventes.",
  wheelMotionReduceLabel: "Réduire les animations",
  wheelPresentationModeLabel: "Mode présentation",
  wheelPresentationToggleLabel: "Afficher la configuration et le suivi",
  wheelSourceDetailItem: "Source d’items • {{count}} par gain",
  wheelSourceDetailSingles: "Source d’items",
  wheelInspectorNoSourceTitle: "Non assigné",
  wheelSourceSinglesOptionsLeft: "{{count}} item{{suffix}} listé{{suffix}} dans le lot • aucun item précis lié",
  wheelTierChaseLabel: "Prix vedette (chase)",
  wheelTierChaseHelp: "Signaler ce palier comme prix vedette lorsqu’il est obtenu.",
  wheelTierBasicsSectionSubtitle: "Définissez le nom affiché, la quantité remise et le coût de ce palier.",
  wheelTierCelebrationSectionTitle: "Célébration",
  wheelTierCelebrationSectionSubtitle: "Choisissez les effets visuels et le statut de prix vedette de ce palier.",
  wheelTierCelebrationEmojiHint: "Une pluie d’émojis lorsque ce palier est obtenu, par exemple 🎉, 🔥 ou 💎.",
  wheelTierCelebrationEmojiLabel: "Émoji de célébration",
  wheelTierCountField: "Quantité",
  wheelTierCountHint: "Nombre d’items remis pour ce prix",
  wheelTierCountSinglesHint: "Un palier d’items individuels remet toujours 1 item par gain.",
  wheelTierEditorSubtitle: "Ajustez la quantité, la source et les options du prix.",
  wheelTierLabelField: "Nom affiché",
  wheelTierPrizeItemLabel: "Item à gagner",
  wheelTierSourceSectionSubtitle: "Associez ce palier à un lot. Pour les items individuels, choisissez l’item à gagner.",
  wheelOddsSubtitle: "Définissez la probabilité de chaque palier. Une modification rééquilibre les autres pour conserver un total de 100 %.",
  wheelOddsTierChanceLabel: "Probabilité de {{label}}",
  wheelInspectorAssignSourceDetail: "Choisissez un lot source dans l’éditeur des paliers.",
  wheelInspectorConfigTitle: "Configuration du jeu",
  wheelInspectorConfigSubtitle: "Définissez les paliers, leurs sources et leurs probabilités.",
  wheelInspectorGridConfigTitle: "Configuration de la grille mystère",
  wheelInspectorGridConfigSubtitle: "Définissez les prix, leurs sources et leurs probabilités.",
  wheelInspectorEmptyState: "Créez un jeu pour commencer.",
  wheelInspectorActiveWheelLabel: "Nom du jeu",
  wheelStageCaptionLive: "Jouez en direct et enregistrez les ventes.",
  wheelStageTitleFallback: "Scène du jeu",
  wheelCompactProfitCostLabel: "Profit/coût",
  wheelStageExpectedMarginLabel: "Profit prévu (% du coût)",
  wheelSessionMarginLabel: "Profit de la session (% du coût)",
  wheelGrossProfitLabel: "Profit de la session",
  wheelRevenueLabel: "Revenu brut",
  wheelLiveRevenueMeta: "${{amount}} de revenu brut",
  wheelLivePrizeCostMeta: "${{amount}} de coût des prix",
  wheelExpectedMarginPositive: "Le profit prévu atteint ou dépasse le seuil de rentabilité.",
  wheelExpectedMarginNegative: "Le profit prévu est sous le seuil de rentabilité.",
  wheelSessionAboveTarget: "+{{diff}} points au-dessus de la cible de {{target}} %",
  wheelSessionBelowTarget: "{{diff}} points sous la cible de {{target}} %",
  wheelTierPerWinMeta: "{{count}} par gain",
  wheelMultiLotInventoryMeta: "{{count}} item{{itemSuffix}} restant{{itemSuffix}} dans {{lotCount}} lot{{lotSuffix}} • {{perHit}} par gain"
} as const;

const expectedNewEnglish = {
  wheelCompactProfitCostLabel: "Margin",
  wheelTierPerWinMeta: "{{count}} per hit",
  wheelMultiLotInventoryMeta: "{{count}} item{{itemSuffix}} left across {{lotCount}} lot{{lotSuffix}} • {{perHit}} per hit"
} as const;

function tier(overrides: Partial<WheelTier> = {}): WheelTier {
  return {
    id: "tier-1",
    label: "Prize",
    color: "#f0a500",
    slots: 1,
    costPerTier: 5,
    packsCount: 2,
    deductionType: "packs",
    sets: [],
    ...overrides
  };
}

function renderEligibleTierEditor(eligible: WheelTier) {
  const config = {
    id: 91,
    name: "FR7 wheel",
    gameType: "wheel" as const,
    spinPrice: 10,
    targetMargin: 20,
    createdAt: "",
    tiers: [eligible]
  };
  const context = reactive({
    ...createGameHostState(),
    ...createWheelControllerState(),
    preferredLanguage: "fr-CA",
    editingWheelConfig: config,
    wheelDisplayConfig: config,
    lots: [{
      id: 3,
      name: "Singles",
      lotType: "singles" as const,
      singlesPurchases: [{ id: 5, item: "Card", quantity: 2, cost: 5 }]
    }],
    currentLotId: 3,
    t: (key: string, params?: Record<string, string | number | null | undefined>) =>
      translateAppMessage("fr-CA", key as never, params),
    canTierBeChase: (tierValue: WheelTier) => wheelConfigMethods.canTierBeChase.call(context as never, tierValue),
    toggleTierChase: (tierValue: WheelTier) => wheelConfigMethods.toggleTierChase.call(context as never, tierValue),
    isBoundLotSingles: (tierValue: WheelTier) => wheelConfigMethods.isBoundLotSingles.call(context as never, tierValue),
    getTierInventoryMeta: (tierValue: WheelTier) => getWheelTierInventoryMeta(context as never, tierValue),
    getSinglesItemsForTier: () => [{ title: "Card", value: 5 }],
    applyWheelConfig: () => undefined,
    removeTier: () => undefined
  });
  const ProvidedTierCard = defineComponent({
    setup() {
      provide(gameControllerKey, createGameController(context as never));
      return () => h(WheelTierCard, { tier: eligible, tierIndex: 0 });
    }
  });
  renderWithApp(ProvidedTierCard);
  return context;
}

test("FR7 active wheel copy matches the approved French glossary and preserves EN keys and parameters", () => {
  const english = JSON.parse(readFileSync("src/app-core/i18n/locales/en/wheel.json", "utf8")) as Record<string, string>;
  const french = JSON.parse(readFileSync("src/app-core/i18n/locales/fr/wheel.json", "utf8")) as Record<string, string>;
  const params = {
    amount: "10.00", count: 2, suffix: "s", label: "Prize", diff: "5", target: "20",
    itemSuffix: "s", lotCount: 2, lotSuffix: "s", perHit: 2
  };

  expect(Object.keys(french).sort()).toEqual(Object.keys(english).sort());
  for (const [key, expected] of Object.entries(frCopy)) {
    expect(translateAppMessage("fr-CA", key, params)).toBe(expected.replace(/{{(\w+)}}/g, (_match, name: keyof typeof params) => String(params[name])));
  }
  for (const [key, expected] of Object.entries(expectedNewEnglish)) {
    expect(english[key]).toBe(expected);
  }
  for (const [key, value] of Object.entries(english)) {
    const placeholders = (text: string) => [...text.matchAll(/{{(\w+)}}/g)].map((match) => match[1]).sort();
    expect([...new Set(placeholders(french[key]!))].sort()).toEqual([...new Set(placeholders(value))].sort());
  }
});

test("the GameWindow compact margin getter uses preferred-language copy", () => {
  const getter = GameWindow.computed!.wheelCompactStageSummaryLabel;
  expect(getter.call({ preferredLanguage: "fr-CA" } as never)).toBe("Profit/coût");
  expect(getter.call({ preferredLanguage: "en" } as never)).toBe("Margin");
  expect(getter.call({ preferredLanguage: "" } as never)).toBe("Margin");
});

test("French and English wheel copy uses the real translator and English remains the default", () => {
  expect(translateAppMessage("fr-CA", "wheelBuilderLabel")).toBe("Configuration");
  expect(translateAppMessage("en", "wheelBuilderLabel")).toBe("Builder");
  expect(translateAppMessage("", "wheelBuilderLabel")).toBe("Builder");
  expect(translateAppMessage("en", "wheelTierChaseLabel")).toBe("Chase tier");
  expect(translateAppMessage("", "wheelTierChaseLabel")).toBe("Chase tier");
  expect(translateAppMessage("en", "wheelTierPerWinMeta", { count: 2 })).toBe("2 per hit");
});

test("the real tier editor shows the approved French chase label in its celebration section", async () => {
  const eligible = tier({
    deductionType: "singles",
    boundLotId: 3,
    boundSinglesId: 5,
    packsCount: 1
  });

  renderEligibleTierEditor(eligible);
  await fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
  expect(screen.getByText("Prix vedette (chase)")).toBeVisible();
});

test("the real tier editor emits the chase command only for a linked singles item", async () => {
  const eligible = tier({ deductionType: "singles", boundLotId: 3, boundSinglesId: 5, packsCount: 1 });
  const context = renderEligibleTierEditor(eligible);
  await fireEvent.click(screen.getByRole("button", { name: "Modifier" }));
  const switchControl = screen.getByRole("checkbox");
  expect(switchControl).toBeEnabled();
  await fireEvent.click(switchControl);
  await fireEvent.click(screen.getByRole("button", { name: "Termine" }));
  expect(eligible.isChase).toBe(true);

  const unlinked = tier({ deductionType: "singles", boundLotId: 3, boundSinglesId: null });
  expect(wheelConfigMethods.canTierBeChase.call(context as never, unlinked)).toBe(false);
  wheelConfigMethods.toggleTierChase.call(context as never, unlinked);
  expect(unlinked.isChase).toBe(false);

  renderEligibleTierEditor(unlinked);
  await fireEvent.click(screen.getAllByRole("button", { name: "Modifier" })[1]!);
  expect(screen.getByRole("checkbox")).toBeDisabled();
});

test("wheel inventory metadata translates per-win and multi-lot summaries and retains exhausted listed sources", () => {
  const oneLot = { id: 1, name: "Lot", lotType: "bulk", boxesPurchased: 2, packsPerBox: 10 } as Lot;
  const lotTwo = { id: 2, name: "Lot two", lotType: "bulk", boxesPurchased: 0, packsPerBox: 20 } as Lot;
  const context = { preferredLanguage: "fr-CA", currentLotId: 1, lots: [oneLot, lotTwo], sales: [] };
  const simple = getWheelTierInventoryMeta(context, tier({ boundLotId: 1, packsCount: 2 }));
  expect(simple).toEqual({ text: "20 items restants • 2 par gain", warning: false });

  const multi = getWheelTierInventoryMeta(context, tier({ boundLotId: null, boundLotIds: [1, 2], packsCount: 2 }));
  expect(multi).toEqual({ text: "20 items restants dans 2 lots • 2 par gain", warning: false });

  const singlesLot = {
    id: 3,
    name: "Singles",
    lotType: "singles",
    singlesPurchases: [{ id: 5, item: "Card", quantity: 20, cost: 2 }]
  } as Lot;
  const singlesContext = { preferredLanguage: "fr-CA", currentLotId: 3, lots: [singlesLot], sales: [] };
  expect(getWheelTierInventoryMeta(singlesContext, tier({
    deductionType: "singles",
    boundLotId: 3,
    boundSinglesId: 5,
    packsCount: 1
  }))).toEqual({ text: "20 items restants • 1 par gain", warning: false });
  expect(getWheelTierInventoryMeta(singlesContext, tier({
    deductionType: "singles",
    boundLotId: 3,
    boundSinglesId: null
  }))).toEqual({ text: "1 item listé dans le lot • aucun item précis lié", warning: false });

  const exhaustedSingleSource = {
    id: 4,
    name: "Exhausted singles",
    lotType: "singles",
    singlesPurchases: [{ id: 6, item: "Sold card", quantity: 0, cost: 2 }]
  } as Lot;
  expect(getWheelTierInventoryMeta({ preferredLanguage: "fr-CA", currentLotId: 4, lots: [exhaustedSingleSource], sales: [] }, tier({
    deductionType: "singles",
    boundLotId: 4,
    boundSinglesId: null
  }))).toEqual({ text: "1 item listé dans le lot • aucun item précis lié", warning: false });
});

test.each([
  ["fr-CA", 0, "0 items restants • 1 par gain", true],
  ["fr-CA", 1, "1 item restant • 1 par gain", true],
  ["fr-CA", 2, "2 items restants • 1 par gain", false],
  ["en", 0, "0 items left • 1 per hit", true],
  ["en", 1, "1 item left • 1 per hit", true],
  ["en", 2, "2 items left • 1 per hit", false],
  ["", 0, "0 items left • 1 per hit", true],
  ["", 1, "1 item left • 1 per hit", true],
  ["", 2, "2 items left • 1 per hit", false]
] as const)("simple bulk inventory preserves %s copy, the %s item threshold and warning", (language, quantity, text, warning) => {
  const lot = { id: 11, name: "Stock", lotType: "bulk", boxesPurchased: quantity, packsPerBox: 1 } as Lot;
  const result = getWheelTierInventoryMeta({ preferredLanguage: language, currentLotId: 11, lots: [lot], sales: [] }, tier({ boundLotId: 11, packsCount: 1 }));
  expect(result).toEqual({ text, warning });
  expect(result?.text).not.toMatch(/{{\w+}}/);
});

test.each([
  ["fr-CA", 0, "0 items restants dans 2 lots • 1 par gain", true],
  ["fr-CA", 1, "1 item restant dans 2 lots • 1 par gain", false],
  ["fr-CA", 2, "2 items restants dans 2 lots • 1 par gain", false],
  ["en", 0, "0 items left across 2 lots • 1 per hit", true],
  ["en", 1, "1 item left across 2 lots • 1 per hit", false],
  ["en", 2, "2 items left across 2 lots • 1 per hit", false],
  ["", 0, "0 items left across 2 lots • 1 per hit", true],
  ["", 1, "1 item left across 2 lots • 1 per hit", false],
  ["", 2, "2 items left across 2 lots • 1 per hit", false]
] as const)("multi-lot inventory preserves %s copy and the %s item warning boundary", (language, quantity, text, warning) => {
  const first = { id: 21, name: "Stock one", lotType: "bulk", boxesPurchased: quantity, packsPerBox: 1 } as Lot;
  const second = { id: 22, name: "Stock two", lotType: "bulk", boxesPurchased: 0, packsPerBox: 1 } as Lot;
  const result = getWheelTierInventoryMeta({ preferredLanguage: language, currentLotId: 21, lots: [first, second], sales: [] }, tier({ boundLotId: null, boundLotIds: [21, 22], packsCount: 1 }));
  expect(result).toEqual({ text, warning });
  expect(result?.text).not.toMatch(/{{\w+}}/);
});

test("the stage summary labels real expected and session money values in French", async () => {
  const config = {
    id: 91,
    name: "Finance wheel",
    gameType: "wheel" as const,
    spinPrice: 10,
    targetMargin: 20,
    createdAt: "",
    tiers: [{
      id: "tier-1",
      label: "Prize",
      color: "#f0a500",
      slots: 1,
      costPerTier: 5,
      packsCount: 1,
      deductionType: "packs" as const,
      boundLotId: 1,
      boundLotIds: [1],
      sets: []
    }]
  };
  const feeLot = {
    id: 1,
    name: "Bulk lot",
    lotType: "bulk" as const,
    boxesPurchased: 0,
    packsPerBox: 0,
    sellingShippingPerOrder: 0,
    sellingTaxPercent: 0,
    platformFeePercent: 10,
    additionalFeePercent: 0,
    additionalFeeAppliesTo: "sale_only" as const,
    fixedFeePerOrder: 0
  };
  const context = reactive({
    ...createWheelControllerState(),
    preferredLanguage: "fr-CA",
    wheelMode: "config" as "config" | "live",
    wheelPresentationMode: false,
    wheelIsCompactLayout: false,
    editingWheelConfig: config,
    wheelDisplayConfig: config,
    activeWheelConfig: config,
    lots: [feeLot],
    currentLotId: 1,
    whatnotFeeSummary: null,
    activeWheelSlots: [{ tier: "tier-1", cost: 5 }],
    wheelDisplaySlots: [{ tier: "tier-1", cost: 5 }],
    wheelSpinCounts: [1],
    wheelTotalSpins: 1,
    wheelSessionNetRevenue: 9,
    wheelSessionCostAdjustment: 0
  });
  Object.defineProperties(context, {
    canApplyWheelConfig: {
      configurable: true,
      get: () => wheelConfigComputeds.canApplyWheelConfig.call(context as never)
    },
    expectedMarginDisplay: {
      configurable: true,
      get: () => wheelConfigComputeds.expectedMarginDisplay.call(context as never)
    },
    expectedMarginColor: {
      configurable: true,
      get: () => wheelConfigComputeds.expectedMarginColor.call(context as never)
    },
    expectedMarginHint: {
      configurable: true,
      get: () => wheelConfigComputeds.expectedMarginHint.call(context as never)
    },
    wheelSessionRevenue: {
      configurable: true,
      get: () => wheelSessionComputeds.wheelSessionRevenue.call(context as never)
    },
    wheelSessionCost: {
      configurable: true,
      get: () => wheelSessionComputeds.wheelSessionCost.call(context as never)
    },
    wheelSessionProfitDisplay: {
      configurable: true,
      get: () => wheelSessionComputeds.wheelSessionProfitDisplay.call(context as never)
    },
    wheelSessionProfitClass: {
      configurable: true,
      get: () => wheelSessionComputeds.wheelSessionProfitClass.call(context as never)
    },
    wheelSessionMarginDisplay: {
      configurable: true,
      get: () => wheelSessionComputeds.wheelSessionMarginDisplay.call(context as never)
    },
    wheelSessionMarginColor: {
      configurable: true,
      get: () => wheelSessionComputeds.wheelSessionMarginColor.call(context as never)
    },
    wheelSessionMarginHint: {
      configurable: true,
      get: () => wheelSessionComputeds.wheelSessionMarginHint.call(context as never)
    },
    wheelStageSummaryCards: {
      configurable: true,
      get: () => gameStageComputeds.wheelStageSummaryCards.call(context as never)
    }
  });

  const renderSummary = () => renderWithApp(WheelStageSummary, {
    props: { ctx: context },
    global: { provide: { gameCtx: context } }
  });
  renderSummary();
  const expectedMarginCard = [...document.querySelectorAll(".wheel-stage-summary-card")].find((card) =>
    card.querySelector(".wheel-stage-summary-card__label")?.textContent?.trim() === "Profit prévu (% du coût)"
  );
  expect(expectedMarginCard).toBeDefined();
  expect(within(expectedMarginCard as HTMLElement).getByText("80.0%")).toBeVisible();
  expect(screen.getByText("La configuration est prête à être appliquée.")).toBeVisible();

  context.wheelMode = "live";
  await nextTick();
  const liveCards = [...document.querySelectorAll(".wheel-stage-summary-card")];
  const spinsCard = liveCards.find((card) => card.querySelector(".wheel-stage-summary-card__label")?.textContent?.trim() === "Parties");
  const profitCard = liveCards.find((card) => card.querySelector(".wheel-stage-summary-card__label")?.textContent?.trim() === "Profit de la session");
  const marginCard = liveCards.find((card) => card.querySelector(".wheel-stage-summary-card__label")?.textContent?.trim() === "Profit de la session (% du coût)");
  expect(spinsCard).toBeDefined();
  expect(profitCard).toBeDefined();
  expect(marginCard).toBeDefined();
  expect(within(spinsCard as HTMLElement).getByText("$10.00 de revenu brut")).toBeVisible();
  const stageProfit = within(profitCard as HTMLElement);
  expect(stageProfit.getByText("$4.00")).toBeVisible();
  expect(stageProfit.getByText("$5.00 de coût des prix")).toBeVisible();
  expect(within(marginCard as HTMLElement).getByText("80.0%")).toBeVisible();

  const sessionPanel = renderWithApp(WheelSessionPanel, {
    props: { ctx: context },
    global: { provide: { gameCtx: context } }
  });
  const sessionRoot = sessionPanel.container as HTMLElement;
  const statsAndMargins = [...sessionRoot.querySelectorAll(".v-card")];
  const panelCard = (labelText: string) => {
    const card = statsAndMargins.find((candidate) => [...candidate.querySelectorAll("*")]
      .some((element) => element.children.length === 0 && element.textContent?.trim() === labelText));
    expect(card).toBeDefined();
    return within(card as HTMLElement);
  };
  expect(panelCard("Revenu brut").getByText("$10.00")).toBeVisible();
  expect(panelCard("Coût des prix").getByText("$5.00")).toBeVisible();
  expect(panelCard("Profit de la session").getByText("$4.00")).toBeVisible();
  expect(panelCard("Profit de la session (% du coût)").getByText("80.0%")).toBeVisible();

  context.activeWheelSlots = [{ tier: "tier-1", cost: 0 }];
  context.wheelDisplaySlots = [{ tier: "tier-1", cost: 0 }];
  await nextTick();
  expect(within(marginCard as HTMLElement).getByText("—")).toBeVisible();
  expect(panelCard("Profit de la session (% du coût)").getByText("—")).toBeVisible();
});
