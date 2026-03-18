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

