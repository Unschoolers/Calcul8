import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

test("global UI styles define responsive chart, table, and report contracts", () => {
  const tokens = read("src/styles/design-tokens.css");
  for (const token of [
    "--app-chart-min-height",
    "--app-chart-mobile-min-height",
    "--app-table-scroll-shadow-width",
    "--app-report-print-page-margin"
  ]) {
    assert.match(tokens, new RegExp(`${token}:`), `${token} should be defined`);
  }

  const styles = read("src/styles/app.css");
  for (const className of [
    "app-responsive-chart",
    "app-responsive-chart__head",
    "app-responsive-chart__plot",
    "app-table-wrap--scroll",
    "app-table-scroll-hint",
    "app-report-surface",
    "app-report-card-grid"
  ]) {
    assert.match(styles, new RegExp(`\\.${className}\\b`), `${className} should be styled`);
  }

  assert.match(styles, /@media print[\s\S]+\.app-report-surface/);
});

test("chart surfaces use shared responsive chart containers", () => {
  const chartTemplates = [
    "src/components/windows/sales/SalesWindow.html",
    "src/components/windows/portfolio/PortfolioWindow.html"
  ];

  for (const templatePath of chartTemplates) {
    const template = read(templatePath);
    assert.match(template, /app-responsive-chart/, `${templatePath} should use app-responsive-chart`);
    assert.match(template, /app-responsive-chart__plot/, `${templatePath} should wrap canvases in a chart plot region`);
  }
});

test("responsive chart canvases are not height-scaled by CSS after Chart.js renders", () => {
  const appStyles = read("src/styles/app.css");
  const salesStyles = read("src/components/windows/sales/SalesWindow.css");
  const portfolioStyles = read("src/components/windows/portfolio/PortfolioWindow.css");

  assert.doesNotMatch(appStyles, /\.app-responsive-chart__plot canvas[\s\S]{0,180}max-height:/);
  assert.doesNotMatch(appStyles, /\.app-responsive-chart__plot canvas[\s\S]{0,180}height:\s*100% !important/);
  assert.doesNotMatch(appStyles, /\.app-responsive-chart__plot[\s\S]{0,180}height:\s*var\(--app-dashboard-chart-max-height\)/);
  assert.doesNotMatch(salesStyles, /\.sales-chart-card \.app-responsive-chart__plot canvas[\s\S]{0,180}max-height:/);
  assert.doesNotMatch(salesStyles, /\.sales-chart-card \.app-responsive-chart__plot[\s\S]{0,180}height:/);
  assert.doesNotMatch(portfolioStyles, /\.portfolio-chart-card \.app-responsive-chart__plot canvas[\s\S]{0,180}max-height:/);
  assert.doesNotMatch(portfolioStyles, /\.portfolio-chart-card \.app-responsive-chart__plot[\s\S]{0,180}height:/);
});

test("true data tables expose scroll affordances while mobile card alternatives stay explicit", () => {
  const tableTemplates = [
    "src/components/shell/PortfolioReportModal.html",
    "src/components/windows/portfolio/PortfolioWindow.html",
    "src/components/windows/whatnot/WhatnotCsvImportDialog.html",
    "src/components/windows/singles/SinglesCsvImportDialog.html"
  ];

  for (const templatePath of tableTemplates) {
    const template = read(templatePath);
    assert.match(template, /app-table-wrap--scroll/, `${templatePath} should mark scrollable desktop tables`);
    assert.match(template, /app-table-scroll-hint/, `${templatePath} should expose a scroll hint`);
  }

  for (const templatePath of [
    "src/components/windows/portfolio/PortfolioWindow.html",
    "src/components/windows/whatnot/WhatnotCsvImportDialog.html",
    "src/components/windows/singles/SinglesCsvImportDialog.html"
  ]) {
    assert.match(read(templatePath), /app-mobile-preview-list/, `${templatePath} should keep a mobile-card alternative`);
  }
});

test("portfolio report uses shared report surface and mobile report card grid", () => {
  const reportTemplate = read("src/components/shell/PortfolioReportModal.html");

  assert.match(reportTemplate, /app-report-surface/);
  assert.match(reportTemplate, /app-report-card-grid/);
  assert.match(reportTemplate, /app-report-meta/);
});
