import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

test("shared dense-card utilities preserve mobile names and metric values", () => {
  const styles = read("src/styles/app.css");

  assert.match(styles, /\.app-dense-card-title\s*{[\s\S]*-webkit-line-clamp:\s*2/);
  assert.match(styles, /\.app-dense-card-title\s*{[\s\S]*overflow-wrap:\s*anywhere/);
  assert.match(styles, /\.app-dense-card-meta\s*{[\s\S]*-webkit-line-clamp:\s*2/);
  assert.match(styles, /\.app-dense-metric\s*{[\s\S]*min-width:\s*0/);
  assert.match(styles, /\.app-dense-metric__value\s*{[\s\S]*overflow-wrap:\s*anywhere/);
  assert.match(styles, /@media \(max-width:\s*600px\)[\s\S]*\.app-dense-metric\s*{[\s\S]*grid-template-columns:\s*1fr/);
});

test("current inventory selector uses dense-card text rules on mobile", () => {
  const template = read("src/components/shell/LotSelectorOnboardingBlock.html");
  const styles = read("src/components/shell/LotSelectorOnboardingBlock.css");

  assert.match(template, /lot-selector-selection__title app-dense-card-title/);
  assert.match(template, /lot-selector-selection__subtitle app-dense-card-meta/);
  assert.match(styles, /@media \(max-width:\s*600px\)[\s\S]*\.lot-selector-shell-card \.v-field\s*{[\s\S]*min-height:\s*58px/);
  assert.match(styles, /@media \(max-width:\s*600px\)[\s\S]*\.lot-selector-selection__title\s*{[\s\S]*-webkit-line-clamp:\s*2/);
  assert.match(styles, /@media \(max-width:\s*600px\)[\s\S]*\.lot-selector-selection__subtitle\s*{[\s\S]*-webkit-line-clamp:\s*2/);
  assert.doesNotMatch(styles, /@media \(max-width:\s*600px\)[\s\S]*\.lot-selector-selection__title\s*{[\s\S]*white-space:\s*nowrap/);
});

test("Config summary metrics stack labels values and metadata instead of colliding", () => {
  const template = read("src/components/windows/config/ConfigWindow.html");
  const styles = read("src/components/windows/config/ConfigWindow.css");
  const singlesTemplate = read("src/components/windows/singles/SinglesPurchasingCard.html");
  const singlesStyles = read("src/components/windows/singles/SinglesConfigWindow.css");

  assert.match(template, /config-summary-pill app-dense-metric/);
  assert.match(template, /config-summary-pill__label app-dense-metric__label/);
  assert.match(template, /class="config-summary-pill__value app-dense-metric__value"/);
  assert.match(template, /config-summary-pill__meta app-dense-metric__meta/);
  assert.match(styles, /@media \(max-width:\s*600px\)[\s\S]*\.config-summary-pill\s*{[\s\S]*min-height:\s*0/);

  assert.match(singlesTemplate, /singles-summary-pill singles-summary-pill--market app-dense-metric/);
  assert.match(singlesTemplate, /singles-summary-label app-dense-card-meta/);
  assert.match(singlesTemplate, /singles-summary-value app-dense-metric__value/);
  assert.match(singlesStyles, /@media \(max-width:\s*600px\)[\s\S]*\.singles-summary-pill\s*{[\s\S]*grid-template-columns:\s*auto minmax\(0,\s*1fr\)/);
  assert.match(singlesStyles, /@media \(max-width:\s*600px\)[\s\S]*\.singles-summary-value\s*{[\s\S]*grid-column:\s*1 \/ -1/);
});

test("Sales and Portfolio dense cards use the shared legibility contract", () => {
  const salesTemplate = read("src/components/windows/sales/SalesHistoryLedger.html");
  const salesStyles = read("src/components/windows/sales/SalesWindow.css");
  const portfolioWindowTemplate = read("src/components/windows/portfolio/PortfolioWindow.html");
  const portfolioWindowStyles = read("src/components/windows/portfolio/PortfolioWindow.css");
  const portfolioTemplate = read("src/components/windows/portfolio/PortfolioPulsePanel.html");
  const portfolioStyles = read("src/components/windows/portfolio/PortfolioPulsePanel.css");

  assert.match(salesTemplate, /sales-history-ledger__type-text app-dense-card-title/);
  assert.match(salesTemplate, /sales-history-ledger__customer app-dense-card-meta/);
  assert.match(salesTemplate, /sales-history-ledger__profit-value app-dense-metric__value/);
  assert.match(salesStyles, /@media \(max-width:\s*600px\)[\s\S]*\.sales-history-ledger__type-text\s*{[\s\S]*-webkit-line-clamp:\s*2/);

  assert.match(portfolioTemplate, /portfolio-pulse-stat__label app-dense-metric__label/);
  assert.match(portfolioTemplate, /portfolio-pulse-stat__value app-dense-metric__value/);
  assert.match(portfolioTemplate, /portfolio-pulse-insight__title app-dense-card-title/);
  assert.match(portfolioStyles, /@media \(max-width:\s*700px\)[\s\S]*\.portfolio-pulse-stat\s*{[\s\S]*min-height:\s*0/);

  assert.match(portfolioWindowTemplate, /portfolio-performance-grid__primary portfolio-lot-performance__name/);
  assert.match(portfolioWindowTemplate, /portfolio-performance-grid__row/);
  assert.match(portfolioWindowTemplate, /portfolio-lot-profit-chip app-dense-metric__value/);
  assert.match(portfolioWindowStyles, /@media \(max-width:\s*900px\)[\s\S]*\.portfolio-performance-grid__row\s*{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(portfolioWindowStyles, /@media \(max-width:\s*900px\)[\s\S]*\.portfolio-performance-grid__primary\s*{[\s\S]*grid-column:\s*1 \/ -1/);
});
