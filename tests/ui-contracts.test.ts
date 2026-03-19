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
  const appTemplate = read("index.html");
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

test("lot selector uses the explicit switch handler", () => {
  const appTemplate = read("index.html");

  assert.match(appTemplate, /:model-value="currentLotId"/);
  assert.match(appTemplate, /@update:model-value="selectLot"/);
});

test("singles custom mode uses a plain item text field instead of autocomplete", () => {
  const singlesTemplate = read("src/components/windows/SinglesConfigWindow.html");

  assert.match(singlesTemplate, /<v-text-field\s+[\s\S]*v-if="!showCatalogSuggestions"[\s\S]*v-model="editingSinglesRow\.item"/);
  assert.match(singlesTemplate, /<v-autocomplete\s+[\s\S]*v-else[\s\S]*v-model:search="singlesItemSearchText"/);
});

