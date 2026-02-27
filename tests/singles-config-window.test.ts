import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { SinglesConfigWindow } from "../src/components/windows/SinglesConfigWindow.ts";
import type { SinglesPurchaseEntry } from "../src/types/app.ts";

type AnyContext = Record<string, unknown> & {
  notify: ReturnType<typeof vi.fn>;
  askConfirmation: ReturnType<typeof vi.fn>;
  onSinglesPurchaseRowsChange: ReturnType<typeof vi.fn>;
  removeSinglesPurchaseRow: ReturnType<typeof vi.fn>;
  $refs: Record<string, unknown>;
};

function getMethod<T extends (...args: never[]) => unknown>(name: string): T {
  return (SinglesConfigWindow.methods as Record<string, unknown>)[name] as T;
}

function getComputed<T>(name: string): (this: AnyContext) => T {
  return (SinglesConfigWindow.computed as Record<string, unknown>)[name] as (this: AnyContext) => T;
}

function createContext(overrides: Partial<AnyContext> = {}): AnyContext {
  const dataState = (SinglesConfigWindow.data as () => Record<string, unknown>).call({});
  const context: AnyContext = {
    ...dataState,
    currency: "CAD",
    singlesPurchases: [],
    singlesSoldCountByPurchaseId: {},
    singlesSearchQuery: "",
    showFullySoldSingles: true,
    singlesCsvImportHeaders: [],
    singlesCsvMapItem: null,
    singlesCsvMapCardNumber: null,
    singlesCsvMapCondition: null,
    singlesCsvMapLanguage: null,
    singlesCsvMapCost: null,
    singlesCsvMapQuantity: null,
    singlesCsvMapMarketValue: null,
    notify: vi.fn(),
    askConfirmation: vi.fn(),
    onSinglesPurchaseRowsChange: vi.fn(),
    removeSinglesPurchaseRow: vi.fn(),
    $refs: {},
    ...overrides
  };

  for (const [name, method] of Object.entries(SinglesConfigWindow.methods as Record<string, unknown>)) {
    if (typeof method === "function") {
      context[name] = (method as (...args: unknown[]) => unknown).bind(context);
    }
  }

  return context;
}

test("visibleSinglesPurchases filters fully sold rows and tokenized search", () => {
  const context = createContext({
    showFullySoldSingles: false,
    singlesSearchQuery: "123 char",
    singlesSoldCountByPurchaseId: { 1: 1, 2: 1 },
    singlesPurchases: [
      { id: 1, item: "Pikachu", cardNumber: "025", cost: 1, currency: "CAD", quantity: 0, marketValue: 0 },
      { id: 2, item: "Charizard", cardNumber: "123", cost: 1, currency: "CAD", quantity: 2, marketValue: 0 },
      { id: 3, item: "Charmander", cardNumber: "004", cost: 1, currency: "CAD", quantity: 2, marketValue: 0 }
    ] satisfies SinglesPurchaseEntry[]
  });

  const visibleSinglesPurchases = getComputed<SinglesPurchaseEntry[]>("visibleSinglesPurchases");
  const hasSinglesSearchQuery = getComputed<boolean>("hasSinglesSearchQuery");
  const rows = visibleSinglesPurchases.call(context);

  assert.equal(hasSinglesSearchQuery.call(context), true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.item, "Charizard");
});

test("stock helpers compute remaining quantity from total quantity and linked sold count", () => {
  const context = createContext({
    singlesSoldCountByPurchaseId: { 42: 1 }
  });
  const entry: SinglesPurchaseEntry = {
    id: 42,
    item: "Charizard",
    cardNumber: "123",
    cost: 23,
    currency: "CAD",
    quantity: 1,
    marketValue: 50
  };

  assert.equal(context.getSinglesEntryTotalQuantity(entry), 1);
  assert.equal(context.getSinglesEntryRemainingQuantity(entry), 0);
  assert.equal(context.getSinglesEntryStockLabel(entry), "0/1");
  assert.equal(context.isSinglesEntryFullySold(entry), true);
});

test("desktopSortedSinglesPurchases sorts by numeric and text columns", () => {
  const context = createContext({
    desktopSortBy: "cost",
    desktopSortDesc: true,
    visibleSinglesPurchases: [
      { id: 1, item: "Beta", cardNumber: "2", condition: "Good", language: "French", cost: 1, quantity: 2, marketValue: 0 },
      { id: 2, item: "Alpha", cardNumber: "10", condition: "Near Mint", language: "English", cost: 3, quantity: 1, marketValue: 0 },
      { id: 3, item: "Gamma", cardNumber: "1", condition: "Mint", language: "Japanese", cost: 0.5, quantity: 4, marketValue: 0 }
    ] satisfies SinglesPurchaseEntry[]
  });

  const sortedByCostBasis = getComputed<SinglesPurchaseEntry[]>("desktopSortedSinglesPurchases").call(context);
  assert.deepEqual(sortedByCostBasis.map((entry) => entry.id), [2, 1, 3]);

  context.desktopSortBy = "language";
  context.desktopSortDesc = false;
  const sortedByLanguage = getComputed<SinglesPurchaseEntry[]>("desktopSortedSinglesPurchases").call(context);
  assert.deepEqual(sortedByLanguage.map((entry) => entry.id), [2, 1, 3]);
});

test("virtualization computed values derive from scroll position", () => {
  const entries = Array.from({ length: 200 }, (_, index) => ({
    id: index + 1,
    item: `Card ${index + 1}`,
    cardNumber: String(index + 1),
    cost: 1,
    quantity: 1,
    marketValue: 1
  }));
  const context = createContext({
    desktopSortedSinglesPurchases: entries,
    desktopRowsScrollTop: 520
  });

  const useDesktopVirtualization = getComputed<boolean>("useDesktopVirtualization").call(context);
  assert.equal(useDesktopVirtualization, true);

  context.useDesktopVirtualization = useDesktopVirtualization;
  context.desktopVirtualStartIndex = getComputed<number>("desktopVirtualStartIndex").call(context);
  context.desktopVirtualEndIndex = getComputed<number>("desktopVirtualEndIndex").call(context);

  assert.equal(context.desktopVirtualStartIndex, 4);
  assert.equal(context.desktopVirtualEndIndex, 27);
  assert.equal(getComputed<number>("desktopTopSpacerPx").call(context), 208);
  assert.equal(getComputed<number>("desktopBottomSpacerPx").call(context), 8996);
});

test("mobile pagination renders in batches and can load more rows", () => {
  const entries = Array.from({ length: 145 }, (_, index) => ({
    id: index + 1,
    item: `Card ${index + 1}`,
    cardNumber: String(index + 1),
    cost: 1,
    currency: "CAD",
    quantity: 1,
    marketValue: 1
  })) satisfies SinglesPurchaseEntry[];

  const context = createContext({
    visibleSinglesPurchases: entries
  });

  assert.equal(getComputed<SinglesPurchaseEntry[]>("mobileRenderedSinglesPurchases").call(context).length, 60);
  assert.equal(getComputed<boolean>("hasMoreMobileSinglesRows").call(context), true);
  assert.equal(getComputed<number>("remainingMobileSinglesRows").call(context), 85);
  assert.equal(getComputed<number>("nextMobileSinglesBatchCount").call(context), 60);

  context.loadMoreMobileRows();
  assert.equal(context.mobileRenderCount, 120);
  assert.equal(getComputed<number>("remainingMobileSinglesRows").call(context), 25);
  assert.equal(getComputed<number>("nextMobileSinglesBatchCount").call(context), 25);

  context.loadMoreMobileRows();
  assert.equal(context.mobileRenderCount, 145);
  assert.equal(getComputed<boolean>("hasMoreMobileSinglesRows").call(context), false);
});

test("search and sold-filter toggles reset mobile pagination", () => {
  const context = createContext({
    mobileRenderCount: 240,
    showFullySoldSingles: true,
    desktopRowsScrollTop: 120,
    $refs: {
      desktopRowsScroller: {
        scrollTop: 44
      }
    }
  });

  context.onSinglesSearchInput();
  assert.equal(context.mobileRenderCount, 60);
  assert.equal(context.desktopRowsScrollTop, 0);

  context.mobileRenderCount = 180;
  context.toggleShowFullySoldSingles();
  assert.equal(context.showFullySoldSingles, false);
  assert.equal(context.mobileRenderCount, 60);
  assert.equal(context.desktopRowsScrollTop, 0);
});

test("CSV mapping computed helpers track required/optional columns and labels", () => {
  const context = createContext({
    singlesCsvImportHeaders: ["Name", "Qty", "Price", "Card #", "Condition", "Language", "Market"],
    singlesCsvMapItem: 0,
    singlesCsvMapQuantity: 1,
    singlesCsvMapCost: 2,
    singlesCsvMapCardNumber: 3,
    singlesCsvMapCondition: 4,
    singlesCsvMapLanguage: 5,
    singlesCsvMapMarketValue: 6
  });

  assert.equal(getComputed<number>("requiredCsvMappedCount").call(context), 2);
  assert.equal(getComputed<number>("optionalCsvMappedCount").call(context), 5);
  context.requiredCsvMappedCount = getComputed<number>("requiredCsvMappedCount").call(context);
  assert.equal(getComputed<boolean>("requiredCsvMappingsComplete").call(context), true);

  const labelsByColumn = getComputed<Record<number, string>>("csvMappedFieldLabelsByColumn").call(context);
  assert.equal(labelsByColumn[0], "Item");
  assert.equal(labelsByColumn[6], "Market");
});

test("saveSinglesRowEditor validates and creates row with non-colliding id", () => {
  const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(5000);
  try {
    const context = createContext({
      singlesPurchases: [
        {
          id: 5000,
          item: "Existing",
          cardNumber: "001",
          condition: "",
          language: "",
          cost: 1,
          currency: "CAD",
          quantity: 1,
          marketValue: 1
        }
      ],
      editingSinglesRowId: null,
      editingSinglesRow: {
        item: "  New Card  ",
        cardNumber: " 123 ",
        condition: " Near Mint ",
        language: " English ",
        cost: 2.25,
        currency: "USD",
        quantity: 2.9,
        marketValue: 5
      },
      showSinglesRowEditor: true
    });

    context.saveSinglesRowEditor();

    const rows = context.singlesPurchases as SinglesPurchaseEntry[];
    assert.equal(rows.length, 2);
    assert.equal(rows[1]?.id, 5001);
    assert.equal(rows[1]?.item, "New Card");
    assert.equal(rows[1]?.quantity, 2);
    assert.equal((context.onSinglesPurchaseRowsChange as ReturnType<typeof vi.fn>).mock.calls.length, 1);
    assert.equal(context.showSinglesRowEditor, false);
  } finally {
    dateNowSpy.mockRestore();
  }
});

test("saveSinglesRowEditor updates existing row and rejects invalid input", () => {
  const context = createContext({
    singlesPurchases: [
      { id: 1, item: "A", cardNumber: "1", condition: "", language: "", cost: 1, currency: "CAD", quantity: 1, marketValue: 1 },
      { id: 2, item: "B", cardNumber: "2", condition: "", language: "", cost: 2, currency: "CAD", quantity: 2, marketValue: 2 }
    ],
    editingSinglesRowId: 2,
    editingSinglesRow: {
      item: "  Updated ",
      cardNumber: " 22 ",
      condition: " Good ",
      language: " French ",
      cost: 3,
      currency: "CAD",
      quantity: 4,
      marketValue: 6
    }
  });

  context.saveSinglesRowEditor();
  const rows = context.singlesPurchases as SinglesPurchaseEntry[];
  assert.equal(rows[1]?.item, "Updated");
  assert.equal(rows[1]?.cardNumber, "22");
  assert.equal(rows[1]?.quantity, 4);

  context.editingSinglesRowId = null;
  context.editingSinglesRow = {
    item: " ",
    cardNumber: "",
    condition: "",
    language: "",
    cost: 1,
    currency: "CAD",
    quantity: 1,
    marketValue: 0
  };
  context.saveSinglesRowEditor();
  assert.equal(context.notify.mock.calls.at(-1)?.[0], "Item is required.");
});

test("deleteSelectedDesktopRows removes selected rows after confirmation", () => {
  const context = createContext({
    singlesPurchases: [
      { id: 1, item: "A", cardNumber: "1", cost: 1, currency: "CAD", quantity: 1, marketValue: 0 },
      { id: 2, item: "B", cardNumber: "2", cost: 1, currency: "CAD", quantity: 1, marketValue: 0 },
      { id: 3, item: "C", cardNumber: "3", cost: 1, currency: "CAD", quantity: 1, marketValue: 0 }
    ] satisfies SinglesPurchaseEntry[],
    selectedDesktopRowIds: [1, 3],
    isDesktopSelectMode: true,
    askConfirmation: vi.fn((_payload, onConfirm: () => void) => onConfirm())
  });

  context.deleteSelectedDesktopRows();

  const rows = context.singlesPurchases as SinglesPurchaseEntry[];
  assert.deepEqual(rows.map((entry) => entry.id), [2]);
  assert.deepEqual(context.selectedDesktopRowIds, []);
  assert.equal(context.isDesktopSelectMode, false);
  assert.equal(context.notify.mock.calls.at(-1)?.[0], "Deleted 2 rows.");
});

test("toggleDesktopSort cycles asc/desc/off and row click behavior respects select mode", () => {
  const context = createContext({
    resetDesktopRowsScroll: vi.fn(),
    desktopSortBy: null,
    desktopSortDesc: false
  });

  context.toggleDesktopSort("item");
  assert.equal(context.desktopSortBy, "item");
  assert.equal(context.desktopSortDesc, false);

  context.toggleDesktopSort("item");
  assert.equal(context.desktopSortDesc, true);

  context.toggleDesktopSort("item");
  assert.equal(context.desktopSortBy, null);
  assert.equal(context.desktopSortDesc, false);

  const openSinglesRowEditor = vi.fn();
  context.openSinglesRowEditor = openSinglesRowEditor;
  context.isDesktopSelectMode = true;
  context.selectedDesktopRowIds = [];
  context.handleDesktopRowClick({ id: 7 } as SinglesPurchaseEntry);
  assert.deepEqual(context.selectedDesktopRowIds, [7]);
  assert.equal(openSinglesRowEditor.mock.calls.length, 0);

  context.isDesktopSelectMode = false;
  context.handleDesktopRowClick({ id: 8 } as SinglesPurchaseEntry);
  assert.equal(openSinglesRowEditor.mock.calls.length, 1);
});

test("csvMappedFieldLabel/mapped flags and abbreviation helpers return expected values", () => {
  const context = createContext({
    csvMappedFieldLabelsByColumn: {
      0: "Item",
      2: "Cost + Market"
    }
  });

  assert.equal(context.csvMappedFieldLabel(0), "Item");
  assert.equal(context.csvMappedFieldLabel(1), "");
  assert.equal(context.isCsvColumnMapped(2), true);
  assert.equal(context.isCsvColumnMapped(3), false);
  assert.equal(context.conditionShortLabel("Near Mint"), "NM");
  assert.equal(context.conditionShortLabel("weird-grade"), "WEI");
  assert.equal(context.languageShortLabel("French"), "Fr");
  assert.equal(context.languageShortLabel("unknown"), "Un");
});

test("load/dismiss singles info notice reads and writes localStorage safely", () => {
  const storage = {
    getItem: vi.fn(() => "1"),
    setItem: vi.fn()
  };
  vi.stubGlobal("localStorage", storage);
  const context = createContext({
    showSinglesInfoNotice: true
  });

  context.loadSinglesInfoNoticeState();
  assert.equal(context.showSinglesInfoNotice, false);

  context.dismissSinglesInfoNotice();
  assert.equal(context.showSinglesInfoNotice, false);
  assert.equal(storage.setItem.mock.calls[0]?.[0], "whatfees_singles_info_notice_dismissed_v1");

  vi.unstubAllGlobals();
});

test("setCurrentSinglesCatalogSource persists on current singles lot and toggles manual mode", () => {
  const saveLotsToStorage = vi.fn();
  const notify = vi.fn();
  const context = createContext({
    currentLotId: 12,
    lots: [
      {
        id: 12,
        lotType: "singles",
        singlesCatalogSource: "ua",
        singlesPurchases: [{ id: 1, item: "Card A" }]
      }
    ],
    saveLotsToStorage,
    notify,
    singlesItemSuggestions: [{ title: "X", name: "X", cardNo: "", rarity: "", marketPrice: null }],
    singlesItemSearchLoading: true
  });
  context.cancelSinglesItemSearch = vi.fn();

  context.setCurrentSinglesCatalogSource("none");

  const currentLot = (context.lots as Array<Record<string, unknown>>)[0];
  assert.equal(currentLot?.singlesCatalogSource, "none");
  assert.equal(saveLotsToStorage.mock.calls.length, 1);
  assert.equal((context.cancelSinglesItemSearch as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.deepEqual(context.singlesItemSuggestions, []);
  assert.equal(context.singlesItemSearchLoading, false);
  assert.equal(notify.mock.calls.length, 1);
  assert.equal(
    String(notify.mock.calls[0]?.[0] || "").includes("future autocomplete suggestions"),
    true
  );
  context.currentSinglesCatalogSource = "none";
  assert.equal(getComputed<boolean>("showCatalogSuggestions").call(context), false);
});

test("fetchSinglesItemSuggestions uses lot catalog source as cards search game", async () => {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      items: [
        {
          name: "Rukia Kuchiki",
          cardNo: "UE01BT/BLC-1-051",
          rarity: "C",
          marketPrice: 0.22
        }
      ]
    })
  }));
  vi.stubGlobal("fetch", fetchMock);

  try {
    const context = createContext({
      currentLotId: 44,
      lots: [
        {
          id: 44,
          lotType: "singles",
          singlesCatalogSource: "pokemon"
        }
      ],
      resolveCardsApiBaseUrl: () => "https://api.example.com"
    });
    context.currentSinglesCatalogSource = "pokemon";

    await context.fetchSinglesItemSuggestions("rukia");

    assert.equal(fetchMock.mock.calls.length, 1);
    const requestUrl = String(fetchMock.mock.calls[0]?.[0] || "");
    assert.equal(requestUrl.includes("game=pokemon"), true);
    assert.equal(requestUrl.includes("q=rukia"), true);
    assert.equal(requestUrl.includes("limit=10"), true);
    assert.equal((context.singlesItemSuggestions as Array<{ name: string }>)[0]?.name, "Rukia Kuchiki");

    context.currentSinglesCatalogSource = "none";
    await context.fetchSinglesItemSuggestions("rukia");
    assert.equal(fetchMock.mock.calls.length, 1);
    assert.deepEqual(context.singlesItemSuggestions, []);
  } finally {
    vi.unstubAllGlobals();
  }
});
