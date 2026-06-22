import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";

describe("portfolio customer performance UI", () => {
  test("portfolio owns a local lots/customers performance switch", () => {
    const template = readFileSync("src/components/windows/portfolio/PortfolioWindow.html", "utf8");
    const definition = readFileSync("src/components/windows/portfolio/PortfolioWindow.definition.ts", "utf8");
    const component = readFileSync("src/components/windows/portfolio/PortfolioWindow.ts", "utf8");

    assert.match(definition, /portfolioPerformanceView/);
    assert.match(template, /portfolioPerformanceSheetTitle/);
    assert.match(template, /portfolioPerformanceViewModeLabel/);
    assert.match(template, /portfolio-performance-sheet-switch/);
    assert.match(template, /portfolio-performance-mode-toggle/);
    assert.match(template, /portfolioPerformanceLotsViewLabel/);
    assert.match(template, /portfolioPerformanceCustomersViewLabel/);
    assert.match(template, /portfolio-customer-performance/);
    assert.match(template, /customerPerformanceRows/);
    assert.match(template, /<buyer-quick-view-modal/);
    assert.match(component, /BuyerQuickViewModal/);
  });

  test("lot performance uses the same responsive grid contract as customer performance", () => {
    const template = readFileSync("src/components/windows/portfolio/PortfolioWindow.html", "utf8");
    const styles = readFileSync("src/components/windows/portfolio/PortfolioWindow.css", "utf8");

    assert.match(template, /portfolio-lot-performance/);
    assert.match(template, /portfolio-performance-grid__head/);
    assert.match(template, /portfolio-performance-grid__row/);
    assert.match(template, /portfolioLotColumnNameLabel/);
    assert.match(template, /portfolioLotColumnStatusLabel/);
    assert.match(template, /portfolioLotColumnSoldMarginLabel/);
    assert.match(template, /portfolioLotColumnRiskLabel/);
    assert.match(template, /portfolioLotColumnProfitLabel/);
    assert.match(styles, /\.portfolio-performance-grid__head/);
    assert.match(styles, /\.portfolio-performance-grid__row/);
    assert.match(styles, /portfolio-lot-performance/);
  });
});
