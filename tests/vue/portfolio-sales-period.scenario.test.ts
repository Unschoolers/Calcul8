import { fireEvent, screen, within } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { computed, nextTick, reactive } from "vue";
import PortfolioWindow from "../../src/components/windows/portfolio/PortfolioWindow.vue";
import { buildPortfolioReceiptSummary } from "../../src/app-core/computed/portfolio-receipt.ts";
import { portfolioComputed } from "../../src/app-core/computed/portfolio.ts";
import { formatLocalizedNumber, translateAppMessage } from "../../src/app-core/i18n/index.ts";
import { createPortfolioWindowPorts, portfolioWindowPortsKey } from "../../src/components/windows/portfolio/portfolioWindowPorts.ts";
import { createDenseVolumeFixture } from "../helpers/volume-fixtures.ts";
import { makeLot } from "../helpers/fixtures.ts";
import { renderWithApp } from "./render.ts";
import { vuetify } from "../../src/vuetify.ts";

function renderPortfolio(
  language = "en",
  theme = "unionArenaLight",
  width = 1280,
  section = "overview",
  chartView = "sales",
  overrides: {
    lot?: ReturnType<typeof makeLot>;
    sales?: ReturnType<typeof createDenseVolumeFixture>["sales"];
    receiptSummary?: Record<string, unknown>;
    performanceRows?: ReturnType<typeof portfolioComputed.allLotPerformance>;
  } = {}
) {
  vuetify.theme.change(theme);
  vuetify.display.width.value = width;
  const fixture = createDenseVolumeFixture();
  const lot = overrides.lot ?? fixture.lot;
  const sales = overrides.sales ?? fixture.sales;
  const salesByLotId = new Map([[lot.id, sales]]);
  let state: Record<string, unknown>;
  const context = () => {
    const base = {
      lots: [lot], sales: [], currentLotId: lot.id, portfolioLotFilterIds: [],
      portfolioLotTypeFilter: "both", portfolioDashboardPreset: "all", salesCacheEpoch: 0,
      portfolioSalesByUserMetric: state.portfolioSalesByUserMetric,
      portfolioSalesByUserPeriod: state.portfolioSalesByUserPeriod,
      getAllSalesByLotId: () => salesByLotId, hasProAccess: false,
      livePackPrice: 0, liveBoxPriceSell: 0, liveSpotPrice: 0,
      whatnotFeeSummary: null, lotItems: [], portfolioSelectedLotIds: [lot.id],
      activeScopeType: "personal", workspaceMembers: [], preferredLanguage: language
    };
    return { ...base, allLotPerformance: portfolioComputed.allLotPerformance.call(base as never) };
  };
  const base: Record<string, unknown> = {
    portfolioSalesByUserPeriod: "all", portfolioSalesByUserMetric: "count",
    currentLotId: lot.id, googleAvatarLoadFailed: false, lots: [lot], portfolioChartView: chartView,
    portfolioDashboardPreset: "all", portfolioLotFilterIds: [], portfolioLotTypeFilter: "both",
    portfolioSection: section, portfolioReceiptFilter: "all", portfolioSalesGrouping: "person",
    portfolioReceiptSummary: overrides.receiptSummary ?? {
      received: { lotCount: 1, totalCost: 25 }, awaiting: { lotCount: 0, totalCost: 0 },
      nextExpectedReceiptDate: null, realizedProfit: 3_608.59, capitalToRecover: 12.5
    },
    portfolioSelectedLotIds: [lot.id], initPortfolioChart: vi.fn(),
    salesByLotId, workspaceMembers: [], googleProfilePicture: "", portfolioLotFilterItems: [],
    togglePortfolioChartView: () => undefined,
    formatDate: (value: string) => value,
    t: (key: string, params?: Record<string, string | number | null | undefined>) => translateAppMessage(language, key, params),
    formatCurrency: (value: number | null | undefined, decimals = 2) => formatLocalizedNumber(value, language, decimals),
    getBuyerProfile: () => null,
    getWorkspaceMemberPresenceState: () => "offline",
    salesCacheEpoch: 0,
    getAllSalesByLotId: () => salesByLotId
  };
  state = reactive(base);
  const chartData = computed(() => portfolioComputed.portfolioSalesByUserChartData.call(context() as never));
  const drilldownRows = computed(() => portfolioComputed.portfolioSalesByUserDrilldownRows.call(context() as never));
  const lotPerformance = computed(() => overrides.performanceRows ?? portfolioComputed.allLotPerformance.call(context() as never)
    .map((row) => lot.expectedReceiptDate ? { ...row, expectedReceiptDate: lot.expectedReceiptDate } : row));
  const portfolioTotals = computed(() => portfolioComputed.portfolioTotals.call({ ...context(), allLotPerformance: lotPerformance.value } as never));
  Object.defineProperties(state, {
    portfolioSalesByUserChartData: { enumerable: true, get: () => chartData.value },
    portfolioSalesByUserDrilldownRows: { enumerable: true, get: () => drilldownRows.value },
    hasPortfolioSalesByUserData: { enumerable: true, get: () => chartData.value.series.length > 0 },
    allLotPerformance: { enumerable: true, get: () => lotPerformance.value },
    portfolioTotals: { enumerable: true, get: () => portfolioTotals.value },
    averagePortfolioForecastScenario: { enumerable: true, get: () => null },
    hasPortfolioData: { enumerable: true, get: () => lotPerformance.value.length > 0 }
  });
  const ports = createPortfolioWindowPorts(state as never);
  const view = renderWithApp(PortfolioWindow, {
    global: { provide: { [portfolioWindowPortsKey as symbol]: ports }, stubs: {
      BuyerIdentityLabel: true, BuyerQuickViewHost: true, ShopifyLinkIndicator: true
    } }
  });
  return { view, state };
}

describe("Portfolio analytics sections", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-20T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vuetify.theme.change("unionArenaDark");
    vuetify.display.width.value = 1024;
  });

  test("shows all-history sales without a period-only selector", () => {
    const { view } = renderPortfolio("en", "unionArenaLight", 1280, "analytics");
    const { container } = view;
    expect(container.textContent).toContain("All history");
    expect(container.querySelector(".portfolio-sales-by-user-period-select")).toBeNull();
    expect(container.textContent).not.toContain("{{");
  });

  test("starts on overview and keeps global receipt filters while navigating sections", async () => {
    const { view, state } = renderPortfolio("en", "unionArenaLight", 390);
    expect(screen.getByRole("navigation", { name: "Portfolio sections" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(view.container.textContent).toContain("Realized profit");
    expect(view.container.textContent).toContain("3,608.59");
    expect(view.container.textContent).toContain("12.50");
    expect(view.container.textContent).toContain("Stock received");
    expect(view.container.textContent).toContain("Preorders");
    expect(view.container.textContent).toContain("Total investment");
    expect(view.container.textContent).toContain((state.portfolioTotals as { totalCost: number }).totalCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

    const receiptFilter = view.container.querySelector<HTMLElement>(".portfolio-receipt-filter-toggle")!;
    await fireEvent.click(within(receiptFilter).getByRole("button", { name: "Preorders" }));
    expect(state.portfolioReceiptFilter).toBe("awaiting");

    const analytics = screen.getByRole("button", { name: "Analytics" });
    await fireEvent.click(analytics);
    await nextTick();
    expect(state.portfolioSection).toBe("analytics");
    expect(screen.getByLabelText("Analysis")).toBeInTheDocument();
    expect(view.container.querySelector(".portfolio-receipt-filter-toggle")).toBeInTheDocument();

    const details = screen.getByRole("button", { name: "Details" });
    details.focus();
    await fireEvent.keyDown(details, { key: "Enter" });
    await fireEvent.keyUp(details, { key: "Enter" });
    await nextTick();
    expect(state.portfolioSection).toBe("details");
    expect(view.container.querySelector(".portfolio-details-section")).toBeInTheDocument();
    expect(state.portfolioReceiptFilter).toBe("awaiting");
    expect(view.container.querySelector(".portfolio-receipt-filter-toggle")).toBeInTheDocument();

    const customers = screen.getByRole("button", { name: "Customer performance" });
    await fireEvent.click(customers);
    const search = screen.getByRole("textbox", { name: "Search customers" });
    await fireEvent.update(search, "no customer can match this");
    expect(view.container.textContent).toContain("No customer performance yet");
    expect(view.container.querySelectorAll(".portfolio-customer-performance .portfolio-performance-grid__row")).toHaveLength(0);
  });

  test("a paid no-sale preorder does not render a fake loss or risk recommendation", async () => {
    const preorder = makeLot({
      id: 900,
      name: "Awaiting preorder",
      boxesPurchased: 10,
      boxPriceCost: 100,
      purchaseShippingCost: 0,
      purchaseTaxPercent: 0,
      expectedReceiptDate: "2026-10-19"
    });
    const { view, state } = renderPortfolio("en", "unionArenaLight", 390, "overview", "trend", {
      lot: preorder,
      sales: [],
      receiptSummary: {
        received: { lotCount: 0, totalCost: 0 }, awaiting: { lotCount: 1, totalCost: 1_000 },
        nextExpectedReceiptDate: "2026-10-19", realizedProfit: 0, capitalToRecover: 1_000
      }
    });
    const row = (state.allLotPerformance as Array<{ totalProfit: number }>)[0];

    expect(row?.totalProfit).toBeLessThan(0);
    expect(view.container.textContent).toContain("Realized profit");
    expect(view.container.textContent).toContain("Capital to recover");
    expect(view.container.textContent).not.toContain("Current P/L");
    expect(view.container.textContent).not.toContain("Biggest risk");
    expect(view.container.querySelector(".portfolio-pulse-panel")).toBeNull();

    await fireEvent.click(screen.getByRole("button", { name: "Details" }));
    await nextTick();
    const lotRow = view.container.querySelector(".portfolio-lot-performance .portfolio-performance-grid__row");
    expect(lotRow?.textContent).toContain("Expected 2026-10-19");
    expect(lotRow?.textContent).toContain("Not assessed before receipt");
    expect(lotRow?.textContent).not.toContain("-$1,000 CAD");
    expect(lotRow?.textContent).not.toContain("Biggest risk");
  });

  test("non-sales analyses expose localized DOM legends for series and lot categories", async () => {
    const fixture = createDenseVolumeFixture();
    const preorder = { ...fixture.lot, expectedReceiptDate: "2026-10-19" };
    const { view, state } = renderPortfolio("en", "unionArenaLight", 1280, "analytics", "trend", {
      lot: preorder,
      sales: fixture.sales
    });
    const legend = screen.getByRole("group", { name: "Chart legend" });
    expect(screen.getByRole("img", { name: "Portfolio investment recovery chart over time." }))
      .toHaveAttribute("aria-describedby", "portfolio-chart-legend");
    expect(legend.textContent).toContain("Investment recovered so far");
    expect(legend.textContent).toContain("Investment recovery target");

    state.portfolioChartView = "sellthrough";
    await nextTick();
    expect(screen.getByRole("group", { name: "Chart legend" }).textContent).toContain("Sell-through %");
    expect(screen.getByRole("group", { name: "Chart legend" }).textContent).toContain("Trend");

    state.portfolioChartView = "margin";
    await nextTick();
    expect(screen.getByRole("group", { name: "Chart legend" }).textContent).toContain("Sold profit margin %");
    expect(screen.getByRole("group", { name: "Chart legend" }).textContent).toContain("WhatFees volume test");

    state.portfolioChartView = "breakdown";
    await nextTick();
    const breakdownLegend = screen.getByRole("group", { name: "Chart legend" });
    expect(breakdownLegend.textContent).toContain("Categories (1)");
    await fireEvent.click(within(breakdownLegend).getByText("Categories (1)"));
    expect(breakdownLegend.textContent).toContain("Expected");
    expect(breakdownLegend.textContent).toContain("WhatFees volume test");
  });

  test("investment recovery title and legend are localized in French", async () => {
    const { view } = renderPortfolio("fr-CA", "unionArenaDark", 390, "analytics", "trend");
    const canvas = screen.getByRole("img", { name: "Graphique de récupération de l’investissement du portefeuille dans le temps." });
    expect(canvas).toBeInTheDocument();
    const legend = screen.getByRole("group", { name: "Légende du graphique" });
    expect(legend.textContent).toContain("Investissement récupéré à ce jour");
    expect(legend.textContent).toContain("Objectif de récupération de l’investissement");
    const analysis = screen.getByRole("combobox", { name: "Analyse" });
    await fireEvent.keyDown(analysis, { key: "ArrowDown" });
    expect(await screen.findByText("Récupération de l’investissement", { selector: ".v-list-item-title" })).toBeInTheDocument();
    expect(await screen.findByText("Ventes", { selector: ".v-list-item-title" })).toBeInTheDocument();
    expect(view.container.textContent).not.toContain("Ventes par personne");
    expect(view.container.textContent).toContain("Récupération de l’investissement dans le temps");
  });

  test("reveals all historical sales through the real selector and metric controls", async () => {
    const { view, state } = renderPortfolio("en", "unionArenaLight", 1280, "analytics");
    const { container } = view;
    expect(container.textContent).toContain("All history");
    const metricToggle = container.querySelector<HTMLElement>(".portfolio-sales-by-user-toggle")!;
    const countButton = within(metricToggle).getByRole("button", { name: "Count" });
    await fireEvent.click(countButton);
    expect(container.textContent).toContain("1,000");
    expect((state.portfolioTotals as { totalProfit: number }).totalProfit).toBeCloseTo(3_608.59, 2);
    const countChart = state.portfolioSalesByUserChartData as { series: Array<{ total: number }> };
    expect(countChart.series.reduce((sum, series) => sum + series.total, 0)).toBe(1_000);
    expect((screen.getByRole("img", { name: /All history by count/i }) as HTMLCanvasElement).getAttribute("aria-label"))
      .toContain("All history");
    expect(container.textContent).toContain("All-history total");
    expect(container.textContent).not.toContain("8-week total");

    const revenueButton = within(metricToggle).getByRole("button", { name: "Revenue (CAD)" });
    await fireEvent.click(revenueButton);
    expect(container.textContent).toContain("12,610.59");
    expect((state.portfolioSalesByUserChartData as { series: Array<{ total: number }> }).series
      .reduce((sum, series) => sum + series.total, 0)).toBeCloseTo(12_610.59, 2);
    const profitButton = within(metricToggle).getByRole("button", { name: "Profit (CAD)" });
    await fireEvent.click(profitButton);
    expect(container.textContent).toContain("6,614.59");
    expect((state.portfolioSalesByUserChartData as { series: Array<{ total: number }> }).series
      .reduce((sum, series) => sum + series.total, 0)).toBeCloseTo(6_614.59, 2);

    const firstWeek = container.querySelector<HTMLButtonElement>(".portfolio-sales-by-user-week-pill");
    expect(firstWeek).not.toBeNull();
    await fireEvent.click(firstWeek!);
    expect(screen.getByText(/Sales for/)).toBeInTheDocument();
    expect(document.querySelectorAll(".portfolio-sales-drilldown-table tbody tr").length).toBeGreaterThan(0);
    const dialog = document.querySelector<HTMLElement>(".portfolio-sales-drilldown-dialog")!;
    const closeButton = within(dialog).getByRole("button", { name: "Close sales drilldown" });
    await fireEvent.click(closeButton);
    expect(document.querySelector(".portfolio-sales-drilldown-dialog")?.getAttribute("aria-hidden")).toBe("true");

    const grouping = container.querySelector<HTMLElement>(".portfolio-sales-grouping-toggle")!;
    await fireEvent.click(within(grouping).getByRole("button", { name: "Total" }));
    expect(state.portfolioSalesGrouping).toBe("total");
    await fireEvent.click(within(grouping).getByRole("button", { name: "By person" }));
    expect(state.portfolioSalesGrouping).toBe("person");
  }, 30_000);

  test("labels and shows localized historical data in French on a dark mobile display", async () => {
    const { view, state } = renderPortfolio("fr-CA", "unionArenaDark", 390, "analytics");
    const { container } = view;
    expect(container.textContent).toContain("Tout l’historique");
    expect(container.querySelector(".portfolio-sales-by-user-period-select")).toBeNull();
    expect(container.textContent).toContain("Tout l’historique");
    expect((screen.getByRole("img", { name: /Tout l’historique/i }) as HTMLCanvasElement).getAttribute("aria-label"))
      .toContain("Tout l’historique");
    expect((state.portfolioSalesByUserChartData as { series: Array<{ total: number }> }).series
      .reduce((sum, series) => sum + series.total, 0)).toBe(1_000);
  });
});

for (const language of ["en", "fr"]) test(`overdue overview and realized Details summary ${language}`, async () => {
  const lot = makeLot({ expectedReceiptDate: "2026-10-19", boxesPurchased: 5, boxPriceCost: 100, purchaseShippingCost: 0, purchaseTaxPercent: 0 });
  const { view } = renderPortfolio(language, "unionArenaLight", 360, "overview", "trend", {
    lot, sales: [], receiptSummary: { received: { lotCount: 0, totalCost: 0 }, awaiting: { lotCount: 1, totalCost: 500 }, nextExpectedReceiptDate: null, realizedProfit: 0, capitalToRecover: 500 }
  });
  expect(view.container.textContent).toContain(language === "fr" ? "Réception à confirmer" : "Receipt to confirm");
  expect(view.container.querySelector(".portfolio-net-revenue")?.textContent).toContain(language === "fr" ? "Revenus nets" : "Net revenue");
  await fireEvent.click(screen.getByRole("button", { name: language === "fr" ? "Détails" : "Details" }));
  const summary = view.container.querySelector(".portfolio-performance-summary")!;
  expect(summary.textContent).toContain(language === "fr" ? "Perte réalisée" : "Realized loss");
  expect(summary.textContent).not.toContain("500");
});

test("Details groups actual financial rows and preserves sorting inside each group", async () => {
  const { lot, sales } = createDenseVolumeFixture();
  const base = portfolioComputed.allLotPerformance.call({ lots: [lot], portfolioLotFilterIds: [], portfolioLotTypeFilter: "both", portfolioReceiptFilter: "all", portfolioDashboardPreset: "all", salesCacheEpoch: 0, getAllSalesByLotId: () => new Map([[lot.id, sales]]) } as never)[0]!;
  const performanceRows = [
    { ...base, lotId: 1, lotName: "Zulu received", realizedMarginPercent: 30 },
    { ...base, lotId: 2, lotName: "Bravo awaiting", expectedReceiptDate: "2026-12-01", realizedMarginPercent: 20 },
    { ...base, lotId: 3, lotName: "Alpha received", realizedMarginPercent: 10 },
    { ...base, lotId: 4, lotName: "Yankee awaiting", expectedReceiptDate: "2026-12-02", realizedMarginPercent: 40 }
  ];
  const { view, state } = renderPortfolio("en", "unionArenaLight", 1280, "details", "trend", { performanceRows });
  for (const [key, direction, expected] of [
    ["name", "asc", ["Alpha received", "Zulu received", "Bravo awaiting", "Yankee awaiting"]],
    ["name", "desc", ["Zulu received", "Alpha received", "Yankee awaiting", "Bravo awaiting"]],
    ["soldMargin", "desc", ["Zulu received", "Alpha received", "Yankee awaiting", "Bravo awaiting"]],
    ["soldMargin", "asc", ["Alpha received", "Zulu received", "Bravo awaiting", "Yankee awaiting"]]
  ] as const) {
    const buttons = view.container.querySelectorAll<HTMLElement>(".portfolio-lot-performance .portfolio-performance-grid__head button");
    await fireEvent.click(buttons[key === "name" ? 0 : 2]!);
    await nextTick();
    const groups = view.container.querySelectorAll(".portfolio-financial-receipt-group");
    expect(groups).toHaveLength(2);
    expect(groups[0]?.textContent).toContain("Stock received");
    expect(groups[1]?.textContent).toContain("Preorders");
    const names = [...view.container.querySelectorAll(".portfolio-lot-performance__name")].map(el => el.textContent?.trim());
    expect(names).toEqual(expected);
  }
});

for (const language of ["en", "fr"]) test(`overview amounts reflect current rows including empty scope ${language}`, () => {
  const base = { lotId: 11, lotName: "Received", totalCost: 1000, totalRevenue: 400, totalProfit: -600, realizedProfit: 80, salesCount: 1 };
  const awaiting = { ...base, lotId: 22, lotName: "Awaiting", expectedReceiptDate: "2026-12-01", totalCost: 500, totalRevenue: 0, totalProfit: -500, realizedProfit: 0, salesCount: 0 };
  for (const [rows, investment, revenue, realized, capital] of [
    [[base, awaiting], 1500, 400, 80, 1100], [[base], 1000, 400, 80, 600], [[awaiting], 500, 0, 0, 500], [[], 0, 0, 0, 0]
  ] as const) {
    const { view } = renderPortfolio(language, "unionArenaLight", 360, "overview", "trend", { performanceRows: [...rows] as never, receiptSummary: buildPortfolioReceiptSummary([...rows], "2026-10-25") as unknown as Record<string, unknown> });
    const money = (value: number) => `$${formatLocalizedNumber(value, language, 2)}`;
    expect(view.container.querySelector(".portfolio-net-revenue")?.textContent).toContain(money(revenue));
    expect(view.container.querySelector(".portfolio-investment-total:not(.portfolio-net-revenue)")?.textContent).toContain(money(investment));
    const kpis = view.container.querySelectorAll(".portfolio-primary-kpi");
    expect(kpis[0]?.textContent).toContain(money(realized));
    expect(kpis[1]?.textContent).toContain(money(capital));
    view.unmount();
  }
});

test("whole Details keeps positive and negative actual preorder sales and neutral unsold capital", () => {
  const rows = [0, 80, -20].map((realizedProfit, i) => ({ lotId: i + 1, lotName: `Preorder ${i}`, expectedReceiptDate: "2026-12-01", totalCost: 500, totalRevenue: i ? 100 : 0, totalProfit: i ? -400 : -500, realizedProfit, salesCount: i ? 1 : 0 }));
  const { view } = renderPortfolio("en", "unionArenaLight", 390, "details", "trend", { performanceRows: rows as never });
  const summary = view.container.querySelector(".portfolio-performance-summary")!;
  expect(summary.textContent).toContain("$20 CAD");
  expect(summary.textContent).toContain("$80 CAD");
  const actualRows = view.container.querySelectorAll(".portfolio-lot-performance .portfolio-performance-grid__row");
  expect(actualRows[0]?.textContent).not.toContain("-$500");
  expect(actualRows[1]?.textContent).toContain("+$80 CAD");
  expect(actualRows[2]?.textContent).toContain("-$20 CAD");
});
