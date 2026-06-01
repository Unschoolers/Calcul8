import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { portfolioWindowDefinition } from "../src/components/windows/portfolio/PortfolioWindow.definition.ts";
import * as portfolioWindowHelpers from "../src/components/windows/portfolio/portfolio-window-helpers.ts";

test("PortfolioWindow formatting helpers use fallback and formatter", () => {
  const withFormatter = {
    formatCurrency: (value: number | null | undefined, decimals = 2) => `fmt:${value}:${decimals}`
  };
  assert.equal(portfolioWindowDefinition.methods.fmtCurrency.call(withFormatter as never, 12.345, 1), "fmt:12.345:1");

  const fallback = {};
  assert.equal(portfolioWindowDefinition.methods.fmtCurrency.call(fallback as never, 12.345, 2), "12.35");
  assert.equal(portfolioWindowDefinition.methods.fmtCurrency.call(fallback as never, null, 2), "0.00");
});

test("PortfolioWindow chart view helpers rotate through all four views", () => {
  const breakdownVm = {
    portfolioChartView: "breakdown",
    nextPortfolioChartView: portfolioWindowDefinition.methods.nextPortfolioChartView
  };
  const trendVm = {
    portfolioChartView: "trend",
    nextPortfolioChartView: portfolioWindowDefinition.methods.nextPortfolioChartView
  };
  const sellthroughVm = {
    portfolioChartView: "sellthrough",
    nextPortfolioChartView: portfolioWindowDefinition.methods.nextPortfolioChartView
  };
  const marginVm = {
    portfolioChartView: "margin",
    nextPortfolioChartView: portfolioWindowDefinition.methods.nextPortfolioChartView
  };

  assert.equal(portfolioWindowDefinition.methods.nextPortfolioChartView.call(breakdownVm as never), "trend");
  assert.equal(portfolioWindowDefinition.methods.nextPortfolioChartView.call(trendVm as never), "sellthrough");
  assert.equal(portfolioWindowDefinition.methods.nextPortfolioChartView.call(sellthroughVm as never), "margin");
  assert.equal(portfolioWindowDefinition.methods.nextPortfolioChartView.call(marginVm as never), "breakdown");

  assert.equal(portfolioWindowDefinition.methods.portfolioChartToggleIcon.call(breakdownVm as never), "mdi-chart-line");
  assert.equal(portfolioWindowDefinition.methods.portfolioChartToggleIcon.call(trendVm as never), "mdi-chart-bar");
  assert.equal(portfolioWindowDefinition.methods.portfolioChartToggleIcon.call(sellthroughVm as never), "mdi-percent-outline");
  assert.equal(portfolioWindowDefinition.methods.portfolioChartToggleIcon.call(marginVm as never), "mdi-chart-donut");
});

test("PortfolioWindow portfolio filter helpers keep hidden ids out of the visible summary", () => {
  const vm = {
    portfolioLotTypeFilter: "singles",
    portfolioLotFilterIds: [11, 22, 33],
    portfolioLotFilterItems: [
      { title: "Singles A", value: 22 },
      { title: "Singles B", value: 33 }
    ],
    portfolioVisibleLotFilterIds: portfolioWindowDefinition.methods.portfolioVisibleLotFilterIds,
    portfolioLotFilterDefaultLabel: portfolioWindowDefinition.methods.portfolioLotFilterDefaultLabel
  };

  const visible = portfolioWindowDefinition.methods.portfolioVisibleLotFilterIds.call(vm as never);
  assert.deepEqual(visible, [22, 33]);
  assert.equal(portfolioWindowDefinition.methods.portfolioLotFilterPrimaryLabel.call(vm as never), "Singles A");
  assert.equal(portfolioWindowDefinition.methods.portfolioLotFilterRemainingCount.call(vm as never), 1);
  assert.equal(portfolioWindowDefinition.methods.portfolioLotFilterDefaultLabel.call(vm as never), "All singles lots");
});

test("PortfolioWindow filter search regrouping keeps bulk items together", () => {
  const vm = {
    portfolioLotFilterItems: [
      { title: "Bleach volume 2", value: 11, subtitle: "Grouped • 2026-02-01", lotType: "bulk", groupLabel: "Grouped inventory" },
      { title: "One punch man", value: 22, subtitle: "Bulk • 2026-02-14", lotType: "bulk", groupLabel: null },
      { title: "Union arena singles", value: 33, subtitle: "Individual • 2026-02-21", lotType: "singles", groupLabel: "Individual items" },
      { title: "Kaiju #8", value: 44, subtitle: "Bulk • 2026-03-01", lotType: "bulk", groupLabel: null }
    ],
    portfolioLotFilterSearchQuery: "a"
  };

  const visibleItems = portfolioWindowDefinition.methods.portfolioVisibleLotFilterItems.call(vm as never);
  assert.deepEqual(visibleItems.map((item: { title: string; groupLabel?: string | null }) => [item.title, item.groupLabel ?? null]), [
    ["Bleach volume 2", "Grouped inventory"],
    ["One punch man", null],
    ["Kaiju #8", null],
    ["Union arena singles", "Individual items"]
  ]);
});

test("PortfolioWindow dashboard preset items use seller-facing labels and safe slot resolution", () => {
  const vm = {
    portfolioCopy(key: string, fallback: string) {
      return `${key}:${fallback}`;
    }
  };

  const items = portfolioWindowDefinition.methods.portfolioDashboardPresetItems.call(vm as never);

  assert.deepEqual(items.map((item: { value: string }) => item.value), [
    "all",
    "active",
    "needs_first_sale",
    "at_risk",
    "profit_winners",
    "finished"
  ]);
  assert.equal(items[1]?.title, "portfolioDashboardPresetActiveLabel:Active sellers");
  assert.deepEqual(
    portfolioWindowDefinition.methods.resolvePortfolioDashboardPresetItem.call(vm as never, items[3]),
    {
      title: "portfolioDashboardPresetAtRiskLabel:At risk",
      value: "at_risk",
      subtitle: "portfolioDashboardPresetAtRiskDescription:Selling lots that are still below break-even.",
      icon: "mdi-alert-circle-outline"
    }
  );
});

test("PortfolioWindow lot filter item slot does not depend on the old Vuetify raw wrapper", () => {
  const template = readFileSync("src/components/windows/portfolio/PortfolioWindow.html", "utf8");

  assert.match(template, /resolvePortfolioLotFilterItem\(item\)\.title/);
  assert.match(template, /resolvePortfolioDashboardPresetItem\(item\)\.title/);
  assert.doesNotMatch(template, /item\.raw/);
});

test("PortfolioWindow uses one profit-led pulse panel instead of duplicate KPI strips", () => {
  const template = readFileSync("src/components/windows/portfolio/PortfolioWindow.html", "utf8");

  assert.match(template, /<portfolio-pulse-panel/);
  assert.doesNotMatch(template, /portfolio-kpi-carousel-shell/);
  assert.doesNotMatch(template, /<portfolio-kpi-card/);
});

test("Portfolio pulse insights surface the biggest risk, best performer, and next action", () => {
  type PulseHelper = (rows: Array<{
    lotId: number;
    lotName: string;
    salesCount: number;
    realizedProfit?: number;
    totalProfit: number;
    soldPacks: number;
    totalPacks: number;
  }>) => Array<{
    kind: string;
    lotId: number;
    lotName: string;
    amount: number | null;
    tone: string;
  }>;

  const buildInsights = (portfolioWindowHelpers as Record<string, unknown>).buildPortfolioPulseInsights;
  assert.equal(typeof buildInsights, "function");

  const insights = (buildInsights as PulseHelper)([
    {
      lotId: 1,
      lotName: "Union arena singles",
      salesCount: 18,
      realizedProfit: 304.2,
      totalProfit: 304.2,
      soldPacks: 16,
      totalPacks: 16
    },
    {
      lotId: 2,
      lotName: "Nikke",
      salesCount: 7,
      realizedProfit: -12.5,
      totalProfit: -91.08,
      soldPacks: 8,
      totalPacks: 14
    },
    {
      lotId: 3,
      lotName: "One punch man",
      salesCount: 5,
      realizedProfit: -44,
      totalProfit: -200.28,
      soldPacks: 4,
      totalPacks: 12
    },
    {
      lotId: 4,
      lotName: "Bleach",
      salesCount: 0,
      realizedProfit: 0,
      totalProfit: -30,
      soldPacks: 0,
      totalPacks: 10
    }
  ]);

  assert.deepEqual(
    insights.map((insight) => [insight.kind, insight.lotName, insight.amount, insight.tone]),
    [
      ["risk", "One punch man", 200.28, "negative"],
      ["winner", "Union arena singles", 304.2, "positive"],
      ["next_move", "Nikke", 91.08, "warning"]
    ]
  );
});

test("PortfolioWindow pulse stats explain forecast context in seller language", () => {
  const vm = {
    portfolioTotals: {
      totalRevenue: 3485.5,
      totalCost: 4952.73,
      totalSalesCount: 62
    },
    averagePortfolioForecastScenario: {
      forecastProfit: 1137.54,
      forecastRevenue: 6090.27,
      label: "Average forecast",
      modeCount: 3
    },
    portfolioCopy(_key: string, fallback: string) {
      return fallback;
    },
    formatCurrency(value: number | null | undefined, decimals = 2) {
      return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }).format(value == null || Number.isNaN(Number(value)) ? 0 : Number(value));
    },
    fmtCurrency: portfolioWindowDefinition.methods.fmtCurrency,
    portfolioSignedCurrency: portfolioWindowDefinition.methods.portfolioSignedCurrency
  };

  const stats = portfolioWindowDefinition.methods.portfolioPulseStats.call(vm as never);
  const projected = stats.find((stat: { key: string }) => stat.key === "projected");

  assert.equal(projected?.value, "+$1,137.54");
  assert.equal(
    projected?.meta,
    "If remaining inventory sells at forecast - Average revenue $6,090.27"
  );
});

test("PortfolioWindow pulse insight display copy is action-oriented", () => {
  const vm = {
    allLotPerformance: [
      {
        lotId: 1,
        lotName: "Union arena singles",
        salesCount: 18,
        realizedProfit: 304.2,
        totalProfit: 304.2,
        soldPacks: 16,
        totalPacks: 16
      },
      {
        lotId: 2,
        lotName: "Nikke",
        salesCount: 7,
        realizedProfit: -12.5,
        totalProfit: -91.08,
        soldPacks: 8,
        totalPacks: 14
      },
      {
        lotId: 3,
        lotName: "One punch man",
        salesCount: 5,
        realizedProfit: -44,
        totalProfit: -200.28,
        soldPacks: 4,
        totalPacks: 12
      }
    ],
    portfolioCopy(_key: string, fallback: string) {
      return fallback;
    },
    formatCurrency(value: number | null | undefined, decimals = 2) {
      return Number(value == null || Number.isNaN(Number(value)) ? 0 : value).toFixed(decimals);
    },
    fmtCurrency: portfolioWindowDefinition.methods.fmtCurrency,
    portfolioSignedCurrency: portfolioWindowDefinition.methods.portfolioSignedCurrency
  };

  const insights = portfolioWindowDefinition.methods.portfolioPulseInsights.call(vm as never);

  assert.deepEqual(
    insights.map((insight: { label: string; title: string }) => [insight.label, insight.title]),
    [
      ["Break-even gap", "Recover One punch man"],
      ["Keep working", "Protect Union arena singles"],
      ["Next action", "Fix Nikke"]
    ]
  );
});

test("Portfolio pulse panel uses a neutral surface, compact stat rail, and action insight layout", () => {
  const template = readFileSync("src/components/windows/portfolio/PortfolioPulsePanel.html", "utf8");
  const css = readFileSync("src/components/windows/portfolio/PortfolioPulsePanel.css", "utf8");
  const panelRuleStart = css.indexOf(".portfolio-pulse-panel {");
  const panelRuleEnd = css.indexOf(".portfolio-pulse-panel.is-negative");
  const panelRule = css.slice(panelRuleStart, panelRuleEnd);

  assert.match(template, /portfolio-pulse-stat-rail/);
  assert.match(template, /portfolio-pulse-insights--actions/);
  assert.doesNotMatch(panelRule, /--portfolio-pulse-accent-rgb/);
  assert.match(css, /portfolio-pulse-stat-rail/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*portfolio-pulse-stat-rail/);
});

test("PortfolioWindow clears stale lot-filter search when opening the menu", () => {
  const vm = {
    portfolioLotFilterMenuOpen: false,
    portfolioLotFilterSearchQuery: "missing lot",
    portfolioLotFilterItems: [
      { title: "Bleach volume 2", value: 11, subtitle: "Grouped • 2026-02-01", lotType: "bulk", groupLabel: "Grouped inventory" },
      { title: "Union arena singles", value: 22, subtitle: "Individual • 2026-02-21", lotType: "singles", groupLabel: "Individual items" }
    ]
  };

  assert.deepEqual(
    portfolioWindowDefinition.methods.portfolioVisibleLotFilterItems.call(vm as never).map((item: { title: string }) => item.title),
    []
  );

  portfolioWindowDefinition.methods.handlePortfolioLotFilterMenuUpdate.call(vm as never, true);

  assert.equal(vm.portfolioLotFilterMenuOpen, true);
  assert.equal(vm.portfolioLotFilterSearchQuery, "");
  assert.deepEqual(
    portfolioWindowDefinition.methods.portfolioVisibleLotFilterItems.call(vm as never).map((item: { title: string }) => item.title),
    ["Bleach volume 2", "Union arena singles"]
  );
});

test("PortfolioWindow enter closes and blurs the portfolio filter even when search has text", () => {
  let blurred = false;
  const vm = {
    portfolioLotFilterItems: [
      { title: "Bleach volume 2", value: 11, subtitle: "Grouped • 2026-02-01", lotType: "bulk", groupLabel: "Grouped inventory" },
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
    blurPortfolioLotFilter: portfolioWindowDefinition.methods.blurPortfolioLotFilter,
    closePortfolioLotFilter: portfolioWindowDefinition.methods.closePortfolioLotFilter
  };

  portfolioWindowDefinition.methods.closePortfolioLotFilterOnEnter.call(vm as never);

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
    blurPortfolioLotFilter: portfolioWindowDefinition.methods.blurPortfolioLotFilter,
    closePortfolioLotFilter: portfolioWindowDefinition.methods.closePortfolioLotFilter
  };

  portfolioWindowDefinition.methods.closePortfolioLotFilterOnEnter.call(vm as never);

  assert.deepEqual(vm.portfolioLotFilterIds, [22]);
  assert.equal(vm.portfolioLotFilterMenuOpen, false);
  assert.equal(blurred, true);
});

test("PortfolioWindow lot status, incomplete state, and profit labels prefer forecast when incomplete", () => {
  const vm = {
    fmtCurrency: portfolioWindowDefinition.methods.fmtCurrency,
    formatCurrency: (value: number | null | undefined, decimals = 2) => Number(value || 0).toFixed(decimals),
    portfolioLotIsIncomplete: portfolioWindowDefinition.methods.portfolioLotIsIncomplete
  };

  assert.equal(
    portfolioWindowDefinition.methods.portfolioLotStatusTone.call(vm as never, { totalProfit: -1, salesCount: 0 }),
    "negative"
  );
  assert.equal(
    portfolioWindowDefinition.methods.portfolioLotStatusTone.call(vm as never, { totalProfit: 0, forecastProfitAverage: 5, salesCount: 0 }),
    "positive"
  );
  assert.equal(
    portfolioWindowDefinition.methods.portfolioLotStatusTone.call(vm as never, { totalProfit: 0, forecastProfitAverage: -5, salesCount: 0 }),
    "negative"
  );
  assert.equal(
    portfolioWindowDefinition.methods.portfolioLotStatusTone.call(vm as never, { totalProfit: 0, salesCount: 2 }),
    "positive"
  );
  assert.equal(
    portfolioWindowDefinition.methods.portfolioLotStatusTone.call(vm as never, { totalProfit: 0, salesCount: 0 }),
    "neutral"
  );

  assert.equal(
    portfolioWindowDefinition.methods.portfolioLotIsIncomplete.call(vm as never, { soldPacks: 2, totalPacks: 5 }),
    true
  );

  assert.equal(
    portfolioWindowDefinition.methods.portfolioLotPrimaryProfitLabel.call(vm as never, {
      soldPacks: 2,
      totalPacks: 5,
      forecastProfitAverage: 12.34
    }),
    "Projected +$12.34"
  );
  assert.equal(
    portfolioWindowDefinition.methods.portfolioLotPrimaryProfitLabel.call(vm as never, {
      soldPacks: 2,
      totalPacks: 5,
      forecastProfitAverage: -12.34
    }),
    "Projected -$12.34"
  );
  assert.equal(
    portfolioWindowDefinition.methods.portfolioLotPrimaryProfitLabel.call(vm as never, {
      salesCount: 2,
      realizedProfit: -8.5,
      soldPacks: 5,
      totalPacks: 5
    }),
    "Loss -$8.50"
  );
  assert.equal(
    portfolioWindowDefinition.methods.portfolioLotPrimaryProfitLabel.call(vm as never, {
      salesCount: 0,
      totalProfit: 7.25,
      soldPacks: 5,
      totalPacks: 5
    }),
    "Net +$7.25"
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
    fmtCurrency: portfolioWindowDefinition.methods.fmtCurrency,
    formatCurrency: (value: number | null | undefined, decimals = 2) => Number(value || 0).toFixed(decimals),
    portfolioLotIsIncomplete: portfolioWindowDefinition.methods.portfolioLotIsIncomplete,
    portfolioAtRiskLotCount: portfolioWindowDefinition.methods.portfolioAtRiskLotCount
  };

  assert.equal(
    portfolioWindowDefinition.methods.portfolioLotPrimaryProfitChipColor.call(vm as never, {
      soldPacks: 1,
      totalPacks: 4,
      forecastProfitAverage: -4
    }),
    "error"
  );
  assert.equal(
    portfolioWindowDefinition.methods.portfolioLotPrimaryProfitChipColor.call(vm as never, {
      salesCount: 2,
      realizedProfit: 4,
      soldPacks: 4,
      totalPacks: 4
    }),
    "success"
  );
  assert.equal(
    portfolioWindowDefinition.methods.portfolioLotPrimaryProfitChipColor.call(vm as never, {
      salesCount: 0,
      totalProfit: -4,
      soldPacks: 4,
      totalPacks: 4
    }),
    "secondary"
  );

  assert.equal(portfolioWindowDefinition.methods.portfolioAtRiskLotCount.call(vm as never), 2);
  assert.equal(portfolioWindowDefinition.methods.portfolioLotPerformanceUnderAmount.call(vm as never), "13");
  assert.equal(portfolioWindowDefinition.methods.portfolioLotPerformanceOverAmount.call(vm as never), "25");
  assert.equal(portfolioWindowDefinition.methods.portfolioLotPerformanceKpiColor.call(vm as never), "error");
  assert.equal(
    portfolioWindowDefinition.methods.portfolioLotPerformanceKpiColor.call({
      portfolioAtRiskLotCount: () => 0
    } as never),
    "success"
  );
});

test("PortfolioWindow chart copy helpers return expected titles, icons, subtitles, and aria labels", () => {
  const breakdownVm = {
    portfolioChartView: "breakdown",
    nextPortfolioChartView: portfolioWindowDefinition.methods.nextPortfolioChartView
  };
  const trendVm = {
    portfolioChartView: "trend",
    nextPortfolioChartView: portfolioWindowDefinition.methods.nextPortfolioChartView
  };
  const sellthroughVm = {
    portfolioChartView: "sellthrough",
    nextPortfolioChartView: portfolioWindowDefinition.methods.nextPortfolioChartView
  };
  const marginVm = {
    portfolioChartView: "margin",
    nextPortfolioChartView: portfolioWindowDefinition.methods.nextPortfolioChartView
  };

  assert.equal(portfolioWindowDefinition.methods.portfolioChartToggleTitle.call(breakdownVm as never), "Show trend view");
  assert.equal(portfolioWindowDefinition.methods.portfolioChartToggleTitle.call(trendVm as never), "Show sell-through view");
  assert.equal(portfolioWindowDefinition.methods.portfolioChartToggleTitle.call(sellthroughVm as never), "Show sold margin view");
  assert.equal(portfolioWindowDefinition.methods.portfolioChartToggleTitle.call(marginVm as never), "Show breakdown view");

  assert.equal(portfolioWindowDefinition.methods.portfolioChartSubtitle.call(breakdownVm as never), "Revenue by lot");
  assert.equal(portfolioWindowDefinition.methods.portfolioChartSubtitle.call(trendVm as never), "Profit trend over time");
  assert.equal(portfolioWindowDefinition.methods.portfolioChartSubtitle.call(sellthroughVm as never), "Sell-through over time");
  assert.equal(portfolioWindowDefinition.methods.portfolioChartSubtitle.call(marginVm as never), "Sold margin by lot");

  assert.equal(
    portfolioWindowDefinition.methods.portfolioChartAriaLabel.call(breakdownVm as never),
    "Portfolio revenue breakdown chart by lot."
  );
  assert.equal(
    portfolioWindowDefinition.methods.portfolioChartAriaLabel.call(trendVm as never),
    "Portfolio profit trend chart."
  );
  assert.equal(
    portfolioWindowDefinition.methods.portfolioChartAriaLabel.call(sellthroughVm as never),
    "Portfolio sell-through over time chart."
  );
  assert.equal(
    portfolioWindowDefinition.methods.portfolioChartAriaLabel.call(marginVm as never),
    "Portfolio sold margin chart by lot."
  );
});

test("PortfolioWindow sales per user helpers return expected labels for each metric", () => {
  const revenueVm = {
    portfolioSalesByUserMetric: "revenue"
  };
  const profitVm = {
    portfolioSalesByUserMetric: "profit"
  };
  const countVm = {
    portfolioSalesByUserMetric: "count"
  };

  assert.equal(portfolioWindowDefinition.methods.portfolioSalesByUserMetricLabel.call(revenueVm as never), "Revenue");
  assert.equal(portfolioWindowDefinition.methods.portfolioSalesByUserMetricLabel.call(profitVm as never), "Profit");
  assert.equal(portfolioWindowDefinition.methods.portfolioSalesByUserMetricLabel.call(countVm as never), "Count");

  assert.equal(
    portfolioWindowDefinition.methods.portfolioSalesByUserSubtitle.call(revenueVm as never),
    "Last 8 weeks by seller"
  );
  assert.equal(
    portfolioWindowDefinition.methods.portfolioSalesByUserAriaLabel.call(profitVm as never),
    "Portfolio sales by person chart for the last 8 weeks by profit."
  );
});

test("PortfolioWindow sales per user summary helpers derive leader, totals, and legend items", () => {
  const vm = {
    portfolioSalesByUserChartData: {
      weeks: [
        { key: "2026-03-02", label: "Mar 2" },
        { key: "2026-03-09", label: "Mar 9" },
        { key: "2026-03-16", label: "Mar 16" }
      ],
      series: [
        { key: "owner-1", label: "Jules", values: [10, 0, 40], total: 50, color: "#F7B500" },
        { key: "member-2", label: "Wyatt", values: [0, 20, 10], total: 30, color: "#34C759" }
      ]
    },
    workspaceMembers: [
      { userId: "owner-1", displayName: "Jules Arena", photoUrl: "https://example.test/jules.png" },
      { userId: "member-2", displayName: "Wyatt World" }
    ],
    getWorkspaceMemberPresenceState(member: { userId: string }) {
      return member.userId === "owner-1" ? "online" : "offline";
    }
  };

  assert.equal(portfolioWindowDefinition.methods.portfolioSalesByUserTotalValue.call(vm as never), 80);
  assert.deepEqual(portfolioWindowDefinition.methods.portfolioSalesByUserLeader.call(vm as never), {
    key: "owner-1",
    label: "Jules",
    values: [10, 0, 40],
    total: 50,
    color: "#F7B500"
  });
  assert.deepEqual(portfolioWindowDefinition.methods.portfolioSalesByUserBestWeek.call(vm as never), {
    label: "Mar 16",
    total: 50
  });
  assert.deepEqual(portfolioWindowDefinition.methods.portfolioSalesByUserWeekTotals.call(vm as never), [
    { label: "Mar 2", total: 10 },
    { label: "Mar 9", total: 20 },
    { label: "Mar 16", total: 50 }
  ]);

  const legendItems = portfolioWindowDefinition.methods.portfolioSalesByUserLegendItems.call(vm as never);
  assert.equal(legendItems.length, 2);
  assert.equal(legendItems[0]?.photoUrl, "https://example.test/jules.png");
  assert.equal(legendItems[0]?.presenceState, "online");
  assert.equal(legendItems[1]?.initials, "WW");
});

test("PortfolioWindow sales per user legend uses signed-in profile photo for personal You series", () => {
  const vm = {
    portfolioSalesByUserChartData: {
      weeks: [{ key: "2026-03-16", label: "Mar 16" }],
      series: [
        { key: "self", label: "You", values: [120], total: 120, color: "#F7B500" }
      ]
    },
    workspaceMembers: [],
    googleProfilePicture: "https://example.test/me.png",
    googleAvatarLoadFailed: false
  };

  const legendItems = portfolioWindowDefinition.methods.portfolioSalesByUserLegendItems.call(vm as never);
  assert.equal(legendItems.length, 1);
  assert.equal(legendItems[0]?.photoUrl, "https://example.test/me.png");
  assert.equal(legendItems[0]?.initials, "Y");
});

test("PortfolioWindow sales per user legend falls back to initials when signed-in photo is unavailable", () => {
  const missingPhotoVm = {
    portfolioSalesByUserChartData: {
      weeks: [{ key: "2026-03-16", label: "Mar 16" }],
      series: [
        { key: "self", label: "You", values: [1], total: 1, color: "#F7B500" }
      ]
    },
    workspaceMembers: [],
    googleProfilePicture: "",
    googleAvatarLoadFailed: false
  };

  const failedPhotoVm = {
    portfolioSalesByUserChartData: {
      weeks: [{ key: "2026-03-16", label: "Mar 16" }],
      series: [
        { key: "self", label: "You", values: [1], total: 1, color: "#F7B500" }
      ]
    },
    workspaceMembers: [],
    googleProfilePicture: "https://example.test/me.png",
    googleAvatarLoadFailed: true
  };

  const missingLegendItems = portfolioWindowDefinition.methods.portfolioSalesByUserLegendItems.call(missingPhotoVm as never);
  const failedLegendItems = portfolioWindowDefinition.methods.portfolioSalesByUserLegendItems.call(failedPhotoVm as never);

  assert.equal(missingLegendItems[0]?.photoUrl, "");
  assert.equal(missingLegendItems[0]?.initials, "Y");
  assert.equal(failedLegendItems[0]?.photoUrl, "");
  assert.equal(failedLegendItems[0]?.initials, "Y");
});

test("PortfolioWindow sales per user legend keeps imported and unknown rows on initials only", () => {
  const vm = {
    portfolioSalesByUserChartData: {
      weeks: [{ key: "2026-03-16", label: "Mar 16" }],
      series: [
        { key: "imported", label: "Imported", values: [50], total: 50, color: "#999999" },
        { key: "unknown", label: "Unknown", values: [10], total: 10, color: "#777777" }
      ]
    },
    workspaceMembers: [],
    googleProfilePicture: "https://example.test/me.png",
    googleAvatarLoadFailed: false
  };

  const legendItems = portfolioWindowDefinition.methods.portfolioSalesByUserLegendItems.call(vm as never);
  assert.equal(legendItems[0]?.photoUrl, "");
  assert.equal(legendItems[0]?.initials, "I");
  assert.equal(legendItems[1]?.photoUrl, "");
  assert.equal(legendItems[1]?.initials, "U");
});

test("PortfolioWindow filter helpers use safe fallbacks when refs or items are missing", () => {
  const blurVm = { $refs: {} };
  portfolioWindowDefinition.methods.blurPortfolioLotFilter.call(blurVm as never);

  const closeVm = {
    portfolioLotFilterMenuOpen: true
  };
  portfolioWindowDefinition.methods.closePortfolioLotFilter.call(closeVm as never);
  assert.equal(closeVm.portfolioLotFilterMenuOpen, false);

  const labelVm = {
    portfolioLotTypeFilter: "bulk",
    portfolioLotFilterIds: [99],
    portfolioLotFilterItems: [{ value: 99 }],
    portfolioVisibleLotFilterIds: portfolioWindowDefinition.methods.portfolioVisibleLotFilterIds
  };
  assert.equal(portfolioWindowDefinition.methods.portfolioLotFilterPrimaryLabel.call(labelVm as never), "Selected lots");
  assert.equal(portfolioWindowDefinition.methods.portfolioLotFilterRemainingCount.call({ portfolioVisibleLotFilterIds: () => [] } as never), 0);
  assert.equal(portfolioWindowDefinition.methods.portfolioLotFilterDefaultLabel.call({ portfolioLotTypeFilter: "bulk" } as never), "All bulk lots");
  assert.equal(portfolioWindowDefinition.methods.portfolioLotFilterDefaultLabel.call({ portfolioLotTypeFilter: "other" } as never), "All lots");
});


