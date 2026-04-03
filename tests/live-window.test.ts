import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { liveWindowDefinition } from "../src/components/windows/LiveWindow.definition.ts";

test("liveWindowDefinition getLiveSinglesPanelVm returns panel instance when ref exists", () => {
  const panel = { foo: "bar" };
  const vm = { $refs: { liveSinglesPanel: panel } };
  const resolved = liveWindowDefinition.methods.getLiveSinglesPanelVm.call(vm as never);
  assert.equal(resolved, panel);
});

test("liveWindowDefinition getLiveSinglesPanelVm returns null when missing or invalid ref", () => {
  assert.equal(liveWindowDefinition.methods.getLiveSinglesPanelVm.call({} as never), null);
  assert.equal(liveWindowDefinition.methods.getLiveSinglesPanelVm.call({ $refs: { liveSinglesPanel: 42 } } as never), null);
});

test("liveWindowDefinition applySinglesAutoPricing delegates to panel method when present", () => {
  const panelApply = vi.fn();
  const panel = {
    panelApplySuggestedLiveSinglesPricing: panelApply
  };
  const vm = {
    $refs: { liveSinglesPanel: panel },
    getLiveSinglesPanelVm: liveWindowDefinition.methods.getLiveSinglesPanelVm
  };

  liveWindowDefinition.methods.applySinglesAutoPricing.call(vm as never);
  assert.equal(panelApply.mock.calls.length, 1);
  assert.equal(panelApply.mock.contexts[0], panel);
});

test("liveWindowDefinition resetSinglesPricing delegates to panel reset method when present", () => {
  const panelReset = vi.fn();
  const panel = {
    panelResetLiveSinglesPricing: panelReset
  };
  const vm = {
    $refs: { liveSinglesPanel: panel },
    getLiveSinglesPanelVm: liveWindowDefinition.methods.getLiveSinglesPanelVm
  };

  liveWindowDefinition.methods.resetSinglesPricing.call(vm as never);
  assert.equal(panelReset.mock.calls.length, 1);
  assert.equal(panelReset.mock.contexts[0], panel);
});

test("liveWindowDefinition panel methods no-op safely when panel methods are missing", () => {
  const vm = {
    $refs: { liveSinglesPanel: {} },
    getLiveSinglesPanelVm: liveWindowDefinition.methods.getLiveSinglesPanelVm
  };
  liveWindowDefinition.methods.applySinglesAutoPricing.call(vm as never);
  liveWindowDefinition.methods.resetSinglesPricing.call(vm as never);
  assert.ok(true);
});

test("liveWindowDefinition profitForLive uses calculateProfit when available and falls back to zero", () => {
  const vm = {
    calculateProfit: (units: number, price: number) => units * price
  };
  assert.equal(liveWindowDefinition.methods.profitForLive.call(vm as never, 2, 5), 10);
  assert.equal(liveWindowDefinition.methods.profitForLive.call({} as never, 2, 5), 0);
});

test("liveWindowDefinition safeFixedForLive uses safeFixed when available and has fallback formatting", () => {
  const vm = {
    safeFixed: (value: number, decimals = 2) => `fixed:${value}:${decimals}`
  };
  assert.equal(liveWindowDefinition.methods.safeFixedForLive.call(vm as never, 12.3, 1), "fixed:12.3:1");

  assert.equal(liveWindowDefinition.methods.safeFixedForLive.call({} as never, 12.345, 2), "12.35");
  assert.equal(liveWindowDefinition.methods.safeFixedForLive.call({} as never, Number.NaN, 2), "0.00");
});

test("liveWindowDefinition live scenario helpers read forecast values from scenarios", () => {
  const vm = {
    liveForecastScenarios: [
      { id: "item", forecastProfit: 123.45, forecastMarginPercent: 12.8 },
      { id: "box", forecastProfit: -20, forecastMarginPercent: -5 }
    ],
    getLiveForecastScenario: liveWindowDefinition.methods.getLiveForecastScenario
  };

  assert.equal(liveWindowDefinition.methods.liveScenarioProfit.call(vm as never, "item"), 123.45);
  assert.equal(liveWindowDefinition.methods.liveScenarioPercent.call(vm as never, "item"), 12.8);
  assert.equal(liveWindowDefinition.methods.liveScenarioProfit.call(vm as never, "rtyh"), null);
});

test("liveWindowDefinition needed-price forecast helpers compute from remaining units", () => {
  const netFromGross = (gross: number, shipping = 0, orders = 1) => gross - ((shipping || 0) * (orders || 1));
  const vm = {
    requiredPackPriceFromNow: 81,
    requiredBoxPriceFromNow: 120,
    requiredSpotPriceFromNow: null,
    remainingPacksCount: 10,
    remainingBoxesEquivalent: 2,
    remainingSpotsEquivalent: 0,
    totalRevenue: 100,
    totalCaseCost: 500,
    sellingShippingPerOrder: 1,
    netFromGross,
    liveScenarioProfitAtPrice: liveWindowDefinition.methods.liveScenarioProfitAtPrice,
    liveScenarioPercentAtPrice: liveWindowDefinition.methods.liveScenarioPercentAtPrice,
    getNeededPriceForMode: liveWindowDefinition.methods.getNeededPriceForMode,
    getRemainingUnitsForMode: liveWindowDefinition.methods.getRemainingUnitsForMode,
    liveScenarioProfitAtNeeded: liveWindowDefinition.methods.liveScenarioProfitAtNeeded
  };

  assert.equal(liveWindowDefinition.methods.liveScenarioProfitAtPrice.call(vm as never, "item", 82), 410);
  assert.equal(liveWindowDefinition.methods.liveScenarioPercentAtPrice.call(vm as never, "item", 82), 82);
  assert.equal(liveWindowDefinition.methods.getNeededPriceForMode.call(vm as never, "item"), 81);
  assert.equal(liveWindowDefinition.methods.getRemainingUnitsForMode.call(vm as never, "box"), 2);
  assert.equal(liveWindowDefinition.methods.liveScenarioProfitAtNeeded.call(vm as never, "item"), 400);
  assert.equal(liveWindowDefinition.methods.liveScenarioPercentAtNeeded.call(vm as never, "item"), 80);
  assert.equal(liveWindowDefinition.methods.liveScenarioProfitAtNeeded.call(vm as never, "rtyh"), null);
});

