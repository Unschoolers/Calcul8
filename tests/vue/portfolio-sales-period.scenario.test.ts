import { fireEvent, screen, within } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { computed, nextTick, reactive } from "vue";
import PortfolioWindow from "../../src/components/windows/portfolio/PortfolioWindow.vue";
import { portfolioComputed } from "../../src/app-core/computed/portfolio.ts";
import { formatLocalizedNumber, translateAppMessage } from "../../src/app-core/i18n/index.ts";
import { createPortfolioWindowPorts, portfolioWindowPortsKey } from "../../src/components/windows/portfolio/portfolioWindowPorts.ts";
import { createDenseVolumeFixture } from "../helpers/volume-fixtures.ts";
import { renderWithApp } from "./render.ts";
import { vuetify } from "../../src/vuetify.ts";

function renderPortfolio(language = "en", theme = "unionArenaLight", width = 1280) {
  vuetify.theme.change(theme);
  vuetify.display.width.value = width;
  const { lot, sales } = createDenseVolumeFixture();
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
    portfolioSalesByUserPeriod: 8, portfolioSalesByUserMetric: "count",
    currentLotId: lot.id, googleAvatarLoadFailed: false, lots: [lot], portfolioChartView: "trend",
    portfolioDashboardPreset: "all", portfolioLotFilterIds: [], portfolioLotTypeFilter: "both",
    salesByLotId: {}, workspaceMembers: [], googleProfilePicture: "", portfolioLotFilterItems: [],
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
  const lotPerformance = computed(() => portfolioComputed.allLotPerformance.call(context() as never));
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
      AppFormLayout: true, AppToolbarCard: true, BuyerIdentityLabel: true, BuyerQuickViewHost: true,
      PortfolioPerformanceSheet: true, PortfolioPulsePanel: true, ShopifyLinkIndicator: true
    } }
  });
  return { view, state };
}

describe("Portfolio sales period control", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-20T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vuetify.theme.change("unionArenaDark");
    vuetify.display.width.value = 1024;
  });

  test("keeps the period selector available when the selected period has no sales", () => {
    const { view } = renderPortfolio();
    const { container } = view;
    const selector = screen.getByLabelText("Period");
    expect(selector).toBeInTheDocument();
    expect(container.textContent).toContain("No recorded sales for this period.");
    expect(container.textContent).not.toContain("{{");
  });

  test("reveals all historical sales through the real selector and metric controls", async () => {
    const { view, state } = renderPortfolio();
    const { container } = view;
    const selector = screen.getByLabelText("Period");
    await fireEvent.keyDown(selector, { key: "ArrowDown" });
    const allHistory = await screen.findByText("All history");
    const menu = (allHistory.closest(".v-overlay-container") ?? document.body) as HTMLElement;
    for (const option of ["4 weeks", "8 weeks", "13 weeks", "26 weeks", "52 weeks", "All history"]) {
      expect(within(menu).getByText(option)).toBeInTheDocument();
    }
    await fireEvent.click(allHistory);
    const metricToggle = container.querySelector<HTMLElement>(".portfolio-sales-by-user-toggle")!;
    const countButton = within(metricToggle).getByRole("button", { name: "Count" });
    await fireEvent.click(countButton);
    expect(container.textContent).toContain("1,000");
    expect((state.portfolioTotals as { totalProfit: number }).totalProfit).toBeCloseTo(3_608.59, 2);
    const countChart = state.portfolioSalesByUserChartData as { series: Array<{ total: number }> };
    expect(countChart.series.reduce((sum, series) => sum + series.total, 0)).toBe(1_000);
    expect((screen.getByRole("img", { name: /All history by count/i }) as HTMLCanvasElement).getAttribute("aria-label"))
      .toContain("All history");
    expect(container.textContent).toContain("Period total");
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

    await fireEvent.keyDown(selector, { key: "ArrowDown" });
    const recentPeriod = await screen.findByText("8 weeks", { selector: ".v-list-item-title" });
    await fireEvent.click(recentPeriod);
    expect(state.portfolioSalesByUserPeriod).toBe(8);
    expect(document.querySelector(".portfolio-sales-drilldown-dialog")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.textContent).toContain("No recorded sales for this period.");
    expect((state.portfolioTotals as { totalProfit: number }).totalProfit).toBeCloseTo(3_608.59, 2);
    expect(container.textContent).not.toContain("6,614.59");

    await fireEvent.keyDown(selector, { key: "ArrowDown" });
    await fireEvent.click(await screen.findByText("All history", { selector: ".v-list-item-title" }));
    const oldestWeek = container.querySelector<HTMLButtonElement>(".portfolio-sales-by-user-week-pill");
    expect(oldestWeek).not.toBeNull();
    await fireEvent.click(oldestWeek!);
    expect(document.querySelector(".portfolio-sales-drilldown-dialog")?.getAttribute("aria-hidden")).toBeNull();
    state.portfolioSalesByUserPeriod = 8;
    await nextTick();
    expect(document.querySelector(".portfolio-sales-drilldown-dialog")?.getAttribute("aria-hidden")).toBe("true");
  }, 30_000);

  test("labels and shows localized historical data in French on a dark mobile display", async () => {
    const { view, state } = renderPortfolio("fr-CA", "unionArenaDark", 390);
    const { container } = view;
    expect(screen.getByLabelText("Période")).toBeInTheDocument();
    expect(container.textContent).toContain("Aucune vente enregistrée pour cette période.");
    const selector = screen.getByLabelText("Période");
    await fireEvent.keyDown(selector, { key: "ArrowDown" });
    await fireEvent.click(await screen.findByText("Tout l’historique", { selector: ".v-list-item-title" }));
    expect(container.textContent).toContain("Tout l’historique");
    expect((screen.getByRole("img", { name: /Tout l’historique/i }) as HTMLCanvasElement).getAttribute("aria-label"))
      .toContain("Tout l’historique");
    expect((state.portfolioSalesByUserChartData as { series: Array<{ total: number }> }).series
      .reduce((sum, series) => sum + series.total, 0)).toBe(1_000);
  });
});
