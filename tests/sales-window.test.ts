import assert from "node:assert/strict";
import { test } from "vitest";
import type { Sale, SinglesPurchaseEntry } from "../src/types/app.ts";
import { SalesWindowDefinition } from "../src/components/windows/SalesWindow.definition.ts";

function makeSale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: 1,
    type: "pack",
    quantity: 1,
    packsCount: 1,
    price: 10,
    date: "2026-03-05",
    ...overrides
  };
}

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

