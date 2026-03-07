import assert from "node:assert/strict";
import { test } from "vitest";
import { PortfolioWindow } from "../src/components/windows/PortfolioWindow.ts";

test("PortfolioWindow formatting helpers use fallback and formatter", () => {
  const withFormatter = {
    formatCurrency: (value: number | null | undefined, decimals = 2) => `fmt:${value}:${decimals}`
  };
  assert.equal(PortfolioWindow.methods.fmtCurrency.call(withFormatter as never, 12.345, 1), "fmt:12.345:1");

  const fallback = {};
  assert.equal(PortfolioWindow.methods.fmtCurrency.call(fallback as never, 12.345, 2), "12.35");
  assert.equal(PortfolioWindow.methods.fmtCurrency.call(fallback as never, null, 2), "0.00");
});

test("PortfolioWindow chart view helpers rotate through all three views", () => {
  const breakdownVm = {
    portfolioChartView: "breakdown",
    nextPortfolioChartView: PortfolioWindow.methods.nextPortfolioChartView
  };
  const trendVm = {
    portfolioChartView: "trend",
    nextPortfolioChartView: PortfolioWindow.methods.nextPortfolioChartView
  };
  const sellthroughVm = {
    portfolioChartView: "sellthrough",
    nextPortfolioChartView: PortfolioWindow.methods.nextPortfolioChartView
  };

  assert.equal(PortfolioWindow.methods.nextPortfolioChartView.call(breakdownVm as never), "trend");
  assert.equal(PortfolioWindow.methods.nextPortfolioChartView.call(trendVm as never), "sellthrough");
  assert.equal(PortfolioWindow.methods.nextPortfolioChartView.call(sellthroughVm as never), "breakdown");

  assert.equal(PortfolioWindow.methods.portfolioChartToggleIcon.call(breakdownVm as never), "mdi-chart-line");
  assert.equal(PortfolioWindow.methods.portfolioChartToggleIcon.call(trendVm as never), "mdi-chart-bar");
  assert.equal(PortfolioWindow.methods.portfolioChartToggleIcon.call(sellthroughVm as never), "mdi-chart-donut");
});
