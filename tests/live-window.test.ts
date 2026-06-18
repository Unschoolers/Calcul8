import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test, vi } from "vitest";
import { liveWindowDefinition } from "../src/components/windows/live/LiveWindow.definition.ts";

test("LiveWindow keeps bulk pricing cards stacked until desktop", () => {
  const template = readFileSync("src/components/windows/live/LiveWindow.html", "utf8");
  const css = readFileSync("src/components/windows/live/LiveWindow.css", "utf8");
  const phoneBlockStart = css.indexOf("@media (max-width: 600px)");
  const desktopBlockStart = css.indexOf("@media (min-width: 1280px)");
  const phoneBlock = css.slice(phoneBlockStart, desktopBlockStart);

  assert.equal((template.match(/<v-col cols="12" lg="4" class="live-pricing-grid__col">/g) ?? []).length, 3);
  assert.equal((template.match(/:target-profit-percent="targetProfitPercent"/g) ?? []).length, 3);
  assert.doesNotMatch(template, /md="6"/);
  assert.match(css, /\.live-pricing-card__target-summary\s*{[\s\S]*min-height:\s*0/);
  assert.match(css, /\.live-pricing-card__scenario-grid\s*{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.live-pricing-card\s*{[\s\S]*display:\s*flex[\s\S]*flex-direction:\s*column/);
  assert.match(css, /\.live-pricing-card__body\s*{[\s\S]*flex:\s*1 1 auto/);
  assert.doesNotMatch(css, /\.live-pricing-card__body\s*{[\s\S]*height:\s*100%/);
  assert.match(css, /@media \(min-width:\s*1280px\)[\s\S]*\.live-window-shell\s*{[\s\S]*padding-top:\s*var\(--app-dashboard-desktop-gap\)/);
  assert.match(css, /@media \(min-width:\s*1280px\)[\s\S]*\.live-window-shell\s*{[\s\S]*min-height:\s*clamp\(26rem,\s*calc\(100dvh - var\(--app-bottom-nav-height\) - 13rem\),\s*42rem\)/);
  assert.match(css, /@media \(min-width:\s*1280px\)[\s\S]*\.live-window-shell\s*{[\s\S]*display:\s*flex[\s\S]*flex-direction:\s*column/);
  assert.match(css, /@media \(min-width:\s*1280px\)[\s\S]*\.live-pricing-grid\s*{[\s\S]*flex:\s*1 1 auto[\s\S]*align-items:\s*stretch/);
  assert.match(css, /@media \(min-width:\s*1280px\)[\s\S]*\.live-pricing-grid__col > \*\s*{[\s\S]*flex:\s*1 1 auto/);
  assert.match(css, /@media \(min-width:\s*1280px\)[\s\S]*\.live-pricing-card__body\s*{[\s\S]*justify-content:\s*space-between/);
  assert.match(css, /@media \(min-width:\s*1280px\)[\s\S]*\.live-pricing-card__target-summary\s*{[\s\S]*justify-content:\s*center/);
  assert.doesNotMatch(css, /@media \(min-width:\s*1280px\)[\s\S]*\.live-pricing-card__target-summary\s*{[\s\S]*flex:\s*1 1 auto/);
  assert.doesNotMatch(css, /@media \(min-width:\s*1280px\)[\s\S]*\.live-pricing-card__target-summary\s*{[\s\S]*min-height:\s*118px/);
  assert.doesNotMatch(css, /@media \(max-width:\s*959px\)[\s\S]*\.live-pricing-card__scenario-grid/);
  assert.doesNotMatch(phoneBlock, /\.live-pricing-card__target-summary/);
  assert.doesNotMatch(css, /@media \(min-width:\s*960px\)[\s\S]*\.live-pricing-grid/);
});

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

