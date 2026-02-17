import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBoxPriceCostCad,
  calculateDefaultSellingPrices,
  calculateNetFromGross,
  calculatePriceForUnits,
  calculateProfitForListing,
  calculatePortfolioTotals,
  calculatePresetPerformanceSummary,
  calculateSalesProgress,
  calculateSalesStatus,
  calculateSoldPacksCount,
  calculateSparklineData,
  calculateSparklineGradient,
  calculateTotalCaseCost,
  calculateTotalPacks,
  calculateTotalRevenue
} from "../src/domain/calculations.ts";
import { appComputed } from "../src/app-core/computed.ts";
import { configMethods } from "../src/app-core/methods/config.ts";
import { salesMethods } from "../src/app-core/methods/sales.ts";
import type { Preset, Sale } from "../src/types/app.ts";

test("calculateBoxPriceCostCad handles CAD and USD", () => {
  assert.equal(calculateBoxPriceCostCad(100, "CAD", "CAD", 1.4, 1.4), 100);
  assert.equal(calculateBoxPriceCostCad(100, "USD", "CAD", 1.4, 1.4), 140);
  assert.equal(calculateBoxPriceCostCad(100, "USD", "USD", 1.4, 1.4), 100);
  assert.equal(calculateBoxPriceCostCad(140, "CAD", "USD", 1.4, 1.4), 100);
});

test("calculateTotalCaseCost applies purchase tax and USD customs", () => {
  const cadCost = calculateTotalCaseCost({
    boxesPurchased: 10,
    pricePerBoxCad: 100,
    purchaseShippingCad: 25,
    purchaseTaxPercent: 15,
    includeTax: true,
    currency: "CAD"
  });
  assert.equal(cadCost, 1175);

  const usdCost = calculateTotalCaseCost({
    boxesPurchased: 10,
    pricePerBoxCad: 100,
    purchaseShippingCad: 25,
    purchaseTaxPercent: 15,
    includeTax: true,
    currency: "USD"
  });
  assert.equal(usdCost, 1232.5);
});

test("calculateNetFromGross matches expected fee formula", () => {
  // Example:
  // gross = 84.15, buyer shipping = 8.63, buyer tax = 12.06
  // buyer tax rate in this order = 12.06 / 84.15
  const gross = 84.15;
  const buyerShipping = 8.63;
  const buyerTaxPercent = (12.06 / 84.15) * 100;
  const expectedNet = 74.08;
  const net = calculateNetFromGross(gross, buyerTaxPercent, buyerShipping, 1);
  assert.ok(Math.abs(net - expectedNet) < 0.02);
});

test("calculateNetFromGross applies 8% commission on full sale price", () => {
  const gross = 2000;
  const sellingTaxPercent = 15;
  const orderTotal = gross * 1.15;

  const expectedCommission = gross * 0.08;
  const expectedProcessing = orderTotal * 0.029;
  const expectedFixed = 0.3;
  const expectedNet = gross - expectedCommission - expectedProcessing - expectedFixed;

  const net = calculateNetFromGross(gross, sellingTaxPercent, 0, 1);
  assert.ok(Math.abs(net - expectedNet) < 0.000001);
});

test("calculateNetFromGross uses $0.30 per order (order count aware)", () => {
  const gross = 120;
  const taxPercent = 15;
  const expectedCommission = gross * 0.08;
  const expectedProcessing = (gross * 1.15) * 0.029;
  const expectedNet = gross - expectedCommission - expectedProcessing - 0.3;

  const netSingleOrder = calculateNetFromGross(gross, taxPercent, 0, 1);
  const netMultiOrder = calculateNetFromGross(gross, taxPercent, 0, 10);

  assert.ok(Math.abs(netSingleOrder - expectedNet) < 0.000001);
  assert.ok(netMultiOrder < netSingleOrder);
});

test("calculatePriceForUnits and calculateDefaultSellingPrices are consistent", () => {
  const totalCaseCost = 1000;
  const targetProfitPercent = 15;
  const totalPacks = 160;
  const boxesPurchased = 10;
  const sellingTaxPercent = 15;
  const requiredNetRevenue = totalCaseCost + (totalCaseCost * targetProfitPercent) / 100;

  const byUnitsPack = calculatePriceForUnits(totalPacks, requiredNetRevenue, sellingTaxPercent, 0);
  const byUnitsBox = calculatePriceForUnits(boxesPurchased, requiredNetRevenue, sellingTaxPercent, 0);

  const defaults = calculateDefaultSellingPrices({
    totalCaseCost,
    targetProfitPercent,
    boxesPurchased,
    totalPacks,
    sellingTaxPercent,
    sellingShippingPerOrder: 0
  });

  assert.equal(defaults.packPrice, byUnitsPack);
  assert.equal(defaults.boxPriceSell, byUnitsBox);
  assert.ok(defaults.spotPrice > 0);
});

test("calculateProfitForListing returns net minus case cost", () => {
  const totalCaseCost = 1000;
  const profit = calculateProfitForListing(100, 15, totalCaseCost, 15, 0);
  const expected = calculateNetFromGross(1500, 15, 0, 100) - totalCaseCost;
  assert.equal(profit, expected);
});

test("sales aggregates and status are calculated correctly", () => {
  const sales: Sale[] = [
    { id: 1, type: "pack", quantity: 2, packsCount: 2, price: 10, buyerShipping: 0, date: "2026-01-01" },
    { id: 2, type: "box", quantity: 1, packsCount: 16, price: 100, buyerShipping: 0, date: "2026-01-02" }
  ];

  assert.equal(calculateTotalPacks(2, 16, 16), 32);
  assert.equal(calculateSoldPacksCount(sales), 18);
  assert.equal(calculateSalesProgress(18, 32), 56.25);

  const revenue = calculateTotalRevenue(sales, 15);
  assert.ok(revenue > 0);

  const status = calculateSalesStatus(revenue, 10, 56.25);
  assert.equal(status.title, "Break-Even Reached");
});

test("sparkline helpers return normalized series and valid gradient", () => {
  const sales: Sale[] = [
    { id: 1, type: "pack", quantity: 1, packsCount: 1, price: 8, buyerShipping: 0, date: "2026-01-02" },
    { id: 2, type: "pack", quantity: 1, packsCount: 1, price: 9, buyerShipping: 0, date: "2026-01-03" }
  ];

  const data = calculateSparklineData(sales, 100, 15);
  assert.ok(data.length >= 3);
  assert.ok(data.every((n) => n >= 0));

  const gradient = calculateSparklineGradient(sales, 100, 15);
  assert.equal(gradient.length, 2);
});

test("preset and portfolio summaries aggregate correctly", () => {
  const presetA: Preset = {
    id: 1,
    name: "Preset A",
    boxPriceCost: 100,
    boxesPurchased: 1,
    packsPerBox: 10,
    costInputMode: "perBox",
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    purchaseDate: "2026-02-01",
    purchaseShippingCost: 0,
    purchaseTaxPercent: 0,
    sellingTaxPercent: 15,
    sellingShippingPerOrder: 0,
    includeTax: false,
    spotPrice: 10,
    boxPriceSell: 100,
    packPrice: 10,
    targetProfitPercent: 15
  };

  const presetB: Preset = {
    ...presetA,
    id: 2,
    name: "Preset B",
    boxPriceCost: 80
  };

  const salesA: Sale[] = [
    { id: 1, type: "pack", quantity: 2, packsCount: 2, price: 10, buyerShipping: 0, date: "2026-02-10" }
  ];
  const salesB: Sale[] = [
    { id: 2, type: "box", quantity: 1, packsCount: 10, price: 120, buyerShipping: 0, date: "2026-02-11" }
  ];

  const rowA = calculatePresetPerformanceSummary(presetA, salesA, 1.4);
  const rowB = calculatePresetPerformanceSummary(presetB, salesB, 1.4);
  const totals = calculatePortfolioTotals([rowA, rowB]);

  assert.equal(rowA.presetName, "Preset A");
  assert.equal(rowA.salesCount, 1);
  assert.equal(rowA.lastSaleDate, "2026-02-10");
  assert.equal(rowB.presetName, "Preset B");
  assert.equal(rowB.salesCount, 1);

  assert.equal(totals.presetCount, 2);
  assert.equal(totals.totalSalesCount, 2);
  assert.equal(totals.totalRevenue, rowA.totalRevenue + rowB.totalRevenue);
  assert.equal(totals.totalCost, rowA.totalCost + rowB.totalCost);
  assert.equal(totals.totalProfit, rowA.totalProfit + rowB.totalProfit);
});

test("preset performance summary handles empty sales with conversion, tax, customs, and shipping", () => {
  const preset: Preset = {
    id: 3,
    name: "USD Case",
    boxPriceCost: 100,
    boxesPurchased: 2,
    packsPerBox: 12,
    costInputMode: "perBox",
    currency: "USD",
    sellingCurrency: "CAD",
    exchangeRate: 1.5,
    purchaseDate: "2026-02-01",
    purchaseShippingCost: 20,
    purchaseTaxPercent: 10,
    sellingTaxPercent: 15,
    sellingShippingPerOrder: 0,
    includeTax: true,
    spotPrice: 25,
    boxPriceSell: 100,
    packPrice: 8,
    targetProfitPercent: 15
  };

  const summary = calculatePresetPerformanceSummary(preset, [], 1.4);

  assert.equal(summary.salesCount, 0);
  assert.equal(summary.totalRevenue, 0);
  assert.equal(summary.totalCost, 366.5);
  assert.equal(summary.totalProfit, -366.5);
  assert.equal(summary.marginPercent, null);
  assert.equal(summary.soldPacks, 0);
  assert.equal(summary.totalPacks, 24);
  assert.equal(summary.lastSaleDate, null);
});

test("preset performance summary uses latest sale date and shipping-aware revenue", () => {
  const preset: Preset = {
    id: 4,
    name: "Date + Shipping",
    boxPriceCost: 80,
    boxesPurchased: 1,
    packsPerBox: 16,
    costInputMode: "perBox",
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    purchaseDate: "2026-02-01",
    purchaseShippingCost: 0,
    purchaseTaxPercent: 0,
    sellingTaxPercent: 15,
    sellingShippingPerOrder: 0,
    includeTax: false,
    spotPrice: 25,
    boxPriceSell: 100,
    packPrice: 8,
    targetProfitPercent: 15
  };

  const sales: Sale[] = [
    { id: 10, type: "pack", quantity: 1, packsCount: 1, price: 10, buyerShipping: 5, date: "2026-01-10" },
    { id: 11, type: "pack", quantity: 2, packsCount: 2, price: 9, buyerShipping: 0, date: "2026-01-12" },
    { id: 12, type: "box", quantity: 1, packsCount: 16, price: 120, buyerShipping: 3, date: "2026-01-11" }
  ];

  const expectedRevenue = sales.reduce((sum, sale) => {
    const gross = sale.quantity * sale.price;
    return sum + calculateNetFromGross(gross, preset.sellingTaxPercent, sale.buyerShipping ?? 0, 1);
  }, 0);

  const summary = calculatePresetPerformanceSummary(preset, sales, 1.4);

  assert.equal(summary.lastSaleDate, "2026-01-12");
  assert.equal(summary.totalRevenue, expectedRevenue);
  assert.equal(summary.salesCount, 3);
  assert.equal(summary.soldPacks, 19);
});

test("portfolio totals handle empty rows and only count strictly positive presets as profitable", () => {
  const emptyTotals = calculatePortfolioTotals([]);
  assert.deepEqual(emptyTotals, {
    presetCount: 0,
    profitablePresetCount: 0,
    totalSalesCount: 0,
    totalRevenue: 0,
    totalCost: 0,
    totalProfit: 0
  });

  const totals = calculatePortfolioTotals([
    {
      presetId: 1,
      presetName: "Positive",
      salesCount: 2,
      totalRevenue: 200,
      totalCost: 150,
      totalProfit: 50,
      marginPercent: 25,
      soldPacks: 10,
      totalPacks: 16,
      lastSaleDate: "2026-01-01"
    },
    {
      presetId: 2,
      presetName: "Break-even",
      salesCount: 1,
      totalRevenue: 100,
      totalCost: 100,
      totalProfit: 0,
      marginPercent: 0,
      soldPacks: 5,
      totalPacks: 16,
      lastSaleDate: "2026-01-02"
    },
    {
      presetId: 3,
      presetName: "Negative",
      salesCount: 3,
      totalRevenue: 90,
      totalCost: 120,
      totalProfit: -30,
      marginPercent: -33.3333,
      soldPacks: 7,
      totalPacks: 16,
      lastSaleDate: "2026-01-03"
    }
  ]);

  assert.equal(totals.presetCount, 3);
  assert.equal(totals.profitablePresetCount, 1);
  assert.equal(totals.totalSalesCount, 6);
  assert.equal(totals.totalRevenue, 390);
  assert.equal(totals.totalCost, 370);
  assert.equal(totals.totalProfit, 20);
});

test("canUsePaidActions requires preset + pro access", () => {
  const blockedNoPreset = appComputed.canUsePaidActions.call({
    hasPresetSelected: false,
    hasProAccess: true
  } as unknown as Parameters<typeof appComputed.canUsePaidActions>[0]);
  assert.equal(blockedNoPreset, false);

  const blockedNoPro = appComputed.canUsePaidActions.call({
    hasPresetSelected: true,
    hasProAccess: false
  } as unknown as Parameters<typeof appComputed.canUsePaidActions>[0]);
  assert.equal(blockedNoPro, false);

  const allowed = appComputed.canUsePaidActions.call({
    hasPresetSelected: true,
    hasProAccess: true
  } as unknown as Parameters<typeof appComputed.canUsePaidActions>[0]);
  assert.equal(allowed, true);
});

test("calculateOptimalPrices is blocked when paywall is locked", () => {
  let notifiedMessage = "";
  let recalculated = false;

  configMethods.calculateOptimalPrices.call({
    canUsePaidActions: false,
    notify(message: string) {
      notifiedMessage = message;
    },
    recalculateDefaultPrices() {
      recalculated = true;
    }
  } as unknown as Parameters<typeof configMethods.calculateOptimalPrices>[0]);

  assert.equal(recalculated, false);
  assert.equal(notifiedMessage, "Pro access required to apply auto-calculated prices");
});

test("calculateOptimalPrices calls recalculate when paywall is unlocked", () => {
  let closeModalValue: boolean | null = null;

  configMethods.calculateOptimalPrices.call({
    canUsePaidActions: true,
    notify() {
      // noop
    },
    recalculateDefaultPrices(opts?: { closeModal?: boolean }) {
      closeModalValue = opts?.closeModal ?? null;
    }
  } as unknown as Parameters<typeof configMethods.calculateOptimalPrices>[0]);

  assert.equal(closeModalValue, true);
});

test("saveSale is blocked when paywall is locked", () => {
  let notified = "";

  salesMethods.saveSale.call({
    canUsePaidActions: false,
    notify(message: string) {
      notified = message;
    }
  } as unknown as Parameters<typeof salesMethods.saveSale>[0]);

  assert.equal(notified, "Pro access required to add or update sales");
});

test("saveSale computes packsCount for pack/box/rtyh and stores buyerShipping", () => {
  const scenarios = [
    {
      draft: { type: "pack", quantity: 3, packsCount: null, expectedPacks: 3 },
      packsPerBox: 16
    },
    {
      draft: { type: "box", quantity: 2, packsCount: null, expectedPacks: 32 },
      packsPerBox: 16
    },
    {
      draft: { type: "rtyh", quantity: 1, packsCount: 9, expectedPacks: 9 },
      packsPerBox: 16
    }
  ] as const;

  for (const scenario of scenarios) {
    let cancelCalled = false;
    const context = {
      canUsePaidActions: true,
      packsPerBox: scenario.packsPerBox,
      editingSale: null,
      sales: [] as Sale[],
      newSale: {
        type: scenario.draft.type,
        quantity: scenario.draft.quantity,
        packsCount: scenario.draft.packsCount,
        price: 25,
        buyerShipping: 5,
        date: "2026-02-13"
      },
      notify() {
        // noop
      },
      cancelSale() {
        cancelCalled = true;
      }
    } as unknown as Parameters<typeof salesMethods.saveSale>[0];

    salesMethods.saveSale.call(context);

    assert.equal(context.sales.length, 1);
    assert.equal(context.sales[0]?.packsCount, scenario.draft.expectedPacks);
    assert.equal(context.sales[0]?.buyerShipping, 5);
    assert.equal(cancelCalled, true);
  }
});

test("saveSale validates negative buyer shipping", () => {
  let notifiedMessage = "";
  const sales: Sale[] = [];

  salesMethods.saveSale.call({
    canUsePaidActions: true,
    packsPerBox: 16,
    editingSale: null,
    sales,
    newSale: {
      type: "pack",
      quantity: 1,
      packsCount: null,
      price: 10,
      buyerShipping: -1,
      date: "2026-02-13"
    },
    notify(message: string) {
      notifiedMessage = message;
    },
    cancelSale() {
      // noop
    }
  } as unknown as Parameters<typeof salesMethods.saveSale>[0]);

  assert.equal(sales.length, 0);
  assert.equal(notifiedMessage, "Please enter a valid buyer shipping amount (0 or greater)");
});

test("saveSale updates existing sale in edit mode", () => {
  const originalSale: Sale = {
    id: 1001,
    type: "pack",
    quantity: 1,
    packsCount: 1,
    price: 7,
    buyerShipping: 2,
    date: "2026-02-10"
  };
  const sales: Sale[] = [originalSale];

  salesMethods.saveSale.call({
    canUsePaidActions: true,
    packsPerBox: 16,
    editingSale: originalSale,
    sales,
    newSale: {
      type: "pack",
      quantity: 4,
      packsCount: null,
      price: 8,
      buyerShipping: 3,
      date: "2026-02-13"
    },
    notify() {
      // noop
    },
    cancelSale() {
      // noop
    }
  } as unknown as Parameters<typeof salesMethods.saveSale>[0]);

  assert.equal(sales.length, 1);
  assert.equal(sales[0]?.id, 1001);
  assert.equal(sales[0]?.quantity, 4);
  assert.equal(sales[0]?.buyerShipping, 3);
});

test("openAddSaleModal defaults sale price from live values with config fallback", () => {
  const context = {
    showAddSaleModal: false,
    editingSale: {
      id: 99,
      type: "pack",
      quantity: 1,
      packsCount: 1,
      price: 1,
      buyerShipping: 0,
      date: "2026-01-01"
    } as Sale,
    livePackPrice: 11,
    packPrice: 7,
    liveBoxPriceSell: 120,
    boxPriceSell: 100,
    liveSpotPrice: Number.NaN,
    spotPrice: 25,
    sellingShippingPerOrder: 4,
    newSale: {
      type: "pack",
      quantity: 1,
      packsCount: null,
      price: 0,
      buyerShipping: 0,
      date: "2026-01-01"
    }
  } as unknown as Parameters<typeof salesMethods.openAddSaleModal>[0];

  salesMethods.openAddSaleModal.call(context, "pack");
  assert.equal(context.showAddSaleModal, true);
  assert.equal(context.editingSale, null);
  assert.equal(context.newSale.type, "pack");
  assert.equal(context.newSale.price, 11);
  assert.equal(context.newSale.buyerShipping, 4);

  salesMethods.openAddSaleModal.call(context, "rtyh");
  assert.equal(context.newSale.type, "rtyh");
  assert.equal(context.newSale.price, 25);
});

test("onNewSaleTypeChange updates default price for new sales only", () => {
  const createContext = (editingSale: Sale | null) =>
    ({
      editingSale,
      livePackPrice: 12,
      packPrice: 8,
      liveBoxPriceSell: 115,
      boxPriceSell: 95,
      liveSpotPrice: 30,
      spotPrice: 20,
      newSale: {
        type: "pack",
        quantity: 1,
        packsCount: null,
        price: 12,
        buyerShipping: 0,
        date: "2026-02-13"
      }
    }) as unknown as Parameters<typeof salesMethods.onNewSaleTypeChange>[0];

  const createMode = createContext(null);
  salesMethods.onNewSaleTypeChange.call(createMode, "box");
  assert.equal(createMode.newSale.type, "box");
  assert.equal(createMode.newSale.price, 115);

  const editMode = createContext({
    id: 5,
    type: "box",
    quantity: 1,
    packsCount: 16,
    price: 88,
    buyerShipping: 0,
    date: "2026-02-13"
  });
  editMode.newSale.price = 88;
  salesMethods.onNewSaleTypeChange.call(editMode, "rtyh");
  assert.equal(editMode.newSale.type, "rtyh");
  assert.equal(editMode.newSale.price, 88);
});

test("required price computed values handle reached/empty/remaining cases", () => {
  const reachedTargetPack = appComputed.requiredPackPriceFromNow.call({
    remainingNetRevenueForTarget: 0,
    remainingPacksCount: 10,
    sellingTaxPercent: 15,
    sellingShippingPerOrder: 5
  } as unknown as Parameters<typeof appComputed.requiredPackPriceFromNow>[0]);
  assert.equal(reachedTargetPack, 0);

  const noInventoryPack = appComputed.requiredPackPriceFromNow.call({
    remainingNetRevenueForTarget: 100,
    remainingPacksCount: 0,
    sellingTaxPercent: 15,
    sellingShippingPerOrder: 5
  } as unknown as Parameters<typeof appComputed.requiredPackPriceFromNow>[0]);
  assert.equal(noInventoryPack, null);

  const noInventoryBox = appComputed.requiredBoxPriceFromNow.call({
    remainingNetRevenueForTarget: 100,
    remainingBoxesEquivalent: 0,
    sellingTaxPercent: 15,
    sellingShippingPerOrder: 5
  } as unknown as Parameters<typeof appComputed.requiredBoxPriceFromNow>[0]);
  assert.equal(noInventoryBox, null);

  const noInventorySpot = appComputed.requiredSpotPriceFromNow.call({
    remainingNetRevenueForTarget: 100,
    remainingSpotsEquivalent: 0,
    sellingTaxPercent: 15,
    sellingShippingPerOrder: 5
  } as unknown as Parameters<typeof appComputed.requiredSpotPriceFromNow>[0]);
  assert.equal(noInventorySpot, null);

  const remainingRevenue = 720;
  const remainingPacks = 48;
  const tax = 15;
  const ship = 4;
  const expectedPack = calculatePriceForUnits(remainingPacks, remainingRevenue, tax, ship);

  const computedPack = appComputed.requiredPackPriceFromNow.call({
    remainingNetRevenueForTarget: remainingRevenue,
    remainingPacksCount: remainingPacks,
    sellingTaxPercent: tax,
    sellingShippingPerOrder: ship
  } as unknown as Parameters<typeof appComputed.requiredPackPriceFromNow>[0]);

  assert.equal(computedPack, expectedPack);
});

test("allPresetPerformance uses in-memory sales for active preset before storage sync", () => {
  const activePreset: Preset = {
    id: 101,
    name: "Active",
    boxPriceCost: 100,
    boxesPurchased: 1,
    packsPerBox: 16,
    costInputMode: "perBox",
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    purchaseDate: "2026-02-01",
    purchaseShippingCost: 0,
    purchaseTaxPercent: 0,
    sellingTaxPercent: 15,
    sellingShippingPerOrder: 0,
    includeTax: false,
    spotPrice: 25,
    boxPriceSell: 100,
    packPrice: 8,
    targetProfitPercent: 15
  };

  const otherPreset: Preset = {
    ...activePreset,
    id: 202,
    name: "Other"
  };

  const activeInMemorySales: Sale[] = [
    { id: 1, type: "pack", quantity: 2, packsCount: 2, price: 10, buyerShipping: 0, date: "2026-02-10" }
  ];
  const otherStoredSales: Sale[] = [
    { id: 2, type: "pack", quantity: 1, packsCount: 1, price: 12, buyerShipping: 0, date: "2026-02-11" }
  ];

  const context = {
    presets: [activePreset, otherPreset],
    currentPresetId: activePreset.id,
    sales: activeInMemorySales,
    loadSalesForPresetId(presetId: number): Sale[] {
      if (presetId === activePreset.id) return [];
      if (presetId === otherPreset.id) return otherStoredSales;
      return [];
    }
  } as unknown as Parameters<typeof appComputed.allPresetPerformance>[0];

  const rows = appComputed.allPresetPerformance.call(context);
  const activeRow = rows.find((row) => row.presetId === activePreset.id);
  const otherRow = rows.find((row) => row.presetId === otherPreset.id);

  assert.equal(activeRow?.salesCount, 1);
  assert.equal(otherRow?.salesCount, 1);
});

test("portfolioSelectedPresetIds defaults to all presets when filter is empty", () => {
  const ids = appComputed.portfolioSelectedPresetIds.call({
    presets: [{ id: 11 }, { id: 22 }, { id: 33 }],
    portfolioPresetFilterIds: []
  } as unknown as Parameters<typeof appComputed.portfolioSelectedPresetIds>[0]);

  assert.deepEqual(ids, [11, 22, 33]);
});

test("allPresetPerformance applies portfolio preset filter", () => {
  const presetA: Preset = {
    id: 301,
    name: "A",
    boxPriceCost: 100,
    boxesPurchased: 1,
    packsPerBox: 16,
    costInputMode: "perBox",
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    purchaseDate: "2026-02-01",
    purchaseShippingCost: 0,
    purchaseTaxPercent: 0,
    sellingTaxPercent: 15,
    sellingShippingPerOrder: 0,
    includeTax: false,
    spotPrice: 25,
    boxPriceSell: 100,
    packPrice: 8,
    targetProfitPercent: 15
  };
  const presetB: Preset = { ...presetA, id: 302, name: "B" };

  const context = {
    presets: [presetA, presetB],
    portfolioSelectedPresetIds: [presetA.id],
    currentPresetId: presetA.id,
    sales: [],
    loadSalesForPresetId(): Sale[] {
      return [];
    }
  } as unknown as Parameters<typeof appComputed.allPresetPerformance>[0];

  const rows = appComputed.allPresetPerformance.call(context);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.presetId, presetA.id);
});
