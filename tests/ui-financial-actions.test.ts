import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

test("shared financial value primitives and tokens exist", () => {
  assert.equal(existsSync("src/components/ui/AppMetricValue.ts"), true);
  assert.equal(existsSync("src/components/ui/AppMetricValue.html"), true);
  assert.equal(existsSync("src/components/ui/AppMetricValue.vue"), true);

  const tokens = read("src/styles/design-tokens.css");
  for (const token of [
    "--app-financial-positive-text",
    "--app-financial-positive-surface",
    "--app-financial-negative-text",
    "--app-financial-negative-surface",
    "--app-financial-neutral-text",
    "--app-financial-neutral-surface",
    "--app-financial-target-text",
    "--app-financial-target-surface"
  ]) {
    assert.match(tokens, new RegExp(`${token}:`), `${token} should be defined`);
  }

  const appStyles = read("src/styles/app.css");
  for (const className of [
    "app-financial-value",
    "app-financial-value--money",
    "app-financial-value--percent",
    "app-financial-value--positive",
    "app-financial-value--negative",
    "app-financial-value--neutral",
    "app-financial-value--target",
    "app-financial-pill",
    "app-financial-cell"
  ]) {
    assert.match(appStyles, new RegExp(`\\.${className}\\b`), `${className} should be styled`);
  }
});

test("financial screens use shared value styling instead of isolated profit classes", () => {
  const migratedTemplates = [
    "src/components/windows/sales/SalesWindow.html",
    "src/components/windows/live/LiveSinglesPanel.html",
    "src/components/windows/singles/SinglesPurchasingCard.html",
    "src/components/windows/portfolio/PortfolioWindow.html",
    "src/components/shell/PortfolioReportModal.html",
    "src/components/windows/whatnot/WhatnotCsvImportDialog.html"
  ];

  for (const templatePath of migratedTemplates) {
    const template = read(templatePath);
    assert.match(template, /<app-metric-value\b|app-financial-value|app-financial-pill|app-financial-cell/, `${templatePath} should use shared financial presentation`);
  }
});

test("action taxonomy provides consistent icons and real screens consume the wrapper", () => {
  assert.equal(existsSync("src/app-core/ui/actionTaxonomy.ts"), true);
  assert.equal(existsSync("src/components/ui/AppActionButton.ts"), true);
  assert.equal(existsSync("src/components/ui/AppActionButton.html"), true);
  assert.equal(existsSync("src/components/ui/AppActionButton.vue"), true);

  const taxonomy = read("src/app-core/ui/actionTaxonomy.ts");
  for (const action of [
    "close",
    "copy",
    "delete",
    "edit",
    "export",
    "import",
    "live",
    "open",
    "save",
    "settings",
    "share",
    "sync",
    "verify"
  ]) {
    assert.match(taxonomy, new RegExp(`${action}:\\s*\\{`), `${action} should have a taxonomy entry`);
  }
  assert.match(taxonomy, /resolveActionDefinition/);
  assert.match(taxonomy, /mdi-content-copy/);
  assert.match(taxonomy, /mdi-delete-outline/);

  const migratedTemplates = [
    "src/components/shell/PortfolioReportModal.html",
    "src/components/windows/game/dialogs/GameSpectatorDialog.html",
    "src/components/windows/singles/SinglesPurchasingCard.html",
    "src/components/windows/whatnot/WhatnotCsvImportDialog.html",
    "src/components/windows/whatnot/WhatnotReviewDialog.html"
  ];

  for (const templatePath of migratedTemplates) {
    assert.match(read(templatePath), /<app-action-button\b/, `${templatePath} should use app-action-button`);
  }
});
