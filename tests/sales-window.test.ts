import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { SalesHistoryLedgerDefinition } from "../src/components/windows/sales/SalesHistoryLedger.ts";
import { SalesWindowDefinition } from "../src/components/windows/sales/SalesWindow.definition.ts";
import { uiBaseMethods } from "../src/app-core/methods/ui/common/base.ts";
import type { Sale, SinglesPurchaseEntry } from "../src/types/app.ts";

function makeSale(overrides: Record<string, any> = {}): Sale {
  return {
    id: 1,
    type: "pack",
    quantity: 1,
    packsCount: 1,
    price: 10,
    buyerShipping: 0,
    date: "2026-03-05",
    ...overrides
  };
}

const read = (path: string) => readFileSync(path, "utf8");

test("SalesWindow computed pagination helpers work from sortedSales and render count", () => {
  const sales = Array.from({ length: 205 }, (_, idx) => makeSale({ id: idx + 1 }));
  const vm = {
    sortedSales: sales,
    salesHistoryRenderCount: 80
  };

  const visible = SalesWindowDefinition.computed.visibleSortedSales.call(vm as never);
  const hasMore = SalesWindowDefinition.computed.hasMoreSalesHistory.call(vm as never);
  const remaining = SalesWindowDefinition.computed.remainingSalesHistoryCount.call(vm as never);
  const nextBatch = SalesWindowDefinition.computed.nextSalesHistoryBatchCount.call(vm as never);

  assert.equal(visible.length, 80);
  assert.equal(hasMore, true);
  assert.equal(remaining, 125);
  assert.equal(nextBatch, 80);
});

test("SalesWindow pagination computed handles missing arrays and invalid limits", () => {
  const vm = {
    sortedSales: null,
    salesHistoryRenderCount: -5
  };

  assert.deepEqual(SalesWindowDefinition.computed.visibleSortedSales.call(vm as never), []);
  assert.equal(SalesWindowDefinition.computed.hasMoreSalesHistory.call(vm as never), false);
  assert.equal(SalesWindowDefinition.computed.remainingSalesHistoryCount.call(vm as never), 0);
  assert.equal(SalesWindowDefinition.computed.nextSalesHistoryBatchCount.call(vm as never), 0);
});

test("SalesWindow watchers and mounted reset render count", () => {
  const vm = {
    calls: 0,
    resetSalesHistoryRenderCount() {
      this.calls += 1;
    }
  };

  SalesWindowDefinition.watch.currentLotId.call(vm as never);
  SalesWindowDefinition.watch.currentLotType.call(vm as never);
  SalesWindowDefinition.mounted.call(vm as never);

  assert.equal(vm.calls, 3);
});

test("SalesWindow status tone and progress colors map expected values", () => {
  const vm = { salesStatus: { color: "warning" } };
  assert.equal(SalesWindowDefinition.methods.salesStatusToneClass.call(vm as never), "sales-status-card--warning");
  assert.equal(SalesWindowDefinition.methods.salesStatusProgressColor.call(vm as never), "warning");

  vm.salesStatus.color = "secondary";
  assert.equal(SalesWindowDefinition.methods.salesStatusToneClass.call(vm as never), "sales-status-card--secondary");
  assert.equal(SalesWindowDefinition.methods.salesStatusProgressColor.call(vm as never), "secondary");

  vm.salesStatus.color = "unknown";
  assert.equal(SalesWindowDefinition.methods.salesStatusToneClass.call(vm as never), "sales-status-card--neutral");
  assert.equal(SalesWindowDefinition.methods.salesStatusProgressColor.call(vm as never), "primary");
});

test("SalesWindow bulkBoxProgressText returns formatted box-equivalent progress", () => {
  const vm = {
    packsPerBox: 16,
    soldPacksCount: 192,
    totalPacks: 256,
    fmtUnits: SalesWindowDefinition.methods.fmtUnits,
    fmtCurrency: SalesWindowDefinition.methods.fmtCurrency,
    formatCurrency: (value: number | null | undefined, decimals = 2) => Number(value || 0).toFixed(decimals)
  };
  assert.equal(SalesWindowDefinition.computed.bulkBoxProgressText.call(vm as never), "12 / 16 boxes");

  const noBoxVm = {
    packsPerBox: 0,
    soldPacksCount: 10,
    totalPacks: 20
  };
  assert.equal(SalesWindowDefinition.computed.bulkBoxProgressText.call(noBoxVm as never), "");
});

test("SalesWindow computes realized sold profit from the per-sale profit helper", () => {
  const vm = {
    sales: [makeSale({ id: 1 }), makeSale({ id: 2 }), makeSale({ id: 3 })],
    calculateSaleProfit(sale: Sale) {
      return sale.id === 1 ? 12.5 : sale.id === 2 ? -2 : 8.25;
    }
  };

  assert.equal(SalesWindowDefinition.computed.salesStatusRealizedProfit.call(vm as never), 18.75);
});

test("SalesWindow computes realized sold margin percent from realized profit and sold revenue", () => {
  const vm = {
    salesStatusRealizedProfit: 18.75,
    salesStatus: { revenue: 150 }
  };

  assert.equal(SalesWindowDefinition.computed.salesStatusRealizedMarginPercent.call(vm as never), 12.5);
  assert.equal(
    SalesWindowDefinition.computed.salesStatusRealizedMarginPercent.call({
      salesStatusRealizedProfit: 18.75,
      salesStatus: { revenue: 0 }
    } as never),
    null
  );
});

test("SalesWindow renders snapshot KPIs through the shared KPI grid", () => {
  const template = read("src/components/windows/sales/SalesWindow.html");
  const script = read("src/components/windows/sales/SalesWindow.ts");

  assert.match(template, /sales-status-progress-wrap/);
  assert.match(template, /salesStatusProgressPercentLabel/);
  assert.match(template, /salesStatusRealizedProfitLabel/);
  assert.match(template, /salesStatusBreakEvenGapLabel/);
  assert.match(template, /salesForecastProjectionBadgeLabel/);
  assert.match(template, /salesForecastScenarioPrefix/);
  assert.match(template, /salesForecastProjectedProfitLabel/);
  assert.match(template, /<app-kpi-grid\b/);
  assert.match(template, /layout="six-three"/);
  assert.match(template, /:items="salesSnapshotKpis"/);
  assert.doesNotMatch(template, /salesStatusSummaryLine/);
  assert.doesNotMatch(template, /salesStatusProgressLine/);
  assert.match(script, /AppKpiGrid/);
});

test("SalesWindow exposes sales, profit, and inventory chart modes", () => {
  const template = read("src/components/windows/sales/SalesWindow.html");
  const context = { chartView: "pie" };

  uiBaseMethods.toggleChartView.call(context as never);
  assert.equal(context.chartView, "sparkline");
  uiBaseMethods.toggleChartView.call(context as never);
  assert.equal(context.chartView, "profit");
  uiBaseMethods.toggleChartView.call(context as never);
  assert.equal(context.chartView, "pie");

  assert.match(template, /salesChartRevenueSubtitle/);
  assert.match(template, /salesChartProfitSubtitle/);
  assert.match(template, /salesChartInventoryTitle/);
  assert.match(template, /salesChartRevenueTitle/);
  assert.match(template, /salesChartProfitTitle/);
  assert.match(template, /salesChartToggleProfitLabel/);
  assert.match(template, /salesChartProfitAriaLabel/);
});

test("SalesWindow renders sales history through one responsive ledger component", () => {
  const template = read("src/components/windows/sales/SalesWindow.html");
  const ledgerTemplate = read("src/components/windows/sales/SalesHistoryLedger.html");
  const script = read("src/components/windows/sales/SalesWindow.ts");

  assert.match(template, /<sales-history-ledger\b/);
  assert.doesNotMatch(template, /<v-list v-else class="sales-history-list"/);
  assert.match(script, /SalesHistoryLedger/);
  assert.match(
    ledgerTemplate,
    /sales-history-ledger__type-icon[\s\S]*salesHistoryColumnUnitsLabel[\s\S]*salesHistoryColumnTypeLabel[\s\S]*salesHistoryColumnPriceLabel[\s\S]*salesHistoryColumnProfitLabel[\s\S]*salesHistoryColumnDateLabel[\s\S]*salesHistoryColumnCustomerLabel/
  );
  assert.match(ledgerTemplate, /saleTypeIcon\(sale\)/);
  assert.match(ledgerTemplate, /saleTypeText\(sale\)/);
  assert.match(ledgerTemplate, /sales-history-ledger__head-sort[\s\S]*@click="setSort\('units'\)"/);
  assert.match(ledgerTemplate, /@click="setSort\('type'\)"[\s\S]*@click="setSort\('price'\)"[\s\S]*@click="setSort\('profit'\)"[\s\S]*@click="setSort\('date'\)"[\s\S]*@click="setSort\('customer'\)"/);
  assert.doesNotMatch(ledgerTemplate, /sales-history-ledger__type"[\s\S]*<v-avatar/);
  assert.doesNotMatch(ledgerTemplate, /saleListTitle\(sale\)/);
  const ledgerCss = read("src/components/windows/sales/SalesWindow.css");
  assert.match(ledgerCss, /grid-template-columns:\s*32px\s+58px\s+minmax\(76px,\s*0\.7fr\)\s+74px\s+minmax\(112px,\s*0\.9fr\)\s+82px\s+minmax\(96px,\s*0\.65fr\)\s+28px/);
  assert.match(ledgerCss, /@media \(min-width:\s*601px\)[\s\S]*\.sales-history-ledger__sortbar\s*{[\s\S]*display:\s*none/);
  assert.match(ledgerCss, /@media \(max-width:\s*600px\)[\s\S]*\.sales-history-ledger__head\s*{[\s\S]*display:\s*none/);
  assert.match(ledgerCss, /"type-icon units type price actions"/);
});

test("SaleEditorModal presents RTYH as spot price and items won", () => {
  const template = read("src/components/shell/SaleEditorModal.html");

  assert.match(template, /v-if="newSale\.type !== 'rtyh'"[\s\S]*saleEditorQuantityLabel/);
  assert.match(template, /newSale\.type === 'rtyh'\s*\? t\('saleEditorRtyhSpotPriceLabel'\)\s*:\s*t\('saleEditorPricePerItemLabel'\)/);
  assert.match(template, /newSale\.type === 'rtyh'[\s\S]*saleEditorRtyhItemsWonLabel/);
  assert.doesNotMatch(template, /saleEditorItemsSoldRandomHitLabel/);
});

test("SalesWindow keeps the selected sales page dense on desktop", () => {
  const template = read("src/components/windows/sales/SalesWindow.html");
  const css = read("src/components/windows/sales/SalesWindow.css");
  const appCss = read("src/styles/app.css");

  assert.match(template, /class="sales-screen-grid"/);
  assert.match(template, /class="sales-right-column"/);
  assert.match(template, /<v-col cols="12" lg="7">/);
  assert.match(template, /<v-col cols="12" lg="5" class="sales-right-column">/);
  assert.doesNotMatch(template, /<v-col cols="12" md="[57]"/);
  assert.match(css, /\.sales-status-content\s*{[\s\S]*container-type:\s*inline-size/);
  assert.match(css, /@media \(min-width:\s*960px\)[\s\S]*\.sales-screen-grid\s*{[\s\S]*align-items:\s*start/);
  assert.match(css, /@media \(min-width:\s*960px\)[\s\S]*\.sales-right-column\s*{[\s\S]*display:\s*grid[\s\S]*gap:\s*0\.75rem/);
  assert.match(css, /@media \(min-width:\s*960px\)[\s\S]*\.sales-chart-card[\s\S]*\.app-responsive-chart__plot\s*{[\s\S]*min-block-size:\s*280px/);
  assert.doesNotMatch(css, /repeat\(6,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(appCss, /\.app-kpi-grid--six-three\s*{[\s\S]*grid-template-columns:\s*repeat\(6,\s*minmax\(var\(--app-kpi-grid-six-three-card-min\),\s*1fr\)\)/);
  assert.match(appCss, /@container \(max-width:\s*52rem\)\s*{[\s\S]*\.app-kpi-grid--six-three\s*{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.sales-snapshot-kpi-card:nth-child\(odd\)/);
  assert.match(css, /\.sales-snapshot-kpi-card:nth-child\(even\)/);
  assert.match(css, /\.v-theme--unionArenaLight \.sales-snapshot-kpi-card:nth-child\(odd\)/);
  assert.match(css, /\.v-theme--unionArenaLight \.sales-snapshot-kpi-card:nth-child\(even\)/);
});

test("SalesHistoryLedger sorts through one stateful ledger model", () => {
  const vm = {
    sales: [
      makeSale({ id: 1, quantity: 1, packsCount: 1, price: 15, date: "2026-06-01", customer: "Zed" }),
      makeSale({ id: 2, quantity: 4, packsCount: 4, price: 30, date: "2026-06-03", customer: "Amy" }),
      makeSale({ id: 3, quantity: 2, packsCount: 2, price: 18, date: "2026-05-29", customer: "" })
    ],
    sortKey: "profit",
    sortDirection: "desc",
    calculateSaleProfit(sale: Sale) {
      return sale.id === 1 ? 5 : sale.id === 2 ? 12 : 7;
    },
    getSaleProfitPreview() {
      return null;
    }
  };

  const byProfit = SalesHistoryLedgerDefinition.computed!.sortedLedgerSales.call(vm as never);
  assert.deepEqual(byProfit.map((sale) => sale.id), [2, 3, 1]);

  SalesHistoryLedgerDefinition.methods!.setSort.call(vm as never, "profit");
  const byProfitAsc = SalesHistoryLedgerDefinition.computed!.sortedLedgerSales.call(vm as never);
  assert.equal(vm.sortDirection, "asc");
  assert.deepEqual(byProfitAsc.map((sale) => sale.id), [1, 3, 2]);

  SalesHistoryLedgerDefinition.methods!.setSort.call(vm as never, "customer");
  const byCustomer = SalesHistoryLedgerDefinition.computed!.sortedLedgerSales.call(vm as never);
  assert.equal(vm.sortDirection, "asc");
  assert.deepEqual(byCustomer.map((sale) => sale.id), [3, 2, 1]);
});

test("SalesHistoryLedger presents compact unit type and price columns", () => {
  const t = (key: string) => ({
    salesHistoryTypeSinglesLabel: "Singles",
    salesHistoryTypeBoxesLabel: "Boxes",
    salesHistoryTypeRandomHitLabel: "Random hit",
    salesHistoryTypeWheelLabel: "Wheel",
    salesItemsLabel: "items"
  })[key] || key;
  const vm = {
    t,
    fmtCurrency: (value: number | null | undefined) => Number(value || 0).toFixed(2),
    fmtUnits: (value: number | null | undefined) => String(Number(value || 0)),
    getSaleIcon: (type: Sale["type"]) => `icon:${type}`
  };

  const singlesSale = makeSale({ quantity: 14, packsCount: 14, type: "pack", price: 7 });
  const boxSale = makeSale({ quantity: 3, packsCount: 48, type: "box", price: 127 });
  const rtyhSale = makeSale({ quantity: 10, packsCount: 32, type: "rtyh", price: 26 });

  assert.equal(SalesHistoryLedgerDefinition.methods!.saleUnitsLabel.call(vm as never, singlesSale), "14");
  assert.equal(SalesHistoryLedgerDefinition.methods!.saleTypeText.call(vm as never, singlesSale), "Singles");
  assert.equal(SalesHistoryLedgerDefinition.methods!.saleTypeIcon.call(vm as never, singlesSale), "icon:pack");
  assert.equal(SalesHistoryLedgerDefinition.methods!.saleRevenueLabel.call(vm as never, singlesSale), "$7.00");
  assert.equal(SalesHistoryLedgerDefinition.methods!.saleUnitsLabel.call(vm as never, boxSale), "3");
  assert.equal(SalesHistoryLedgerDefinition.methods!.saleTypeText.call(vm as never, boxSale), "Boxes");
  assert.equal(SalesHistoryLedgerDefinition.methods!.saleTypeIcon.call(vm as never, boxSale), "icon:box");
  assert.equal(SalesHistoryLedgerDefinition.methods!.saleRevenueLabel.call(vm as never, boxSale), "$127.00");
  assert.equal(SalesHistoryLedgerDefinition.methods!.saleUnitsLabel.call(vm as never, rtyhSale), "32");
  assert.equal(SalesHistoryLedgerDefinition.methods!.saleTypeText.call(vm as never, rtyhSale), "Random hit");
  assert.equal(SalesHistoryLedgerDefinition.methods!.saleRevenueLabel.call(vm as never, rtyhSale), "$26.00");
});

test("SalesWindow builds bulk snapshot KPIs from practical sales context", () => {
  const vm = {
    currentLotType: "bulk",
    sortedSales: [
      makeSale({ id: 2, quantity: 3, packsCount: 3, price: 45, netRevenue: 38.5, date: "2026-06-15", customer: "Ollielav" }),
      makeSale({ id: 1, quantity: 4, packsCount: 4, price: 40, netRevenue: 35.5, date: "2026-06-01", customer: "Ollielav" })
    ],
    soldPacksCount: 7,
    totalPacks: 64,
    packsPerBox: 16,
    totalCaseCost: 319,
    salesProgress: 10.9375,
    salesStatus: { revenue: 74 },
    fmtCurrency: SalesWindowDefinition.methods.fmtCurrency,
    fmtUnits: SalesWindowDefinition.methods.fmtUnits,
    formatCurrency: (value: number | null | undefined, decimals = 2) => Number(value || 0).toFixed(decimals),
    formatDate: (value: string) => `D:${value}`,
    t: (key: string) => key
  };

  const kpis = SalesWindowDefinition.computed.salesSnapshotKpis.call(vm as never);
  const progressPercent = SalesWindowDefinition.computed.salesStatusProgressPercentLabel.call(vm as never);

  assert.equal(progressPercent, "10.9%");
  assert.deepEqual(
    kpis.map((kpi) => [kpi.id, kpi.label, kpi.value, kpi.meta, kpi.icon, kpi.tone]),
    [
      ["revenue", "salesStatusRevenueLabel", "$74.00", "salesKpiSoldNetMeta", "mdi-cash-register", "neutral"],
      ["cost", "salesStatusCostLabel", "$319.00", "salesKpiLotCostMeta", "mdi-receipt-text-outline", "neutral"],
      ["inventory", "salesKpiInventoryLabel", "0.44 / 4 salesBoxesLabel", "7 salesKpiSoldShortMeta • 57 salesKpiLeftShortMeta • 10.9%", "mdi-view-dashboard-outline", "neutral"],
      ["top-buyer", "salesKpiTopBuyerLabel", "Ollielav", "7 salesItemsLabel • $295.00", "mdi-account-star-outline", "neutral"],
      ["last-sale", "salesKpiLastSaleLabel", "D:2026-06-15", "3 salesKpiItemsNetMeta $38.50", "mdi-calendar-clock", "neutral"],
      ["box-progress", "salesKpiNextBoxLabel", "9 salesKpiToNextBoxValue", "7 / 16 salesKpiCurrentBoxMeta", "mdi-package-variant-closed", "neutral"]
    ]
  );
});

test("SalesWindow builds singles snapshot KPIs without bulk box progress", () => {
  const vm = {
    currentLotType: "singles",
    sortedSales: [
      makeSale({ id: 3, quantity: 1, packsCount: 1, price: 24, netRevenue: 21, date: "2026-06-14", customer: "Ollielav" })
    ],
    soldPacksCount: 2,
    totalPacks: 8,
    singlesTrackedSoldCount: 2,
    singlesTrackedTotalCount: 10,
    singlesUnlinkedSoldCount: 1,
    totalCaseCost: 30,
    salesStatus: { revenue: 42 },
    fmtCurrency: SalesWindowDefinition.methods.fmtCurrency,
    fmtUnits: SalesWindowDefinition.methods.fmtUnits,
    formatCurrency: (value: number | null | undefined, decimals = 2) => Number(value || 0).toFixed(decimals),
    formatDate: (value: string) => `D:${value}`,
    t: (key: string) => key
  };

  const kpis = SalesWindowDefinition.computed.salesSnapshotKpis.call(vm as never);
  const progressPercent = SalesWindowDefinition.computed.salesStatusProgressPercentLabel.call(vm as never);

  assert.equal(progressPercent, "20.0%");
  assert.deepEqual(
    kpis.map((kpi) => [kpi.id, kpi.label, kpi.value, kpi.meta, kpi.icon, kpi.tone]),
    [
      ["revenue", "salesStatusRevenueLabel", "$42.00", "salesKpiSoldNetMeta", "mdi-cash-register", "neutral"],
      ["cost", "salesStatusCostLabel", "$30.00", "salesKpiLotCostMeta", "mdi-receipt-text-outline", "neutral"],
      ["inventory", "salesKpiInventoryLabel", "2 / 10 salesItemsLabel", "2 salesKpiSoldShortMeta • 8 salesKpiLeftShortMeta • 20.0%", "mdi-view-dashboard-outline", "neutral"],
      ["top-buyer", "salesKpiTopBuyerLabel", "Ollielav", "1 salesItemsLabel • $24.00", "mdi-account-star-outline", "neutral"],
      ["last-sale", "salesKpiLastSaleLabel", "D:2026-06-14", "1 salesKpiItemNetMeta $21.00", "mdi-calendar-clock", "neutral"],
      ["avg-net", "salesKpiAvgNetItemLabel", "$21.00", "salesKpiAvgNetItemMeta", "mdi-cash-multiple", "neutral"]
    ]
  );
});

test("SalesWindow fmtCurrency uses context formatter and fallback formatting", () => {
  const vmWithFormatter = {
    formatCurrency: (value: number | null | undefined, decimals = 2) => `fmt:${value}:${decimals}`
  };
  assert.equal(SalesWindowDefinition.methods.fmtCurrency.call(vmWithFormatter as never, 12.345, 1), "fmt:12.345:1");

  const vmFallback = {};
  assert.equal(SalesWindowDefinition.methods.fmtCurrency.call(vmFallback as never, 12.345, 2), "12.35");
  assert.equal(SalesWindowDefinition.methods.fmtCurrency.call(vmFallback as never, null, 2), "0.00");
});

test("SalesWindow singles link helpers detect unlinked and generate labels", () => {
  const entries: SinglesPurchaseEntry[] = [
    { id: 10, item: "Charizard", cardNumber: "123", cost: 20, quantity: 2, marketValue: 40 },
    { id: 11, item: "Pikachu", cardNumber: "025", cost: 3, quantity: 10, marketValue: 5 }
  ];
  const vm = {
    currentLotType: "singles",
    singlesPurchases: entries
  };

  const linkedSale = makeSale({
    singlesItems: [
      { singlesPurchaseEntryId: 10, quantity: 1, price: 50 }
    ]
  });
  const mixedSale = makeSale({
    singlesItems: [
      { singlesPurchaseEntryId: 10, quantity: 1, price: 30 },
      { singlesPurchaseEntryId: 11, quantity: 1, price: 20 }
    ]
  });
  const unlinkedSale = makeSale({
    singlesItems: [
      { singlesPurchaseEntryId: 999, quantity: 1, price: 10 }
    ]
  });
  const legacyLinked = makeSale({ singlesPurchaseEntryId: 10 });
  const legacyUnlinked = makeSale({ singlesPurchaseEntryId: null });

  assert.equal(SalesWindowDefinition.methods.isUnlinkedSinglesSale.call(vm as never, linkedSale), false);
  assert.equal(SalesWindowDefinition.methods.isUnlinkedSinglesSale.call(vm as never, unlinkedSale), true);
  assert.equal(SalesWindowDefinition.methods.isUnlinkedSinglesSale.call(vm as never, legacyLinked), false);
  assert.equal(SalesWindowDefinition.methods.isUnlinkedSinglesSale.call(vm as never, legacyUnlinked), true);

  assert.equal(SalesWindowDefinition.methods.getLinkedSinglesSaleLabel.call(vm as never, linkedSale), "Charizard #123");
  assert.equal(SalesWindowDefinition.methods.getLinkedSinglesSaleLabel.call(vm as never, mixedSale), "2 items");
  assert.equal(SalesWindowDefinition.methods.getLinkedSinglesSaleLabel.call(vm as never, legacyLinked), "Charizard #123");
  assert.equal(SalesWindowDefinition.methods.getLinkedSinglesSaleLabel.call(vm as never, legacyUnlinked), "");
});

test("SalesWindow saleListTitle formats explicit bulk and singles labels", () => {
  const vm = {
    currentLotType: "bulk",
    fmtCurrency: SalesWindowDefinition.methods.fmtCurrency,
    getLinkedSinglesSaleLabel: SalesWindowDefinition.methods.getLinkedSinglesSaleLabel,
    formatCurrency: (value: number | null | undefined, decimals = 2) => Number(value || 0).toFixed(decimals),
    singlesPurchases: [
      { id: 10, item: "Charizard", cardNumber: "123", cost: 20, quantity: 2, marketValue: 40 }
    ] satisfies SinglesPurchaseEntry[]
  };
  const bulkSale = makeSale({ quantity: 2, type: "box", price: 99 });
  assert.equal(SalesWindowDefinition.methods.saleListTitle.call(vm as never, bulkSale), "2 boxes @ $99.00");

  vm.currentLotType = "singles";
  const singlesSale = makeSale({ quantity: 1, price: 50, singlesPurchaseEntryId: 10 });
  assert.equal(
    SalesWindowDefinition.methods.saleListTitle.call(vm as never, singlesSale),
    "1 item • Charizard #123 • $50.00"
  );

  const rtyhSale = makeSale({ quantity: 3, type: "rtyh", price: 12 });
  assert.equal(
    SalesWindowDefinition.methods.saleListTitle.call({ ...vm, currentLotType: "bulk" } as never, rtyhSale),
    "3 random hit @ $12.00"
  );

  const unlinkedSingles = makeSale({ quantity: 3, price: 12, singlesPurchaseEntryId: null });
  assert.equal(SalesWindowDefinition.methods.saleListTitle.call(vm as never, unlinkedSingles), "3 items • $12.00");
});

test("SalesWindow render count helpers mutate expected values", () => {
  const vm = {
    salesHistoryRenderCount: 5
  };
  SalesWindowDefinition.methods.resetSalesHistoryRenderCount.call(vm as never);
  assert.equal(vm.salesHistoryRenderCount, 80);
  SalesWindowDefinition.methods.loadMoreSalesHistory.call(vm as never);
  assert.equal(vm.salesHistoryRenderCount, 160);
});

test("SalesWindow forecast visibility shows one scenario on mobile and all on desktop", () => {
  const scenarios = [
    { id: "item" },
    { id: "box" },
    { id: "rtyh" }
  ];
  const mobileVm = {
    liveForecastScenarios: scenarios,
    liveForecastScenarioIndex: 1,
    $vuetify: { display: { smAndDown: true } }
  };
  const desktopVm = {
    liveForecastScenarios: scenarios,
    liveForecastScenarioIndex: 1,
    $vuetify: { display: { smAndDown: false } }
  };

  const mobileVisible = SalesWindowDefinition.computed.visibleLiveForecastScenarios.call(mobileVm as never);
  const desktopVisible = SalesWindowDefinition.computed.visibleLiveForecastScenarios.call(desktopVm as never);

  assert.equal(mobileVisible.length, 1);
  assert.equal(String(mobileVisible[0]?.id), "box");
  assert.equal(desktopVisible.length, 3);
  assert.equal(SalesWindowDefinition.computed.hasMultipleLiveForecastScenarios.call(mobileVm as never), true);
  assert.equal(SalesWindowDefinition.computed.activeLiveForecastPosition.call(mobileVm as never), 2);
});

test("SalesWindow forecast carousel cycles index with wrap-around", () => {
  const vm = {
    liveForecastScenarios: [{ id: "item" }, { id: "box" }, { id: "rtyh" }],
    liveForecastScenarioIndex: 0
  };

  SalesWindowDefinition.methods.cycleLiveForecastScenario.call(vm as never, -1);
  assert.equal(vm.liveForecastScenarioIndex, 2);
  SalesWindowDefinition.methods.cycleLiveForecastScenario.call(vm as never, 1);
  assert.equal(vm.liveForecastScenarioIndex, 0);
});
