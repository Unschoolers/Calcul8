import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { test } from "vitest";

const sourceRoot = "src";

function collectSourceFiles(root: string, extensions: ReadonlySet<string>): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path, extensions);
    return extensions.has(extname(entry.name)) ? [path.replaceAll("\\", "/")] : [];
  });
}

test("only AppDialogShell owns v-dialog", () => {
  const offenders = collectSourceFiles(sourceRoot, new Set([".html", ".vue"]))
    .filter((path) => /<v-dialog\b/.test(readFileSync(path, "utf8")))
    .map((path) => relative(".", path).replaceAll("\\", "/"));
  assert.deepEqual(offenders, ["src/components/ui/AppDialogShell.html"]);
});

test("only intentional mobile editors own v-bottom-sheet", () => {
  const owners = collectSourceFiles(sourceRoot, new Set([".html", ".vue"]))
    .filter((path) => /<v-bottom-sheet\b/.test(readFileSync(path, "utf8")))
    .map((path) => relative(".", path).replaceAll("\\", "/"))
    .sort();
  assert.deepEqual(owners, [
    "src/components/shell/MobileLotSwitcher.html",
    "src/components/windows/singles/SinglesConfigWindow.html"
  ]);
});

test("responsive layout tokens distinguish navigation and action clearance", () => {
  const tokens = readFileSync("src/styles/design-tokens.css", "utf8");
  for (const name of [
    "--app-shell-content-clearance-nav",
    "--app-shell-content-clearance-actions",
    "--app-sticky-content-top",
    "--app-form-mobile-inline-padding",
    "--app-touch-target-min"
  ]) assert.match(tokens, new RegExp(name));
});

test("feature styles do not encode shell chrome measurements", () => {
  const guarded = [
    "src/components/windows/game/styles/wheel-stage.css",
    "src/components/windows/game/styles/wheel-mobile.css",
    "src/components/windows/singles/SinglesConfigWindow.css",
    "src/components/windows/live/LiveSinglesPanel.css"
  ].map((path) => readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(guarded, /calc\((?:72px|108px|7rem|2\.7rem|8\.5rem)\s*\+/);
});

test("editable feature forms use the shared form contract", () => {
  const required = [
    "src/App.html",
    "src/components/customers/BuyerQuickViewModal.html",
    "src/components/modals/AutoCalculateModal.html",
    "src/components/shell/LotSelectorOnboardingBlock.html",
    "src/components/shell/MobileLotSwitcher.html",
    "src/components/shell/SaleEditorModal.html",
    "src/components/shell/SystemConfigurationDialog.html",
    "src/components/shell/WorkspaceModals.html",
    "src/components/windows/config/ConfigWindow.html",
    "src/components/windows/config/AdminSyncImportCard.html",
    "src/components/windows/game/coordinator/GameWindow.html",
    "src/components/windows/singles/SinglesConfigWindow.html",
    "src/components/windows/singles/SinglesCsvImportDialog.html",
    "src/components/windows/singles/SinglesPurchasingCard.html",
    "src/components/windows/game/bracket/BracketBattleBuilder.html",
    "src/components/windows/game/inspector/WheelInspector.html",
    "src/components/windows/game/inspector/WheelTierCard.html",
    "src/components/windows/game/stage/WheelStageTopbar.html",
    "src/components/windows/live/LiveSinglesPanel.html",
    "src/components/windows/portfolio/PortfolioWindow.html",
    "src/components/windows/whatnot/WhatnotCsvImportDialog.html",
    "src/components/windows/whatnot/WhatnotReviewDialog.html"
  ];

  for (const path of required) {
    assert.match(readFileSync(path, "utf8"), /<app-form-layout\b|app-form-row/);
  }
});

test("configuration forms do not create viewport-filling gaps", () => {
  const styles = readFileSync("src/components/windows/config/ConfigWindow.css", "utf8");
  assert.doesNotMatch(styles, /min-height:\s*(?:100vh|calc\(100vh)/);
  assert.doesNotMatch(styles, /flex-grow:\s*1[^}]*admin/i);
});
