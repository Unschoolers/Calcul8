import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { calculateDefaultSellingPrices } from "../src/domain/calculations-fees.ts";
import { calculateSinglesTargetLinePrice } from "../src/app-core/methods/sales-draft.ts";

test("ConfigWindow keeps the main setup focused on cost basis and purchasing only", () => {
  const template = readFileSync("src/components/windows/config/ConfigWindow.html", "utf8");
  const css = readFileSync("src/components/windows/config/ConfigWindow.css", "utf8");

  assert.match(template, /configCurrentCostBasisTitle/);
  assert.match(template, /configPurchasingTitle/);
  assert.doesNotMatch(template, /config-system-card/);
  assert.doesNotMatch(template, /configSystemConfigurationAction/);
  assert.doesNotMatch(template, /v-model="showSystemConfigurationDialog"/);
  assert.doesNotMatch(template, /configSellingTitle/);
  assert.doesNotMatch(template, /<!-- Default Prices -->/);
  assert.match(css, /@media \(max-width:\s*1144px\)[\s\S]*\.config-summary-hero__main\s*{[\s\S]*flex-direction:\s*column/);
  assert.match(css, /@media \(max-width:\s*1144px\)[\s\S]*\.config-summary-hero__stats\s*{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.doesNotMatch(css, /@media \(max-width:\s*600px\)[\s\S]*\.config-summary-hero__main\s*{[\s\S]*flex-direction:\s*column/);
});

test("SinglesConfigWindow keeps selling assumptions in system configuration", () => {
  const template = readFileSync("src/components/windows/singles/SinglesConfigWindow.html", "utf8");
  const definition = readFileSync("src/components/windows/singles/SinglesConfigWindow.ts", "utf8");

  assert.match(template, /<singles-purchasing-card/);
  assert.doesNotMatch(template, /<singles-selling-card/);
  assert.doesNotMatch(definition, /SinglesSellingCard/);

  for (const removedLotSellingControl of [
    "singlesSellingTitle",
    "configTargetProfitLabel",
    "configSellingTaxesLabel",
    "configAverageBuyerShippingLabel",
    "configFeeProfileLabel",
    "setFeeProfilePreset"
  ]) {
    assert.doesNotMatch(template, new RegExp(removedLotSellingControl));
  }
});

test("System configuration is opened from the global app menu", () => {
  const shellTemplate = readFileSync("src/components/shell/AppShellTopBar.html", "utf8");
  const appTemplate = readFileSync("src/App.html", "utf8");

  assert.match(shellTemplate, /configSystemConfigurationAction/);
  assert.match(shellTemplate, /showSystemConfigurationDialog = true/);
  assert.match(appTemplate, /<system-configuration-dialog><\/system-configuration-dialog>/);
});

test("SystemConfigurationDialog keeps random-hit spots scoped to bulk lots", () => {
  const template = readFileSync("src/components/shell/SystemConfigurationDialog.html", "utf8");

  assert.equal((template.match(/configRtyhSpotsPerBoxLabel/g) ?? []).length, 2);
  assert.equal((template.match(/v-if="currentLotType !== 'singles'"/g) ?? []).length, 2);
});

test("Whatnot vertical is required for new lots and edited through the lot dialog", () => {
  const appTemplate = readFileSync("src/App.html", "utf8");
  const systemTemplate = readFileSync("src/components/shell/SystemConfigurationDialog.html", "utf8");
  const bulkTemplate = readFileSync("src/components/windows/config/ConfigWindow.html", "utf8");
  const singlesTemplate = readFileSync("src/components/windows/singles/SinglesConfigWindow.html", "utf8");

  assert.match(appTemplate, /v-model="newLotWhatnotVertical"[\s\S]*?configWhatnotVerticalLabel[\s\S]*?required/);
  assert.doesNotMatch(systemTemplate, /configWhatnotVerticalLabel|configWhatnotVerticalLegacyHint|setCurrentLotWhatnotVertical/);
  assert.match(bulkTemplate, /WhatnotLotSetupControl[\s\S]*?:show-category="false"/);
  assert.match(singlesTemplate, /WhatnotLotSetupControl[\s\S]*?:show-category="false"/);
  assert.match(appTemplate, /v-model="renameLotWhatnotVertical"[\s\S]*?configWhatnotVerticalLabel/);

  const en = JSON.parse(readFileSync("src/app-core/i18n/locales/en/config.json", "utf8")) as Record<string, string>;
  const fr = JSON.parse(readFileSync("src/app-core/i18n/locales/fr/config.json", "utf8")) as Record<string, string>;
  for (const key of [
    "configWhatnotVerticalLabel",
    "configWhatnotVerticalRequired",
    "configWhatnotVerticalLegacyHint",
    "configWhatnotVerticalUnclassified",
    "configWhatnotVerticalSports",
    "configWhatnotVerticalTcg",
    "configWhatnotVerticalFashion",
    "configWhatnotVerticalOtherCollectibles",
    "configWhatnotVerticalCoins",
    "configWhatnotVerticalOther",
    "configShopifyDraftCreated",
    "configShopifyWorkspaceOwnerHint",
    "configShopifyReconnectInSettings",
    "configShopifyRefreshListing",
    "configShopifyRetrySave"
  ]) {
    assert.ok(en[key]?.trim(), `missing English copy for ${key}`);
    assert.ok(fr[key]?.trim(), `missing French copy for ${key}`);
  }
});

test("SystemConfigurationDialog owns its styling instead of importing ConfigWindow CSS", () => {
  const definition = readFileSync("src/components/shell/SystemConfigurationDialog.ts", "utf8");
  const configCss = readFileSync("src/components/windows/config/ConfigWindow.css", "utf8");

  assert.match(definition, /SystemConfigurationDialog\.css/);
  assert.doesNotMatch(definition, /windows\/config\/ConfigWindow\.css/);
  assert.doesNotMatch(configCss, /config-system-dialog/);
  assert.doesNotMatch(configCss, /config-system-section/);
});

test("ConfigWindow provides system defaults and lot override copy in both locales", () => {
  const en = JSON.parse(readFileSync("src/app-core/i18n/locales/en/config.json", "utf8")) as Record<string, string>;
  const fr = JSON.parse(readFileSync("src/app-core/i18n/locales/fr/config.json", "utf8")) as Record<string, string>;

  for (const key of [
    "configSystemConfigurationAction",
    "configSystemConfigurationTitle",
    "configSystemDefaultsTitle",
    "configLotOverridesTitle",
    "configUseSystemPricingDefaultsLabel",
    "configSystemConfigurationHelp",
    "configSystemDefaultsHelp",
    "configSystemDefaultsAutosaveHelp",
    "configLotOverridesHelp",
    "configLotUsingSystemDefaultsHelp",
    "configAverageBuyerShippingLabel",
    "configSellingTaxesLabel",
    "configRtyhSpotsPerBoxLabel",
    "configFeeProfileWhatnot",
    "configTargetProfitBoxesHelp",
    "configTargetProfitItemsHelp",
    "configSaveLotsFailedNotice",
    "configSaveSystemDefaultsFailedNotice"
  ]) {
    assert.equal(typeof en[key], "string", `missing English config copy for ${key}`);
    assert.ok(en[key]?.trim(), `empty English config copy for ${key}`);
    assert.equal(typeof fr[key], "string", `missing French config copy for ${key}`);
    assert.ok(fr[key]?.trim(), `empty French config copy for ${key}`);
  }

  assert.equal(fr.configSystemConfigurationAction, "Paramètres de vente");
  assert.equal(fr.configSystemConfigurationTitle, "Paramètres de vente");
  assert.equal(fr.configSystemConfigurationHelp, "Les nouveaux lots utilisent ces paramètres par défaut. Pour un lot actuel, vous pouvez conserver les paramètres par défaut ou définir des paramètres propres à ce lot.");
  assert.equal(fr.configSystemDefaultsTitle, "Paramètres par défaut");
  assert.equal(fr.configSystemDefaultsHelp, "Ces paramètres s’appliquent aux nouveaux lots et aux lots actuels qui utilisent les paramètres par défaut.");
  assert.equal(fr.configSystemDefaultsAutosaveHelp, "Les modifications sont enregistrées automatiquement pendant la saisie. Elles s’appliquent immédiatement aux nouveaux lots et aux lots actuels qui utilisent les paramètres par défaut.");
  assert.equal(fr.configLotOverridesTitle, "Paramètres du lot");
  assert.equal(fr.configLotOverridesHelp, "Le lot sélectionné utilise les paramètres par défaut ou ses propres paramètres.");
  assert.equal(fr.configUseSystemPricingDefaultsLabel, "Utiliser les paramètres par défaut");
  assert.equal(fr.configLotUsingSystemDefaultsHelp, "Ce lot utilise les paramètres par défaut. Modifiez ces paramètres pour tous les lots qui les utilisent, ou désactivez cette option pour personnaliser ce lot.");
  assert.equal(fr.configAverageBuyerShippingLabel, "Livraison moyenne payée par l’acheteur, par commande");
  assert.equal(fr.configSellingTaxesLabel, "Taux de taxe de vente (%)");
  assert.equal(fr.configRtyhSpotsPerBoxLabel, "Nombre de spots par boîte (Random hit, RTYH)");
  assert.equal(fr.configFeeProfileWhatnot, "Profil de frais Whatnot");
  assert.equal(fr.configTargetProfitBoxesHelp, "Pour les boîtes, le pourcentage est calculé sur le coût total du lot.");
  assert.equal(fr.configTargetProfitItemsHelp, "Pour les items individuels, le pourcentage s’ajoute à la valeur de marché lorsqu’elle est positive, sinon au coût d’achat.");
  assert.equal(en.configTargetProfitBoxesHelp, "For boxes, the percentage is calculated on the total lot cost.");
  assert.equal(en.configTargetProfitItemsHelp, "For individual items, the percentage is added to a positive market value, or to the purchase cost otherwise.");
  assert.equal(fr.configSaveLotsFailedNotice, "Impossible d’enregistrer les lots. L’espace de stockage est peut-être plein.");
  assert.equal(fr.configSaveSystemDefaultsFailedNotice, "Impossible d’enregistrer les paramètres de vente. L’espace de stockage est peut-être plein.");

  const shellFr = JSON.parse(readFileSync("src/app-core/i18n/locales/fr/shell.json", "utf8")) as Record<string, string>;
  assert.equal(shellFr.shellSystemConfigurationSubtitle, "Paramètres de vente par défaut et paramètres propres à chaque lot");

  const template = readFileSync("src/components/shell/SystemConfigurationDialog.html", "utf8");
  assert.match(template, /configTargetProfitBoxesHelp/);
  assert.match(template, /configTargetProfitItemsHelp/);
  assert.match(template, /<p class="config-system-profit-help">\{\{ t\('configTargetProfitBoxesHelp'\) \}\}<\/p>/);
  assert.match(template, /<p class="config-system-profit-help">\{\{ t\('configTargetProfitItemsHelp'\) \}\}<\/p>/);
  assert.match(template, /currentLotType === 'singles'[\s\S]*?configTargetProfitItemsHelp/);
  assert.match(template, /currentLotType !== 'singles'[\s\S]*?configTargetProfitBoxesHelp/);
});

test("target-profit help matches the existing box and individual-item calculations", () => {
  const box = calculateDefaultSellingPrices({
    totalCaseCost: 100,
    targetProfitPercent: 20,
    boxesPurchased: 1,
    totalSpots: 1,
    totalPacks: 1,
    sellingTaxPercent: 0,
    sellingShippingPerOrder: 0,
    feeProfileInput: { platformFeePercent: 0, additionalFeePercent: 0, fixedFeePerOrder: 0 }
  });
  assert.equal(box.boxPriceSell, 120);

  const createSinglesContext = () => ({
    currentLotType: "singles" as const,
    hasProAccess: true,
    targetProfitPercent: 20,
    currency: "CAD" as const,
    sellingCurrency: "CAD" as const,
    exchangeRate: 1,
    sellingShippingPerOrder: 0,
    editingSale: null,
    singlesPurchases: [],
    sales: [],
    newSale: { type: "singles" as const, buyerShipping: 0, date: "2026-10-22" },
    showAddSaleModal: false,
    calculatePriceForUnits: (_units: number, targetNetRevenue: number) => targetNetRevenue
  });
  const selectedEntry = { id: 1, item: "Test item", cost: 10, currency: "CAD" as const, quantity: 1, marketValue: 30, marketValueCurrency: "CAD" as const };
  assert.equal(calculateSinglesTargetLinePrice(createSinglesContext() as never, selectedEntry, 1), 36);
  assert.equal(calculateSinglesTargetLinePrice(createSinglesContext() as never, { ...selectedEntry, marketValue: 0 }, 1), 12);
});

test("Shopify linking and marketplace SKU are edited with the lot, not system assumptions", () => {
  const appTemplate = readFileSync("src/App.html", "utf8");
  const systemTemplate = readFileSync("src/components/shell/SystemConfigurationDialog.html", "utf8");
  const pickerTemplate = readFileSync("src/components/windows/shopify/ShopifyProductPicker.vue", "utf8");
  assert.match(appTemplate, /v-model="renameLotExternalSku"/);
  assert.match(appTemplate, /<section v-if="currentLotType !== 'singles'" class="edit-inventory-shopify">[\s\S]*?<shopify-lot-integration[\s\S]*?v-if="showRenameLotModal"[\s\S]*?:state="\{ listing: shopifyEditListing[\s\S]*?@query-change="onShopifyEditQueryChange"[\s\S]*?<\/section>/);
  assert.match(appTemplate, /saveBinding: applyShopifyBinding, saveDetails: saveShopifyProductDetails/);
  assert.match(appTemplate, /@manager-open="shopifyEditManagerOpen = \$event"/);
  assert.match(pickerTemplate, /t\('configShopifySectionTitle'\)/);
  assert.match(pickerTemplate, /t\('configShopifyPickerOpen'\)/);
  assert.match(appTemplate, /searchShopifyEditProducts/);
  assert.match(appTemplate, /<section v-if="currentLotType !== 'singles'" class="edit-inventory-shopify">[\s\S]*?<v-switch v-if="shopifyEditListing\?\.mode === 'managed'" v-model="renameLotShopifyEnabled"/);
  assert.doesNotMatch(systemTemplate, /configMarketplaceSkuLabel|configShopifyPublishLabel|shopifyEnabled/);
});
