import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { liveSinglesMethods } from "../src/app-core/methods/live-singles.ts";

type LiveSinglesMethodsContext = {
  liveSinglesManualIds: number[];
  liveSinglesExternalIds: number[];
  currentLotType: "bulk" | "singles";
  effectiveLiveSinglesIds: number[];
  notify: ReturnType<typeof vi.fn>;
  $refs?: Record<string, unknown>;
  setLiveSinglesSelection: typeof liveSinglesMethods.setLiveSinglesSelection;
};

function createContext(overrides: Partial<LiveSinglesMethodsContext> = {}): LiveSinglesMethodsContext {
  const context: LiveSinglesMethodsContext = {
    liveSinglesManualIds: [],
    liveSinglesExternalIds: [],
    currentLotType: "singles",
    effectiveLiveSinglesIds: [],
    notify: vi.fn(),
    setLiveSinglesSelection: liveSinglesMethods.setLiveSinglesSelection,
    ...overrides
  };
  return context;
}

test("live singles selection methods normalize ids and apply source/mode behavior", () => {
  const context = createContext({
    liveSinglesManualIds: [7],
    liveSinglesExternalIds: [3]
  });

  liveSinglesMethods.setLiveSinglesSelection.call(context as never, [1, "2" as never, 2.9, -5, 0, Number.NaN, 1]);
  assert.deepEqual(context.liveSinglesManualIds, [1, 2]);

  liveSinglesMethods.setLiveSinglesSelection.call(context as never, [3, 4, 4, 5.7], {
    source: "external",
    mode: "merge"
  });
  assert.deepEqual(context.liveSinglesExternalIds, [3, 4, 5]);

  liveSinglesMethods.addLiveSinglesSelection.call(context as never, 6);
  assert.deepEqual(context.liveSinglesManualIds, [1, 2, 6]);

  liveSinglesMethods.removeLiveSinglesSelection.call(context as never, Number.NaN);
  assert.deepEqual(context.liveSinglesManualIds, [1, 2, 6]);

  liveSinglesMethods.removeLiveSinglesSelection.call(context as never, 2, "manual");
  assert.deepEqual(context.liveSinglesManualIds, [1, 6]);

  liveSinglesMethods.removeLiveSinglesSelection.call(context as never, 4, "external");
  assert.deepEqual(context.liveSinglesExternalIds, [3, 5]);

  liveSinglesMethods.clearLiveSinglesSelection.call(context as never, "manual");
  assert.deepEqual(context.liveSinglesManualIds, []);
  assert.deepEqual(context.liveSinglesExternalIds, [3, 5]);

  liveSinglesMethods.clearLiveSinglesSelection.call(context as never, "external");
  assert.deepEqual(context.liveSinglesExternalIds, []);

  context.liveSinglesManualIds = [9];
  context.liveSinglesExternalIds = [10];
  liveSinglesMethods.clearLiveSinglesSelection.call(context as never);
  assert.deepEqual(context.liveSinglesManualIds, []);
  assert.deepEqual(context.liveSinglesExternalIds, []);
});

test("applyLiveSinglesSuggestedPricing handles empty selection, missing live tab vm, and delegated action", () => {
  const context = createContext({
    currentLotType: "bulk",
    effectiveLiveSinglesIds: [1]
  });

  liveSinglesMethods.applyLiveSinglesSuggestedPricing.call(context as never);
  assert.equal(context.notify.mock.calls.length, 0);

  context.currentLotType = "singles";
  context.effectiveLiveSinglesIds = [];
  liveSinglesMethods.applyLiveSinglesSuggestedPricing.call(context as never);
  assert.equal(context.notify.mock.calls.length, 0);

  context.notify.mockClear();
  context.effectiveLiveSinglesIds = [1, 2];
  liveSinglesMethods.applyLiveSinglesSuggestedPricing.call(context as never);
  assert.deepEqual(context.notify.mock.calls[0], ["Open the Live tab to auto-calculate singles prices", "info"]);

  const applySinglesAutoPricing = vi.fn();
  const liveWindowVm = { applySinglesAutoPricing };
  context.$refs = { liveWindow: liveWindowVm };
  context.notify.mockClear();
  liveSinglesMethods.applyLiveSinglesSuggestedPricing.call(context as never);
  assert.equal(applySinglesAutoPricing.mock.calls.length, 1);
  assert.equal(applySinglesAutoPricing.mock.contexts[0], liveWindowVm);
  assert.deepEqual(context.notify.mock.calls[0], ["Live singles prices auto-calculated from target profit", "success"]);
});

test("resetLiveSinglesPricing handles current tab state and fallback notifications", () => {
  const context = createContext({
    currentLotType: "bulk"
  });

  liveSinglesMethods.resetLiveSinglesPricing.call(context as never);
  assert.equal(context.notify.mock.calls.length, 0);

  context.currentLotType = "singles";
  liveSinglesMethods.resetLiveSinglesPricing.call(context as never);
  assert.deepEqual(context.notify.mock.calls[0], ["Open the Live tab to reset singles prices", "info"]);

  const resetSinglesPricing = vi.fn();
  const liveWindowVm = { resetSinglesPricing };
  context.$refs = { liveWindow: liveWindowVm };
  context.notify.mockClear();
  liveSinglesMethods.resetLiveSinglesPricing.call(context as never);
  assert.equal(resetSinglesPricing.mock.calls.length, 1);
  assert.equal(resetSinglesPricing.mock.contexts[0], liveWindowVm);
  assert.deepEqual(context.notify.mock.calls[0], ["Live singles prices reset to suggested values", "info"]);
});
