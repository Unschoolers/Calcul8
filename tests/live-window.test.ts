import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { LiveWindow } from "../src/components/windows/LiveWindow.ts";

test("LiveWindow getLiveSinglesPanelVm returns panel instance when ref exists", () => {
  const panel = { foo: "bar" };
  const vm = { $refs: { liveSinglesPanel: panel } };
  const resolved = LiveWindow.methods.getLiveSinglesPanelVm.call(vm as never);
  assert.equal(resolved, panel);
});

test("LiveWindow getLiveSinglesPanelVm returns null when missing or invalid ref", () => {
  assert.equal(LiveWindow.methods.getLiveSinglesPanelVm.call({} as never), null);
  assert.equal(LiveWindow.methods.getLiveSinglesPanelVm.call({ $refs: { liveSinglesPanel: 42 } } as never), null);
});

test("LiveWindow applySinglesAutoPricing delegates to panel method when present", () => {
  const panelApply = vi.fn();
  const panel = {
    panelApplySuggestedLiveSinglesPricing: panelApply
  };
  const vm = {
    $refs: { liveSinglesPanel: panel },
    getLiveSinglesPanelVm: LiveWindow.methods.getLiveSinglesPanelVm
  };

  LiveWindow.methods.applySinglesAutoPricing.call(vm as never);
  assert.equal(panelApply.mock.calls.length, 1);
  assert.equal(panelApply.mock.contexts[0], panel);
});

test("LiveWindow resetSinglesPricing delegates to panel reset method when present", () => {
  const panelReset = vi.fn();
  const panel = {
    panelResetLiveSinglesPricing: panelReset
  };
  const vm = {
    $refs: { liveSinglesPanel: panel },
    getLiveSinglesPanelVm: LiveWindow.methods.getLiveSinglesPanelVm
  };

  LiveWindow.methods.resetSinglesPricing.call(vm as never);
  assert.equal(panelReset.mock.calls.length, 1);
  assert.equal(panelReset.mock.contexts[0], panel);
});

test("LiveWindow panel methods no-op safely when panel methods are missing", () => {
  const vm = {
    $refs: { liveSinglesPanel: {} },
    getLiveSinglesPanelVm: LiveWindow.methods.getLiveSinglesPanelVm
  };
  LiveWindow.methods.applySinglesAutoPricing.call(vm as never);
  LiveWindow.methods.resetSinglesPricing.call(vm as never);
  assert.ok(true);
});

test("LiveWindow profitForLive uses calculateProfit when available and falls back to zero", () => {
  const vm = {
    calculateProfit: (units: number, price: number) => units * price
  };
  assert.equal(LiveWindow.methods.profitForLive.call(vm as never, 2, 5), 10);
  assert.equal(LiveWindow.methods.profitForLive.call({} as never, 2, 5), 0);
});

test("LiveWindow safeFixedForLive uses safeFixed when available and has fallback formatting", () => {
  const vm = {
    safeFixed: (value: number, decimals = 2) => `fixed:${value}:${decimals}`
  };
  assert.equal(LiveWindow.methods.safeFixedForLive.call(vm as never, 12.3, 1), "fixed:12.3:1");

  assert.equal(LiveWindow.methods.safeFixedForLive.call({} as never, 12.345, 2), "12.35");
  assert.equal(LiveWindow.methods.safeFixedForLive.call({} as never, Number.NaN, 2), "0.00");
});

test("LiveWindow live scenario helpers read forecast values from scenarios", () => {
  const vm = {
    liveForecastScenarios: [
      { id: "item", forecastProfit: 123.45, forecastMarginPercent: 12.8 },
      { id: "box", forecastProfit: -20, forecastMarginPercent: -5 }
    ],
    getLiveForecastScenario: LiveWindow.methods.getLiveForecastScenario
  };

  assert.equal(LiveWindow.methods.liveScenarioProfit.call(vm as never, "item"), 123.45);
  assert.equal(LiveWindow.methods.liveScenarioPercent.call(vm as never, "item"), 12.8);
  assert.equal(LiveWindow.methods.liveScenarioProfit.call(vm as never, "rtyh"), null);
});

test("LiveWindow needed-price forecast helpers compute from remaining units", () => {
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
    getNeededPriceForMode: LiveWindow.methods.getNeededPriceForMode,
    getRemainingUnitsForMode: LiveWindow.methods.getRemainingUnitsForMode,
    liveScenarioProfitAtNeeded: LiveWindow.methods.liveScenarioProfitAtNeeded
  };

  assert.equal(LiveWindow.methods.getNeededPriceForMode.call(vm as never, "item"), 81);
  assert.equal(LiveWindow.methods.getRemainingUnitsForMode.call(vm as never, "box"), 2);
  assert.equal(LiveWindow.methods.liveScenarioProfitAtNeeded.call(vm as never, "item"), 400);
  assert.equal(LiveWindow.methods.liveScenarioPercentAtNeeded.call(vm as never, "item"), 80);
  assert.equal(LiveWindow.methods.liveScenarioProfitAtNeeded.call(vm as never, "rtyh"), null);
});
