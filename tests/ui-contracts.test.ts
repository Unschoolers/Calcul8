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

test("both Live FAB and Config quick button open the same auto-calc modal state", () => {
  const appTemplate = read("index.html");
  const configWindowTemplate = read("src/components/windows/ConfigWindow.html");

  assert.match(appTemplate, /@click="showProfitCalculator = true"/);
  assert.match(configWindowTemplate, /@click="showProfitCalculator = true"/);
  assert.match(appTemplate, /<auto-calculate-modal\s+:ctx="\$root"><\/auto-calculate-modal>/);
});

