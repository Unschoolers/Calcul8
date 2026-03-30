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

test("wheel mobile summary cards stay static and non-clickable", () => {
  const wheelTemplate = read("src/components/windows/WheelWindow.html");

  assert.match(wheelTemplate, /<div\s+v-if="wheelMode === 'config'"\s+class="wheel-stage-summary-card"/);
  assert.match(wheelTemplate, /<div\s+v-if="wheelMode === 'live'"\s+class="wheel-stage-summary-card"/);
  assert.doesNotMatch(wheelTemplate, /class="wheel-stage-summary-card"[^>]*@click=/);
  assert.doesNotMatch(wheelTemplate, /<button[^>]*class="wheel-stage-summary-card"/);
});

test("wheel inspector keeps the Builder Session History segmented control", () => {
  const wheelTemplate = read("src/components/windows/WheelWindow.html");

  assert.match(wheelTemplate, /class="wheel-inspector-toggle"/);
  assert.match(wheelTemplate, /<v-btn[^>]*value="config"[\s\S]*Builder/);
  assert.match(wheelTemplate, /<v-btn[^>]*value="session"[\s\S]*Session/);
  assert.match(wheelTemplate, /<v-btn[^>]*value="history"[\s\S]*History/);
});

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

