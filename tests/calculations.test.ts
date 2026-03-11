import assert from "node:assert/strict";
import { test } from "vitest";
import {
  calculateBoxPriceCostCad,
  calculateDefaultSellingPrices,
  calculateSinglesPurchaseTotals,
  calculateSinglesPurchaseTotalCostInSellingCurrency,
  calculateSinglesLineProfitPreview,
  calculateSinglesSaleProfitPreview,
  createForecastProjectionFromUnitPrice,
  createForecastScenarioFromProjection,
  createForecastScenarioFromUnitPrice,
  calculateNetFromGross,
  calculatePortfolioSellThroughTimeline,
  calculatePriceForUnits,
  calculateProfitForListing,
  calculateSaleProfit,
  calculatePortfolioTotals,
  calculateLotPerformanceSummary,
  calculateSalesProgress,
  calculateSalesStatus,
  calculateSoldPacksCount,
  calculateTotalSpots,
  calculateSparklineData,
  calculateSparklineGradient,
  calculateTotalCaseCost,
  calculateTotalPacks,
  calculateTotalRevenue
} from "../src/domain/calculations.ts";
import { appComputed } from "../src/app-core/computed.ts";
import { appLifecycle } from "../src/app-core/lifecycle.ts";
import { appWatch } from "../src/app-core/watch.ts";
import { configMethods } from "../src/app-core/methods/config.ts";
import { salesMethods } from "../src/app-core/methods/sales.ts";
import { uiBaseMethods } from "../src/app-core/methods/ui/base.ts";
import { getLegacySalesStorageKey } from "../src/app-core/storageKeys.ts";
import type { Lot, Sale } from "../src/types/app.ts";

type MockStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
};

function getTodayLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function withMockedLocalStorage(run: (storage: MockStorage, data: Map<string, string>) => void): void {
  const original = (globalThis as { localStorage?: MockStorage }).localStorage;
  const data = new Map<string, string>();

  const storage: MockStorage = {
    getItem(key: string): string | null {
      return data.has(key) ? data.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      data.set(key, String(value));
    },
    removeItem(key: string): void {
      data.delete(key);
    },
    clear(): void {
      data.clear();
    }
  };

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage
  });

  try {
    run(storage, data);
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: original
    });
  }
}

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

test("calculateSinglesPurchaseTotals aggregates quantity, cost, and market value", () => {
  const totals = calculateSinglesPurchaseTotals([
    { id: 1, item: "Card A", cost: 12, quantity: 2, marketValue: 18 },
    { id: 2, item: "Card B", cost: 4.5, quantity: 3, marketValue: 6.25 }
  ]);

  assert.equal(totals.totalQuantity, 5);
  assert.equal(totals.totalCost, 37.5);
  assert.equal(totals.totalMarketValue, 54.75);
});

test("calculateSinglesPurchaseTotalCostInSellingCurrency converts mixed-currency singles rows", () => {
  const totalCost = calculateSinglesPurchaseTotalCostInSellingCurrency({
    entries: [
      { id: 1, item: "Card A", cost: 10, currency: "USD", quantity: 2, marketValue: 0 },
      { id: 2, item: "Card B", cost: 4, currency: "CAD", quantity: 3, marketValue: 0 },
      { id: 3, item: "Card C", cost: -5, currency: "CAD", quantity: 2, marketValue: 0 }
    ],
    purchaseCurrency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.5,
    defaultExchangeRate: 1.4
  });

  assert.equal(totalCost, 42);
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
  const totalSpots = 50;
  const sellingTaxPercent = 15;
  const requiredNetRevenue = totalCaseCost + (totalCaseCost * targetProfitPercent) / 100;

  const byUnitsPack = calculatePriceForUnits(totalPacks, requiredNetRevenue, sellingTaxPercent, 0);
  const byUnitsBox = calculatePriceForUnits(boxesPurchased, requiredNetRevenue, sellingTaxPercent, 0);

  const defaults = calculateDefaultSellingPrices({
    totalCaseCost,
    targetProfitPercent,
    boxesPurchased,
    totalSpots,
    totalPacks,
    sellingTaxPercent,
    sellingShippingPerOrder: 0
  });

  assert.equal(defaults.packPrice, byUnitsPack);
  assert.equal(defaults.boxPriceSell, byUnitsBox);
  assert.ok(defaults.spotPrice > 0);
});

test("calculateTotalSpots scales RTYH spots with boxes purchased", () => {
  assert.equal(calculateTotalSpots(16), 80);
  assert.equal(calculateTotalSpots(8), 40);
  assert.equal(calculateTotalSpots(4), 20);
  assert.equal(calculateTotalSpots(0), 0);
  assert.equal(calculateTotalSpots(10, 6), 60);
});

test("calculateDefaultSellingPrices uses provided totalSpots for RTYH price", () => {
  const base = {
    totalCaseCost: 1000,
    targetProfitPercent: 15,
    boxesPurchased: 10,
    totalPacks: 160,
    sellingTaxPercent: 15,
    sellingShippingPerOrder: 0
  };

  const fewerSpots = calculateDefaultSellingPrices({
    ...base,
    totalSpots: 50
  });
  const moreSpots = calculateDefaultSellingPrices({
    ...base,
    totalSpots: 80
  });

  assert.ok(fewerSpots.spotPrice > moreSpots.spotPrice);
});

test("calculateProfitForListing returns net minus case cost", () => {
  const totalCaseCost = 1000;
  const profit = calculateProfitForListing(100, 15, totalCaseCost, 15, 0);
  const expected = calculateNetFromGross(1500, 15, 0, 100) - totalCaseCost;
  assert.equal(profit, expected);
});

test("calculatePortfolioSellThroughTimeline keeps past sell-through based on inventory available at the time", () => {
  const timeline = calculatePortfolioSellThroughTimeline({
    lots: [
      {
        id: 1706745600000,
        purchaseDate: "2026-02-01"
      },
      {
        id: 1740787200000,
        purchaseDate: "2026-03-01"
      }
    ],
    allLotPerformance: [
      {
        lotId: 1706745600000,
        totalPacks: 10
      },
      {
        lotId: 1740787200000,
        totalPacks: 10
      }
    ],
    salesByLotId: new Map([
      [1706745600000, [{ date: "2026-02-10", packsCount: 2 }]],
      [1740787200000, []]
    ]),
    todayDate: "2026-03-10"
  });

  assert.deepEqual(
    timeline.map((point) => ({
      date: point.date,
      availableUnits: point.availableUnits,
      soldUnits: point.soldUnits,
      percentage: Number(point.percentage.toFixed(2))
    })),
    [
      { date: "2026-02-01", availableUnits: 10, soldUnits: 0, percentage: 0 },
      { date: "2026-02-10", availableUnits: 10, soldUnits: 2, percentage: 20 },
      { date: "2026-03-01", availableUnits: 20, soldUnits: 2, percentage: 10 }
    ]
  );
});

test("calculateSaleProfit allocates bulk lot cost per sold pack", () => {
  const profit = calculateSaleProfit({
    sale: {
      id: 1,
      type: "box",
      quantity: 1,
      packsCount: 16,
      price: 160,
      buyerShipping: 0,
      date: "2026-03-01"
    },
    lotType: "bulk",
    sellingTaxPercent: 15,
    totalCaseCost: 100,
    totalPacks: 20,
    purchaseCurrency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    singlesPurchases: []
  });

  const expectedNet = calculateNetFromGross(160, 15, 0, 1);
  assert.equal(profit, expectedNet - 80);
});

test("calculateSaleProfit uses converted cost basis for linked singles sales", () => {
  const profit = calculateSaleProfit({
    sale: {
      id: 2,
      type: "pack",
      quantity: 3,
      packsCount: 3,
      singlesPurchaseEntryId: 101,
      price: 30,
      buyerShipping: 0,
      date: "2026-03-01"
    },
    lotType: "singles",
    sellingTaxPercent: 15,
    totalCaseCost: 0,
    totalPacks: 0,
    purchaseCurrency: "USD",
    sellingCurrency: "CAD",
    exchangeRate: 1.5,
    singlesPurchases: [
      { id: 101, item: "Card A", cost: 10, currency: "USD", quantity: 5, marketValue: 12 }
    ]
  });

  const expectedNet = calculateNetFromGross(90, 15, 0, 1);
  assert.equal(profit, expectedNet - 45);
});

test("calculateSaleProfit sums multi-line singles basis and ignores unlinked lines", () => {
  const profit = calculateSaleProfit({
    sale: {
      id: 3,
      type: "pack",
      quantity: 3,
      packsCount: 3,
      price: 90,
      priceIsTotal: true,
      singlesItems: [
        { singlesPurchaseEntryId: 10, quantity: 2, price: 60 },
        { singlesPurchaseEntryId: 11, quantity: 1, price: 20 },
        { quantity: 1, price: 10 }
      ],
      buyerShipping: 0,
      date: "2026-03-01"
    },
    lotType: "singles",
    sellingTaxPercent: 15,
    totalCaseCost: 0,
    totalPacks: 0,
    purchaseCurrency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    singlesPurchases: [
      { id: 10, item: "Card A", cost: 15, currency: "CAD", quantity: 5, marketValue: 12 },
      { id: 11, item: "Card B", cost: 20, currency: "CAD", quantity: 5, marketValue: 12 }
    ]
  });

  const expectedNet = calculateNetFromGross(90, 15, 0, 1);
  assert.equal(profit, expectedNet - 50);
});

test("calculateSinglesLineProfitPreview allocates net revenue proportionally and prefers market basis", () => {
  const preview = calculateSinglesLineProfitPreview({
    line: { singlesPurchaseEntryId: 10, quantity: 2, price: 60 },
    grossRevenue: 80,
    netRevenue: 72,
    singlesPurchases: [
      { id: 10, item: "Card A", cost: 15, marketValue: 20, quantity: 3, currency: "CAD" }
    ],
    purchaseCurrency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4
  });

  assert.equal(preview?.value, 14);
  assert.equal(preview?.basisLabel, "Market");
  assert.equal(preview?.marketBasisValue, 40);
  assert.equal(preview?.costBasisValue, 0);
  assert.equal(preview?.unitValue, 7);
  assert.equal(preview?.percent, 35);
  assert.equal(preview?.sign, "+");
});

test("calculateSinglesLineProfitPreview falls back to converted cost basis and ignores blank draft rows", () => {
  const preview = calculateSinglesLineProfitPreview({
    line: { singlesPurchaseEntryId: 10, quantity: 1, price: 20 },
    grossRevenue: 20,
    netRevenue: 18,
    singlesPurchases: [
      { id: 10, item: "Card A", cost: 10, marketValue: 0, quantity: 3, currency: "USD" }
    ],
    purchaseCurrency: "USD",
    sellingCurrency: "CAD",
    exchangeRate: 1.5
  });

  const blank = calculateSinglesLineProfitPreview({
    line: { singlesPurchaseEntryId: null, quantity: 0, price: 0 },
    grossRevenue: 20,
    netRevenue: 18,
    singlesPurchases: [],
    purchaseCurrency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4
  });

  assert.equal(preview?.basisLabel, "Cost");
  assert.equal(preview?.basisValue, 15);
  assert.equal(preview?.value, 3);
  assert.equal(blank, null);
});

test("calculateSinglesSaleProfitPreview aggregates mixed basis previews", () => {
  const preview = calculateSinglesSaleProfitPreview([
    {
      value: 20,
      unitValue: 10,
      quantity: 2,
      percent: 20,
      sign: "+",
      colorClass: "text-success",
      basisLabel: "Market",
      basisValue: 100,
      marketBasisValue: 100,
      costBasisValue: 0
    },
    {
      value: -5,
      unitValue: -5,
      quantity: 1,
      percent: -50,
      sign: "-",
      colorClass: "text-error",
      basisLabel: "Cost",
      basisValue: 10,
      marketBasisValue: 0,
      costBasisValue: 10
    }
  ]);

  assert.equal(preview?.value, 15);
  assert.equal(preview?.quantity, 3);
  assert.equal(preview?.unitValue, 5);
  assert.equal(preview?.basisLabel, "Mixed");
  assert.equal(preview?.basisValue, 110);
  assert.equal(preview?.marketBasisValue, 100);
  assert.equal(preview?.costBasisValue, 10);
  assert.ok(Math.abs((preview?.percent ?? 0) - 13.6363636364) < 0.0001);
});

test("createForecastProjectionFromUnitPrice derives gross and net remaining from fee formula", () => {
  const projection = createForecastProjectionFromUnitPrice({
    units: 4,
    unitPrice: 7.5,
    sellingTaxPercent: 15,
    shippingPerOrder: 2
  });

  assert.equal(projection.gross, 30);
  assert.equal(projection.estimatedNetRemaining, calculateNetFromGross(30, 15, 2, 4));
});

test("createForecastScenarioFromUnitPrice and projection use the same scenario math", () => {
  const fromUnitPrice = createForecastScenarioFromUnitPrice({
    id: "item",
    label: "Item live price",
    unitLabel: "item",
    units: 10,
    unitPrice: 9,
    baseRevenue: 100,
    baseCost: 200,
    sellingTaxPercent: 15,
    shippingPerOrder: 0
  });

  const projection = createForecastProjectionFromUnitPrice({
    units: 10,
    unitPrice: 9,
    sellingTaxPercent: 15,
    shippingPerOrder: 0
  });
  const fromProjection = createForecastScenarioFromProjection({
    id: "item",
    label: "Item live price",
    unitLabel: "item",
    projection,
    baseRevenue: 100,
    baseCost: 200
  });

  assert.equal(fromUnitPrice.id, "item");
  assert.equal(fromUnitPrice.forecastRevenue, fromProjection?.forecastRevenue);
  assert.equal(fromUnitPrice.forecastProfit, fromProjection?.forecastProfit);
  assert.equal(fromUnitPrice.forecastMarginPercent, fromProjection?.forecastMarginPercent);
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
  const presetA: Lot = {
    id: 1,
    name: "Lot A",
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

  const presetB: Lot = {
    ...presetA,
    id: 2,
    name: "Lot B",
    boxPriceCost: 80
  };

  const salesA: Sale[] = [
    { id: 1, type: "pack", quantity: 2, packsCount: 2, price: 10, buyerShipping: 0, date: "2026-02-10" }
  ];
  const salesB: Sale[] = [
    { id: 2, type: "box", quantity: 1, packsCount: 10, price: 120, buyerShipping: 0, date: "2026-02-11" }
  ];

  const rowA = calculateLotPerformanceSummary(presetA, salesA, 1.4);
  const rowB = calculateLotPerformanceSummary(presetB, salesB, 1.4);
  const totals = calculatePortfolioTotals([rowA, rowB]);

  assert.equal(rowA.lotName, "Lot A");
  assert.equal(rowA.salesCount, 1);
  assert.equal(rowA.lastSaleDate, "2026-02-10");
  assert.equal(rowB.lotName, "Lot B");
  assert.equal(rowB.salesCount, 1);

  assert.equal(totals.lotCount, 2);
  assert.equal(totals.totalSalesCount, 2);
  assert.equal(totals.totalRevenue, rowA.totalRevenue + rowB.totalRevenue);
  assert.equal(totals.totalCost, rowA.totalCost + rowB.totalCost);
  assert.equal(totals.totalProfit, rowA.totalProfit + rowB.totalProfit);
});

test("preset performance summary handles empty sales with conversion, tax, customs, and shipping", () => {
  const preset: Lot = {
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

  const summary = calculateLotPerformanceSummary(preset, [], 1.4);

  assert.equal(summary.salesCount, 0);
  assert.equal(summary.totalRevenue, 0);
  assert.equal(summary.totalCost, 376.5);
  assert.equal(summary.totalProfit, -376.5);
  assert.equal(summary.marginPercent, null);
  assert.equal(summary.soldPacks, 0);
  assert.equal(summary.totalPacks, 24);
  assert.equal(summary.lastSaleDate, null);
});

test("preset performance summary uses latest sale date and shipping-aware revenue", () => {
  const preset: Lot = {
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

  const summary = calculateLotPerformanceSummary(preset, sales, 1.4);

  assert.equal(summary.lastSaleDate, "2026-01-12");
  assert.equal(summary.totalRevenue, expectedRevenue);
  assert.equal(summary.salesCount, 3);
  assert.equal(summary.soldPacks, 19);
});

test("preset performance summary uses singles purchase grid as cost basis", () => {
  const preset: Lot = {
    id: 44,
    name: "Singles Cost Basis",
    lotType: "singles",
    boxPriceCost: 0,
    boxesPurchased: 0,
    packsPerBox: 1,
    costInputMode: "total",
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    purchaseDate: "2026-02-01",
    purchaseShippingCost: 0,
    purchaseTaxPercent: 0,
    sellingTaxPercent: 15,
    sellingShippingPerOrder: 0,
    includeTax: false,
    spotPrice: 0,
    boxPriceSell: 0,
    packPrice: 0,
    targetProfitPercent: 15,
    singlesPurchases: [
      { id: 1, item: "Card A", cost: 10, quantity: 2, marketValue: 14 },
      { id: 2, item: "Card B", cost: 5, quantity: 1, marketValue: 7 }
    ]
  };

  const sales: Sale[] = [
    { id: 1, type: "pack", quantity: 2, packsCount: 2, price: 20, buyerShipping: 0, date: "2026-02-10" }
  ];

  const summary = calculateLotPerformanceSummary(preset, sales, 1.4);
  assert.equal(summary.totalCost, 25);
  assert.equal(summary.totalPacks, 3);
  assert.equal(summary.soldPacks, 2);
});

test("preset performance summary converts singles cost basis from purchase to selling currency", () => {
  const preset: Lot = {
    id: 46,
    name: "Singles FX Cost Basis",
    lotType: "singles",
    boxPriceCost: 0,
    boxesPurchased: 0,
    packsPerBox: 1,
    costInputMode: "total",
    currency: "USD",
    sellingCurrency: "CAD",
    exchangeRate: 1.5,
    purchaseDate: "2026-02-01",
    purchaseShippingCost: 0,
    purchaseTaxPercent: 0,
    sellingTaxPercent: 15,
    sellingShippingPerOrder: 0,
    includeTax: false,
    spotPrice: 0,
    boxPriceSell: 0,
    packPrice: 0,
    targetProfitPercent: 15,
    singlesPurchases: [
      { id: 1, item: "Card A", cost: 10, quantity: 2, marketValue: 14 }
    ]
  };

  const summary = calculateLotPerformanceSummary(preset, [], 1.4);
  assert.equal(summary.totalCost, 30);
  assert.equal(summary.totalPacks, 2);
});

test("preset performance summary converts singles cost basis per purchase currency", () => {
  const preset: Lot = {
    id: 47,
    name: "Singles Mixed FX",
    lotType: "singles",
    boxPriceCost: 0,
    boxesPurchased: 0,
    packsPerBox: 1,
    costInputMode: "total",
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.5,
    purchaseDate: "2026-02-01",
    purchaseShippingCost: 0,
    purchaseTaxPercent: 0,
    sellingTaxPercent: 15,
    sellingShippingPerOrder: 0,
    includeTax: false,
    spotPrice: 0,
    boxPriceSell: 0,
    packPrice: 0,
    targetProfitPercent: 15,
    singlesPurchases: [
      { id: 1, item: "Card A", cost: 10, currency: "USD", quantity: 2, marketValue: 14 },
      { id: 2, item: "Card B", cost: 4, currency: "CAD", quantity: 1, marketValue: 7 }
    ]
  };

  const summary = calculateLotPerformanceSummary(preset, [], 1.4);
  assert.equal(summary.totalCost, 34);
  assert.equal(summary.totalPacks, 3);
});

test("preset performance summary treats zero-cost singles rows as no cost-basis packs", () => {
  const preset: Lot = {
    id: 45,
    name: "Singles Zero Cost",
    lotType: "singles",
    boxPriceCost: 0,
    boxesPurchased: 0,
    packsPerBox: 1,
    costInputMode: "total",
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    purchaseDate: "2026-02-01",
    purchaseShippingCost: 0,
    purchaseTaxPercent: 0,
    sellingTaxPercent: 15,
    sellingShippingPerOrder: 0,
    includeTax: false,
    spotPrice: 0,
    boxPriceSell: 0,
    packPrice: 0,
    targetProfitPercent: 15,
    singlesPurchases: [
      { id: 1, item: "Card A", cost: 0, quantity: 2, marketValue: 14 },
      { id: 2, item: "Card B", cost: 0, quantity: 1, marketValue: 7 }
    ]
  };

  const summary = calculateLotPerformanceSummary(preset, [], 1.4);
  assert.equal(summary.totalCost, 0);
  assert.equal(summary.totalPacks, 0);
});

test("portfolio totals handle empty rows and only count strictly positive lots as profitable", () => {
  const emptyTotals = calculatePortfolioTotals([]);
  assert.deepEqual(emptyTotals, {
    lotCount: 0,
    profitableLotCount: 0,
    totalSalesCount: 0,
    totalRevenue: 0,
    totalCost: 0,
    totalProfit: 0
  });

  const totals = calculatePortfolioTotals([
    {
      lotId: 1,
      lotName: "Positive",
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
      lotId: 2,
      lotName: "Break-even",
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
      lotId: 3,
      lotName: "Negative",
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

  assert.equal(totals.lotCount, 3);
  assert.equal(totals.profitableLotCount, 1);
  assert.equal(totals.totalSalesCount, 6);
  assert.equal(totals.totalRevenue, 390);
  assert.equal(totals.totalCost, 370);
  assert.equal(totals.totalProfit, 20);
});

test("canUsePaidActions requires preset + pro access", () => {
  const blockedNoPreset = appComputed.canUsePaidActions.call({
    hasLotSelected: false,
    hasProAccess: true
  } as unknown as Parameters<typeof appComputed.canUsePaidActions>[0]);
  assert.equal(blockedNoPreset, false);

  const blockedNoPro = appComputed.canUsePaidActions.call({
    hasLotSelected: true,
    hasProAccess: false
  } as unknown as Parameters<typeof appComputed.canUsePaidActions>[0]);
  assert.equal(blockedNoPro, false);

  const allowed = appComputed.canUsePaidActions.call({
    hasLotSelected: true,
    hasProAccess: true
  } as unknown as Parameters<typeof appComputed.canUsePaidActions>[0]);
  assert.equal(allowed, true);
});

test("computed totalCaseCost uses singles purchase cost and 100% fallback when grid is empty", () => {
  const withRows = appComputed.totalCaseCost.call({
    currentLotType: "singles",
    singlesPurchaseTotalQuantity: 4,
    singlesPurchaseTotalCost: 42
  } as unknown as Parameters<typeof appComputed.totalCaseCost>[0]);
  assert.equal(withRows, 42);

  const emptyRows = appComputed.totalCaseCost.call({
    currentLotType: "singles",
    singlesPurchaseTotalQuantity: 0,
    singlesPurchaseTotalCost: 99
  } as unknown as Parameters<typeof appComputed.totalCaseCost>[0]);
  assert.equal(emptyRows, 0);
});

test("computed singlesPurchaseTotalCost converts purchase currency to selling currency", () => {
  const converted = appComputed.singlesPurchaseTotalCost.call({
    singlesPurchases: [{ id: 1, item: "Card A", cost: 10, quantity: 2, marketValue: 0 }],
    currency: "USD",
    sellingCurrency: "CAD",
    exchangeRate: 1.5
  } as unknown as Parameters<typeof appComputed.singlesPurchaseTotalCost>[0]);
  assert.equal(converted, 30);
});

test("computed singlesPurchaseTotalCost converts each row from its own currency", () => {
  const converted = appComputed.singlesPurchaseTotalCost.call({
    singlesPurchases: [
      { id: 1, item: "Card A", cost: 10, currency: "USD", quantity: 2, marketValue: 0 },
      { id: 2, item: "Card B", cost: 4, currency: "CAD", quantity: 1, marketValue: 0 }
    ],
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.5
  } as unknown as Parameters<typeof appComputed.singlesPurchaseTotalCost>[0]);
  assert.equal(converted, 34);
});

test("computed totalPacks uses singles quantity even when total cost is zero", () => {
  const withCost = appComputed.totalPacks.call({
    currentLotType: "singles",
    singlesPurchases: [{ id: 1 }],
    singlesPurchaseTotalQuantity: 4,
    singlesPurchaseTotalCost: 42,
    singlesSoldCountByPurchaseId: {},
    sales: []
  } as unknown as Parameters<typeof appComputed.totalPacks>[0]);
  assert.equal(withCost, 4);

  const zeroCost = appComputed.totalPacks.call({
    currentLotType: "singles",
    singlesPurchases: [{ id: 1 }],
    singlesPurchaseTotalQuantity: 4,
    singlesPurchaseTotalCost: 0,
    singlesSoldCountByPurchaseId: {},
    sales: []
  } as unknown as Parameters<typeof appComputed.totalPacks>[0]);
  assert.equal(zeroCost, 4);
});

test("computed totalPacks in singles uses tracked inventory total when it covers sales", () => {
  const total = appComputed.totalPacks.call({
    currentLotType: "singles",
    singlesPurchases: [{ id: 11 }, { id: 12 }],
    singlesPurchaseTotalQuantity: 6,
    singlesSoldCountByPurchaseId: { 11: 4, 12: 3 },
    sales: []
  } as unknown as Parameters<typeof appComputed.totalPacks>[0]);
  assert.equal(total, 6);
});

test("computed totalPacks in singles is at least all sold cards from sales list", () => {
  const total = appComputed.totalPacks.call({
    currentLotType: "singles",
    singlesPurchases: [{ id: 1 }],
    singlesPurchaseTotalQuantity: 7,
    singlesSoldCountByPurchaseId: {},
    sales: [
      { id: 1, type: "pack", quantity: 1, packsCount: 1, price: 10, date: "2026-02-01" },
      { id: 2, type: "pack", quantity: 6, packsCount: 6, price: 10, date: "2026-02-02" }
    ]
  } as unknown as Parameters<typeof appComputed.totalPacks>[0]);
  assert.equal(total, 7);
});

test("computed totalPacks in singles ignores linked sold counts for deleted entries", () => {
  const total = appComputed.totalPacks.call({
    currentLotType: "singles",
    singlesPurchases: [{ id: 10 }, { id: 20 }, { id: 30 }, { id: 40 }, { id: 50 }, { id: 60 }, { id: 70 }],
    singlesPurchaseTotalQuantity: 6,
    singlesSoldCountByPurchaseId: { 10: 1, 999: 3 },
    sales: [
      { id: 1, type: "pack", quantity: 1, packsCount: 1, price: 10, date: "2026-02-01" },
      { id: 2, type: "pack", quantity: 2, packsCount: 2, price: 10, date: "2026-02-02" },
      { id: 3, type: "pack", quantity: 1, packsCount: 1, price: 10, date: "2026-02-03" },
      { id: 4, type: "pack", quantity: 3, packsCount: 3, price: 10, date: "2026-02-04" }
    ]
  } as unknown as Parameters<typeof appComputed.totalPacks>[0]);
  assert.equal(total, 7);
});

test("computed singlesSoldCountByPurchaseId sums sold quantity for valid linked entries", () => {
  const result = appComputed.singlesSoldCountByPurchaseId.call({
    sales: [
      { id: 1, type: "pack", quantity: 1, packsCount: 1, singlesPurchaseEntryId: 10, price: 5, date: "2026-02-01" },
      { id: 2, type: "pack", quantity: 2, packsCount: 2, singlesPurchaseEntryId: 10, price: 6, date: "2026-02-02" },
      { id: 3, type: "pack", quantity: 1, packsCount: 1, singlesPurchaseEntryId: 12, price: 7, date: "2026-02-03" },
      { id: 4, type: "pack", quantity: 1, packsCount: 1, singlesPurchaseEntryId: 0, price: 7, date: "2026-02-04" }
    ]
  } as unknown as Parameters<typeof appComputed.singlesSoldCountByPurchaseId>[0]);

  assert.deepEqual(result, { 10: 3, 12: 1 });
});

test("computed soldPacksCount in singles uses all sales quantities", () => {
  const count = appComputed.soldPacksCount.call({
    currentLotType: "singles",
    sales: [
      { id: 1, type: "pack", quantity: 4, packsCount: 4, price: 10, date: "2026-02-01" },
      { id: 2, type: "pack", quantity: 3, packsCount: 3, price: 9, date: "2026-02-02" }
    ]
  } as unknown as Parameters<typeof appComputed.soldPacksCount>[0]);
  assert.equal(count, 7);
});

test("computed singlesTrackedSoldCount and singlesTrackedTotalCount only use current listed entries", () => {
  const trackedSold = appComputed.singlesTrackedSoldCount.call({
    currentLotType: "singles",
    singlesPurchases: [{ id: 10 }, { id: 20 }, { id: 30 }],
    singlesSoldCountByPurchaseId: { 10: 1, 20: 2, 999: 5 }
  } as unknown as Parameters<typeof appComputed.singlesTrackedSoldCount>[0]);
  assert.equal(trackedSold, 3);

  const trackedTotal = appComputed.singlesTrackedTotalCount.call({
    currentLotType: "singles",
    singlesPurchaseTotalQuantity: 4,
    singlesTrackedSoldCount: trackedSold
  } as unknown as Parameters<typeof appComputed.singlesTrackedTotalCount>[0]);
  assert.equal(trackedTotal, 4);
});

test("computed singlesUnlinkedSoldCount shows delta between total sold and tracked sold", () => {
  const unlinked = appComputed.singlesUnlinkedSoldCount.call({
    currentLotType: "singles",
    soldPacksCount: 10,
    singlesTrackedSoldCount: 7
  } as unknown as Parameters<typeof appComputed.singlesUnlinkedSoldCount>[0]);
  assert.equal(unlinked, 3);
});

test("computed singlesSaleCardOptions computes remaining quantity from total and sold", () => {
  const options = appComputed.singlesSaleCardOptions.call({
    currentLotType: "singles",
    newSale: { singlesPurchaseEntryId: 20 },
    sellingTaxPercent: 15,
    singlesSoldCountByPurchaseId: { 20: 3, 30: 1 },
    singlesPurchases: [
      { id: 20, item: "Sold Out", cardNumber: "020", cost: 2, quantity: 3, marketValue: 3 },
      { id: 30, item: "In Stock", cardNumber: "030", cost: 4, quantity: 3, marketValue: 5 }
    ],
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4
  } as unknown as Parameters<typeof appComputed.singlesSaleCardOptions>[0]);

  assert.equal(options.length, 2);
  const soldOut = options.find((option) => option.value === 20);
  const inStock = options.find((option) => option.value === 30);
  assert.equal(soldOut?.quantity, 0);
  assert.equal(soldOut?.soldCount, 3);
  assert.equal(soldOut?.costBasis, 6);
  assert.equal(soldOut?.profitablePrice, 0);
  assert.equal(inStock?.quantity, 2);
  assert.equal(inStock?.costBasis, 12);
  assert.equal(Math.abs((inStock?.profitablePrice ?? 0) - 9.36) < 0.01, true);
});

test("computed selectedSinglesSaleMaxQuantity restores editing quantity for same linked card", () => {
  const sameCard = appComputed.selectedSinglesSaleMaxQuantity.call({
    currentLotType: "singles",
    newSale: { singlesPurchaseEntryId: 50 },
    editingSale: { singlesPurchaseEntryId: 50, quantity: 2 },
    singlesSoldCountByPurchaseId: { 50: 2 },
    singlesPurchases: [{ id: 50, item: "Card", cost: 1, quantity: 2, marketValue: 1 }]
  } as unknown as Parameters<typeof appComputed.selectedSinglesSaleMaxQuantity>[0]);
  assert.equal(sameCard, 2);

  const differentCard = appComputed.selectedSinglesSaleMaxQuantity.call({
    currentLotType: "singles",
    newSale: { singlesPurchaseEntryId: 51 },
    editingSale: { singlesPurchaseEntryId: 50, quantity: 2 },
    singlesPurchases: [{ id: 51, item: "Card", cost: 1, quantity: 1, marketValue: 1 }]
  } as unknown as Parameters<typeof appComputed.selectedSinglesSaleMaxQuantity>[0]);
  assert.equal(differentCard, 1);
});

test("computed saleEditorProfitPreview shows live singles profit value and percent", () => {
  const preview = appComputed.saleEditorProfitPreview.call({
    currentLotType: "singles",
    showAddSaleModal: true,
    sellingTaxPercent: 15,
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    singlesPurchases: [{ id: 123, item: "Charizard", cost: 23, quantity: 2, marketValue: 50, currency: "CAD" }],
    newSale: { singlesPurchaseEntryId: 123, quantity: 2, price: 100, buyerShipping: 0 }
  } as unknown as Parameters<typeof appComputed.saleEditorProfitPreview>[0]);

  assert.equal(preview?.sign, "-");
  assert.equal(preview?.colorClass, "text-error");
  assert.equal(preview?.basisLabel, "Market");
  const expectedValue = calculateNetFromGross(100, 15, 0, 1) - 100;
  assert.equal(preview?.value, expectedValue);
  assert.equal(Math.abs((preview?.percent ?? 0) - ((expectedValue / 100) * 100)) < 0.0001, true);
});

test("computed saleEditorProfitPreview defaults to 100% when no linked card cost exists", () => {
  const preview = appComputed.saleEditorProfitPreview.call({
    currentLotType: "singles",
    showAddSaleModal: true,
    sellingTaxPercent: 15,
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    singlesPurchases: [],
    newSale: { singlesPurchaseEntryId: null, quantity: 1, price: 20, buyerShipping: 0 }
  } as unknown as Parameters<typeof appComputed.saleEditorProfitPreview>[0]);

  assert.equal(preview?.value, calculateNetFromGross(20, 15, 0, 1));
  assert.equal(preview?.percent, 100);
  assert.equal(preview?.colorClass, "text-success");
  assert.equal(preview?.basisLabel, "Cost");
});

test("computed saleEditorLineProfitPreviews returns per-line profit entries", () => {
  const linePreviews = appComputed.saleEditorLineProfitPreviews.call({
    currentLotType: "singles",
    showAddSaleModal: true,
    sellingTaxPercent: 15,
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    singlesPurchases: [
      { id: 1, item: "Card A", cost: 10, quantity: 4, marketValue: 20, currency: "CAD" },
      { id: 2, item: "Card B", cost: 8, quantity: 2, marketValue: 0, currency: "CAD" }
    ],
    newSale: {
      singlesItems: [
        { lineId: 1, singlesPurchaseEntryId: 1, quantity: 2, price: 60 },
        { lineId: 2, singlesPurchaseEntryId: 2, quantity: 1, price: 20 }
      ],
      buyerShipping: 0
    }
  } as unknown as Parameters<typeof appComputed.saleEditorLineProfitPreviews>[0]);

  assert.equal(linePreviews.length, 2);
  assert.equal(linePreviews[0]?.basisLabel, "Market");
  assert.equal(linePreviews[0]?.basisValue, 40);
  assert.equal(linePreviews[1]?.basisLabel, "Cost");
  assert.equal(linePreviews[1]?.basisValue, 8);
  const expectedNet = calculateNetFromGross(80, 15, 0, 1);
  assert.equal(linePreviews[0]?.value, (expectedNet * (60 / 80)) - 40);
  assert.equal(linePreviews[1]?.value, (expectedNet * (20 / 80)) - 8);
});

test("computed saleEditorProfitPreview aggregates basis across singles line items", () => {
  const preview = appComputed.saleEditorProfitPreview.call({
    currentLotType: "singles",
    showAddSaleModal: true,
    sellingTaxPercent: 15,
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    singlesPurchases: [
      { id: 1, item: "Card A", cost: 20, quantity: 3, marketValue: 50, currency: "CAD" },
      { id: 2, item: "Card B", cost: 10, quantity: 1, marketValue: 0, currency: "CAD" }
    ],
    newSale: {
      singlesItems: [
        { lineId: 1, singlesPurchaseEntryId: 1, quantity: 2, price: 120 },
        { lineId: 2, singlesPurchaseEntryId: 2, quantity: 1, price: 20 }
      ],
      buyerShipping: 0
    }
  } as unknown as Parameters<typeof appComputed.saleEditorProfitPreview>[0]);

  const expectedValue = calculateNetFromGross(140, 15, 0, 1) - 110;
  assert.equal(preview?.value, expectedValue);
  assert.equal(preview?.quantity, 3);
  assert.equal(preview?.unitValue, expectedValue / 3);
  assert.equal(preview?.basisLabel, "Mixed");
  assert.equal(preview?.marketBasisValue, 100);
  assert.equal(preview?.costBasisValue, 10);
  assert.equal(preview?.sign, "+");
});

test("watch.currentTab persists selected tab and triggers portfolio chart init", () => {
  withMockedLocalStorage((_storage, data) => {
    let portfolioInitCalled = false;
    let nextTickCalled = false;

    const context = {
      speedDialOpenSales: true,
      portfolioChart: null,
      $nextTick(callback: () => void) {
        nextTickCalled = true;
        callback();
      },
      initSalesChart() {
        // noop
      },
      initPortfolioChart() {
        portfolioInitCalled = true;
      }
    } as unknown as Parameters<typeof appWatch.currentTab>[0];

    appWatch.currentTab.call(context, "portfolio");

    assert.equal(data.get("whatfees_last_tab"), "portfolio");
    assert.equal(context.speedDialOpenSales, false);
    assert.equal(nextTickCalled, true);
    assert.equal(portfolioInitCalled, true);
  });
});

test("watch.currentTab destroys existing portfolio chart when leaving portfolio", () => {
  withMockedLocalStorage(() => {
    let destroyed = false;

    const context = {
      speedDialOpenSales: false,
      portfolioChart: {
        destroy() {
          destroyed = true;
        }
      },
      $nextTick() {
        // noop
      },
      initSalesChart() {
        // noop
      },
      initPortfolioChart() {
        // noop
      }
    } as unknown as Parameters<typeof appWatch.currentTab>[0];

    appWatch.currentTab.call(context, "sales");

    assert.equal(destroyed, true);
    assert.equal(context.portfolioChart, null);
  });
});

test("watch.portfolioLotFilterIds persists filter and refreshes chart in portfolio tab", () => {
  withMockedLocalStorage((_storage, data) => {
    let portfolioInitCalled = false;

    const context = {
      currentTab: "portfolio",
      portfolioLotFilterIds: [101, 202],
      $nextTick(callback: () => void) {
        callback();
      },
      initPortfolioChart() {
        portfolioInitCalled = true;
      }
    } as unknown as Parameters<NonNullable<typeof appWatch.portfolioLotFilterIds>["handler"]>[0];

    appWatch.portfolioLotFilterIds.handler.call(context);

    assert.equal(data.get("whatfees_portfolio_filter_ids"), JSON.stringify([101, 202]));
    assert.equal(portfolioInitCalled, true);
  });
});

test("watch.portfolioLotTypeFilter persists type scope and refreshes chart in portfolio tab", () => {
  withMockedLocalStorage((_storage, data) => {
    let portfolioInitCalled = false;

    const context = {
      currentTab: "portfolio",
      $nextTick(callback: () => void) {
        callback();
      },
      initPortfolioChart() {
        portfolioInitCalled = true;
      }
    } as unknown as Parameters<typeof appWatch.portfolioLotTypeFilter>[0];

    appWatch.portfolioLotTypeFilter.call(context, "singles");

    assert.equal(data.get("whatfees_portfolio_filter_type"), "singles");
    assert.equal(portfolioInitCalled, true);
  });
});

test("watch.purchaseUiMode persists mode and enforces total mode in simple", () => {
  withMockedLocalStorage((_storage, data) => {
    let purchaseConfigChanged = false;
    const context = {
      costInputMode: "perBox",
      onPurchaseConfigChange() {
        purchaseConfigChanged = true;
      }
    } as unknown as Parameters<typeof appWatch.purchaseUiMode>[0];

    appWatch.purchaseUiMode.call(context, "simple");

    assert.equal(data.get("whatfees_purchase_ui_mode"), "simple");
    assert.equal(context.costInputMode, "total");
    assert.equal(purchaseConfigChanged, true);
  });
});

test("calculateOptimalPrices is blocked when paywall is locked", () => {
  let notifiedMessage = "";
  let recalculated = false;
  const context = {
    canUsePaidActions: false,
    showProfitCalculator: true,
    notify(message: string) {
      notifiedMessage = message;
    },
    recalculateDefaultPrices() {
      recalculated = true;
    }
  } as unknown as Parameters<typeof configMethods.calculateOptimalPrices>[0];

  configMethods.calculateOptimalPrices.call(context);

  assert.equal(recalculated, false);
  assert.equal(notifiedMessage, "Pro access required to apply auto-calculated prices");
  assert.equal(context.showProfitCalculator, true);
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

test("syncLivePricesFromDefaults copies config selling prices into live prices", () => {
  const context = {
    spotPrice: 22,
    boxPriceSell: 111,
    packPrice: 8,
    liveSpotPrice: 0,
    liveBoxPriceSell: 0,
    livePackPrice: 0
  } as unknown as Parameters<typeof configMethods.syncLivePricesFromDefaults>[0];

  configMethods.syncLivePricesFromDefaults.call(context);

  assert.equal(context.liveSpotPrice, 22);
  assert.equal(context.liveBoxPriceSell, 111);
  assert.equal(context.livePackPrice, 8);
});

test("resetLivePrices syncs from config defaults and notifies", () => {
  let syncCalled = false;
  let notifyMessage = "";
  let notifyColor = "";

  const context = {
    syncLivePricesFromDefaults() {
      syncCalled = true;
    },
    notify(message: string, color: string) {
      notifyMessage = message;
      notifyColor = color;
    }
  } as unknown as Parameters<typeof configMethods.resetLivePrices>[0];

  configMethods.resetLivePrices.call(context);

  assert.equal(syncCalled, true);
  assert.equal(notifyMessage, "Live prices reset to config defaults");
  assert.equal(notifyColor, "info");
});

test("recalculateDefaultPrices syncs live prices even when current tab is live", () => {
  let syncCalled = false;
  let saved = false;

  const context = {
    currentTab: "live",
    totalCaseCost: 1000,
    targetProfitPercent: 15,
    boxesPurchased: 10,
    totalPacks: 160,
    sellingTaxPercent: 15,
    sellingShippingPerOrder: 0,
    spotPrice: 0,
    boxPriceSell: 0,
    packPrice: 0,
    showProfitCalculator: true,
    syncLivePricesFromDefaults() {
      syncCalled = true;
    },
    autoSaveSetup() {
      saved = true;
    }
  } as unknown as Parameters<typeof configMethods.recalculateDefaultPrices>[0];

  configMethods.recalculateDefaultPrices.call(context, { closeModal: true });

  assert.equal(syncCalled, true);
  assert.equal(saved, true);
  assert.ok(context.spotPrice > 0);
  assert.ok(context.boxPriceSell > 0);
  assert.ok(context.packPrice > 0);
  assert.equal(context.showProfitCalculator, false);
});

test("applyLivePricesToDefaults saves live prices into config defaults", () => {
  let saved = false;
  let notified = "";

  const context = {
    currentLotId: 123,
    liveSpotPrice: 31,
    liveBoxPriceSell: 122,
    livePackPrice: 9,
    spotPrice: 0,
    boxPriceSell: 0,
    packPrice: 0,
    autoSaveSetup() {
      saved = true;
    },
    pushCloudSync() {
      return Promise.resolve();
    },
    notify(message: string) {
      notified = message;
    }
  } as unknown as Parameters<typeof configMethods.applyLivePricesToDefaults>[0];

  configMethods.applyLivePricesToDefaults.call(context);

  assert.equal(context.spotPrice, 31);
  assert.equal(context.boxPriceSell, 122);
  assert.equal(context.packPrice, 9);
  assert.equal(saved, true);
  assert.equal(notified, "Live prices saved to config");
});

test("applyLivePricesToDefaults is blocked when no preset is selected", () => {
  let saved = false;
  let notified = "";

  const context = {
    currentLotId: null,
    liveSpotPrice: 31,
    liveBoxPriceSell: 122,
    livePackPrice: 9,
    spotPrice: 10,
    boxPriceSell: 20,
    packPrice: 30,
    autoSaveSetup() {
      saved = true;
    },
    notify(message: string) {
      notified = message;
    }
  } as unknown as Parameters<typeof configMethods.applyLivePricesToDefaults>[0];

  configMethods.applyLivePricesToDefaults.call(context);

  assert.equal(context.spotPrice, 10);
  assert.equal(context.boxPriceSell, 20);
  assert.equal(context.packPrice, 30);
  assert.equal(saved, false);
  assert.equal(notified, "Select a lot first");
});

test("createNewLot in simple mode resets purchase defaults for new lots", () => {
  const todayDate = getTodayLocalDate();
  let saved = false;
  let loaded = false;
  let notified = "";

  const context = {
    purchaseUiMode: "simple",
    newLotName: "Simple lot",
    lots: [] as Lot[],
    currentLotId: null as number | null,
    showNewLotModal: true,
    getCurrentSetup() {
      return {
        boxPriceCost: 80,
        boxesPurchased: 3,
        packsPerBox: 16,
        spotsPerBox: 5,
        costInputMode: "total" as const,
        currency: "CAD" as const,
        sellingCurrency: "CAD" as const,
        exchangeRate: 1.36,
        purchaseDate: "2025-01-01",
        purchaseShippingCost: 17,
        purchaseTaxPercent: 15,
        sellingTaxPercent: 15,
        sellingShippingPerOrder: 9,
        includeTax: false,
        spotPrice: 20,
        boxPriceSell: 100,
        packPrice: 7,
        targetProfitPercent: 12
      };
    },
    saveLotsToStorage() {
      saved = true;
    },
    loadLot() {
      loaded = true;
    },
    notify(message: string) {
      notified = message;
    }
  } as unknown as Parameters<typeof configMethods.createNewLot>[0];

  configMethods.createNewLot.call(context);

  assert.equal(saved, true);
  assert.equal(loaded, true);
  assert.equal(notified, "Lot created");
  assert.equal(context.lots.length, 1);
  assert.equal(context.showNewLotModal, false);
  assert.equal(context.newLotName, "");

  const newPreset = context.lots[0]!;
  assert.equal(newPreset.purchaseDate, todayDate);
  assert.equal(newPreset.purchaseShippingCost, 0);
  assert.equal(newPreset.purchaseTaxPercent, 0);
  assert.equal(newPreset.sellingTaxPercent, 15);
});

test("createNewLot in expert mode uses 15 selling tax for the first lot", () => {
  const todayDate = getTodayLocalDate();
  let saved = false;

  const context = {
    purchaseUiMode: "expert",
    newLotName: "Expert lot",
    lots: [] as Lot[],
    currentLotId: null as number | null,
    showNewLotModal: true,
    getCurrentSetup() {
      return {
        boxPriceCost: 80,
        boxesPurchased: 3,
        packsPerBox: 16,
        spotsPerBox: 5,
        costInputMode: "total" as const,
        currency: "CAD" as const,
        sellingCurrency: "CAD" as const,
        exchangeRate: 1.36,
        purchaseDate: "2025-01-01",
        purchaseShippingCost: 17,
        purchaseTaxPercent: 11,
        sellingTaxPercent: 13,
        sellingShippingPerOrder: 9,
        includeTax: false,
        spotPrice: 20,
        boxPriceSell: 100,
        packPrice: 7,
        targetProfitPercent: 12
      };
    },
    saveLotsToStorage() {
      saved = true;
    },
    loadLot() {
      // noop
    },
    notify() {
      // noop
    }
  } as unknown as Parameters<typeof configMethods.createNewLot>[0];

  configMethods.createNewLot.call(context);

  assert.equal(saved, true);
  assert.equal(context.lots.length, 1);
  const newPreset = context.lots[0]!;
  assert.equal(newPreset.purchaseDate, todayDate);
  assert.equal(newPreset.purchaseShippingCost, 17);
  assert.equal(newPreset.purchaseTaxPercent, 11);
  assert.equal(newPreset.sellingTaxPercent, 15);
});

test("createNewLot uses previous lot selling tax for second+ lots", () => {
  const existingLot: Lot = {
    id: 9001,
    name: "Existing lot",
    boxPriceCost: 70,
    boxesPurchased: 2,
    packsPerBox: 16,
    spotsPerBox: 5,
    costInputMode: "total",
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.36,
    purchaseDate: "2026-02-01",
    purchaseShippingCost: 0,
    purchaseTaxPercent: 0,
    sellingTaxPercent: 9.5,
    sellingShippingPerOrder: 0,
    includeTax: false,
    spotPrice: 18,
    boxPriceSell: 85,
    packPrice: 6,
    targetProfitPercent: 0
  };

  const context = {
    purchaseUiMode: "expert",
    newLotName: "Second lot",
    lots: [existingLot] as Lot[],
    currentLotId: existingLot.id,
    showNewLotModal: true,
    getCurrentSetup() {
      return {
        boxPriceCost: 80,
        boxesPurchased: 3,
        packsPerBox: 16,
        spotsPerBox: 5,
        costInputMode: "total" as const,
        currency: "CAD" as const,
        sellingCurrency: "CAD" as const,
        exchangeRate: 1.36,
        purchaseDate: "2025-01-01",
        purchaseShippingCost: 17,
        purchaseTaxPercent: 11,
        sellingTaxPercent: 13,
        sellingShippingPerOrder: 9,
        includeTax: false,
        spotPrice: 20,
        boxPriceSell: 100,
        packPrice: 7,
        targetProfitPercent: 12
      };
    },
    saveLotsToStorage() {
      // noop
    },
    loadLot() {
      // noop
    },
    notify() {
      // noop
    }
  } as unknown as Parameters<typeof configMethods.createNewLot>[0];

  configMethods.createNewLot.call(context);

  assert.equal(context.lots.length, 2);
  const newPreset = context.lots[1]!;
  assert.equal(newPreset.sellingTaxPercent, 9.5);
});

test("openRenameLotModal pre-fills selected lot name and opens modal", () => {
  const context = {
    currentLotId: 2,
    lots: [
      { id: 1, name: "Alpha" },
      { id: 2, name: "Beta" }
    ],
    renameLotName: "",
    showRenameLotModal: false,
    notify() {
      // noop
    }
  } as unknown as Parameters<typeof configMethods.openRenameLotModal>[0];

  configMethods.openRenameLotModal.call(context);

  assert.equal(context.showRenameLotModal, true);
  assert.equal(context.renameLotName, "Beta");
});

test("renameCurrentLot rejects duplicates and renames unique names", () => {
  let savedCount = 0;
  let notifiedMessage = "";
  let chartRefreshCount = 0;

  const context = {
    currentLotId: 2,
    currentTab: "portfolio",
    lots: [
      { id: 1, name: "Alpha" },
      { id: 2, name: "Beta" }
    ],
    renameLotName: " alpha ",
    showRenameLotModal: true,
    saveLotsToStorage() {
      savedCount += 1;
    },
    initPortfolioChart() {
      chartRefreshCount += 1;
    },
    $nextTick(callback: () => void) {
      callback();
    },
    notify(message: string) {
      notifiedMessage = message;
    }
  } as unknown as Parameters<typeof configMethods.renameCurrentLot>[0];

  configMethods.renameCurrentLot.call(context);
  assert.equal(savedCount, 0);
  assert.equal(notifiedMessage, "A lot with this name already exists");
  assert.equal(context.lots[1]?.name, "Beta");

  context.renameLotName = "Gamma";
  configMethods.renameCurrentLot.call(context);

  assert.equal(savedCount, 1);
  assert.equal(chartRefreshCount, 1);
  assert.equal(context.lots[1]?.name, "Gamma");
  assert.equal(context.showRenameLotModal, false);
  assert.equal(context.renameLotName, "");
  assert.equal(notifiedMessage, "Lot renamed");
});

test("loadLot forces target profit to 0 for non-pro users", async () => {
  const preset: Lot = {
    id: 5001,
    name: "Locked preset",
    boxPriceCost: 90,
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
    spotPrice: 20,
    boxPriceSell: 95,
    packPrice: 7,
    targetProfitPercent: 27
  };

  const context = {
    hasProAccess: false,
    currentLotId: preset.id,
    lots: [preset],
    currentTab: "config",
    syncLivePricesFromDefaults() {
      // noop
    },
    loadSalesFromStorage() {
      // noop
    },
    initSalesChart() {
      // noop
    },
    initPortfolioChart() {
      // noop
    },
    $nextTick(callback: () => void) {
      callback();
      return Promise.resolve();
    }
  } as unknown as Parameters<typeof configMethods.loadLot>[0];

  configMethods.loadLot.call(context);
  assert.equal(context.targetProfitPercent, 0);
});

test("loadLot defaults target profit to 15 for pro users when missing", () => {
  const preset: Lot = {
    id: 5002,
    name: "Pro preset",
    boxPriceCost: 90,
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
    spotPrice: 20,
    boxPriceSell: 95,
    packPrice: 7,
    targetProfitPercent: Number.NaN
  };

  const context = {
    hasProAccess: true,
    currentLotId: preset.id,
    lots: [preset],
    currentTab: "config",
    syncLivePricesFromDefaults() {
      // noop
    },
    loadSalesFromStorage() {
      // noop
    },
    initSalesChart() {
      // noop
    },
    initPortfolioChart() {
      // noop
    },
    $nextTick(callback: () => void) {
      callback();
      return Promise.resolve();
    }
  } as unknown as Parameters<typeof configMethods.loadLot>[0];

  configMethods.loadLot.call(context);
  assert.equal(context.targetProfitPercent, 15);
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

test("saveSale normalizes slash date input to YYYY-MM-DD", () => {
  const context = {
    canUsePaidActions: true,
    packsPerBox: 16,
    editingSale: null,
    sales: [] as Sale[],
    newSale: {
      type: "pack",
      quantity: 1,
      packsCount: null,
      price: 25,
      buyerShipping: 0,
      date: "2/21/2026"
    },
    notify() {
      // noop
    },
    cancelSale() {
      // noop
    }
  } as unknown as Parameters<typeof salesMethods.saveSale>[0];

  salesMethods.saveSale.call(context);

  assert.equal(context.sales.length, 1);
  assert.equal(context.sales[0]?.date, "2026-02-21");
});

test("saveSale falls back to local today date when date input is invalid", () => {
  const todayDate = getTodayLocalDate();

  const context = {
    canUsePaidActions: true,
    packsPerBox: 16,
    editingSale: null,
    sales: [] as Sale[],
    newSale: {
      type: "pack",
      quantity: 1,
      packsCount: null,
      price: 25,
      buyerShipping: 0,
      date: ""
    },
    notify() {
      // noop
    },
    cancelSale() {
      // noop
    }
  } as unknown as Parameters<typeof salesMethods.saveSale>[0];

  salesMethods.saveSale.call(context);

  assert.equal(context.sales.length, 1);
  assert.equal(context.sales[0]?.date, todayDate);
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

test("formatDate keeps date-only values in local time", () => {
  const expected = new Date(2026, 1, 21).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });

  const fromIsoDateOnly = uiBaseMethods.formatDate.call(
    {} as unknown as Parameters<typeof uiBaseMethods.formatDate>[0],
    "2026-02-21"
  );
  const fromSlashDate = uiBaseMethods.formatDate.call(
    {} as unknown as Parameters<typeof uiBaseMethods.formatDate>[0],
    "2/21/2026"
  );
  const invalidRaw = uiBaseMethods.formatDate.call(
    {} as unknown as Parameters<typeof uiBaseMethods.formatDate>[0],
    "not-a-date"
  );

  assert.equal(fromIsoDateOnly, expected);
  assert.equal(fromSlashDate, expected);
  assert.equal(invalidRaw, "not-a-date");
});

test("calculateSaleProfit in singles uses linked card cost multiplied by sold quantity", () => {
  const sale: Sale = {
    id: 1,
    type: "pack",
    quantity: 3,
    packsCount: 3,
    singlesPurchaseEntryId: 101,
    price: 30,
    buyerShipping: 0,
    date: "2026-02-21"
  };

  const profit = uiBaseMethods.calculateSaleProfit.call({
    currentLotType: "singles",
    singlesPurchases: [
      { id: 101, item: "Card A", cost: 10, currency: "CAD", quantity: 5, marketValue: 12 }
    ],
    sellingTaxPercent: 15,
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    totalPacks: 100,
    totalCaseCost: 1000
  } as unknown as Parameters<typeof uiBaseMethods.calculateSaleProfit>[0], sale);

  const expectedNet = calculateNetFromGross(90, 15, 0, 1);
  assert.equal(profit, expectedNet - 30);
});

test("calculateSaleProfit in singles without linked card returns net revenue with zero cost basis", () => {
  const sale: Sale = {
    id: 2,
    type: "pack",
    quantity: 1,
    packsCount: 1,
    price: 10,
    buyerShipping: 0,
    date: "2026-02-21"
  };

  const profit = uiBaseMethods.calculateSaleProfit.call({
    currentLotType: "singles",
    singlesPurchases: [],
    sellingTaxPercent: 15,
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    totalPacks: 100,
    totalCaseCost: 1000
  } as unknown as Parameters<typeof uiBaseMethods.calculateSaleProfit>[0], sale);

  assert.equal(profit, calculateNetFromGross(10, 15, 0, 1));
});

test("calculateSaleProfit in singles uses summed line-item cost basis", () => {
  const sale: Sale = {
    id: 3,
    type: "pack",
    quantity: 3,
    packsCount: 3,
    price: 90,
    priceIsTotal: true,
    singlesItems: [
      { singlesPurchaseEntryId: 10, quantity: 2, price: 60 },
      { singlesPurchaseEntryId: 11, quantity: 1, price: 30 }
    ],
    buyerShipping: 0,
    date: "2026-02-21"
  };

  const profit = uiBaseMethods.calculateSaleProfit.call({
    currentLotType: "singles",
    singlesPurchases: [
      { id: 10, item: "Card A", cost: 15, currency: "CAD", quantity: 5, marketValue: 12 },
      { id: 11, item: "Card B", cost: 20, currency: "CAD", quantity: 5, marketValue: 12 }
    ],
    sellingTaxPercent: 15,
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    totalPacks: 100,
    totalCaseCost: 1000
  } as unknown as Parameters<typeof uiBaseMethods.calculateSaleProfit>[0], sale);

  const expectedNet = calculateNetFromGross(90, 15, 0, 1);
  assert.equal(profit, expectedNet - 50);
});

test("accessProFeature routes locked users into purchase flow", async () => {
  let purchaseStarted = 0;
  const context = {
    hasProAccess: false,
    startProPurchase: async () => {
      purchaseStarted += 1;
    },
    showProfitCalculator: false,
    speedDialOpenSales: false,
    purchaseUiMode: "simple",
    openPortfolioReportModal: () => {
      throw new Error("report should stay locked");
    }
  } as unknown as Parameters<typeof uiBaseMethods.accessProFeature>[0];

  await uiBaseMethods.accessProFeature.call(context, "autoCalculate");
  await uiBaseMethods.accessProFeature.call(context, "portfolioReport");
  await uiBaseMethods.accessProFeature.call(context, "salesTracking");

  assert.equal(purchaseStarted, 3);
  assert.equal(context.showProfitCalculator, false);
  assert.equal(context.speedDialOpenSales, false);
  assert.equal(context.purchaseUiMode, "simple");
});

test("accessProFeature opens unlocked features directly", async () => {
  let reportOpened = 0;
  const context = {
    hasProAccess: true,
    startProPurchase: async () => {
      throw new Error("purchase flow should not run");
    },
    showProfitCalculator: false,
    speedDialOpenSales: false,
    purchaseUiMode: "simple",
    openPortfolioReportModal: () => {
      reportOpened += 1;
    }
  } as unknown as Parameters<typeof uiBaseMethods.accessProFeature>[0];

  await uiBaseMethods.accessProFeature.call(context, "autoCalculate");
  await uiBaseMethods.accessProFeature.call(context, "portfolioReport");
  await uiBaseMethods.accessProFeature.call(context, "salesTracking");
  await uiBaseMethods.accessProFeature.call(context, "expertMode");

  assert.equal(context.showProfitCalculator, true);
  assert.equal(reportOpened, 1);
  assert.equal(context.speedDialOpenSales, true);
  assert.equal(context.purchaseUiMode, "expert");
});

test("requestPurchaseUiMode upgrades locked expert requests and applies allowed changes", async () => {
  let requestedUpgrade = 0;
  const lockedContext = {
    hasProAccess: false,
    purchaseUiMode: "simple",
    accessProFeature: async (target: string) => {
      if (target === "expertMode") {
        requestedUpgrade += 1;
      }
    }
  } as unknown as Parameters<typeof uiBaseMethods.requestPurchaseUiMode>[0];

  await uiBaseMethods.requestPurchaseUiMode.call(lockedContext, "expert");
  assert.equal(requestedUpgrade, 1);
  assert.equal(lockedContext.purchaseUiMode, "simple");

  const unlockedContext = {
    hasProAccess: true,
    purchaseUiMode: "simple",
    accessProFeature: async () => {
      throw new Error("should not request upgrade");
    }
  } as unknown as Parameters<typeof uiBaseMethods.requestPurchaseUiMode>[0];

  await uiBaseMethods.requestPurchaseUiMode.call(unlockedContext, "expert");
  assert.equal(unlockedContext.purchaseUiMode, "expert");

  await uiBaseMethods.requestPurchaseUiMode.call(unlockedContext, "simple");
  assert.equal(unlockedContext.purchaseUiMode, "simple");
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
  assert.equal(context.newSale.quantity, null);
  assert.equal(context.newSale.price, 11);
  assert.equal(context.newSale.buyerShipping, 4);

  salesMethods.openAddSaleModal.call(context, "rtyh");
  assert.equal(context.newSale.type, "rtyh");
  assert.equal(context.newSale.price, 25);
});

test("loadSalesFromStorage restores legacy sales key instead of writing empty current sales", () => {
  withMockedLocalStorage((_, data) => {
    const lotId = 901;
    const legacyKey = getLegacySalesStorageKey(lotId);
    data.set(
      legacyKey,
      JSON.stringify([{ id: 1, type: "pack", quantity: 2, packsCount: 2, price: 9, date: "2026-02-18" }])
    );

    const context = {
      currentLotId: lotId,
      sales: [],
      getSalesStorageKey: configMethods.getSalesStorageKey,
      loadSalesForLotId: configMethods.loadSalesForLotId
    } as unknown as Parameters<typeof salesMethods.loadSalesFromStorage>[0];

    salesMethods.loadSalesFromStorage.call(context);

    assert.equal(context.sales.length, 1);
    assert.equal(context.sales[0]?.price, 9);
    assert.equal(
      data.get(context.getSalesStorageKey(lotId)),
      JSON.stringify([{ id: 1, type: "pack", quantity: 2, packsCount: 2, price: 9, date: "2026-02-18" }])
    );
  });
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

test("remainingSpotsEquivalent uses dynamic totalSpots instead of fixed 80", () => {
  const remainingSpots = appComputed.remainingSpotsEquivalent.call({
    remainingPacksCount: 64,
    totalPacks: 128,
    totalSpots: 40
  } as unknown as Parameters<typeof appComputed.remainingSpotsEquivalent>[0]);

  assert.equal(remainingSpots, 20);
});

test("liveForecastScenarios builds bulk forecasts from current live prices", () => {
  const scenarios = appComputed.liveForecastScenarios.call({
    currentLotType: "bulk",
    remainingPacksCount: 10,
    remainingBoxesEquivalent: 2.5,
    remainingSpotsEquivalent: 5,
    livePackPrice: 9,
    liveBoxPriceSell: 30,
    liveSpotPrice: 6,
    totalRevenue: 100,
    totalCaseCost: 200,
    sellingTaxPercent: 15,
    sellingShippingPerOrder: 2,
    netFromGross(grossRevenue: number, _shipping?: number, orderCount?: number) {
      return grossRevenue - (orderCount || 0);
    }
  } as unknown as Parameters<typeof appComputed.liveForecastScenarios>[0]);

  assert.equal(scenarios.length, 3);
  assert.equal(scenarios[0]?.id, "item");
  assert.equal(scenarios[0]?.units, 10);
  const expectedItemNetRemaining = calculateNetFromGross(90, 15, 2, 10);
  assert.equal(scenarios[0]?.estimatedNetRemaining, expectedItemNetRemaining);
  assert.equal(scenarios[0]?.forecastRevenue, 100 + expectedItemNetRemaining);
  assert.equal(scenarios[0]?.forecastProfit, (100 + expectedItemNetRemaining) - 200);
});

test("liveForecastScenarios builds singles forecast from remaining inventory suggested prices", () => {
  const scenarios = appComputed.liveForecastScenarios.call({
    currentLotType: "singles",
    singlesPurchases: [
      { id: 1, item: "A", quantity: 3, cost: 5, marketValue: 0, currency: "CAD" },
      { id: 2, item: "B", quantity: 2, cost: 2, marketValue: 4, currency: "CAD" }
    ],
    singlesSoldCountByPurchaseId: {
      1: 1,
      2: 0
    },
    hasProAccess: true,
    targetProfitPercent: 10,
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    calculatePriceForUnits(_units: number, targetNetRevenue: number) {
      return targetNetRevenue + 1;
    },
    totalRevenue: 20,
    totalCaseCost: 50,
    sellingTaxPercent: 15,
    sellingShippingPerOrder: 0,
    netFromGross(grossRevenue: number) {
      return grossRevenue;
    }
  } as unknown as Parameters<typeof appComputed.liveForecastScenarios>[0]);

  assert.equal(scenarios.length, 1);
  assert.equal(scenarios[0]?.id, "singles-suggested");
  assert.equal(scenarios[0]?.units, 4);
  assert.ok(Math.abs((scenarios[0]?.unitPrice || 0) - 5.95) < 0.000001);
  const expectedSinglesNetRemaining = calculateNetFromGross(23.8, 15, 0, 4);
  assert.ok(Math.abs((scenarios[0]?.estimatedNetRemaining || 0) - expectedSinglesNetRemaining) < 0.000001);
  assert.ok(Math.abs((scenarios[0]?.forecastProfit || 0) - ((20 + expectedSinglesNetRemaining) - 50)) < 0.000001);
});

test("bestLiveForecastScenario returns null on empty and highest-profit scenario otherwise", () => {
  const none = appComputed.bestLiveForecastScenario.call({
    liveForecastScenarios: []
  } as unknown as Parameters<typeof appComputed.bestLiveForecastScenario>[0]);
  assert.equal(none, null);

  const best = appComputed.bestLiveForecastScenario.call({
    liveForecastScenarios: [
      {
        id: "item",
        label: "Item live price",
        unitLabel: "item",
        units: 1,
        unitPrice: 1,
        estimatedNetRemaining: 1,
        forecastRevenue: 1,
        forecastProfit: -10,
        forecastMarginPercent: -5
      },
      {
        id: "box",
        label: "Box live price",
        unitLabel: "box",
        units: 1,
        unitPrice: 1,
        estimatedNetRemaining: 1,
        forecastRevenue: 1,
        forecastProfit: 20,
        forecastMarginPercent: 10
      }
    ]
  } as unknown as Parameters<typeof appComputed.bestLiveForecastScenario>[0]);
  assert.equal(best?.id, "box");
});

test("portfolioForecastScenarios aggregates forecast across selected lots", () => {
  const scenarios = appComputed.portfolioForecastScenarios.call({
    lots: [
      {
        id: 1,
        name: "Lot A",
        lotType: "bulk",
        boxPriceCost: 100,
        boxesPurchased: 2,
        packsPerBox: 10,
        spotsPerBox: 5,
        costInputMode: "perBox",
        currency: "CAD",
        sellingCurrency: "CAD",
        exchangeRate: 1.4,
        purchaseDate: "2026-02-01",
        purchaseShippingCost: 0,
        purchaseTaxPercent: 0,
        sellingTaxPercent: 0,
        sellingShippingPerOrder: 0,
        includeTax: false,
        spotPrice: 4,
        boxPriceSell: 90,
        packPrice: 10,
        targetProfitPercent: 15
      },
      {
        id: 2,
        name: "Lot B",
        lotType: "bulk",
        boxPriceCost: 100,
        boxesPurchased: 1,
        packsPerBox: 5,
        spotsPerBox: 8,
        costInputMode: "perBox",
        currency: "CAD",
        sellingCurrency: "CAD",
        exchangeRate: 1.4,
        purchaseDate: "2026-02-01",
        purchaseShippingCost: 0,
        purchaseTaxPercent: 0,
        sellingTaxPercent: 0,
        sellingShippingPerOrder: 0,
        includeTax: false,
        spotPrice: 3,
        boxPriceSell: 50,
        packPrice: 20,
        targetProfitPercent: 15
      }
    ],
    portfolioSelectedLotIds: [1, 2],
    allLotPerformance: [
      {
        lotId: 1,
        lotName: "Lot A",
        lotType: "Bulk",
        salesCount: 1,
        totalRevenue: 100,
        totalCost: 200,
        totalProfit: -100,
        marginPercent: null,
        soldPacks: 5,
        totalPacks: 20,
        lastSaleDate: null
      },
      {
        lotId: 2,
        lotName: "Lot B",
        lotType: "Bulk",
        salesCount: 1,
        totalRevenue: 50,
        totalCost: 100,
        totalProfit: -50,
        marginPercent: null,
        soldPacks: 0,
        totalPacks: 10,
        lastSaleDate: null
      }
    ],
    currentLotId: 1,
    livePackPrice: 12,
    liveBoxPriceSell: 100,
    liveSpotPrice: 6,
    hasProAccess: true
  } as unknown as Parameters<typeof appComputed.portfolioForecastScenarios>[0]);

  const item = scenarios.find((scenario) => scenario.id === "item");
  const box = scenarios.find((scenario) => scenario.id === "box");
  const rtyh = scenarios.find((scenario) => scenario.id === "rtyh");

  assert.equal(item?.units, 25);
  assert.ok(Math.abs((item?.unitPrice || 0) - 15.2) < 0.000001);
  assert.equal(Math.round(item?.forecastProfit || 0), 181);

  assert.ok(Math.abs((box?.units || 0) - 3.5) < 0.000001);
  assert.equal(Math.round(box?.forecastProfit || 0), 72);

  assert.ok(Math.abs((rtyh?.units || 0) - 15.5) < 0.000001);
  assert.equal(Math.round(rtyh?.forecastProfit || 0), -93);
});

test("bestPortfolioForecastScenario returns highest aggregated forecast", () => {
  const best = appComputed.bestPortfolioForecastScenario.call({
    portfolioForecastScenarios: [
      {
        id: "item",
        label: "Item",
        unitLabel: "item",
        units: 10,
        unitPrice: 2,
        estimatedNetRemaining: 20,
        forecastRevenue: 100,
        forecastProfit: 50,
        forecastMarginPercent: 10
      },
      {
        id: "box",
        label: "Box",
        unitLabel: "box",
        units: 4,
        unitPrice: 10,
        estimatedNetRemaining: 40,
        forecastRevenue: 120,
        forecastProfit: 70,
        forecastMarginPercent: 14
      }
    ]
  } as unknown as Parameters<typeof appComputed.bestPortfolioForecastScenario>[0]);

  assert.equal(best?.id, "box");
});

test("averagePortfolioForecastScenario returns mean forecast across selling modes", () => {
  const average = appComputed.averagePortfolioForecastScenario.call({
    portfolioForecastScenarios: [
      {
        id: "item",
        label: "Item",
        unitLabel: "item",
        units: 10,
        unitPrice: 2,
        estimatedNetRemaining: 20,
        forecastRevenue: 140,
        forecastProfit: 40,
        forecastMarginPercent: 20
      },
      {
        id: "box",
        label: "Box",
        unitLabel: "box",
        units: 4,
        unitPrice: 10,
        estimatedNetRemaining: 40,
        forecastRevenue: 120,
        forecastProfit: 20,
        forecastMarginPercent: 10
      },
      {
        id: "rtyh",
        label: "RTYH",
        unitLabel: "spot",
        units: 8,
        unitPrice: 5,
        estimatedNetRemaining: 30,
        forecastRevenue: 90,
        forecastProfit: -10,
        forecastMarginPercent: -5
      }
    ],
    portfolioTotals: {
      totalCost: 200
    }
  } as unknown as Parameters<typeof appComputed.averagePortfolioForecastScenario>[0]);

  assert.equal(average?.modeCount, 3);
  assert.ok(Math.abs((average?.forecastRevenue || 0) - 116.6666667) < 0.0001);
  assert.ok(Math.abs((average?.forecastProfit || 0) - 16.6666667) < 0.0001);
  assert.ok(Math.abs((average?.forecastMarginPercent || 0) - 8.3333333) < 0.0001);
});

test("allLotPerformance uses in-memory sales for active preset before storage sync", () => {
  const activePreset: Lot = {
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

  const otherPreset: Lot = {
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
    lots: [activePreset, otherPreset],
    currentLotId: activePreset.id,
    sales: activeInMemorySales,
    loadSalesForLotId(lotId: number): Sale[] {
      if (lotId === activePreset.id) return [];
      if (lotId === otherPreset.id) return otherStoredSales;
      return [];
    }
  } as unknown as Parameters<typeof appComputed.allLotPerformance>[0];

  const rows = appComputed.allLotPerformance.call(context);
  const activeRow = rows.find((row) => row.lotId === activePreset.id);
  const otherRow = rows.find((row) => row.lotId === otherPreset.id);

  assert.equal(activeRow?.salesCount, 1);
  assert.equal(otherRow?.salesCount, 1);
  assert.equal(typeof activeRow?.forecastProfitAverage, "number");
  assert.equal(typeof activeRow?.forecastScenarioCount, "number");
});

test("portfolioSelectedLotIds defaults to all lots when filter is empty", () => {
  const ids = appComputed.portfolioSelectedLotIds.call({
    lots: [{ id: 11 }, { id: 22 }, { id: 33 }],
    portfolioLotFilterIds: [],
    portfolioLotTypeFilter: "both"
  } as unknown as Parameters<typeof appComputed.portfolioSelectedLotIds>[0]);

  assert.deepEqual(ids, [11, 22, 33]);
});

test("portfolioSelectedLotIds applies type scope without dropping saved lot ids", () => {
  const ids = appComputed.portfolioSelectedLotIds.call({
    lots: [
      { id: 11, lotType: "bulk" },
      { id: 22, lotType: "singles" },
      { id: 33, lotType: "singles" }
    ],
    portfolioLotFilterIds: [11, 22],
    portfolioLotTypeFilter: "singles"
  } as unknown as Parameters<typeof appComputed.portfolioSelectedLotIds>[0]);

  assert.deepEqual(ids, [22]);
});

test("mounted restores persisted portfolio lot type filter", () => {
  withMockedLocalStorage((_storage, data) => {
    data.set("whatfees_portfolio_filter_type", "bulk");

    const context = {
      lots: [] as Lot[],
      currentLotId: null,
      portfolioLotFilterIds: [] as number[],
      portfolioLotTypeFilter: "both" as const,
      currentTab: "config",
      loadLotsFromStorage() {
        this.lots = [];
      },
      loadLot() {
        // noop
      },
      getExchangeRate() {
        // noop
      },
      loadSalesFromStorage() {
        // noop
      },
      syncLivePricesFromDefaults() {
        // noop
      },
      initGoogleAutoLogin() {
        // noop
      },
      debugLogEntitlement() {
        return Promise.resolve();
      },
      startCloudSyncScheduler() {
        // noop
      },
      unregisterServiceWorkersForDev() {
        return Promise.resolve();
      },
      setupPwaUiHandlers() {
        // noop
      },
      registerServiceWorker() {
        // noop
      }
    } as unknown as Parameters<typeof appLifecycle.mounted>[0];

    appLifecycle.mounted.call(context);

    assert.equal(context.portfolioLotTypeFilter, "bulk");
  });
});

test("allLotPerformance applies portfolio preset filter", () => {
  const presetA: Lot = {
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
  const presetB: Lot = { ...presetA, id: 302, name: "B" };

  const context = {
    lots: [presetA, presetB],
    portfolioSelectedLotIds: [presetA.id],
    currentLotId: presetA.id,
    sales: [],
    loadSalesForLotId(): Sale[] {
      return [];
    }
  } as unknown as Parameters<typeof appComputed.allLotPerformance>[0];

  const rows = appComputed.allLotPerformance.call(context);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.lotId, presetA.id);
});

