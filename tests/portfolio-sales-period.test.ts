import { describe, expect, it } from "vitest";
import {
  DEFAULT_PORTFOLIO_SALES_BY_USER_PERIOD,
  normalizePortfolioSalesByUserPeriod,
  PORTFOLIO_SALES_BY_USER_PERIODS
} from "../src/app-core/shared/portfolio-sales-period.ts";
import {
  buildPortfolioSalesByUserChartData,
  buildPortfolioSalesByUserDrilldownRows
} from "../src/app-core/computed/portfolio-sales-by-user.ts";
import { createDenseVolumeFixture } from "./helpers/volume-fixtures.ts";

describe("Portfolio sales periods", () => {
  it("exports the six exact choices and defaults invalid values to eight weeks", () => {
    expect(PORTFOLIO_SALES_BY_USER_PERIODS).toEqual([4, 8, 13, 26, 52, "all"]);
    expect(DEFAULT_PORTFOLIO_SALES_BY_USER_PERIOD).toBe(8);
    for (const invalid of [undefined, null, "4", 0, 7, true, {}, "ALL"]) {
      expect(normalizePortfolioSalesByUserPeriod(invalid)).toBe(8);
    }
    expect(normalizePortfolioSalesByUserPeriod("all")).toBe("all");
    expect(normalizePortfolioSalesByUserPeriod(13)).toBe(13);
  });

  it("normalizes an invalid runtime period before both builders calculate their range", () => {
    const { lot, sales } = createDenseVolumeFixture();
    const common = {
      lots: [lot], salesByLotId: new Map([[lot.id, sales]]), selectedLotIds: [lot.id],
      scopeType: "personal" as const, workspaceMembers: [], todayDate: "2025-09-26"
    };
    const chart = buildPortfolioSalesByUserChartData({ ...common, metric: "count", period: 7 as never });
    const rows = buildPortfolioSalesByUserDrilldownRows({ ...common, period: "4" as never });

    expect(chart.weeks).toHaveLength(8);
    expect(chart.series.reduce((sum, series) => sum + series.total, 0)).toBe(54);
    expect(rows).toHaveLength(54);
  });

  it("covers the selected historical range for both graph and detail without truncation", () => {
    const { lot, sales } = createDenseVolumeFixture();
    const common = {
      lots: [lot], salesByLotId: new Map([[lot.id, sales]]), selectedLotIds: [lot.id],
      scopeType: "personal" as const, workspaceMembers: [], todayDate: "2026-10-20"
    };
    const chart = buildPortfolioSalesByUserChartData({ ...common, metric: "count", period: "all" });
    const rows = buildPortfolioSalesByUserDrilldownRows({ ...common, period: "all" });

    expect(chart.weeks[0]?.key).toBe("2022-12-26");
    expect(chart.weeks.at(-1)?.key).toBe("2026-10-19");
    expect(chart.weeks[0]?.label).toMatch(/2022/);
    expect(chart.series.reduce((sum, series) => sum + series.total, 0)).toBe(1_000);
    expect(rows).toHaveLength(1_000);

    const emptyChart = buildPortfolioSalesByUserChartData({ ...common, metric: "count", period: 4 });
    const emptyRows = buildPortfolioSalesByUserDrilldownRows({ ...common, period: 4 });
    expect(emptyChart).toEqual({ weeks: expect.any(Array), series: [] });
    expect(emptyChart.weeks).toHaveLength(4);
    expect(emptyRows).toEqual([]);
  });

  it("keeps all-history weekly totals equal to the sum of person series and counts transactions", () => {
    const { lot, sales } = createDenseVolumeFixture();
    const selectedSales = [
      { ...sales[0]!, id: 31_001, date: "2022-12-30", updatedBy: "user-a" },
      { ...sales[1]!, id: 31_002, date: "2022-12-31", updatedBy: "user-b" },
      { ...sales[2]!, id: 31_003, date: "2026-10-20", updatedBy: "user-a" }
    ];
    const common = {
      lots: [lot], salesByLotId: new Map([[lot.id, selectedSales]]), selectedLotIds: [lot.id],
      scopeType: "workspace" as const,
      workspaceMembers: [
        { userId: "user-a", workspaceId: "workspace-a", role: "member" as const, status: "active" as const, updatedAt: "2026-10-20", displayName: "A" },
        { userId: "user-b", workspaceId: "workspace-a", role: "member" as const, status: "active" as const, updatedAt: "2026-10-20", displayName: "B" }
      ],
      todayDate: "2026-10-20",
      period: "all" as const,
      metric: "count" as const
    };
    const byPerson = buildPortfolioSalesByUserChartData({ ...common, grouping: "person" });
    const total = buildPortfolioSalesByUserChartData({ ...common, grouping: "total" });

    expect(byPerson.weeks[0]?.key).toBe("2022-12-26");
    expect(total.weeks).toEqual(byPerson.weeks);
    expect(total.series).toHaveLength(1);
    expect(total.series[0]?.values).toEqual(byPerson.weeks.map((_, index) =>
      byPerson.series.reduce((sum, series) => sum + (series.values[index] ?? 0), 0)
    ));
    expect(total.series[0]?.total).toBe(selectedSales.length);
    expect(byPerson.series.reduce((sum, series) => sum + series.total, 0)).toBe(selectedSales.length);
  });

  it("excludes an older unselected lot from all-time coverage and amounts", () => {
    const { lot, sales } = createDenseVolumeFixture();
    const unselectedLot = { ...lot, id: lot.id + 1, name: "Unselected older lot" };
    const ancientSale = { ...sales[0]!, id: 99_999, date: "2018-01-01", price: 999_999 };
    const selectedOnly = {
      lots: [lot], salesByLotId: new Map([[lot.id, sales]]), selectedLotIds: [lot.id],
      scopeType: "personal" as const, workspaceMembers: [], todayDate: "2026-10-20", period: "all" as const
    };
    const withUnselected = {
      ...selectedOnly,
      lots: [lot, unselectedLot],
      salesByLotId: new Map([[lot.id, sales], [unselectedLot.id, [ancientSale]]])
    };
    const expectedChart = buildPortfolioSalesByUserChartData({ ...selectedOnly, metric: "count" });
    const actualChart = buildPortfolioSalesByUserChartData({ ...withUnselected, metric: "count" });
    const expectedRows = buildPortfolioSalesByUserDrilldownRows(selectedOnly);
    const actualRows = buildPortfolioSalesByUserDrilldownRows(withUnselected);

    expect(actualChart.weeks).toEqual(expectedChart.weeks);
    expect(actualChart.series).toEqual(expectedChart.series);
    expect(actualRows).toEqual(expectedRows);
    expect(actualChart.weeks[0]?.key).toBe("2022-12-26");
    expect(actualRows.every((row) => row.lotId === lot.id)).toBe(true);
  });

  it("shares week coverage for numeric periods and handles date-only values strictly", () => {
    const { lot, sales } = createDenseVolumeFixture();
    const invalid = { ...sales[0]!, id: 10_001, date: "2025-02-31" };
    const common = {
      lots: [lot], salesByLotId: new Map([[lot.id, [...sales, invalid]]]), selectedLotIds: [lot.id],
      scopeType: "personal" as const, workspaceMembers: [], todayDate: "2025-09-26"
    };
    const expected = new Map([[4, 26], [8, 54], [13, 89], [26, 180], [52, 362]]);
    for (const [period, count] of expected) {
      const chart = buildPortfolioSalesByUserChartData({ ...common, metric: "count", period: period as 4 | 8 | 13 | 26 | 52 });
      const rows = buildPortfolioSalesByUserDrilldownRows({ ...common, period: period as 4 | 8 | 13 | 26 | 52 });
      expect(chart.weeks).toHaveLength(period);
      expect(chart.series.reduce((sum, series) => sum + series.total, 0)).toBe(count);
      expect(rows).toHaveLength(count);
    }
  });

  it("returns a coherent empty result when all selected sale dates are invalid", () => {
    const { lot } = createDenseVolumeFixture();
    const sale = { id: 1, date: "2025-02-31", type: "pack", quantity: 1, price: 1 } as never;
    const common = { lots: [lot], salesByLotId: new Map([[lot.id, [sale]]]), selectedLotIds: [lot.id], scopeType: "personal" as const, workspaceMembers: [], todayDate: "2026-10-20", period: "all" as const };
    expect(buildPortfolioSalesByUserChartData({ ...common, metric: "count" })).toEqual({ weeks: [], series: [] });
    expect(buildPortfolioSalesByUserDrilldownRows(common)).toEqual([]);
  });
});
