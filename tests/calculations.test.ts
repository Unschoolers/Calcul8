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
