import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";

test("ConfigWindow keeps the main setup focused on cost basis and purchasing only", () => {
  const template = readFileSync("src/components/windows/config/ConfigWindow.html", "utf8");

  assert.match(template, /configCurrentCostBasisTitle/);
  assert.match(template, /configPurchasingTitle/);
  assert.doesNotMatch(template, /config-system-card/);
  assert.doesNotMatch(template, /configSystemConfigurationAction/);
  assert.doesNotMatch(template, /v-model="showSystemConfigurationDialog"/);
  assert.doesNotMatch(template, /configSellingTitle/);
  assert.doesNotMatch(template, /<!-- Default Prices -->/);
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
  assert.match(appTemplate, /<system-configuration-dialog :ctx="this"><\/system-configuration-dialog>/);
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
    "configSystemConfigurationHelp"
  ]) {
    assert.equal(typeof en[key], "string", `missing English config copy for ${key}`);
    assert.ok(en[key]?.trim(), `empty English config copy for ${key}`);
    assert.equal(typeof fr[key], "string", `missing French config copy for ${key}`);
    assert.ok(fr[key]?.trim(), `empty French config copy for ${key}`);
  }

  assert.match(fr.configSystemConfigurationTitle, /Configuration système/);
});
