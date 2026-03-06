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
