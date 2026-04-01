import assert from "node:assert/strict";
import { test } from "vitest";
import { readFileSync } from "node:fs";

function read(filePath: string): string {
  return readFileSync(filePath, "utf8");
}

test("auto-calculate modal is controlled by showProfitCalculator", () => {
  const modalTemplate = read("src/components/modals/AutoCalculateModal.html");
  assert.match(modalTemplate, /<v-dialog\s+v-model="showProfitCalculator"/);
});

test("both Live FAB and Config quick button use the same centralized auto-calc access method", () => {
  const appTemplate = read("src/App.html");
  const configWindowTemplate = read("src/components/windows/ConfigWindow.html");
  const singlesSellingCardTemplate = read("src/components/windows/singles/SinglesSellingCard.html");

  assert.match(appTemplate, /@click="accessProFeature\('autoCalculate'\)"/);
  assert.match(configWindowTemplate, /@click="accessProFeature\('autoCalculate'\)"/);
  assert.match(singlesSellingCardTemplate, /@click="accessProFeature\('autoCalculate'\)"/);
  assert.match(appTemplate, /<auto-calculate-modal\s+:ctx="\$root"><\/auto-calculate-modal>/);
});

test("config purchase total field saves through the model update event", () => {
  const configWindowTemplate = read("src/components/windows/ConfigWindow.html");

  assert.match(configWindowTemplate, /:model-value="purchaseCostInputValue"/);
  assert.match(configWindowTemplate, /@update:model-value="updatePurchaseCostInput"/);
});

test("fee profile popovers adapt to narrow screens in config and singles flows", () => {
  const configWindowTemplate = read("src/components/windows/ConfigWindow.html");
  const singlesSellingCardTemplate = read("src/components/windows/singles/SinglesSellingCard.html");
  const configStyles = read("src/components/windows/ConfigWindow.css");
  const singlesStyles = read("src/components/windows/SinglesConfigWindow.css");

  assert.match(configWindowTemplate, /content-class="fee-profile-menu"/);
  assert.match(singlesSellingCardTemplate, /content-class="fee-profile-menu"/);
  assert.match(configWindowTemplate, /:location="\$vuetify\?\.display\?\.smAndDown \? 'bottom center' : 'bottom end'"/);
  assert.match(singlesSellingCardTemplate, /:location="\$vuetify\?\.display\?\.smAndDown \? 'bottom center' : 'bottom end'"/);
  assert.match(configStyles, /\.fee-profile-menu\s*\{\s*width: min\(100vw - 1rem, 360px\);/);
  assert.match(singlesStyles, /\.fee-profile-menu\s*\{\s*width: min\(100vw - 1rem, 360px\);/);
  assert.match(configStyles, /\.fee-profile-popover__row\s*\{\s*display: flex;[\s\S]*?justify-content: space-between;/);
  assert.match(singlesStyles, /\.fee-profile-popover__row\s*\{\s*display: flex;[\s\S]*?justify-content: space-between;/);
  assert.match(configStyles, /@media\s*\(max-width:\s*960px\)\s*\{[\s\S]*?\.fee-profile-popover__row\s*\{[\s\S]*?flex-direction:\s*column;/);
  assert.match(singlesStyles, /@media\s*\(max-width:\s*960px\)\s*\{[\s\S]*?\.fee-profile-popover__row\s*\{[\s\S]*?flex-direction:\s*column;/);
});

test("wheel mobile summary cards stay static and non-clickable", () => {
  const wheelTemplate = read("src/components/windows/WheelWindow.html");

  assert.match(wheelTemplate, /<div\s+v-if="wheelMode === 'config'"\s+class="wheel-stage-summary-card"/);
  assert.match(wheelTemplate, /<div\s+v-if="wheelMode === 'live'"\s+class="wheel-stage-summary-card"/);
  assert.doesNotMatch(wheelTemplate, /class="wheel-stage-summary-card"[^>]*@click=/);
  assert.doesNotMatch(wheelTemplate, /<button[^>]*class="wheel-stage-summary-card"/);
});

test.todo("wheel tier rows are rendered by a reusable WheelTierCard component");

test.todo("wheel setup view uses compact tier summary cards with an edit action instead of always-open inline forms");

test("wheel mobile action rail keeps session accessible in test and live modes", () => {
  const railTemplate = read("src/components/windows/WheelActionRail.html");

  assert.match(railTemplate, /mode === 'live' \? 'Session' : 'Builder'/);
  assert.match(railTemplate, /v-if="mode === 'live'"/);
  assert.match(railTemplate, /@click="\$emit\('open-inspector', 'session'\)"/);
  assert.match(railTemplate, /mdi-chart-box-outline/);
  assert.match(railTemplate, />\s*Session\s*</);
});

test("wheel mobile inspector keeps a dedicated close button visible in the sticky header", () => {
  const inspectorTemplate = read("src/components/windows/WheelInspector.html");
  const wheelStyles = read("src/components/windows/WheelWindow.css");

  assert.match(inspectorTemplate, /class="wheel-panel-title__copy"/);
  assert.match(inspectorTemplate, /class="wheel-inspector-mobile-close"/);
  assert.match(wheelStyles, /\.wheel-panel-title__copy\s*\{\s*flex:\s*1 1 auto;[\s\S]*?min-width:\s*0;/);
  assert.match(wheelStyles, /\.wheel-inspector-mobile-close\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?right:\s*10px;[\s\S]*?z-index:\s*4;/);
});

test.todo("wheel shell exposes top-level Setup / Live / History navigation");

test.todo("wheel setup view owns builder-only controls and tier editing");

test.todo("wheel live view owns the wheel stage, live KPIs, and session actions");

test.todo("wheel history view owns fairness and spin-history inspection");

test.todo("WheelCanvasStage owns the wheel canvas, center cap, pointer, and wheel-only overlays");

test("lot selector uses the explicit switch handler", () => {
  const appTemplate = read("src/App.html");

  assert.match(appTemplate, /:model-value="currentLotId"/);
  assert.match(appTemplate, /@update:model-value="selectLot"/);
});

test("singles custom mode uses a plain item text field instead of autocomplete", () => {
  const singlesTemplate = read("src/components/windows/SinglesConfigWindow.html");

  assert.match(singlesTemplate, /<v-text-field\s+[\s\S]*v-if="!showCatalogSuggestions"[\s\S]*v-model="editingSinglesRow\.item"/);
  assert.match(singlesTemplate, /<v-autocomplete\s+[\s\S]*v-else[\s\S]*v-model:search="singlesItemSearchText"/);
});

