import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { describe, test } from "vitest";

describe("buyer quick view UI contract", () => {
  test("provides a reusable customer modal component", () => {
    assert.equal(existsSync("src/components/customers/BuyerQuickViewModal.vue"), true);
    assert.equal(existsSync("src/components/customers/BuyerQuickViewModal.ts"), true);
    assert.equal(existsSync("src/components/customers/BuyerQuickViewModal.html"), true);

    const template = readFileSync("src/components/customers/BuyerQuickViewModal.html", "utf8");
    assert.match(template, /<v-dialog/);
    assert.match(template, /buyerQuickViewTotalLotLabel/);
    assert.match(template, /buyerQuickViewGroupedTitle/);
  });

  test("sales history exposes named customers as the buyer quick-view entry point", () => {
    const definition = readFileSync("src/components/windows/sales/SalesHistoryLedger.ts", "utf8");
    const template = readFileSync("src/components/windows/sales/SalesHistoryLedger.html", "utf8");
    const windowTemplate = readFileSync("src/components/windows/sales/SalesWindow.html", "utf8");

    assert.match(definition, /"open-buyer"/);
    assert.match(template, /\$emit\('open-buyer',\s*saleCustomerLabel\(sale\)\)/);
    assert.match(template, /sales-history-ledger__customer-button/);
    assert.match(windowTemplate, /<buyer-quick-view-modal/);
    assert.match(windowTemplate, /@open-buyer="openBuyerQuickView"/);
  });
});
