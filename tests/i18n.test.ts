import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test, vi } from "vitest";
import {
  APP_TRANSLATIONS,
  formatLocalizedCompactDate,
  normalizeLanguagePreference,
  resolveAppTranslationLocale,
  translateAppMessage,
  getBrowserLocale
} from "../src/app-core/i18n/index.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("normalizeLanguagePreference maps common locale tags to supported app languages", () => {
  assert.equal(normalizeLanguagePreference("fr"), "fr-CA");
  assert.equal(normalizeLanguagePreference("fr-CA"), "fr-CA");
  assert.equal(normalizeLanguagePreference("en-US"), "en");
  assert.equal(normalizeLanguagePreference("es-MX"), "");
});

test("resolveAppTranslationLocale falls back to English unless French is requested", () => {
  assert.equal(resolveAppTranslationLocale(undefined), "en");
  assert.equal(resolveAppTranslationLocale("fr"), "fr-CA");
  assert.equal(resolveAppTranslationLocale("en"), "en");
});

test("translateAppMessage returns the configured string and interpolates params", () => {
  assert.equal(translateAppMessage("en", "personalLabel"), "Personal");
  assert.equal(translateAppMessage("en", "onboardingIntroTitle"), "What are you selling?");
  assert.equal(translateAppMessage("fr-CA", "shellLanguageLabel"), "Langue de l'application");
  assert.equal(
    translateAppMessage("en", "whatnotConnectedSummary", { name: "A", pendingCountSuffix: " (2)" }),
    "A (2)"
  );
});

test("shared workspace copy uses approved French terms while preserving English defaults", () => {
  assert.equal(translateAppMessage("fr-CA", "shellCreateSharedWorkspaceAction"), "Créer un espace partagé");
  assert.equal(translateAppMessage("fr-CA", "shellWorkspaceSectionLabel"), "Espaces");
  assert.equal(translateAppMessage("fr-CA", "shellWorkspaceActionLabel"), "Gérer l’espace partagé");
  assert.equal(translateAppMessage("fr-CA", "shellCreateWorkspaceBody"), "Ce nouvel espace partagé reprend une copie de vos inventaires, de vos jeux et de vos paramètres de vente. Les ventes ne sont pas copiées.");
  assert.equal(translateAppMessage("fr-CA", "shellJoinWorkspacePrompt", { name: "Équipe de Zoé" }), "Rejoindre l’espace partagé « Équipe de Zoé » ?");
  assert.equal(translateAppMessage("fr-CA", "shellLeaveWorkspaceAction"), "Quitter l’espace partagé");
  assert.equal(translateAppMessage("fr-CA", "workspaceCreateRecoveryConflictNotice"), "La création de l’espace partagé n’a pas pu reprendre. Gardez cette fenêtre ouverte et réessayez.");
  assert.equal(translateAppMessage("fr-CA", "workspacePresenceMinutesAgo", { count: 12 }), "Actif il y a 12 min");
  assert.equal(translateAppMessage("fr-CA", "workspaceRealtimeIdleTitle"), "Mises à jour en temps réel inactives");
  assert.equal(translateAppMessage("en", "shellCreateSharedWorkspaceAction"), "Create shared workspace");
  assert.equal(translateAppMessage("en", "workspaceCreateRecoveryConflictNotice"), "Workspace creation could not resume safely. Keep this dialog open and try again.");
  assert.equal(translateAppMessage(undefined, "workspacePresenceOffline"), "Offline");
});

test("Whatnot lot category prompts and labels are localized in English and French", () => {
  assert.equal(translateAppMessage("en", "configWhatnotVerticalRequired"), "Choose a Whatnot category");
  assert.equal(translateAppMessage("fr-CA", "configWhatnotVerticalRequired"), "Choisissez une catégorie Whatnot");
  assert.equal(translateAppMessage("en", "configWhatnotVerticalCoins"), "Coins");
  assert.equal(translateAppMessage("fr-CA", "configWhatnotVerticalCoins"), "Pièces de monnaie");
});

test("bulk configuration copy uses approved French cost terms and preserves English labels", () => {
  const expectedFrench: Record<string, string> = {
    configCurrentCostBasisTitle: "Coût total du lot",
    configCostBreakdownSubtitle: "Ce coût total sert au calcul des profits, des prix et du portefeuille.",
    purchaseCostInputTotalLabel: "Coût des boîtes",
    purchaseCostInputPerBoxLabel: "Coût par boîte",
    configPurchaseCostExclusionsHint: "Avant taxes, droits de douane et frais de livraison.",
    configPurchaseShippingLabel: "Frais de livraison à l’achat",
    configPurchaseTaxesLabel: "Taux de taxe à l’achat (%)",
    configBoughtLabel: "Date d’achat",
    configTotalModeLabel: "Total des boîtes",
    configUsdToCadRateLabel: "Taux de conversion USD → CAD",
    configWhatnotFeeStatusEstimate: "Estimation fondée sur les ventes enregistrées dans WhatFees. Whatnot peut appliquer des ajustements ou inclure des ventes absentes de WhatFees.",
    configBoxCountOne: "boîte",
    configBoxCountOther: "boîtes",
    configItemCountOne: "item",
    configItemCountOther: "items"
  };
  for (const [key, value] of Object.entries(expectedFrench)) {
    assert.equal(translateAppMessage("fr-CA", key), value, key);
  }
  assert.equal(translateAppMessage("en", "configBoxCountOne"), "box");
  assert.equal(translateAppMessage("en", "configBoxCountOther"), "boxes");
  assert.equal(translateAppMessage(undefined, "configBoxCountOther"), "boxes");
  assert.equal(translateAppMessage("en", "configItemCountOne"), "item");
  assert.equal(translateAppMessage("en", "configItemCountOther"), "items");
  assert.equal(translateAppMessage("en", "configPurchaseCostExclusionsHint"), "Before taxes, customs duties and shipping fees.");
  assert.equal(translateAppMessage("en", "configBoughtLabel"), "Bought");
  assert.equal(translateAppMessage("en", "purchaseCostInputTotalLabel"), "Total Purchase");
  assert.equal(translateAppMessage("en", "purchaseCostInputPerBoxLabel"), "Price per Box (No Tax)");
  assert.equal(translateAppMessage(undefined, "purchaseCostInputTotalLabel"), "Total Purchase");
});

test("Whatnot fee status translations interpolate tier, rate, amounts, and dates", () => {
  for (const language of ["en", "fr-CA"]) {
    assert.equal(translateAppMessage(language, "configWhatnotFeeStatusTier", { tier: 3 }).includes("{tier}"), false);
    assert.equal(translateAppMessage(language, "configWhatnotFeeStatusRate", { tier: "Tier 3", rate: 4.5 }).includes("{rate}"), false);
    assert.equal(translateAppMessage(language, "configWhatnotFeeStatusPreviousGross", { amount: "1,250", start: "May 1", end: "May 31" }).includes("{amount}"), false);
    assert.equal(translateAppMessage(language, "configWhatnotFeeStatusProgress", { amount: "1,250", threshold: "2,000", start: "Jun 1", end: "Jun 30" }).includes("{threshold}"), false);
    assert.equal(translateAppMessage(language, "configWhatnotFeeStatusMaxTier", { start: "Jun 1", end: "Jun 30" }).includes("{start}"), false);
  }
});

test("first-run onboarding uses seller-facing inventory language", () => {
  const englishOnboarding = [
    "onboardingIntroTitle",
    "onboardingIntroBody",
    "onboardingBulkCta",
    "onboardingBulkSummary",
    "onboardingSinglesCta",
    "onboardingSinglesSummary"
  ].map((key) => translateAppMessage("en", key)).join("\n");

  assert.match(englishOnboarding, /Individual items/);
  assert.match(englishOnboarding, /Grouped inventory/);
  assert.doesNotMatch(englishOnboarding, /\b(singles|bulk|lot|custom)\b/i);

  assert.equal(translateAppMessage("en", "itemCatalogCustom"), "Manual / any item");
  assert.equal(translateAppMessage("en", "newLotTitle"), "New inventory");
  assert.equal(translateAppMessage("en", "shellLotLabel"), "Current inventory");
});

test("Lot inventory copy uses item language and explains RTYH", () => {
  assert.equal(translateAppMessage("en", "lotOptionSinglesLotsLabel"), "Individual items");
  assert.equal(translateAppMessage("en", "singlesPurchasingTitle"), "Item inventory");
  assert.equal(translateAppMessage("en", "portfolioSalesByUserSaleTypeRtyh"), "Random hit (RTYH)");
  assert.equal(translateAppMessage("en", "saleEditorRtyhSpotPriceLabel"), "Random hit price");

  assert.equal(translateAppMessage("fr-CA", "lotOptionSinglesLotsLabel"), "Items individuels");
  assert.equal(translateAppMessage("fr-CA", "singlesPurchasingTitle"), "Inventaire d’items");
  assert.equal(translateAppMessage("fr-CA", "portfolioSalesByUserSaleTypeRtyh"), "Random hit (RTYH)");
  assert.equal(translateAppMessage("fr-CA", "saleEditorRtyhSpotPriceLabel"), "Prix du random hit");
});

test("translation catalogs stay aligned across locales", () => {
  assert.deepEqual(
    Object.keys(APP_TRANSLATIONS["fr-CA"]).sort(),
    Object.keys(APP_TRANSLATIONS.en).sort()
  );
});

test("config JSON catalogs keep key and interpolation parameter parity across locales", () => {
  const en = JSON.parse(readFileSync("src/app-core/i18n/locales/en/config.json", "utf8")) as Record<string, string>;
  const fr = JSON.parse(readFileSync("src/app-core/i18n/locales/fr/config.json", "utf8")) as Record<string, string>;
  const keys = Object.keys(en).sort();
  assert.deepEqual(Object.keys(fr).sort(), keys);

  const parameterNames = (value: string): string[] => [...value.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)]
    .map((match) => match[1]!.trim())
    .sort();
  for (const key of keys) {
    assert.deepEqual(parameterNames(fr[key]!), parameterNames(en[key]!), `${key} interpolation parameters`);
  }
});

test("Portfolio copy uses approved buyer and realized-sales terms with bilingual parameters", () => {
  const expectedFrench: Record<string, string> = {
    portfolioLotColumnSoldMarginLabel: "Marge sur les ventes",
    portfolioLotNoSoldMarginLabel: "Aucune marge sur les ventes",
    portfolioLotFilterBulkLabel: "Tous les lots groupés",
    portfolioLotFilterSinglesLabel: "Tous les lots individuels",
    portfolioReportColumnSoldCost: "Coût des items vendus",
    portfolioReportColumnSoldRevenue: "Revenu net des ventes",
    portfolioReportColumnRealizedProfit: "Profit des ventes réalisées",
    portfolioReportTypeBulkLabel: "Groupé",
    portfolioReportTypeSinglesLabel: "Individuel",
    portfolioReportNoRealizedProfitShort: "Aucun profit réalisé",
    portfolioReportNoRealizedProfitYet: "Aucun profit réalisé pour le moment",
    portfolioReportColumnTotalItems: "Items au total",
    portfolioReportColumnSoldVsTotal: "Items vendus / total",
    portfolioCustomerColumnNameLabel: "Acheteur",
    portfolioCustomerCountLabel: "Acheteurs",
    portfolioCustomerCountMeta: "acheteurs",
    portfolioCustomerHighlightRepeatLabel: "Acheteurs récurrents",
    portfolioCustomerHighlightsTitle: "Faits saillants des acheteurs",
    portfolioCustomerHighlightTopLabel: "Meilleur acheteur",
    portfolioCustomerNoSalesMeta: "Aucune vente associée à un acheteur",
    portfolioCustomerPerformanceEmptyTitle: "Aucune donnée sur les acheteurs",
    portfolioCustomerPerformanceEmptyBody: "Ajoutez le nom de l’acheteur à vos ventes pour consulter les données par acheteur ici.",
    portfolioCustomerPerformanceTitle: "Performance des acheteurs",
    portfolioCustomerSearchLabel: "Rechercher des acheteurs",
    portfolioCustomerColumnLastLabel: "Dernier achat",
    portfolioSalesByUserTitle: "Ventes par utilisateur",
    portfolioSalesByUserSubtitle: "8 dernières semaines",
    portfolioSalesByUserDrilldownSellerLabel: "Dernière modification par",
    portfolioSalesByUserDrilldownQuantityLabel: "Quantité",
    portfolioSalesByUserMetricCountLabel: "Nombre de ventes",
    portfolioSalesByUserAttributionNote: "Les ventes sont attribuées au dernier utilisateur qui les a modifiées."
  };
  for (const [key, expected] of Object.entries(expectedFrench)) {
    assert.equal(translateAppMessage("fr-CA", key), expected, key);
  }
  assert.equal(translateAppMessage("en", "portfolioSalesByUserAttributionNote"), "Sales are attributed to the last user who modified them.");
  assert.equal(translateAppMessage("en", "portfolioReportTypeBulkLabel"), "Bulk");
  assert.equal(translateAppMessage("en", "portfolioReportTypeSinglesLabel"), "Singles");

  const english = APP_TRANSLATIONS.en as Record<string, string>;
  const french = APP_TRANSLATIONS["fr-CA"] as Record<string, string>;
  const portfolioKeys = Object.keys(english).filter((key) => key.startsWith("portfolio"));
  assert.deepEqual(Object.keys(french).filter((key) => key.startsWith("portfolio")).sort(), portfolioKeys.sort());
  const params = (message: string) => [...new Set([...message.matchAll(/\{\{?(\w+)\}?\}/g)].map((match) => match[1]))].sort();
  for (const key of portfolioKeys) assert.deepEqual(params(french[key]!), params(english[key]!), `portfolio parameters for ${key}`);
});

test("French sales copy uses Acheteur and Item language with corrected accents", () => {
  assert.equal(translateAppMessage("fr-CA", "saleEditorBuyerShippingLabel"), "Frais de livraison payés par l’acheteur");
  assert.equal(translateAppMessage("fr-CA", "saleEditorQuantityLabel"), "Quantité");
  assert.equal(translateAppMessage("fr-CA", "saleEditorSectionDetailsLabel"), "Détails");
  assert.equal(translateAppMessage("fr-CA", "saleEditorTypeRandomHitLabel"), "Random hit (RTYH)");
  assert.equal(translateAppMessage("fr-CA", "salesHistoryTypeItemLabel"), "Item");
  assert.equal(translateAppMessage("fr-CA", "salesHistoryTypeSinglesLabel"), "Items");
  assert.equal(translateAppMessage("fr-CA", "salesHistoryColumnCustomerLabel"), "Acheteur");
  assert.equal(translateAppMessage("fr-CA", "salesHistorySortCustomerLabel"), "Acheteur");
  assert.equal(translateAppMessage("fr-CA", "salesHistoryNoCustomerLabel"), "Aucun acheteur");
  assert.equal(translateAppMessage("fr-CA", "salesHistoryDeleteSaleLabel"), "Supprimer la vente");
  assert.equal(translateAppMessage("fr-CA", "salesNoticeSaleDeleted"), "Vente supprimée.");
  assert.equal(translateAppMessage("fr-CA", "salesStatusRealizedProfitLabel"), "Profit sur les items vendus");
  assert.equal(translateAppMessage("fr-CA", "salesHistoryPerItemLabel"), "/item");
});

test("sales catalog message parameters stay bilingual", () => {
  const salesKeys = Object.keys(APP_TRANSLATIONS.en).filter((key) =>
    key.startsWith("saleEditor") || key.startsWith("saleValidation") || key.startsWith("sales")
  );
  for (const key of salesKeys) {
    const english = APP_TRANSLATIONS.en[key as keyof typeof APP_TRANSLATIONS.en];
    const french = APP_TRANSLATIONS["fr-CA"][key as keyof typeof APP_TRANSLATIONS["fr-CA"]];
    const params = (message: string) => [...new Set([...message.matchAll(/\{\{?(\w+)\}?\}/g)].map((match) => match[1]))].sort();
    assert.deepEqual(params(english), params(french), `sales parameter names for ${key}`);
  }
});

test("live pricing labels use the approved French copy and bilingual notification keys", () => {
  const expectedFrench: Record<string, string> = {
    liveSinglesPanelTitle: "Items à tarifer",
    liveSinglesConvertToSaleLabel: "Préparer une vente",
    liveSinglesBasisLabel: "Valeur de référence",
    liveSinglesBundleModeLabel: "Prix global",
    liveSinglesBundleSummaryLabel: "Prix global",
    liveSinglesBundleTotalLabel: "Prix global",
    liveSinglesBundleShareLabel: "Répartition du prix",
    liveSinglesShareOfBundleLabel: "du prix global",
    liveSinglesPanelIntro: "Ajoutez des items, puis choisissez si vous voulez fixer leur prix individuellement ou utiliser un prix global.",
    liveSinglesEstimatedProfitLabel: "profit estimé",
    liveSinglesSummaryMarginLabel: "marge estimée",
    livePriceCardBoxLabel: "Boîte",
    livePriceCardRandomHitLabel: "Random hit (RTYH)",
    livePriceCardOnTargetLabel: "Aucun ajustement proposé",
    liveSinglesItemLabel: "item",
    liveNoticeSinglesAutoPriced: "Prix des items calculés automatiquement selon l’objectif de profit",
    liveNoticeOpenToAutoPriceSingles: "Ouvrez la vue de vente en direct pour calculer automatiquement les prix des items",
    liveNoticeSinglesPricesReset: "Prix des items réinitialisés aux valeurs suggérées",
    liveNoticeOpenToResetSingles: "Ouvrez la vue de vente en direct pour réinitialiser les prix des items",
    liveNoticePricesResetToDefaults: "Prix en direct réinitialisés aux valeurs par défaut de la configuration",
    liveNoticeSelectLotFirst: "Sélectionnez d’abord un lot",
    liveNoticePricesSavedToConfig: "Prix en direct enregistrés dans la configuration",
    liveNoticeConflictReview: "Les prix en direct ont changé dans le cloud. Vérifiez-les et enregistrez-les de nouveau.",
    liveNoticeConflictRetryUnavailable: "Les prix en direct ont changé dans le cloud. Réessayez l’enregistrement.",
    liveNoticeConflictRetrying: "Les prix en direct ont changé. Nouvelle tentative d’enregistrement avec la version la plus récente…",
    liveNoticeSaveFailed: "Impossible d’enregistrer les prix en direct.",
    liveNoticePricesSaved: "Prix en direct enregistrés"
  };
  for (const [key, value] of Object.entries(expectedFrench)) {
    assert.equal(translateAppMessage("fr-CA", key), value, key);
  }

  const liveKeys = Object.keys(APP_TRANSLATIONS.en).filter((key) => key.startsWith("live"));
  assert.deepEqual(
    Object.keys(APP_TRANSLATIONS["fr-CA"]).filter((key) => key.startsWith("live")).sort(),
    liveKeys.sort()
  );
  for (const key of liveKeys) {
    const params = (message: string) => [...new Set([...message.matchAll(/\{\{?(\w+)\}?\}/g)].map((match) => match[1]))].sort();
    assert.deepEqual(params(APP_TRANSLATIONS["fr-CA"][key]!), params(APP_TRANSLATIONS.en[key]!), `live parameter names for ${key}`);
  }

  assert.equal(translateAppMessage("fr-CA", "shellApplyLivePricesAction"), "Enregistrer les prix en direct");
  assert.equal(translateAppMessage("fr-CA", "shellResetLivePricesAction"), "Réinitialiser les prix en direct");
  assert.equal(translateAppMessage("fr-CA", "shellResetLiveSinglesPricesAction"), "Réinitialiser les prix des items");
  assert.equal(translateAppMessage("fr-CA", "shellClearLiveSinglesAction"), "Vider la liste d’items");
  assert.equal(translateAppMessage("fr-CA", "shellClearLiveSinglesConfirmTitle"), "Vider la liste d’items ?");
  assert.equal(translateAppMessage("fr-CA", "shellClearLiveSinglesConfirmBody"), "Retirer tous les items de la liste de prix ?");
  assert.equal(translateAppMessage("fr-CA", "shellLiveActionsLabel"), "Autres actions de vente en direct");
});

test("inventory copy is localized and selection count keeps singular and plural forms", () => {
  assert.equal(translateAppMessage("en", "singlesSelectedCountOne", { count: 1 }), "1 item selected");
  assert.equal(translateAppMessage("en", "singlesSelectedCountOther", { count: 2 }), "2 items selected");
  assert.equal(translateAppMessage("fr-CA", "singlesSelectedCountOne", { count: 1 }), "1 item sélectionné");
  assert.equal(translateAppMessage("fr-CA", "singlesSelectedCountOther", { count: 2 }), "2 items sélectionnés");
  assert.equal(translateAppMessage("fr-CA", "singlesEditorNameRequired"), "Le nom de l’item est obligatoire.");
  assert.equal(translateAppMessage("fr-CA", "singlesEditorCostInvalid"), "Entrez un coût égal ou supérieur à 0.");
  assert.equal(translateAppMessage("fr-CA", "singlesEditorQuantityInvalid"), "Entrez une quantité égale ou supérieure à 0.");
  assert.equal(translateAppMessage("fr-CA", "singlesEditorDeleteRowTitle"), "Supprimer cet item ?");
  assert.equal(translateAppMessage("fr-CA", "singlesEditorDeleteRowBody"), "Supprimer cet achat d’item ?");
  const englishSingles = APP_TRANSLATIONS.en as Record<string, string>;
  const frenchSingles = APP_TRANSLATIONS["fr-CA"] as Record<string, string>;
  const inventoryKeys = Object.keys(englishSingles).filter((key) => key.startsWith("singles"));
  for (const key of inventoryKeys) {
    const englishParams = [...englishSingles[key]!.matchAll(/\{\{?(\w+)\}?\}/g)].map((match) => match[1]);
    const frenchParams = [...frenchSingles[key]!.matchAll(/\{\{?(\w+)\}?\}/g)].map((match) => match[1]);
    assert.deepEqual([...new Set(englishParams)].sort(), [...new Set(frenchParams)].sort(), `parameter names for ${key}`);
  }
});

test("spectator translations are part of the bilingual app contract", () => {
  assert.equal(translateAppMessage("en", "spectatorLanguageLabel"), "Language");
  assert.equal(translateAppMessage("fr-CA", "spectatorLanguageLabel"), "Langue");
  assert.equal(translateAppMessage("fr-CA", "spectatorGridKicker"), "Spectateur de grille en direct");
  assert.equal(
    translateAppMessage("fr-CA", "spectatorGridOpenedSummary", { progress: "1/2" }),
    "1/2 cases ouvertes."
  );
});

test("French user-facing copy keeps audited terms accented", () => {
  const frenchCopy = Object.values(APP_TRANSLATIONS["fr-CA"]).join("\n");

  assert.doesNotMatch(
    frenchCopy,
    /\b(couts?|resultats?|selectionne|revision|integration|echec|reussie|lies|probabilites|ponderees)\b/i
  );
});

test("shared game copy stays game-neutral while wheel-specific actions stay explicit", () => {
  assert.equal(translateAppMessage("en", "wheelNameLabel"), "Game name");
  assert.equal(translateAppMessage("en", "wheelInspectorSpinPriceLabel"), "Price per play ($)");
  assert.equal(translateAppMessage("en", "wheelCreateWheelBody"), "Spin a visual wheel with weighted prize odds.");
  assert.equal(translateAppMessage("en", "wheelSpinButtonLabel"), "Spin");

  assert.equal(translateAppMessage("fr-CA", "wheelNameLabel"), "Nom du jeu");
  assert.equal(translateAppMessage("fr-CA", "wheelInspectorSpinPriceLabel"), "Prix par partie ($)");
  assert.equal(translateAppMessage("fr-CA", "wheelCreateWheelBody"), "Définissez les prix et leurs probabilités, puis faites tourner la roue.");
  assert.equal(translateAppMessage("fr-CA", "wheelSpinButtonLabel"), "Tourner");
});

test("formatLocalizedCompactDate uses the requested locale", () => {
  assert.equal(formatLocalizedCompactDate("2026-03-09", "en"), "Mar 9");
  assert.equal(formatLocalizedCompactDate("not-a-date", "en"), "not-a-date");
});

test("getBrowserLocale uses the first available browser candidate", () => {
  vi.stubGlobal("navigator", {
    language: "en-US",
    languages: ["fr-CA", "en-US"]
  });

  assert.equal(getBrowserLocale(), "fr-CA");
});

const sessionFrenchCopy = [
  ["wheelChaseReplacePrompt", "Prix vedette obtenu."],
  ["wheelChaseReplaceHelpText", "Ce choix détermine le prix proposé aux prochaines parties."],
  ["wheelConfirmEndBody", "Terminer cette session de jeu? Les ventes en attente s’afficheront pour que vous puissiez les traiter avant de réinitialiser la session."],
  ["wheelPendingInventoryIssuesTitle", "Vérifier 2 prix non traités"],
  ["wheelRecordAllAction", "Enregistrer les ventes prêtes"],
  ["wheelDismissAction", "Retirer sans enregistrer"],
  ["wheelFairnessRecentSpins", "2 résultats récents"],
  ["wheelFairnessServerVerifiedTitle", "Preuve du serveur"],
  ["wheelFairnessLocalVerifiedTitle", "Preuve locale"],
  ["wheelFairnessHashLabel", "Empreinte (hash)"],
  ["wheelFairnessClientSeedLabel", "Graine du client"],
  ["wheelFairnessSeedLabel", "Graine (seed)"],
  ["wheelFairnessSeedVerifiedNote", "Le SHA-256 de la graine ci-dessus correspond à l’empreinte engagée avant le résultat."],
  ["wheelFairnessRecentHistoryTitle", "Historique récent"],
  ["wheelFairnessEmptyState", "Jouez une partie pour démarrer un historique de vérification pour cette session."],
  ["wheelInspectorHistoryTitle", "Historique et équité"],
  ["wheelInspectorHistorySubtitle", "Consultez l’équité et les résultats récents."],
  ["wheelFairnessServerModeLabel", "Preuve du serveur"],
  ["wheelFairnessLocalModeLabel", "Preuve locale"],
  ["wheelConfirmResetTitle", "Réinitialiser la session?"],
  ["wheelResetSessionAction", "Réinitialiser la session"],
  ["wheelConfirmResetLiveBody", "Ceci effacera tous les nombres de parties, le suivi des revenus et les déductions ignorées de cette session en direct. Cette action est irréversible."],
  ["wheelSpinInProgress", "Tirage en cours…"],
  ["wheelNoResultLabel", "Résultat inconnu"],
  ["wheelCanvasEmptyStateLabel", "Configurez le jeu et appliquez-le"],
  ["wheelReplacementStockLabel", "2 en stock"],
  ["wheelSelectedLotFallback", "le lot sélectionné"],
  ["wheelChaseResolveBeforeBatchSale", "Réglez ce prix vedette en choisissant Garder ou Remplacer avant de l’enregistrer avec les ventes prêtes."],
  ["wheelChaseStillNeedsDecision", "Ce prix vedette doit encore être conservé ou remplacé."],
  ["wheelChaseSourceChangedCannotContinue", "Ce prix vedette reste en attente parce que la source d’origine du jeu ou du prix a changé. Restaurez cette source pour continuer."],
  ["wheelChaseWheelSourceChangedCannotContinue", "Ce prix vedette reste en attente parce que la source d’origine du jeu a changé. Restaurez cette source pour continuer."],
  ["wheelChaseOriginalSourceChanged", "Ce prix vedette reste en attente parce que la source d’origine du jeu a changé."],
  ["wheelChaseSourceChangedDuringSpin", "Ce prix vedette reste en attente parce que la source d’origine du jeu a changé pendant le tirage."],
  ["wheelChaseSourceChangedBeforeKeepOrReplace", "Ce prix vedette reste en attente parce que la source d’origine du jeu a changé. Restaurez cette source avant de le conserver ou de le remplacer."],
  ["wheelChaseReplacementUnavailable", "L’item de remplacement sélectionné n’est plus disponible. Ce prix vedette reste en attente."],
  ["wheelChaseOriginalSourceUnavailable", "Ce prix vedette reste en attente parce que la source d’origine du jeu n’est plus disponible."],
  ["wheelChaseUnresolvedRestoreSource", "Une décision concernant un prix vedette reste en attente. Restaurez la source d’origine du jeu avant de la régler."],
  ["wheelChaseRestoreBeforeDelete", "Un prix vedette reste en attente pour ce jeu. Restaurez sa source et réglez-le avant de supprimer le jeu."],
  ["wheelChaseSettleBeforeWheelChange", "Réglez le prix vedette en attente avant d’appliquer une modification au jeu."],
  ["wheelChaseDecisionSaveFailed", "La décision du prix vedette n’a pas pu être enregistrée. Ne continuez pas avant que le stockage soit disponible."],
  ["wheelSaleConfirmationFailed", "La vente n’a pas pu être confirmée. Réessayez à partir de l’inventaire en attente."],
  ["wheelItemNoLongerAvailableInLot", "L’item Carte n’est plus disponible dans le lot Lot A."],
  ["wheelItemNeedsStock", "L’item Carte nécessite 2 items, mais il n’en reste que 1 dans le lot Lot A."],
  ["wheelPreviewChaseReplacedResult", "⭐ Prix vedette remplacé dans l’aperçu — Carte"],
  ["wheelChaseReplacedResult", "⭐ Prix vedette remplacé — Carte"],
  ["wheelPreviewKeepsChaseResult", "⭐ L’aperçu conserve le prix vedette"]
] as const;

test.each(sessionFrenchCopy)("session catalog translates %s exactly in French", (key, expected) => {
  assert.equal(translateAppMessage("fr-CA", key, {
    count: 2, suffix: "s", item: "Carte", lot: "Lot A", needed: 2, neededSuffix: "s", remaining: 1
  }), expected);
});

test("session catalog preserves English copy and defaults to English", () => {
  assert.equal(translateAppMessage("en", "wheelChaseReplacePrompt"), "Chase won! Replace with:");
  assert.equal(translateAppMessage("", "wheelChaseReplacePrompt"), "Chase won! Replace with:");
  assert.equal(translateAppMessage("en", "wheelChaseReplaceHelpText"), "This choice determines the prize offered in future games.");
  assert.equal(translateAppMessage("en", "wheelPendingInventoryIssuesTitle", { count: 2, suffix: "s" }), "Review 2 unresolved prizes");
  assert.equal(translateAppMessage("", "wheelPendingInventoryIssuesTitle", { count: 2, suffix: "s" }), "Review 2 unresolved prizes");
  assert.equal(translateAppMessage("en", "wheelRecordAllAction"), "OK");
  assert.equal(translateAppMessage("en", "wheelDismissAction"), "Dismiss");
  assert.equal(translateAppMessage("en", "wheelFairnessRecentSpins", { count: 2, suffix: "s" }), "2 recent results");
  assert.equal(translateAppMessage("en", "wheelFairnessServerVerifiedTitle"), "Server verified");
  assert.equal(translateAppMessage("en", "wheelFairnessLocalVerifiedTitle"), "Local verified");
  assert.equal(translateAppMessage("en", "wheelFairnessHashLabel"), "Hash");
  assert.equal(translateAppMessage("en", "wheelFairnessClientSeedLabel"), "Client seed");
  assert.equal(translateAppMessage("en", "wheelFairnessSeedLabel"), "Seed");
  assert.equal(translateAppMessage("en", "wheelFairnessSeedVerifiedNote"), "SHA-256 of the seed above matches the committed hash.");
  assert.equal(translateAppMessage("en", "wheelChaseOriginalSourceChanged"), "This chase remains unresolved because its original wheel source changed.");
  assert.equal(translateAppMessage("en", "wheelFairnessRecentHistoryTitle"), "Recent History");
  assert.equal(translateAppMessage("en", "wheelFairnessEmptyState"), "Play the game to start a fairness history for this session.");
  assert.equal(translateAppMessage("en", "wheelInspectorHistoryTitle"), "History & Fairness");
  assert.equal(translateAppMessage("en", "wheelInspectorHistorySubtitle"), "Review fairness and recent results.");
  assert.equal(translateAppMessage("en", "wheelSpinInProgress"), "Spinning…");
  assert.equal(translateAppMessage("en", "wheelNoResultLabel"), "Unknown result");
  assert.equal(translateAppMessage("en", "wheelCanvasEmptyStateLabel"), "Configure & Apply");
  assert.equal(translateAppMessage("en", "wheelReplacementStockLabel", { count: 2 }), "2 left");
  assert.equal(translateAppMessage("en", "wheelItemNoLongerAvailableInLot", { item: "Card", lot: "Lot A" }), "Card is no longer available in Lot A.");
  assert.equal(translateAppMessage("en", "wheelItemNeedsStock", { item: "Card", needed: 2, neededSuffix: "s", remaining: 1, lot: "Lot A" }), "Card needs 2 items, but only 1 remain in Lot A.");
});
