import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { describe, test } from "vitest";

describe("buyer quick view UI contract", () => {
  test("provides a reusable customer modal component", () => {
    assert.equal(existsSync("src/components/customers/BuyerQuickViewModal.vue"), true);
    assert.equal(existsSync("src/components/customers/BuyerQuickViewModal.ts"), true);
    assert.equal(existsSync("src/components/customers/BuyerQuickViewModal.html"), true);
    assert.equal(existsSync("src/components/customers/BuyerQuickViewHost.vue"), true);
    assert.equal(existsSync("src/components/customers/BuyerIdentityLabel.vue"), true);

    const template = readFileSync("src/components/customers/BuyerQuickViewModal.html", "utf8");
    assert.match(template, /<app-dialog-shell/);
    assert.doesNotMatch(template, /<v-dialog\b/);
    assert.match(template, /buyerQuickViewTotalLotLabel/);
    assert.match(template, /buyerQuickViewGroupedTitle/);
  });

  test("uses the shared shell as the only padded and themed dialog surface", () => {
    const template = readFileSync("src/components/customers/BuyerQuickViewModal.html", "utf8");
    const styles = readFileSync("src/components/customers/BuyerQuickViewModal.css", "utf8");
    const contentRule = styles.match(/\.buyer-quick-view-content\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

    assert.match(template, /<app-dialog-shell\b[^>]*class="buyer-quick-view-dialog"/s);
    assert.doesNotMatch(contentRule, /padding(?:-inline|-left|-right)?\s*:/);
    assert.doesNotMatch(styles, /\.buyer-quick-view-content\s*\{[^}]*padding-inline\s*:/s);
    assert.match(
      styles,
      /\.buyer-quick-view-dialog\s+\.app-dialog-card\s*\{[^}]*border:[^}]*background:/s
    );
    assert.doesNotMatch(styles, /\.buyer-quick-view-card\s*\{/);
  });

  test("sales history exposes named customers as the buyer quick-view entry point", () => {
    const definition = readFileSync("src/components/windows/sales/SalesHistoryLedger.ts", "utf8");
    const template = readFileSync("src/components/windows/sales/SalesHistoryLedger.html", "utf8");
    const windowTemplate = readFileSync("src/components/windows/sales/SalesWindow.html", "utf8");

    assert.match(definition, /"open-buyer"/);
    assert.match(template, /\$emit\('open-buyer',\s*saleCustomerLabel\(sale\)\)/);
    assert.match(template, /sales-history-ledger__customer-button/);
    assert.match(windowTemplate, /<buyer-quick-view-host/);
    assert.match(windowTemplate, /@open-buyer="openBuyerQuickView"/);
  });
});
