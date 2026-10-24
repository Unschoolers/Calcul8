import { fireEvent, screen, within } from "@testing-library/vue";
import { expect, test } from "vitest";
import { defineComponent, h, nextTick, provide, reactive } from "vue";
import { translateAppMessage } from "../../src/app-core/i18n/index.ts";
import { createDefaultBracketBattleConfig } from "../../src/app-core/shared/bracket-battle-config.ts";
import BracketBattlePanel from "../../src/components/windows/game/bracket/BracketBattlePanel.vue";
import BracketBattleBuilder from "../../src/components/windows/game/bracket/BracketBattleBuilder.vue";
import WheelCreateGameDialog from "../../src/components/windows/game/dialogs/WheelCreateGameDialog.vue";
import { createGameController } from "../../src/components/windows/game/coordinator/gameControllerState.ts";
import { gameControllerKey } from "../../src/components/windows/game/coordinator/gameContext.ts";
import { createWheelControllerState } from "../../src/components/windows/game/services/gameSessionState.ts";
import { buildBracketBattlePrizeCatalog, createBracketBattleDraft, getBracketBattleDraftValidation } from "../../src/components/windows/game/bracket/bracketBattlePanelModel.ts";
import type { Lot, WheelConfig } from "../../src/types/app.ts";
import { renderWithApp } from "./render.ts";

function bracketContext(language: string) {
  const bracket = createDefaultBracketBattleConfig(4);
  const config: WheelConfig = {
    id: 91,
    name: "New Bracket Battle",
    gameType: "bracket",
    spinPrice: 10,
    targetMargin: 40,
    createdAt: "",
    tiers: [{
      id: "tier-1", label: "Prize", color: "#ff0000", slots: 1,
      costPerTier: 2, packsCount: 1, deductionType: "packs", sets: []
    }],
    bracketBattle: bracket
  };
  return reactive({
    preferredLanguage: language,
    lots: [{ id: 1, name: "Bulk lot", lotType: "bulk" as const, boxesPurchased: 1, packsPerBox: 9 }],
    wheelDisplayConfig: config,
    editingWheelConfig: config,
    wheelMode: "config",
    activeScopeType: "personal",
    activeWorkspaceId: null,
    activeWheelConfigId: config.id,
    wheelPresentationMode: false,
    wheelViewportWidth: 1280,
    t: (key: string, params?: Record<string, string | number | null | undefined>) =>
      translateAppMessage(language, key as never, params)
  });
}

function renderBracket(language: string) {
  const context = bracketContext(language);
  const view = renderWithApp(BracketBattlePanel, { props: { ctx: context } });
  return { ...view, context };
}

test("Bracket Battle prize catalog localizes generated metadata and retains English defaults", () => {
  const lots = [
    { id: 10, name: "Bulk Box", lotType: "bulk" },
    { id: 20, name: "Singles Tray", lotType: "singles", singlesPurchases: [{ id: 1, item: "", quantity: 1, cost: 1 }] }
  ] as Lot[];
  const frenchCatalog = buildBracketBattlePrizeCatalog(lots, "fr-CA");
  const englishCatalog = buildBracketBattlePrizeCatalog(lots);

  expect(frenchCatalog.map((entry) => [entry.subtitle, entry.title])).toEqual([
    ["Lot groupé", "Bulk Box"],
    ["Singles Tray", "Item individuel"]
  ]);
  expect(englishCatalog.map((entry) => [entry.subtitle, entry.title])).toEqual([
    ["Bulk lot", "Bulk Box"],
    ["Singles Tray", "Singles item"]
  ]);

});

test("Bracket Battle validation localizes buyer and match-prize requirements while retaining English defaults", () => {
  const draft = createBracketBattleDraft(4);
  expect(getBracketBattleDraftValidation(draft, "fr-CA").message).toBe("Ajoutez exactement 4 acheteurs.");
  expect(getBracketBattleDraftValidation(createBracketBattleDraft(4)).message).toBe("Add exactly 4 buyers.");
});

test("Bracket Battle validation localizes the match-prize requirement", () => {
  const draft = createBracketBattleDraft(4);
  draft.participants = ["A", "B", "C", "D"];
  draft.prizes[2]!.label = "";
  expect(getBracketBattleDraftValidation(draft, "fr-CA").message).toBe("Attribuez un prix à chacun des 3 matchs.");
});

test("mounted French Bracket Battle renders the localized buyer validation and disabled start action", async () => {
  const view = renderBracket("fr-CA");
  expect(view.getByText("Ajoutez exactement 4 acheteurs.")).toBeVisible();
  expect(view.getByRole("button", { name: "Démarrer le tournoi" })).toBeDisabled();
  view.unmount();
});

test.each([
  ["fr-CA", "L’ordre de départ des acheteurs est tiré au sort au début du tournoi.", "Aperçu du tournoi"],
  ["en", "Buyers enter in seed order before the live bracket begins.", "Bracket preview"],
  ["", "Buyers enter in seed order before the live bracket begins.", "Bracket preview"]
] as const)("mounted Bracket Battle renders %s preview copy with the real translator", (language, previewSubtitle, previewTitle) => {
  const view = renderBracket(language);

  if (language === "fr-CA") {
    expect(view.getByText("Placez les acheteurs et attribuez le prix prévu à chaque match du tournoi.")).toBeVisible();
  }
  expect(view.getByText(previewSubtitle)).toBeVisible();
  expect(view.getByRole("heading", { name: previewTitle })).toBeVisible();
  view.unmount();
});

test("mounted French bracket session renders the localized active match, roll action, and reset confirmation", async () => {
  const view = renderBracket("fr-CA");
  view.context.wheelDisplayConfig.bracketBattle!.participants = ["Alex", "Bri", "Cam", "Dev"];
  await nextTick();
  await fireEvent.click(view.container.querySelector(".bracket-battle-actions button")!);

  expect(view.getByText("Match en cours")).toBeVisible();
  expect(view.getByText("Prêt à lancer")).toBeVisible();
  expect(view.getByRole("button", { name: "Lancer les dés" })).toBeVisible();
  await fireEvent.click(view.container.querySelector(".bracket-battle-header-actions button")!);
  const dialog = await screen.findByRole("dialog", { name: "Réinitialiser la session Bracket Battle?" });
  expect(within(dialog).getByText("Cette action efface la session Bracket Battle en cours et son état enregistré sur cet appareil.")).toBeVisible();
});

test("mounted French BracketBattleBuilder passes the real game language into catalog options and preserves saved prize names", async () => {
  const bracket = createDefaultBracketBattleConfig(4);
  bracket.prizes[0]!.sourceType = "lot";
  bracket.prizes[1]!.label = "Étoile déjà nommée";
  const config: WheelConfig = {
    id: 92,
    name: "Saved bracket",
    gameType: "bracket",
    spinPrice: 10,
    targetMargin: 40,
    createdAt: "",
    tiers: [],
    bracketBattle: bracket
  };
  const context = reactive({
    ...createWheelControllerState(),
    editingWheelConfig: config,
    lots: [
      { id: 1, name: "Bulk Box", lotType: "bulk" as const, boxesPurchased: 1, packsPerBox: 9 },
      { id: 2, name: "Singles Tray", lotType: "singles" as const, singlesPurchases: [{ id: 7, item: "", cardNumber: "4/102", quantity: 1, cost: 2 }] }
    ],
    preferredLanguage: "fr-CA",
    t: (key: string, params?: Record<string, string | number | null | undefined>) =>
      translateAppMessage("fr-CA", key as never, params)
  });
  const Host = defineComponent({
    setup() {
      provide(gameControllerKey, createGameController(context as never));
      return () => h(BracketBattleBuilder);
    }
  });
  const view = renderWithApp(Host);

  expect(view.getByText("Ajoutez les acheteurs et choisissez le prix prévu pour chaque match.")).toBeVisible();
  expect(view.getAllByLabelText("Nom du prix")).toHaveLength(3);
  expect(view.getByDisplayValue("Étoile déjà nommée")).toBeVisible();
  await fireEvent.mouseDown(view.getByRole("combobox", { name: "Source du prix" }));
  expect(await screen.findByText("Lot groupé")).toBeVisible();
  const localizedFallback = await screen.findByText("Item individuel #4/102");
  await fireEvent.click(localizedFallback);
  expect(context.editingWheelConfig!.bracketBattle!.prizes[0]!.label).toBe("Item individuel #4/102");
  expect(context.editingWheelConfig!.bracketBattle!.prizes[1]!.label).toBe("Étoile déjà nommée");
});

test.each([
  ["fr-CA", "Faites jouer les acheteurs dans un tableau à élimination. Lancez les dés à chaque match pour déterminer qui remporte le prix prévu."],
  ["en", "Pair buyers in a bracket and roll each match for pre-assigned prizes."]
] as const)("mounted create-game dialog renders %s Bracket Battle description through the real translator", (language, expectedCopy) => {
  const context = reactive({
    wheelCreateDialog: true,
    wheelDisplayConfig: null,
    activeScopeType: "personal",
    activeWorkspaceId: null,
    activeWheelConfigId: null,
    wheelMode: "config",
    wheelPresentationMode: false,
    wheelViewportWidth: 1280,
    t: (key: string, params?: Record<string, string | number | null | undefined>) =>
      translateAppMessage(language, key as never, params),
    createNewGameConfig: () => undefined,
    closeWheelCreateDialog: () => undefined
  });
  const view = renderWithApp(WheelCreateGameDialog, { props: { ctx: context } });
  expect(view.getByText(expectedCopy)).toBeVisible();
});
