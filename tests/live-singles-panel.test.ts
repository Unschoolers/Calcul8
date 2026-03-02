import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { LiveSinglesPanel } from "../src/components/windows/live/LiveSinglesPanel.ts";
import { STORAGE_KEYS } from "../src/app-core/storageKeys.ts";
import type { SinglesPurchaseEntry } from "../src/types/app.ts";

type PanelCtx = Record<string, unknown> & {
  safeFixed: (value: number | null | undefined, decimals?: number) => string;
  addLiveSinglesSelection: ReturnType<typeof vi.fn>;
  removeLiveSinglesSelection: ReturnType<typeof vi.fn>;
  clearLiveSinglesSelection: ReturnType<typeof vi.fn>;
  netFromGross: (gross: number, shipping: number, units: number) => number;
  calculatePriceForUnits: (units: number, netRevenue: number) => number;
  getSuggestedIndividualPrice: (entry: SinglesPurchaseEntry) => number;
};

function getMethod<T extends (...args: never[]) => unknown>(name: string): T {
  return (LiveSinglesPanel.methods as Record<string, unknown>)[name] as T;
}

function getComputed<T>(name: string): (this: PanelCtx) => T {
  return (LiveSinglesPanel.computed as Record<string, unknown>)[name] as (this: PanelCtx) => T;
}

function entry(overrides: Partial<SinglesPurchaseEntry> = {}): SinglesPurchaseEntry {
  return {
    id: 1,
    item: "Card",
    cardNumber: "",
    cost: 0,
    currency: "CAD",
    quantity: 1,
    marketValue: 0,
    ...overrides
  };
}

function createContext(overrides: Partial<PanelCtx> = {}): PanelCtx {
  const dataState = (LiveSinglesPanel.data as () => Record<string, unknown>).call({});
  const context: PanelCtx = {
    ...dataState,
    currentLotType: "singles",
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    targetProfitPercent: 10,
    sellingShippingPerOrder: 0,
    singlesPurchases: [],
    singlesSoldCountByPurchaseId: {},
    effectiveLiveSinglesIds: [],
    effectiveLiveSinglesEntries: [],
    safeFixed: (value, decimals = 2) => Number(value ?? 0).toFixed(decimals),
    addLiveSinglesSelection: vi.fn(),
    removeLiveSinglesSelection: vi.fn(),
    clearLiveSinglesSelection: vi.fn(),
    netFromGross: (gross) => gross,
    calculatePriceForUnits: (_units, netRevenue) => netRevenue,
    getSuggestedIndividualPrice: () => 0
  };

  for (const [name, method] of Object.entries(LiveSinglesPanel.methods as Record<string, unknown>)) {
    if (typeof method === "function") {
      context[name] = (method as (...args: unknown[]) => unknown).bind(context);
    }
  }

  Object.assign(context, overrides);

  for (const [name, computed] of Object.entries(LiveSinglesPanel.computed as Record<string, unknown>)) {
    if (Object.prototype.hasOwnProperty.call(context, name)) continue;
    if (typeof computed !== "function") continue;
    Object.defineProperty(context, name, {
      get: () => (computed as (this: PanelCtx) => unknown).call(context),
      configurable: true
    });
  }

  return context;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("live singles autocomplete filters stock and sorts by title", () => {
  const context = createContext({
    effectiveLiveSinglesIds: [2],
    singlesSoldCountByPurchaseId: { 2: 1, 3: 2 },
    singlesPurchases: [
      entry({ id: 1, item: "Zed", cardNumber: "10", quantity: 1 }),
      entry({ id: 2, item: "alpha", cardNumber: "2", quantity: 1 }),
      entry({ id: 3, item: "Beta", quantity: 2 })
    ]
  });

  const items = getComputed<Array<{ title: string; value: number; subtitle: string }>>(
    "liveSinglesAutocompleteItems"
  ).call(context);

  assert.deepEqual(items.map((item) => item.value), [2, 1]);
  assert.equal(items[0]?.subtitle, "0/1 in stock");
  assert.equal(items[1]?.title, "Zed #10");
});

test("bundle metrics and allocations are derived from selected entries", () => {
  const context = createContext({
    effectiveLiveSinglesIds: [1, 2],
    effectiveLiveSinglesEntries: [
      entry({ id: 1, marketValue: 10, cost: 2 }),
      entry({ id: 2, marketValue: 0, cost: 5 })
    ],
    liveSinglesBundlePrice: undefined,
    targetProfitPercent: 20,
    calculatePriceForUnits: (_units, netRevenue) => netRevenue + 1,
    netFromGross: (gross) => gross - 2
  });

  assert.equal(getComputed<number>("liveSinglesBasisTotal").call(context), 15);
  assert.equal(getComputed<number>("liveSinglesSuggestedBundlePrice").call(context), 19);
  assert.equal(getComputed<number>("liveSinglesEffectiveBundlePrice").call(context), 19);
  assert.equal(getComputed<number>("liveSinglesBundleProfit").call(context), 2);
  assert.equal(Math.round(getComputed<number>("liveSinglesBundleProfitPercent").call(context) * 10) / 10, 13.3);

  const allocations = getComputed<Array<{ id: number; share: number; percent: number }>>(
    "liveSinglesBundleAllocations"
  ).call(context);
  assert.equal(allocations.length, 2);
  assert.equal(allocations[0]?.id, 1);
  assert.equal(allocations[0]?.share, 12.67);
  assert.equal(allocations[1]?.share, 6.33);
});

test("syncLiveSinglesPricingState prunes stale prices and seeds suggested values", () => {
  const context = createContext({
    effectiveLiveSinglesIds: [1, 2],
    effectiveLiveSinglesEntries: [entry({ id: 1 }), entry({ id: 2 })],
    liveSinglesIndividualPrices: { 1: 5, 2: -1, 3: 7 },
    getSuggestedIndividualPrice: (selectedEntry) => selectedEntry.id * 10,
    liveSinglesSuggestedBundlePrice: 33
  });

  getMethod<(this: PanelCtx) => void>("syncLiveSinglesPricingState").call(context);
  assert.deepEqual(context.liveSinglesIndividualPrices, { 1: 5, 2: 20 });
  assert.equal(context.liveSinglesBundleSelectionKey, "1,2");
  assert.equal(context.liveSinglesBundlePrice, 33);

  context.liveSinglesBundlePrice = Number.NaN;
  getMethod<(this: PanelCtx) => void>("syncLiveSinglesPricingState").call(context);
  assert.equal(context.liveSinglesBundlePrice, 33);

  context.effectiveLiveSinglesIds = [];
  context.effectiveLiveSinglesEntries = [];
  getMethod<(this: PanelCtx) => void>("syncLiveSinglesPricingState").call(context);
  assert.deepEqual(context.liveSinglesIndividualPrices, {});
  assert.equal(context.liveSinglesBundlePrice, null);
  assert.equal(context.liveSinglesBundleSelectionKey, "");
});

test("individual and bundle price mutators update values and selection state", () => {
  const context = createContext({
    effectiveLiveSinglesEntries: [entry({ id: 5, marketValue: 7 })],
    liveSinglesBundlePrice: undefined,
    liveSinglesSuggestedBundlePrice: 12.4,
    getSuggestedIndividualPrice: () => 7
  });

  const getIndividualPrice = getMethod<(this: PanelCtx, selectedEntry: SinglesPurchaseEntry) => number>("getIndividualPrice");
  assert.equal(getIndividualPrice.call(context, entry({ id: 5 })), 7);

  getMethod<(this: PanelCtx, entryId: number, value: unknown) => void>("onIndividualPriceInput").call(context, 5, "4.236");
  assert.equal((context.liveSinglesIndividualPrices as Record<number, number>)[5], 4.24);

  getMethod<(this: PanelCtx, entryId: number, direction: -1 | 1) => void>("adjustIndividualPrice").call(context, 5, 1);
  assert.equal((context.liveSinglesIndividualPrices as Record<number, number>)[5], 5.24);

  getMethod<(this: PanelCtx, direction: -1 | 1) => void>("adjustBundlePrice").call(context, 1);
  assert.equal(context.liveSinglesBundlePrice, 13.4);

  context.liveSinglesSelectedId = 7;
  getMethod<(this: PanelCtx) => void>("addLiveSinglesFromPicker").call(context);
  assert.deepEqual(context.addLiveSinglesSelection.mock.calls[0], [7, "manual"]);
  assert.equal(context.liveSinglesSelectedId, null);

  getMethod<(this: PanelCtx, entryId: number) => void>("removeLiveSinglesEntry").call(context, 7);
  assert.deepEqual(context.removeLiveSinglesSelection.mock.calls[0], [7, "manual"]);
  assert.deepEqual(context.removeLiveSinglesSelection.mock.calls[1], [7, "external"]);

  getMethod<(this: PanelCtx) => void>("clearLiveSinglesEntries").call(context);
  assert.equal(context.clearLiveSinglesSelection.mock.calls.length, 1);
  assert.deepEqual(context.liveSinglesIndividualPrices, {});
  assert.equal(context.liveSinglesBundlePrice, null);
});

test("apply/reset pricing and storage hooks behave as expected", () => {
  const getItemMock = vi.fn(() => "bundle");
  const setItemMock = vi.fn();
  vi.stubGlobal("localStorage", {
    getItem: getItemMock,
    setItem: setItemMock
  });

  const context = createContext({
    effectiveLiveSinglesEntries: [entry({ id: 1 }), entry({ id: 2 })],
    getSuggestedIndividualPrice: (selectedEntry) => selectedEntry.id + 0.5,
    liveSinglesSuggestedBundlePrice: 55
  });

  getMethod<(this: PanelCtx) => void>("panelApplySuggestedLiveSinglesPricing").call(context);
  assert.deepEqual(context.liveSinglesIndividualPrices, { 1: 1.5, 2: 2.5 });
  assert.equal(context.liveSinglesBundleSelectionKey, "1,2");
  assert.equal(context.liveSinglesBundlePrice, 55);

  context.liveSinglesIndividualPrices = { 1: 99 };
  getMethod<(this: PanelCtx) => void>("panelResetLiveSinglesPricing").call(context);
  assert.deepEqual(context.liveSinglesIndividualPrices, { 1: 1.5, 2: 2.5 });

  getMethod<(this: PanelCtx) => void>("loadLiveSinglesModeFromStorage").call(context);
  assert.equal(context.liveSinglesPricingMode, "bundle");

  context.liveSinglesPricingMode = "individual";
  getMethod<(this: PanelCtx) => void>("persistLiveSinglesMode").call(context);
  assert.deepEqual(setItemMock.mock.calls[0], [STORAGE_KEYS.LIVE_SINGLES_MODE, "individual"]);

  const idsWatcher = (LiveSinglesPanel.watch as Record<string, { handler: (this: PanelCtx) => void }>).effectiveLiveSinglesIds.handler;
  context.syncLiveSinglesPricingState = vi.fn();
  idsWatcher.call(context);
  assert.equal((context.syncLiveSinglesPricingState as ReturnType<typeof vi.fn>).mock.calls.length, 1);

  const modeWatcher = (LiveSinglesPanel.watch as Record<string, ((this: PanelCtx) => void) | { handler: (this: PanelCtx) => void }>).liveSinglesPricingMode as (this: PanelCtx) => void;
  context.persistLiveSinglesMode = vi.fn();
  modeWatcher.call(context);
  assert.equal((context.persistLiveSinglesMode as ReturnType<typeof vi.fn>).mock.calls.length, 1);

  context.loadLiveSinglesModeFromStorage = vi.fn();
  (LiveSinglesPanel.mounted as (this: PanelCtx) => void).call(context);
  assert.equal((context.loadLiveSinglesModeFromStorage as ReturnType<typeof vi.fn>).mock.calls.length, 1);
});
