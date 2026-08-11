import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

test("Singles purchasing and editor use shared surfaces and summary-first mobile structure", () => {
  const configScript = read("src/components/windows/singles/SinglesConfigWindow.ts");
  const configTemplate = read("src/components/windows/singles/SinglesConfigWindow.html");
  const purchasingScript = read("src/components/windows/singles/SinglesPurchasingCard.ts");
  const purchasingTemplate = read("src/components/windows/singles/SinglesPurchasingCard.html");

  assert.match(configScript, /AppSectionCard/);
  assert.match(configTemplate, /<app-section-card[\s\S]+singles-editor-sheet/);
  assert.doesNotMatch(configTemplate, /<v-card class="singles-editor-sheet"/);

  assert.match(purchasingScript, /AppEmptyState/);
  assert.match(purchasingScript, /AppSectionCard/);
  assert.match(purchasingScript, /AppToolbarCard/);
  assert.match(purchasingTemplate, /<app-section-card[\s\S]+singles-grid-card/);
  assert.match(purchasingTemplate, /<app-toolbar-card[\s\S]+singles-mobile-sticky-tools/);
  assert.match(purchasingTemplate, /singles-mobile-summary-panel/);
  assert.match(purchasingTemplate, /<app-empty-state[\s\S]+singlesEmptyState/);
  assert.match(purchasingTemplate, /<app-empty-state[\s\S]+singlesSearchEmptyState/);
  assert.match(purchasingTemplate, /<app-empty-state[\s\S]+singlesSoldOutEmptyState/);
});

test("Portfolio sales drilldown has mobile cards with the same row actions and values as the desktop table", () => {
  const template = read("src/components/windows/portfolio/PortfolioWindow.html");
  const styles = read("src/components/windows/portfolio/PortfolioWindow.css");

  assert.match(template, /portfolio-sales-drilldown-mobile-list/);
  assert.match(template, /app-mobile-preview-card/);
  assert.match(template, /portfolio-sales-drilldown-mobile-card/);
  assert.match(template, /portfolioSalesByUserSelectedDrilldownRows\(\)/);
  assert.match(template, /portfolio-sales-drilldown-desktop-table/);
  assert.match(styles, /\.portfolio-sales-drilldown-mobile-list/);
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]+\.portfolio-sales-drilldown-desktop-table/);
  assert.doesNotMatch(styles, /\.portfolio-sales-drilldown-card\b/);
});

test("Game workflow dialogs and inspector use shared dialog and section contracts", () => {
  const gameTemplate = read("src/components/windows/game/coordinator/GameWindow.html");
  const inspectorScript = read("src/components/windows/game/inspector/WheelInspector.ts");
  const inspectorTemplate = read("src/components/windows/game/inspector/WheelInspector.html");
  const tierEditorStyles = read("src/components/windows/game/styles/wheel-tier-editor.css");
  const sharedDialogBlocks = gameTemplate.match(/<app-dialog-shell\b[\s\S]*?<\/app-dialog-shell>/g) ?? [];

  assert.doesNotMatch(gameTemplate, /<v-dialog\b/);
  assert.equal(sharedDialogBlocks.length, 4);

  for (const dialogContract of [
    {
      className: "wheel-pending-lot-dialog",
      state: /v-if="wheelHasRequiredLotSelection && wheelPendingInventoryIssues\.length"/,
      actions: [/:title="wheelPendingInventoryIssuesTitle"/, /@click="confirmAllBatchSales"/]
    },
    {
      className: "wheel-confirm-dialog",
      state: /v-model="wheelConfirmDialog"/,
      actions: [/@click="wheelConfirmDialog = false"/, /@click="confirmWheelAction"/]
    },
    {
      className: "wheel-live-confirm-dialog",
      state: /v-model="wheelLiveConfirmDialog"/,
      actions: [/@click="cancelWheelModeChange"/, /@click="confirmWheelModeChange"/]
    },
    {
      className: "wheel-manage-dialog",
      state: /v-model="wheelManageDialog"/,
      actions: [/@click="closeWheelManageDialog"/, /@click="applyWheelManageDialog"/]
    }
  ]) {
    const dialogBlock = sharedDialogBlocks.find((block) => block.includes(`class="${dialogContract.className}"`));
    assert.ok(dialogBlock, `${dialogContract.className} must be owned by AppDialogShell`);
    assert.match(dialogBlock, dialogContract.state);
    for (const action of dialogContract.actions) assert.match(dialogBlock, action);
  }

  assert.doesNotMatch(tierEditorStyles, /^\.wheel-tier-editor\s*\{/m);

  assert.match(inspectorScript, /AppSectionCard/);
  assert.match(inspectorTemplate, /<app-section-card[\s\S]+wheel-inspector-panel/);
  assert.match(inspectorTemplate, /app-section-title-bar/);
  assert.doesNotMatch(inspectorTemplate, /^<v-card[\s\S]+wheel-inspector-panel/);
});
