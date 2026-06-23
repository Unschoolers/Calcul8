import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";

describe("portfolio customer performance UI", () => {
  test("portfolio owns a local lots/customers performance switch", () => {
    const template = readFileSync("src/components/windows/portfolio/PortfolioWindow.html", "utf8");
    const definition = readFileSync("src/components/windows/portfolio/PortfolioWindow.definition.ts", "utf8");
    const component = readFileSync("src/components/windows/portfolio/PortfolioWindow.ts", "utf8");

    assert.match(definition, /portfolioPerformanceView/);
    assert.match(definition, /portfolioLotPerformanceSortKey/);
    assert.match(definition, /portfolioCustomerPerformanceSortKey/);
    assert.match(template, /portfolioPerformanceSheetTitle/);
    assert.match(template, /portfolioPerformanceViewModeLabel/);
    assert.match(template, /portfolio-performance-sheet-switch/);
    assert.match(template, /portfolio-performance-sheet-switch__summary/);
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
    const sortbarRule = styles.match(/\.portfolio-performance-grid__sortbar\s*{[^}]*}/)?.[0] ?? "";

    assert.match(template, /portfolio-lot-performance/);
    assert.match(template, /portfolio-performance-grid__head/);
    assert.match(template, /portfolio-performance-grid__row/);
    assert.match(template, /portfolioLotColumnNameLabel/);
    assert.match(template, /portfolioLotColumnStatusLabel/);
    assert.match(template, /portfolioLotColumnSoldMarginLabel/);
    assert.match(template, /portfolioLotColumnRiskLabel/);
    assert.match(template, /portfolioLotColumnProfitLabel/);
    assert.match(template, /portfolioPerformanceSortLabel/);
    assert.match(template, /portfolio-performance-grid__sort-button/);
    assert.match(template, /portfolio-performance-grid__sort-label/);
    assert.doesNotMatch(template, /class="sr-only"/);
    assert.match(template, /portfolio-performance-grid__sortbar/);
    assert.match(template, /v-for="option in portfolioLotPerformanceSortOptions\(\)"/);
    assert.match(template, /v-for="option in portfolioCustomerPerformanceSortOptions\(\)"/);
    assert.match(template, /setPortfolioLotPerformanceSort\(option\.key\)/);
    assert.match(template, /setPortfolioCustomerPerformanceSort\(option\.key\)/);
    assert.match(template, /portfolioLotPerformanceSortButtonClass\(option\.key\)/);
    assert.match(template, /portfolioCustomerPerformanceSortButtonClass\(option\.key\)/);
    assert.match(template, /portfolio-performance-grid__cell--number/);
    assert.match(template, /sortedPortfolioLotPerformanceRows/);
    assert.match(template, /portfolioBuyerContextTitle/);
    assert.match(template, /portfolioLotContextTitle/);
    assert.match(styles, /\.portfolio-performance-grid__head/);
    assert.match(styles, /\.portfolio-performance-grid__row/);
    assert.match(styles, /\.portfolio-performance-grid__cell--number/);
    assert.match(styles, /\.portfolio-performance-grid__sort-button/);
    assert.match(styles, /\.portfolio-performance-grid__sort-label\s*{[\s\S]*position:\s*absolute/);
    assert.match(styles, /\.portfolio-performance-grid__sort-label\s*{[\s\S]*clip-path:\s*inset\(50%\)/);
    assert.match(styles, /\.portfolio-performance-grid__sortbar/);
    assert.match(styles, /\.portfolio-performance-grid__sortbar\s*{[\s\S]*display:\s*none/);
    assert.match(styles, /@media \(max-width:\s*900px\)[\s\S]*\.portfolio-performance-grid__sortbar\s*{[\s\S]*display:\s*flex/);
    assert.match(styles, /@media \(max-width:\s*900px\)[\s\S]*\.portfolio-performance-grid__sortbar\s*{[\s\S]*flex-wrap:\s*wrap/);
    assert.match(styles, /@media \(max-width:\s*900px\)[\s\S]*\.portfolio-performance-grid__sortbar\s*{[\s\S]*overflow:\s*visible/);
    assert.doesNotMatch(sortbarRule, /overflow-x:\s*auto/);
    assert.match(styles, /@media \(max-width:\s*600px\)[\s\S]*\.portfolio-customer-performance \.portfolio-performance-grid__sort:nth-child\(3\),[\s\S]*\.portfolio-customer-performance \.portfolio-performance-grid__sort:nth-child\(4\),[\s\S]*\.portfolio-customer-performance \.portfolio-performance-grid__sort:nth-child\(6\)\s*{[\s\S]*display:\s*none/);
    assert.match(styles, /@media \(max-width:\s*900px\)[\s\S]*\.portfolio-performance-grid__head\s*{[\s\S]*display:\s*none/);
    assert.match(styles, /@media \(max-width:\s*900px\)[\s\S]*\.portfolio-performance-grid__row\s*{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(styles, /@media \(max-width:\s*900px\)[\s\S]*\.portfolio-customer-performance \.portfolio-performance-grid__row\s*{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1\.15fr\)\s+minmax\(56px,\s*0\.55fr\)\s+minmax\(56px,\s*0\.55fr\)/);
    assert.match(styles, /@media \(max-width:\s*900px\)[\s\S]*\.portfolio-customer-performance \.portfolio-performance-grid__row > span:nth-child\(6\)\s*{[\s\S]*grid-column:\s*2 \/ 4/);
    assert.match(styles, /@media \(max-width:\s*900px\)[\s\S]*\.portfolio-customer-performance \.portfolio-performance-grid__row > span\s*{[\s\S]*overflow-wrap:\s*anywhere/);
    assert.match(styles, /@media \(max-width:\s*900px\)[\s\S]*\.portfolio-lot-profit-chip\s*{[\s\S]*height:\s*auto/);
    assert.match(styles, /@media \(max-width:\s*900px\)[\s\S]*\.portfolio-lot-profit-chip \.v-chip__content\s*{[\s\S]*white-space:\s*normal/);
    assert.match(styles, /portfolio-lot-performance/);
  });
});
