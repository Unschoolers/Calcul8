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

test("PortfolioWindow portfolio filter helpers keep hidden ids out of the visible summary", () => {
  const vm = {
    portfolioLotTypeFilter: "singles",
    portfolioLotFilterIds: [11, 22, 33],
    portfolioLotFilterItems: [
      { title: "Singles A", value: 22 },
      { title: "Singles B", value: 33 }
    ],
    portfolioVisibleLotFilterIds: PortfolioWindow.methods.portfolioVisibleLotFilterIds,
    portfolioLotFilterDefaultLabel: PortfolioWindow.methods.portfolioLotFilterDefaultLabel
  };

  const visible = PortfolioWindow.methods.portfolioVisibleLotFilterIds.call(vm as never);
  assert.deepEqual(visible, [22, 33]);
  assert.equal(PortfolioWindow.methods.portfolioLotFilterPrimaryLabel.call(vm as never), "Singles A");
  assert.equal(PortfolioWindow.methods.portfolioLotFilterRemainingCount.call(vm as never), 1);
  assert.equal(PortfolioWindow.methods.portfolioLotFilterDefaultLabel.call(vm as never), "All singles lots");
});

test("PortfolioWindow filter search regrouping keeps bulk items together", () => {
  const vm = {
    portfolioLotFilterItems: [
      { title: "Bleach volume 2", value: 11, subtitle: "Bulk • 2026-02-01", lotType: "bulk", groupLabel: "Bulk lots" },
      { title: "One punch man", value: 22, subtitle: "Bulk • 2026-02-14", lotType: "bulk", groupLabel: null },
      { title: "Union arena singles", value: 33, subtitle: "Singles • 2026-02-21", lotType: "singles", groupLabel: "Singles lots" },
      { title: "Kaiju #8", value: 44, subtitle: "Bulk • 2026-03-01", lotType: "bulk", groupLabel: null }
    ],
    portfolioLotFilterSearchQuery: "a"
  };

  const visibleItems = PortfolioWindow.methods.portfolioVisibleLotFilterItems.call(vm as never);
  assert.deepEqual(visibleItems.map((item: { title: string; groupLabel?: string | null }) => [item.title, item.groupLabel ?? null]), [
    ["Bleach volume 2", "Bulk lots"],
    ["One punch man", null],
    ["Kaiju #8", null],
    ["Union arena singles", "Singles lots"]
  ]);
});
