import { fireEvent, screen, within } from "@testing-library/vue";
import { reactive, nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createInitialState } from "../../src/app-core/state.ts";
import { uiBaseMethods } from "../../src/app-core/methods/ui/common/base.ts";
import { formatLocalizedDate } from "../../src/app-core/i18n/index.ts";
import { createDenseVolumeFixture } from "../helpers/volume-fixtures.ts";
import { createSalesWindowPorts, salesWindowPortsKey } from "../../src/components/windows/sales/salesWindowPorts.ts";
import SalesWindow from "../../src/components/windows/sales/SalesWindow.vue";
import { vuetify } from "../../src/vuetify.ts";
import { renderWithApp } from "./render.ts";

const originalInnerWidth = window.innerWidth;
const originalTheme = vuetify.theme.global.name.value;

afterEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: originalInnerWidth });
  vuetify.display.update();
  vuetify.theme.change(originalTheme);
});

describe("dense sales history", () => {
  test("paginates all identities, globally sorts the lot, routes row actions, and resets on lot change", async () => {
    vuetify.theme.change("unionArenaLight");
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
    vuetify.display.update();
    const { lot, sales, targets } = createDenseVolumeFixture();
    const secondLot = { ...lot, id: lot.id + 1, name: "Control lot", singlesPurchases: [] };
    const secondSale = { ...sales[5]!, id: 99_999, date: "2025-01-01", price: 44 };
    const editSale = vi.fn();
    const deleteSale = vi.fn();
    const source = reactive({
      ...createInitialState(),
      currentLotId: lot.id,
      currentLotType: "singles",
      currentLotCatalogSource: "none",
      currentLotName: lot.name,
      preferredLanguage: "en",
      lots: [lot, secondLot],
      salesByLotId: new Map([[lot.id, sales], [secondLot.id, [secondSale]]]),
      sales,
      sortedSales: [...sales].sort((a, b) => b.date.localeCompare(a.date)),
      chartView: "pie",
      salesProgress: 0,
      salesStatus: { revenue: 0, color: "primary" },
      soldPacksCount: 0,
      totalCaseCost: 0,
      totalPacks: 0,
      singlesTrackedSoldCount: 0,
      singlesTrackedTotalCount: 1_000,
      liveForecastScenarios: [],
      calculateSaleProfit: () => 0,
      getSaleProfitPreview: () => null,
      getSaleColor: () => "primary",
      getSaleIcon: () => "mdi-tag",
      formatDate: (date: string) => uiBaseMethods.formatDate.call(source as never, date),
      toggleChartView: vi.fn(),
      getBuyerProfile: () => null,
      formatCurrency: (value: number | null | undefined, decimals = 2) => uiBaseMethods.formatCurrency.call(source as never, value, decimals),
      fmtCurrency: (value: number | null | undefined, decimals = 2) => uiBaseMethods.formatCurrency.call(source as never, value, decimals),
      fmtUnits: (value: number | null | undefined) => String(value ?? 0),
      t: (key: string) => uiBaseMethods.t.call(source as never, key, undefined),
      editSale,
      deleteSale,
      isUnlinkedSinglesSale: () => false,
      salesInvestmentRecovery: { remaining: 0, percent: null, revenue: 0, cost: 0 },
      salesSnapshotKpis: [],
      salesSnapshotInventoryMeta: "1,000 items",
      buyerQuickViewSummary: null
    });
    const { container } = renderWithApp(SalesWindow, {
      global: {
        provide: { [salesWindowPortsKey as symbol]: createSalesWindowPorts(source as never) },
        stubs: { BuyerQuickViewHost: true }
      }
    });
    await nextTick();

    const rows = () => Array.from(container.querySelectorAll(".sales-history-ledger__row"));
    expect(rows()).toHaveLength(5);
    expect(screen.getByRole("button", { name: "View all sales" })).toBeVisible();

    const sort = screen.getByRole("combobox", { name: "Sort sales history" });
    const targetSale = sales.find(sale => sale.id === targets.oldestHighestPriceSaleId)!;
    const targetDateLabel = formatLocalizedDate(targetSale.date, "en");
    await fireEvent.update(sort, "price:desc");
    expect(rows()).toHaveLength(5);
    expect(rows()[0]?.querySelector(".sales-history-ledger__date")?.textContent?.trim()).toBe(targetDateLabel);
    await fireEvent.update(sort, "date:asc");
    expect(rows()).toHaveLength(5);
    expect(rows()[0]?.querySelector(".sales-history-ledger__date")?.textContent?.trim()).toBe(targetDateLabel);
    await fireEvent.update(sort, "date:desc");

    await fireEvent.click(screen.getByRole("button", { name: "View all sales" }));
    expect(rows()).toHaveLength(80);
    const priceSortButton = Array.from(container.querySelectorAll(".sales-history-ledger__head button"))
      .find(button => button.textContent?.includes("Price"))!;
    await fireEvent.click(priceSortButton);
    expect(rows()).toHaveLength(80);
    expect(rows()[0]?.querySelector(".sales-history-ledger__date")?.textContent?.trim()).toBe(targetDateLabel);
    const maxPrice = Math.max(...sales.map(sale => sale.price));
    await fireEvent.update(sort, "price:desc");

    const saleIdByDateLabel = new Map(sales.map(sale => [formatLocalizedDate(sale.date, "en"), sale.id]));
    const seen = new Set<number>();
    let visibleCount = 80;
    const loadMoreButton = () => {
      const control = container.querySelector(".sales-history-ledger__loadmore");
      return control ? within(control as HTMLElement).queryByRole("button") : null;
    };
    while (loadMoreButton()) {
      const nextCount = Math.min(80, sales.length - visibleCount);
      const remaining = sales.length - visibleCount;
      const normalizedLoadMoreLabel = loadMoreButton()!.textContent?.replace(/\s+/g, " ").trim();
      expect(normalizedLoadMoreLabel).toBe(`Load ${nextCount} more (${remaining} left)`);
      for (const row of rows()) {
        const dateLabel = row.querySelector(".sales-history-ledger__date")?.textContent?.trim();
        const saleId = dateLabel ? saleIdByDateLabel.get(dateLabel) : undefined;
        if (saleId !== undefined) seen.add(saleId);
      }
      await fireEvent.click(loadMoreButton()!);
      visibleCount += nextCount;
      expect(rows()).toHaveLength(visibleCount);
    }
    for (const row of rows()) {
      const dateLabel = row.querySelector(".sales-history-ledger__date")?.textContent?.trim();
      const saleId = dateLabel ? saleIdByDateLabel.get(dateLabel) : undefined;
      if (saleId !== undefined) seen.add(saleId);
    }
    expect(rows()).toHaveLength(1_000);
    expect(seen.size).toBe(1_000);
    const actualFinalIds = rows().map(row => {
      const dateLabel = row.querySelector(".sales-history-ledger__date")?.textContent?.trim() || "";
      return saleIdByDateLabel.get(dateLabel)!;
    });
    const expectedFinalIds = sales.map(sale => sale.id).sort((left, right) => left - right);
    expect(actualFinalIds.sort((left, right) => left - right)).toEqual(expectedFinalIds);
    await fireEvent.update(sort, "date:asc");
    const firstFullDateLabel = rows()[0]?.querySelector(".sales-history-ledger__date")?.textContent?.trim() || "";
    const firstFullDateId = saleIdByDateLabel.get(firstFullDateLabel);
    expect(firstFullDateId).toBe(targets.oldestHighestPriceSaleId);
    await fireEvent.update(sort, "price:desc");
    const targetRow = rows().find(row => row.textContent?.includes(targetDateLabel))!;
    expect(rows()[0]).toBe(targetRow);
    expect(targetRow).toHaveTextContent("1,000.00");
    expect(source.sortedSales.find(sale => sale.price === maxPrice)?.id).toBe(targets.oldestHighestPriceSaleId);
    await fireEvent.click(targetRow.querySelector("button[aria-label='Sale actions']")!);
    await fireEvent.click(await screen.findByText("Delete sale"));
    expect(deleteSale).toHaveBeenCalledWith(targets.oldestHighestPriceSaleId);
    expect(editSale).not.toHaveBeenCalled();

    source.currentLotId = secondLot.id;
    source.currentLotName = secondLot.name;
    source.sales = [secondSale];
    source.sortedSales = [secondSale];
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    vuetify.display.update();
    vuetify.theme.change("unionArenaDark");
    source.preferredLanguage = "fr-CA";
    await nextTick();
    expect(rows()).toHaveLength(1);
    expect(screen.getByText("Historique des ventes")).toBeVisible();
    expect(rows()[0]?.querySelector(".sales-history-ledger__date")?.textContent?.trim()).toBe(formatLocalizedDate(secondSale.date, "fr-CA"));
    expect(rows().some(row => row.querySelector(".sales-history-ledger__date")?.textContent?.trim() === targetDateLabel)).toBe(false);
    expect(container.querySelector(".v-theme--unionArenaDark")).not.toBeNull();

    source.currentLotId = lot.id;
    source.currentLotName = lot.name;
    source.sales = sales;
    source.sortedSales = [...sales].sort((a, b) => b.date.localeCompare(a.date));
    await nextTick();
    expect(rows()).toHaveLength(5);
    await fireEvent.keyDown(rows()[0]!, { key: "Enter" });
    expect(editSale).toHaveBeenCalledWith(sales.find(sale => sale.id === targets.oldestHighestPriceSaleId));
  }, 120_000);
});
