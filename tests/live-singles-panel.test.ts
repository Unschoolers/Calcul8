import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, test, vi } from "vitest";
import { LiveSinglesPanel } from "../src/components/windows/live/LiveSinglesPanel.ts";
import { STORAGE_KEYS } from "../src/app-core/storageKeys.ts";
import type { SinglesPurchaseEntry } from "../src/types/app.ts";

type PanelCtx = Record<string, unknown> & {
  safeFixed: (value: number | null | undefined, decimals?: number) => string;
  addLiveSinglesSelection: ReturnType<typeof vi.fn>;
  removeLiveSinglesSelection: ReturnType<typeof vi.fn>;
  clearLiveSinglesSelection: ReturnType<typeof vi.fn>;
  openConvertLiveSinglesSaleModal: ReturnType<typeof vi.fn>;
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
    openConvertLiveSinglesSaleModal: vi.fn(),
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

test("panel helper methods and aggregate computed totals cover fallback branches", () => {
  const context = createContext({
    currentLotType: "bulk",
    effectiveLiveSinglesIds: [1, 2],
    effectiveLiveSinglesEntries: [
      entry({ id: 1, cost: 10, currency: undefined, marketValue: 0 }),
      entry({ id: 2, cost: 2, currency: "CAD", marketValue: 5 })
    ],
    liveSinglesIndividualPrices: { 1: 12, 2: 7 },
    singlesSoldCountByPurchaseId: { 1: 3 },
    currency: "USD",
    sellingCurrency: "CAD",
    exchangeRate: 2,
    netFromGross: (gross) => gross - 1
  });

  assert.deepEqual(getComputed<Array<{ title: string }>>("liveSinglesAutocompleteItems").call(context), []);
  assert.equal(getComputed<number>("liveSinglesSelectedCount").call(context), 2);
  assert.equal(getComputed<number>("liveSinglesIndividualTotalPrice").call(context), 19);
  assert.equal(getComputed<number>("liveSinglesIndividualTotalProfit").call(context), -8);
  assert.equal(getComputed<number>("liveSinglesIndividualTotalProfitPercent").call(context), -32);

  assert.equal(getMethod<(this: PanelCtx, e: SinglesPurchaseEntry) => string>("getStockLabel").call(context, entry({ id: 1, quantity: 6 })), "3/6");
  assert.equal(getMethod<(this: PanelCtx, e: SinglesPurchaseEntry) => number>("getEntryCostInSellingCurrency").call(context, entry({ id: 1, cost: 10, currency: undefined })), 20);
  assert.equal(getMethod<(this: PanelCtx, e: SinglesPurchaseEntry) => number>("getIndividualProfit").call(context, entry({ id: 1, marketValue: 0, cost: 10, currency: undefined })), -9);
  assert.equal(getMethod<(this: PanelCtx, e: SinglesPurchaseEntry) => number>("getIndividualProfitPercent").call(context, entry({ id: 1, marketValue: 0, cost: 10, currency: undefined })), -45);
  assert.equal(getMethod<(this: PanelCtx, value: number | null | undefined, d?: number) => string>("fmtCurrency").call(context, 3.456, 2), "3.46");

  context.safeFixed = undefined as unknown as PanelCtx["safeFixed"];
  assert.equal(getMethod<(this: PanelCtx, value: number | null | undefined, d?: number) => string>("fmtCurrency").call(context, Number.NaN, 2), "0.00");
  assert.equal(getMethod<(this: PanelCtx, value: number | null | undefined, d?: number) => string>("fmtCurrency").call(context, 12.345, 1), "12.3");

  context.calculatePriceForUnits = undefined as unknown as PanelCtx["calculatePriceForUnits"];
  context.targetProfitPercent = 12;
  assert.equal(getMethod<(this: PanelCtx, e: SinglesPurchaseEntry) => number>("getSuggestedIndividualPrice").call(context, entry({ id: 8, marketValue: 0, cost: 10, currency: undefined })), 22.4);

  context.netFromGross = undefined as unknown as PanelCtx["netFromGross"];
  context.liveSinglesBundlePrice = 25;
  assert.equal(getComputed<number>("liveSinglesBundleProfit").call(context), 0);
  assert.equal(getMethod<(this: PanelCtx, e: SinglesPurchaseEntry) => number>("getIndividualProfit").call(context, entry({ id: 2, marketValue: 5, cost: 2 })), 2);

  context.effectiveLiveSinglesIds = undefined as unknown as PanelCtx["effectiveLiveSinglesIds"];
  getMethod<(this: PanelCtx) => void>("syncLiveSinglesPricingState").call(context);
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

test("live singles autocomplete can search by card number with the same picker fields", () => {
  const context = createContext({
    liveSinglesSearchText: "eva-017",
    singlesPurchases: [
      entry({ id: 1, item: "Mari Makinami Illustrious", cardNumber: "UE15BT/EVA-1-017-ALT1", image: "https://example.com/mari.webp", marketValue: 15 }),
      entry({ id: 2, item: "Goreinu", cardNumber: "UEX04BT/HTR-2-013-ALT1", marketValue: 1 })
    ]
  });

  const items = getComputed<Array<{ value: number; name: string; cardNumber: string; image: string }>>(
    "liveSinglesAutocompleteItems"
  ).call(context);

  assert.equal(items.length, 1);
  assert.equal(items[0]?.value, 1);
  assert.equal(items[0]?.name, "Mari Makinami Illustrious");
  assert.equal(items[0]?.cardNumber, "UE15BT/EVA-1-017-ALT1");
  assert.equal(items[0]?.image, "https://example.com/mari.webp");
});

test("live singles autocomplete template renders normalized item fallbacks", async () => {
  const template = await readFile("src/components/windows/live/LiveSinglesPanel.html", "utf8");

  assert.match(template, /resolveVuetifySlotString\(item, \['name', 'title', 'item'\]\)/);
  assert.match(template, /resolveVuetifySlotString\(item, \['image'\]\)/);
  assert.match(template, /entry\.image/);
  assert.match(template, /live-singles-item-media/);
  assert.match(template, /openLiveSinglesImagePreview\(entry\)/);
  assert.match(template, /mdi-magnify-plus-outline/);
  assert.doesNotMatch(template, /item\??\.raw\??\./);
});

test("live singles image preview opens and closes for selected cards", () => {
  const context = createContext();
  const openPreview = getMethod<(this: PanelCtx, entry: SinglesPurchaseEntry) => void>("openLiveSinglesImagePreview");
  const closePreview = getMethod<(this: PanelCtx) => void>("closeLiveSinglesImagePreview");

  openPreview.call(context, entry({ image: "" }));
  assert.equal(context.liveSinglesImagePreviewOpen, false);
  assert.equal(context.liveSinglesImagePreviewSrc, "");

  openPreview.call(context, entry({ item: "Asuka", image: " https://img.test/asuka.webp " }));
  assert.equal(context.liveSinglesImagePreviewOpen, true);
  assert.equal(context.liveSinglesImagePreviewSrc, "https://img.test/asuka.webp");
  assert.equal(context.liveSinglesImagePreviewTitle, "Asuka");

  closePreview.call(context);
  assert.equal(context.liveSinglesImagePreviewOpen, false);
  assert.equal(context.liveSinglesImagePreviewSrc, "");
  assert.equal(context.liveSinglesImagePreviewTitle, "");
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
    liveSinglesQuantities: { 1: 3, 2: 0, 3: 9 },
    liveSinglesIndividualPrices: { 1: 5, 2: -1, 3: 7 },
    getSuggestedIndividualPrice: (selectedEntry) => selectedEntry.id * 10,
    liveSinglesSuggestedBundlePrice: 33
  });

  getMethod<(this: PanelCtx) => void>("syncLiveSinglesPricingState").call(context);
  assert.deepEqual(context.liveSinglesQuantities, { 1: 1, 2: 1 });
  assert.deepEqual(context.liveSinglesIndividualPrices, { 1: 5, 2: 20 });
  assert.equal(context.liveSinglesBundleSelectionKey, "1,2");
  assert.equal(context.liveSinglesBundlePrice, 33);

  context.liveSinglesBundlePrice = Number.NaN;
  getMethod<(this: PanelCtx) => void>("syncLiveSinglesPricingState").call(context);
  assert.equal(context.liveSinglesBundlePrice, 33);

  context.effectiveLiveSinglesIds = [];
  context.effectiveLiveSinglesEntries = [];
  getMethod<(this: PanelCtx) => void>("syncLiveSinglesPricingState").call(context);
  assert.deepEqual(context.liveSinglesQuantities, {});
  assert.deepEqual(context.liveSinglesIndividualPrices, {});
  assert.equal(context.liveSinglesBundlePrice, null);
  assert.equal(context.liveSinglesBundleSelectionKey, "");
});

test("individual and bundle price mutators update values and selection state", () => {
  const context = createContext({
    effectiveLiveSinglesEntries: [entry({ id: 5, marketValue: 7, quantity: 4 })],
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

  getMethod<(this: PanelCtx, entryId: number, direction: -1 | 1) => void>("adjustLiveSinglesEntryQuantity").call(context, 5, 1);
  assert.equal((context.liveSinglesQuantities as Record<number, number>)[5], 2);

  getMethod<(this: PanelCtx, entryId: number, value: unknown) => void>("setLiveSinglesEntryQuantity").call(context, 5, 99);
  assert.equal((context.liveSinglesQuantities as Record<number, number>)[5], 4);

  getMethod<(this: PanelCtx, value: unknown) => void>("onLiveSinglesPickerSelection").call(context, 6);
  assert.deepEqual(context.addLiveSinglesSelection.mock.calls[0], [6, "manual"]);
  assert.equal(context.liveSinglesSelectedId, null);

  context.liveSinglesSelectedId = 7;
  getMethod<(this: PanelCtx) => void>("addLiveSinglesFromPicker").call(context);
  assert.deepEqual(context.addLiveSinglesSelection.mock.calls[1], [7, "manual"]);
  assert.equal(context.liveSinglesSelectedId, null);

  getMethod<(this: PanelCtx, entryId: number) => void>("removeLiveSinglesEntry").call(context, 7);
  assert.deepEqual(context.removeLiveSinglesSelection.mock.calls[0], [7, "manual"]);
  assert.deepEqual(context.removeLiveSinglesSelection.mock.calls[1], [7, "external"]);

  getMethod<(this: PanelCtx) => void>("clearLiveSinglesEntries").call(context);
  assert.equal(context.clearLiveSinglesSelection.mock.calls.length, 1);
  assert.deepEqual(context.liveSinglesQuantities, {});
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
  assert.deepEqual(context.liveSinglesQuantities, { 1: 1, 2: 1 });
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

  const idsWatcher = (LiveSinglesPanel.watch as unknown as Record<string, { handler: (this: PanelCtx) => void }>).effectiveLiveSinglesIds.handler;
  context.syncLiveSinglesPricingState = vi.fn();
  idsWatcher.call(context);
  assert.equal((context.syncLiveSinglesPricingState as ReturnType<typeof vi.fn>).mock.calls.length, 1);

  const modeWatcher = (LiveSinglesPanel.watch as unknown as Record<string, ((this: PanelCtx) => void) | { handler: (this: PanelCtx) => void }>).liveSinglesPricingMode as (this: PanelCtx) => void;
  context.persistLiveSinglesMode = vi.fn();
  modeWatcher.call(context);
  assert.equal((context.persistLiveSinglesMode as ReturnType<typeof vi.fn>).mock.calls.length, 1);

  context.loadLiveSinglesModeFromStorage = vi.fn();
  (LiveSinglesPanel.mounted as unknown as (this: PanelCtx) => void).call(context);
  assert.equal((context.loadLiveSinglesModeFromStorage as ReturnType<typeof vi.fn>).mock.calls.length, 1);
});

test("guard paths and setup paths behave safely for live singles panel", () => {
  const context = createContext({
    effectiveLiveSinglesEntries: [entry({ id: 9, marketValue: 6, cost: 1 })],
    liveSinglesIndividualPrices: {}
  });

  getMethod<(this: PanelCtx, entryId: number, value: unknown) => void>("onIndividualPriceInput").call(context, 0, 3);
  assert.deepEqual(context.liveSinglesIndividualPrices, {});

  getMethod<(this: PanelCtx, entryId: number, direction: -1 | 1) => void>("adjustIndividualPrice").call(context, 9, 1);
  assert.equal((context.liveSinglesIndividualPrices as Record<number, number>)[9], 7.6);

  getMethod<(this: PanelCtx, value: unknown) => void>("onLiveSinglesPickerSelection").call(context, 0);
  assert.equal(context.addLiveSinglesSelection.mock.calls.length, 0);
  assert.equal(context.liveSinglesSelectedId, null);

  context.liveSinglesSelectedId = 0;
  getMethod<(this: PanelCtx) => void>("addLiveSinglesFromPicker").call(context);
  assert.equal(context.addLiveSinglesSelection.mock.calls.length, 0);

  context.effectiveLiveSinglesEntries = [];
  context.liveSinglesQuantities = { 9: 2 };
  context.liveSinglesIndividualPrices = { 9: 99 };
  context.liveSinglesBundlePrice = 99;
  context.liveSinglesBundleSelectionKey = "9";
  getMethod<(this: PanelCtx) => void>("panelApplySuggestedLiveSinglesPricing").call(context);
  assert.deepEqual(context.liveSinglesQuantities, {});
  assert.deepEqual(context.liveSinglesIndividualPrices, {});
  assert.equal(context.liveSinglesBundlePrice, null);
  assert.equal(context.liveSinglesBundleSelectionKey, "");

  context.effectiveLiveSinglesEntries = undefined as unknown as PanelCtx["effectiveLiveSinglesEntries"];
  getMethod<(this: PanelCtx) => void>("panelApplySuggestedLiveSinglesPricing").call(context);
  assert.deepEqual(context.liveSinglesIndividualPrices, {});

  assert.equal(getMethod<(this: PanelCtx, entryId: number) => { id: number; share: number; percent: number } | null>("getBundleAllocationForEntry").call(context, -1), null);
  assert.equal(getMethod<(this: PanelCtx, entryId: number) => { id: number; share: number; percent: number } | null>("getBundleAllocationForEntry").call(context, 9), null);

  const getItemThrow = vi.fn(() => {
    throw new Error("read fail");
  });
  const setItemThrow = vi.fn(() => {
    throw new Error("write fail");
  });
  vi.stubGlobal("localStorage", {
    getItem: getItemThrow,
    setItem: setItemThrow
  });

  getMethod<(this: PanelCtx) => void>("loadLiveSinglesModeFromStorage").call(context);
  context.liveSinglesPricingMode = "bundle";
  getMethod<(this: PanelCtx) => void>("persistLiveSinglesMode").call(context);
  assert.equal(context.liveSinglesPricingMode, "bundle");

});

test("quantity affects selected count, basis, suggested price, and profit totals", () => {
  const context = createContext({
    effectiveLiveSinglesIds: [1],
    effectiveLiveSinglesEntries: [entry({ id: 1, marketValue: 10, quantity: 5 })],
    liveSinglesQuantities: { 1: 3 },
    liveSinglesIndividualPrices: { 1: 12 },
    targetProfitPercent: 20,
    calculatePriceForUnits: (units, netRevenue) => Math.round(netRevenue / units),
    netFromGross: (gross) => gross - 3
  });

  assert.equal(getComputed<number>("liveSinglesSelectedCount").call(context), 3);
  assert.equal(getComputed<number>("liveSinglesBasisTotal").call(context), 30);
  assert.equal(getMethod<(this: PanelCtx, entry: SinglesPurchaseEntry) => number>("getSuggestedIndividualPrice").call(context, entry({ id: 1, marketValue: 10, quantity: 5 })), 12);
  assert.equal(getComputed<number>("liveSinglesIndividualTotalPrice").call(context), 36);
  assert.equal(getMethod<(this: PanelCtx, entry: SinglesPurchaseEntry) => number>("getIndividualProfit").call(context, entry({ id: 1, marketValue: 10, quantity: 5 })), 3);
});

test("convertLiveSinglesToSale opens the shared sales modal with prefilled lines", () => {
  const context = createContext({
    effectiveLiveSinglesEntries: [
      entry({ id: 5, item: "Gemstone pendants", marketValue: 10, quantity: 20 }),
      entry({ id: 8, item: "Rings", marketValue: 4, quantity: 10 })
    ],
    liveSinglesQuantities: { 5: 2, 8: 3 },
    liveSinglesIndividualPrices: { 5: 12, 8: 6 },
    liveSinglesPricingMode: "individual",
    sellingShippingPerOrder: 8
  });

  getMethod<(this: PanelCtx) => void>("convertLiveSinglesToSale").call(context);
  assert.equal(context.openConvertLiveSinglesSaleModal.mock.calls.length, 1);
  assert.deepEqual(context.openConvertLiveSinglesSaleModal.mock.calls[0]?.[0], [
    { singlesPurchaseEntryId: 5, quantity: 2, price: 24 },
    { singlesPurchaseEntryId: 8, quantity: 3, price: 18 }
  ]);
  assert.deepEqual(context.openConvertLiveSinglesSaleModal.mock.calls[0]?.[1], {
    buyerShipping: 8
  });

  context.openConvertLiveSinglesSaleModal.mockClear();
  context.liveSinglesPricingMode = "bundle";
  context.liveSinglesBundlePrice = 30;
  getMethod<(this: PanelCtx) => void>("convertLiveSinglesToSale").call(context);
  assert.deepEqual(context.openConvertLiveSinglesSaleModal.mock.calls[0]?.[0], [
    { singlesPurchaseEntryId: 5, quantity: 2, price: 18.75 },
    { singlesPurchaseEntryId: 8, quantity: 3, price: 11.25 }
  ]);
});
