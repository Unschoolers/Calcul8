import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBoxPriceCostCad,
  calculateDefaultSellingPrices,
  calculateNetFromGross,
  calculatePriceForUnits,
  calculateProfitForListing,
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
import type { Sale } from "../src/types/app.ts";

test("calculateBoxPriceCostCad handles CAD and USD", () => {
  assert.equal(calculateBoxPriceCostCad(100, "CAD", 1.4, 1.4), 100);
  assert.equal(calculateBoxPriceCostCad(100, "USD", 1.4, 1.4), 140);
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
    const sales: Sale[] = [];

    salesMethods.saveSale.call({
      canUsePaidActions: true,
      packsPerBox: scenario.packsPerBox,
      editingSale: null,
      sales,
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
    } as unknown as Parameters<typeof salesMethods.saveSale>[0]);

    assert.equal(sales.length, 1);
    assert.equal(sales[0]?.packsCount, scenario.draft.expectedPacks);
    assert.equal(sales[0]?.buyerShipping, 5);
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
