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

test("PortfolioWindow chart view helpers rotate through all four views", () => {
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
  const marginVm = {
    portfolioChartView: "margin",
    nextPortfolioChartView: PortfolioWindow.methods.nextPortfolioChartView
  };

  assert.equal(PortfolioWindow.methods.nextPortfolioChartView.call(breakdownVm as never), "trend");
  assert.equal(PortfolioWindow.methods.nextPortfolioChartView.call(trendVm as never), "sellthrough");
  assert.equal(PortfolioWindow.methods.nextPortfolioChartView.call(sellthroughVm as never), "margin");
  assert.equal(PortfolioWindow.methods.nextPortfolioChartView.call(marginVm as never), "breakdown");

  assert.equal(PortfolioWindow.methods.portfolioChartToggleIcon.call(breakdownVm as never), "mdi-chart-line");
  assert.equal(PortfolioWindow.methods.portfolioChartToggleIcon.call(trendVm as never), "mdi-chart-bar");
  assert.equal(PortfolioWindow.methods.portfolioChartToggleIcon.call(sellthroughVm as never), "mdi-percent-outline");
  assert.equal(PortfolioWindow.methods.portfolioChartToggleIcon.call(marginVm as never), "mdi-chart-donut");
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

test("PortfolioWindow enter closes and blurs the portfolio filter even when search has text", () => {
  let blurred = false;
  const vm = {
    portfolioLotFilterItems: [
      { title: "Bleach volume 2", value: 11, subtitle: "Bulk • 2026-02-01", lotType: "bulk", groupLabel: "Bulk lots" },
      { title: "Kagurabachi", value: 22, subtitle: "Bulk • 2026-03-03", lotType: "bulk", groupLabel: null }
    ],
    portfolioLotFilterIds: [11],
    portfolioLotFilterSearchQuery: "kag",
    portfolioLotFilterMenuOpen: true,
    $refs: {
      portfolioLotFilterSelect: {
        blur() {
          blurred = true;
        }
      }
    },
    blurPortfolioLotFilter: PortfolioWindow.methods.blurPortfolioLotFilter,
    closePortfolioLotFilter: PortfolioWindow.methods.closePortfolioLotFilter
  };

  PortfolioWindow.methods.closePortfolioLotFilterOnEnter.call(vm as never);

  assert.deepEqual(vm.portfolioLotFilterIds, [11]);
  assert.equal(vm.portfolioLotFilterSearchQuery, "kag");
  assert.equal(vm.portfolioLotFilterMenuOpen, false);
  assert.equal(blurred, true);
});

test("PortfolioWindow enter closes the portfolio filter menu when search is empty", () => {
  let blurred = false;
  const vm = {
    portfolioLotFilterIds: [22],
    portfolioLotFilterSearchQuery: "",
    portfolioLotFilterMenuOpen: true,
    $refs: {
      portfolioLotFilterSelect: {
        blur() {
          blurred = true;
        }
      }
    },
    blurPortfolioLotFilter: PortfolioWindow.methods.blurPortfolioLotFilter,
    closePortfolioLotFilter: PortfolioWindow.methods.closePortfolioLotFilter
  };

  PortfolioWindow.methods.closePortfolioLotFilterOnEnter.call(vm as never);

  assert.deepEqual(vm.portfolioLotFilterIds, [22]);
  assert.equal(vm.portfolioLotFilterMenuOpen, false);
  assert.equal(blurred, true);
});

test("PortfolioWindow mobile KPI helpers clamp, wrap, and expand when average forecast exists", () => {
  const vm = {
    averagePortfolioForecastScenario: { label: "Average" },
    mobileKpiIndex: 0,
    mobileKpiSlideCount: PortfolioWindow.methods.mobileKpiSlideCount,
    mobileKpiEffectiveIndex: PortfolioWindow.methods.mobileKpiEffectiveIndex
  };

  assert.equal(PortfolioWindow.methods.mobileKpiSlideCount.call(vm as never), 4);
  assert.equal(PortfolioWindow.methods.mobileKpiEffectiveIndex.call({ ...vm, mobileKpiIndex: 7 } as never), 3);
  assert.equal(PortfolioWindow.methods.mobileKpiEffectiveIndex.call({ ...vm, mobileKpiIndex: -2 } as never), 0);

  PortfolioWindow.methods.setMobileKpiIndex.call(vm as never, 2);
  assert.equal(vm.mobileKpiIndex, 2);
  PortfolioWindow.methods.setMobileKpiIndex.call(vm as never, 99);
  assert.equal(vm.mobileKpiIndex, 3);

  PortfolioWindow.methods.cycleMobileKpi.call(vm as never, 1);
  assert.equal(vm.mobileKpiIndex, 0);
  PortfolioWindow.methods.cycleMobileKpi.call(vm as never, -1);
  assert.equal(vm.mobileKpiIndex, 3);
});

test("PortfolioWindow mobile KPI helpers fall back safely when count is zero or invalid", () => {
  const zeroVm = {
    mobileKpiIndex: 5,
    mobileKpiSlideCount: () => 0
  };
  PortfolioWindow.methods.setMobileKpiIndex.call(zeroVm as never, 3);
  assert.equal(zeroVm.mobileKpiIndex, 0);

  const singleVm = {
    mobileKpiIndex: 2,
    mobileKpiSlideCount: () => 1,
    mobileKpiEffectiveIndex: () => 0
  };
  PortfolioWindow.methods.cycleMobileKpi.call(singleVm as never, 1);
  assert.equal(singleVm.mobileKpiIndex, 0);
});

test("PortfolioWindow lot status, incomplete state, and profit labels prefer forecast when incomplete", () => {
  const vm = {
    fmtCurrency: PortfolioWindow.methods.fmtCurrency,
    formatCurrency: (value: number | null | undefined, decimals = 2) => Number(value || 0).toFixed(decimals),
    portfolioLotIsIncomplete: PortfolioWindow.methods.portfolioLotIsIncomplete
  };

  assert.equal(
    PortfolioWindow.methods.portfolioLotStatusTone.call(vm as never, { totalProfit: -1, salesCount: 0 }),
    "negative"
  );
  assert.equal(
    PortfolioWindow.methods.portfolioLotStatusTone.call(vm as never, { totalProfit: 0, forecastProfitAverage: 5, salesCount: 0 }),
    "positive"
  );
  assert.equal(
    PortfolioWindow.methods.portfolioLotStatusTone.call(vm as never, { totalProfit: 0, forecastProfitAverage: -5, salesCount: 0 }),
    "negative"
  );
  assert.equal(
    PortfolioWindow.methods.portfolioLotStatusTone.call(vm as never, { totalProfit: 0, salesCount: 2 }),
    "positive"
  );
  assert.equal(
    PortfolioWindow.methods.portfolioLotStatusTone.call(vm as never, { totalProfit: 0, salesCount: 0 }),
    "neutral"
  );

  assert.equal(
    PortfolioWindow.methods.portfolioLotIsIncomplete.call(vm as never, { soldPacks: 2, totalPacks: 5 }),
    true
  );

  assert.equal(
    PortfolioWindow.methods.portfolioLotPrimaryProfitLabel.call(vm as never, {
      soldPacks: 2,
      totalPacks: 5,
      forecastProfitAverage: 12.34
    }),
    "≈ $12.34"
  );
  assert.equal(
    PortfolioWindow.methods.portfolioLotPrimaryProfitLabel.call(vm as never, {
      soldPacks: 2,
      totalPacks: 5,
      forecastProfitAverage: -12.34
    }),
    "≈ -$12.34"
  );
  assert.equal(
    PortfolioWindow.methods.portfolioLotPrimaryProfitLabel.call(vm as never, {
      salesCount: 2,
      realizedProfit: -8.5,
      soldPacks: 5,
      totalPacks: 5
    }),
    "-$8.50"
  );
  assert.equal(
    PortfolioWindow.methods.portfolioLotPrimaryProfitLabel.call(vm as never, {
      salesCount: 0,
      totalProfit: 7.25,
      soldPacks: 5,
      totalPacks: 5
    }),
    "$7.25"
  );
});

test("PortfolioWindow profit chip and performance amount helpers summarize mixed lots", () => {
  const vm = {
    allLotPerformance: [
      { totalProfit: -10 },
      { totalProfit: 25.4 },
      { totalProfit: 0 },
      { totalProfit: -2.6 }
    ],
    fmtCurrency: PortfolioWindow.methods.fmtCurrency,
    formatCurrency: (value: number | null | undefined, decimals = 2) => Number(value || 0).toFixed(decimals),
    portfolioLotIsIncomplete: PortfolioWindow.methods.portfolioLotIsIncomplete,
    portfolioAtRiskLotCount: PortfolioWindow.methods.portfolioAtRiskLotCount
  };

  assert.equal(
    PortfolioWindow.methods.portfolioLotPrimaryProfitChipColor.call(vm as never, {
      soldPacks: 1,
      totalPacks: 4,
      forecastProfitAverage: -4
    }),
    "error"
  );
  assert.equal(
    PortfolioWindow.methods.portfolioLotPrimaryProfitChipColor.call(vm as never, {
      salesCount: 2,
      realizedProfit: 4,
      soldPacks: 4,
      totalPacks: 4
    }),
    "success"
  );
  assert.equal(
    PortfolioWindow.methods.portfolioLotPrimaryProfitChipColor.call(vm as never, {
      salesCount: 0,
      totalProfit: -4,
      soldPacks: 4,
      totalPacks: 4
    }),
    "secondary"
  );

  assert.equal(PortfolioWindow.methods.portfolioAtRiskLotCount.call(vm as never), 2);
  assert.equal(PortfolioWindow.methods.portfolioLotPerformanceUnderAmount.call(vm as never), "13");
  assert.equal(PortfolioWindow.methods.portfolioLotPerformanceOverAmount.call(vm as never), "25");
  assert.equal(PortfolioWindow.methods.portfolioLotPerformanceKpiColor.call(vm as never), "error");
  assert.equal(
    PortfolioWindow.methods.portfolioLotPerformanceKpiColor.call({
      portfolioAtRiskLotCount: () => 0
    } as never),
    "success"
  );
});

test("PortfolioWindow chart copy helpers return expected titles, icons, subtitles, and aria labels", () => {
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
  const marginVm = {
    portfolioChartView: "margin",
    nextPortfolioChartView: PortfolioWindow.methods.nextPortfolioChartView
  };

  assert.equal(PortfolioWindow.methods.portfolioChartToggleTitle.call(breakdownVm as never), "Switch to trend view");
  assert.equal(PortfolioWindow.methods.portfolioChartToggleTitle.call(trendVm as never), "Switch to sell-through view");
  assert.equal(PortfolioWindow.methods.portfolioChartToggleTitle.call(sellthroughVm as never), "Switch to sold profit margin view");
  assert.equal(PortfolioWindow.methods.portfolioChartToggleTitle.call(marginVm as never), "Switch to breakdown view");

  assert.equal(PortfolioWindow.methods.portfolioChartSubtitle.call(breakdownVm as never), "Revenue by lot");
  assert.equal(PortfolioWindow.methods.portfolioChartSubtitle.call(trendVm as never), "Cumulative portfolio profit trend");
  assert.equal(PortfolioWindow.methods.portfolioChartSubtitle.call(sellthroughVm as never), "Sell-through over time (%)");
  assert.equal(PortfolioWindow.methods.portfolioChartSubtitle.call(marginVm as never), "Sold profit margin by lot (%)");

  assert.equal(
    PortfolioWindow.methods.portfolioChartAriaLabel.call(breakdownVm as never),
    "Portfolio revenue breakdown chart by lot."
  );
  assert.equal(
    PortfolioWindow.methods.portfolioChartAriaLabel.call(trendVm as never),
    "Portfolio cumulative profit trend chart."
  );
  assert.equal(
    PortfolioWindow.methods.portfolioChartAriaLabel.call(sellthroughVm as never),
    "Portfolio sell-through percentage over time chart."
  );
  assert.equal(
    PortfolioWindow.methods.portfolioChartAriaLabel.call(marginVm as never),
    "Portfolio sold profit margin percentage chart by lot."
  );
});

test("PortfolioWindow filter helpers use safe fallbacks when refs or items are missing", () => {
  const blurVm = { $refs: {} };
  PortfolioWindow.methods.blurPortfolioLotFilter.call(blurVm as never);

  const closeVm = {
    portfolioLotFilterMenuOpen: true
  };
  PortfolioWindow.methods.closePortfolioLotFilter.call(closeVm as never);
  assert.equal(closeVm.portfolioLotFilterMenuOpen, false);

  const labelVm = {
    portfolioLotTypeFilter: "bulk",
    portfolioLotFilterIds: [99],
    portfolioLotFilterItems: [{ value: 99 }],
    portfolioVisibleLotFilterIds: PortfolioWindow.methods.portfolioVisibleLotFilterIds
  };
  assert.equal(PortfolioWindow.methods.portfolioLotFilterPrimaryLabel.call(labelVm as never), "Selected lots");
  assert.equal(PortfolioWindow.methods.portfolioLotFilterRemainingCount.call({ portfolioVisibleLotFilterIds: () => [] } as never), 0);
  assert.equal(PortfolioWindow.methods.portfolioLotFilterDefaultLabel.call({ portfolioLotTypeFilter: "bulk" } as never), "All bulk lots");
  assert.equal(PortfolioWindow.methods.portfolioLotFilterDefaultLabel.call({ portfolioLotTypeFilter: "other" } as never), "All lots");
});
