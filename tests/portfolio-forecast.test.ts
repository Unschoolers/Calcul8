import assert from "node:assert/strict";
import { test } from "vitest";
import { calculatePriceForUnits } from "../src/domain/calculations.ts";
import {
  buildScenarioFromProjection,
  computeLotModeProjections,
  summarizeForecastAverage
} from "../src/app-core/computed/portfolio-forecast.ts";

test("computeLotModeProjections uses live prices for current bulk lot and returns all modes", () => {
  const projection = computeLotModeProjections({
    lot: {
      id: 1,
      lotType: "bulk",
      boxesPurchased: 2,
      packsPerBox: 10,
      spotsPerBox: 5,
      sellingTaxPercent: 0,
      sellingShippingPerOrder: 0,
      packPrice: 9,
      boxPriceSell: 40,
      spotPrice: 2,
      targetProfitPercent: 15
    },
    summary: {
      soldPacks: 5,
      totalPacks: 20,
      totalCost: 200
    },
    isCurrentLot: true,
    hasProAccess: true,
    livePackPrice: 12,
    liveBoxPriceSell: 100,
    liveSpotPrice: 6
  });

  assert.equal(projection.item?.units, 15);
  assert.equal(projection.item?.gross, 180);
  assert.equal(projection.box?.units, 1.5);
  assert.equal(projection.box?.gross, 150);
  assert.equal(projection.rtyh?.units, 7.5);
  assert.equal(projection.rtyh?.gross, 45);
});

test("computeLotModeProjections for singles only returns item mode using target pricing", () => {
  const projection = computeLotModeProjections({
    lot: {
      id: 2,
      lotType: "singles",
      boxesPurchased: 0,
      packsPerBox: 0,
      spotsPerBox: 0,
      sellingTaxPercent: 0,
      sellingShippingPerOrder: 0,
      packPrice: 0,
      boxPriceSell: 0,
      spotPrice: 0,
      targetProfitPercent: 10
    },
    summary: {
      soldPacks: 1,
      totalPacks: 5,
      totalCost: 25
    },
    isCurrentLot: false,
    hasProAccess: true,
    livePackPrice: 0,
    liveBoxPriceSell: 0,
    liveSpotPrice: 0
  });

  const expectedUnitPrice = calculatePriceForUnits(1, 5.5, 0, 0);
  assert.equal(projection.item?.units, 4);
  assert.ok(Math.abs((projection.item?.gross || 0) - (expectedUnitPrice * 4)) < 0.000001);
  assert.equal(projection.box, null);
  assert.equal(projection.rtyh, null);
});

test("buildScenarioFromProjection and summarizeForecastAverage derive forecast outputs", () => {
  const itemScenario = buildScenarioFromProjection({
    id: "item",
    label: "Item",
    unitLabel: "item",
    projection: {
      units: 10,
      gross: 90,
      estimatedNetRemaining: 80
    },
    baseRevenue: 100,
    baseCost: 200
  });
  assert.equal(itemScenario?.unitPrice, 9);
  assert.equal(itemScenario?.forecastRevenue, 180);
  assert.equal(itemScenario?.forecastProfit, -20);

  const noneScenario = buildScenarioFromProjection({
    id: "box",
    label: "Box",
    unitLabel: "box",
    projection: {
      units: 0,
      gross: 0,
      estimatedNetRemaining: 0
    },
    baseRevenue: 100,
    baseCost: 200
  });
  assert.equal(noneScenario, null);

  const summary = summarizeForecastAverage({
    projections: [
      { units: 10, gross: 90, estimatedNetRemaining: 80 },
      { units: 4, gross: 40, estimatedNetRemaining: 30 }
    ],
    baseRevenue: 100,
    baseCost: 200
  });
  assert.equal(summary.forecastScenarioCount, 2);
  assert.equal(summary.forecastRevenueAverage, 155);
  assert.equal(summary.forecastProfitAverage, -45);
});
