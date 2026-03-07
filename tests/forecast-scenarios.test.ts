import assert from "node:assert/strict";
import { test } from "vitest";
import {
  createForecastScenario,
  estimateNetRemainingFromUnitPrice,
  pickBestForecastScenario
} from "../src/app-core/computed/forecast-scenarios.ts";

test("estimateNetRemainingFromUnitPrice delegates to netFromGross with derived gross and order count", () => {
  let capturedGross = -1;
  let capturedShipping = -1;
  let capturedOrders = -1;

  const estimated = estimateNetRemainingFromUnitPrice({
    units: 4,
    unitPrice: 7.5,
    shippingPerOrder: 2,
    netFromGross(grossRevenue: number, buyerShippingPerOrder?: number, orderCount?: number) {
      capturedGross = grossRevenue;
      capturedShipping = buyerShippingPerOrder ?? -1;
      capturedOrders = orderCount ?? -1;
      return grossRevenue - 3;
    }
  });

  assert.equal(capturedGross, 30);
  assert.equal(capturedShipping, 2);
  assert.equal(capturedOrders, 4);
  assert.equal(estimated, 27);
});

test("createForecastScenario builds forecast totals and margin from base revenue/cost", () => {
  const scenario = createForecastScenario(
    { baseRevenue: 100, baseCost: 200 },
    {
      id: "item",
      label: "Item live price",
      unitLabel: "item",
      units: 10,
      unitPrice: 9,
      estimatedNetRemaining: 80
    }
  );

  assert.equal(scenario.id, "item");
  assert.equal(scenario.forecastRevenue, 180);
  assert.equal(scenario.forecastProfit, -20);
  assert.equal(scenario.forecastMarginPercent, -10);
});

test("pickBestForecastScenario returns null for empty input and highest-profit scenario otherwise", () => {
  assert.equal(pickBestForecastScenario([]), null);

  const best = pickBestForecastScenario([
    {
      id: "item",
      label: "Item",
      unitLabel: "item",
      units: 1,
      unitPrice: 1,
      estimatedNetRemaining: 1,
      forecastRevenue: 100,
      forecastProfit: 30,
      forecastMarginPercent: 10
    },
    {
      id: "box",
      label: "Box",
      unitLabel: "box",
      units: 1,
      unitPrice: 1,
      estimatedNetRemaining: 1,
      forecastRevenue: 100,
      forecastProfit: 50,
      forecastMarginPercent: 20
    }
  ]);

  assert.equal(best?.id, "box");
});
