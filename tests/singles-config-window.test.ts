import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test, vi } from "vitest";
import { singlesConfigWindowDefinition } from "../src/components/windows/singles/SinglesConfigWindow.definition.ts";
import type { SinglesPurchaseEntry } from "../src/types/app.ts";

type AnyContext = Record<string, any> & {
  notify: ReturnType<typeof vi.fn>;
  askConfirmation: ReturnType<typeof vi.fn>;
  onSinglesPurchaseRowsChange: ReturnType<typeof vi.fn>;
  removeSinglesPurchaseRow: ReturnType<typeof vi.fn>;
  $refs: Record<string, unknown>;
};

const singlesConfigData = singlesConfigWindowDefinition.data as () => Record<string, unknown>;
const singlesConfigMethods = Object.entries(singlesConfigWindowDefinition.methods as Record<string, unknown>)
  .filter(([, method]) => typeof method === "function") as Array<[string, (...args: unknown[]) => unknown]>;

test("singles inventory table uses a larger unframed card image row", async () => {
  const source = await readFile("src/components/windows/singles/SinglesConfigWindow.definition.ts", "utf8");
  const css = await readFile("src/components/windows/singles/SinglesConfigWindow.css", "utf8");

  assert.match(source, /const DESKTOP_VIRTUAL_ROW_HEIGHT = 104;/);
  assert.match(css, /\.singles-grid-table tbody tr:not\(\.singles-virtual-spacer-row\) \{\s*height: 104px;/);
  assert.match(css, /\.singles-row-thumb \{[\s\S]*width: 64px;[\s\S]*height: 90px;/);
  assert.match(css, /\.singles-row-thumb \{[\s\S]*border: 0;/);
  assert.match(css, /\.singles-row-thumb img \{[\s\S]*object-fit: contain;/);
  assert.match(css, /\.singles-mobile-item \{[\s\S]*min-height: 132px;/);
  assert.match(css, /\.singles-mobile-thumb \{[\s\S]*width: 64px;[\s\S]*height: 90px;/);
  assert.match(css, /\.singles-mobile-thumb \{[\s\S]*border: 0;/);
});

test("manual singles editor exposes image upload controls for custom inventory", async () => {
  const template = await readFile("src/components/windows/singles/SinglesConfigWindow.html", "utf8");
  const css = await readFile("src/components/windows/singles/SinglesConfigWindow.css", "utf8");

  assert.match(template, /v-if="!showCatalogSuggestions"[\s\S]*type="file"[\s\S]*accept="image\/\*"/);
  assert.match(template, /@change="handleSinglesImageUpload"/);
  assert.match(template, /@click="triggerSinglesImageUpload"/);
  assert.match(template, /@click="clearEditingSinglesImage"/);
  assert.match(template, /singlesEditorAddImageAction/);
  assert.match(template, /singlesEditorChangeImageAction/);
  assert.match(template, /singlesEditorImageUploadHelp/);
  assert.match(template, /singlesImageUploadError/);
  assert.match(css, /\.singles-editor-image-actions/);
  assert.match(css, /\.singles-editor-image-error/);
});

function getComputed<T>(name: string): (this: AnyContext) => T {
  return (singlesConfigWindowDefinition.computed as Record<string, unknown>)[name] as (this: AnyContext) => T;
}

function createContext(overrides: Partial<AnyContext> = {}): AnyContext {
  const dataState = singlesConfigData.call({});
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
    $refs: {}
  };

  for (const [name, method] of singlesConfigMethods) {
    context[name] = method.bind(context);
  }

  Object.assign(context, overrides);

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

  assert.equal(context.desktopVirtualStartIndex, 0);
  assert.equal(context.desktopVirtualEndIndex, 18);
  assert.equal(getComputed<number>("desktopTopSpacerPx").call(context), 0);
  assert.equal(getComputed<number>("desktopBottomSpacerPx").call(context), 18928);
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

  assert.equal(getComputed<SinglesPurchaseEntry[]>("mobileRenderedSinglesPurchases").call(context).length, 30);
  assert.equal(getComputed<boolean>("hasMoreMobileSinglesRows").call(context), true);
  assert.equal(getComputed<number>("remainingMobileSinglesRows").call(context), 115);
  assert.equal(getComputed<number>("nextMobileSinglesBatchCount").call(context), 30);

  context.loadMoreMobileRows();
  assert.equal(context.mobileRenderCount, 60);
  assert.equal(getComputed<number>("remainingMobileSinglesRows").call(context), 85);
  assert.equal(getComputed<number>("nextMobileSinglesBatchCount").call(context), 30);

  context.loadMoreMobileRows();
  assert.equal(context.mobileRenderCount, 90);
  assert.equal(getComputed<number>("remainingMobileSinglesRows").call(context), 55);
  assert.equal(getComputed<number>("nextMobileSinglesBatchCount").call(context), 30);

  context.loadMoreMobileRows();
  assert.equal(context.mobileRenderCount, 120);
  assert.equal(getComputed<number>("remainingMobileSinglesRows").call(context), 25);
  assert.equal(getComputed<number>("nextMobileSinglesBatchCount").call(context), 25);

  context.loadMoreMobileRows();
  assert.equal(context.mobileRenderCount, 145);
  assert.equal(getComputed<boolean>("hasMoreMobileSinglesRows").call(context), false);
});

test("mobile sorting cycles through recent, name, and market views", () => {
  const entries = [
    { id: 1, item: "Zoro", cardNumber: "003", cost: 1, currency: "CAD", quantity: 1, marketValue: 5 },
    { id: 2, item: "Asta", cardNumber: "001", cost: 1, currency: "CAD", quantity: 1, marketValue: 10 },
    { id: 3, item: "Ichigo", cardNumber: "002", cost: 1, currency: "CAD", quantity: 2, marketValue: 4 }
  ] satisfies SinglesPurchaseEntry[];
  const context = createContext({
    visibleSinglesPurchases: entries,
    mobileSortBy: "item"
  });

  assert.deepEqual(getComputed<SinglesPurchaseEntry[]>("mobileSortedSinglesPurchases").call(context).map((entry) => entry.id), [2, 3, 1]);
  assert.equal(getComputed<string>("mobileSortLabel").call(context), "Name");

  context.cycleMobileSort();
  assert.equal(context.mobileSortBy, "marketValue");
  assert.equal(context.mobileRenderCount, 30);
  assert.deepEqual(getComputed<SinglesPurchaseEntry[]>("mobileSortedSinglesPurchases").call(context).map((entry) => entry.id), [2, 3, 1]);
  assert.equal(getComputed<string>("mobileSortLabel").call(context), "Market");

  context.cycleMobileSort();
  assert.equal(context.mobileSortBy, "recent");
  assert.deepEqual(getComputed<SinglesPurchaseEntry[]>("mobileSortedSinglesPurchases").call(context).map((entry) => entry.id), [1, 2, 3]);
  assert.equal(getComputed<string>("mobileSortLabel").call(context), "Recent");

  context.cycleMobileSort();
  assert.equal(context.mobileSortBy, "item");
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
  assert.equal(context.mobileRenderCount, 30);
  assert.equal(context.desktopRowsScrollTop, 0);

  context.mobileRenderCount = 180;
  context.toggleShowFullySoldSingles();
  assert.equal(context.showFullySoldSingles, false);
  assert.equal(context.mobileRenderCount, 30);
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
  context.csvMappedFieldLabelsByColumn = labelsByColumn;

  const previewColumns = getComputed<Array<{ index: number; header: string; label: string }>>("singlesCsvPreviewColumns").call(context);
  assert.deepEqual(previewColumns.map((column) => column.index), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(previewColumns[0]?.header, "Name");
  assert.equal(previewColumns[0]?.label, "Item");
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
        image: "https://img.example.com/new-card.jpg",
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
    assert.equal(rows[1]?.image, "https://img.example.com/new-card.jpg");
    assert.equal(rows[1]?.quantity, 2);
    assert.equal((context.onSinglesPurchaseRowsChange as ReturnType<typeof vi.fn>).mock.calls.length, 1);
    assert.equal(context.showSinglesRowEditor, false);
  } finally {
    dateNowSpy.mockRestore();
  }
});

test("saveSinglesRowEditor can save and keep adding with preserved context", () => {
  const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(6000);
  try {
    const context = createContext({
      singlesPurchases: [],
      editingSinglesRowId: null,
      editingSinglesRow: {
        item: "Rei Ayanami",
        cardNumber: "UE15BT/EVA-1-004-ALT1",
        image: "https://img.example.com/rei.jpg",
        condition: "Near Mint",
        language: "Japanese",
        cost: 46,
        currency: "USD",
        quantity: 1,
        marketValue: 50
      },
      showSinglesRowEditor: true
    });

    context.saveSinglesRowEditor("new");

    const rows = context.singlesPurchases as SinglesPurchaseEntry[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.item, "Rei Ayanami");
    assert.equal(context.showSinglesRowEditor, true);
    assert.equal(context.editingSinglesRowId, null);
    assert.equal(context.editingSinglesRow.item, "");
    assert.equal(context.editingSinglesRow.cardNumber, "");
    assert.equal(context.editingSinglesRow.image, "");
    assert.equal(context.editingSinglesRow.cost, 0);
    assert.equal(context.editingSinglesRow.marketValue, 0);
    assert.equal(context.editingSinglesRow.marketValueCurrency, "USD");
    assert.equal(context.editingSinglesRow.currency, "USD");
    assert.equal(context.editingSinglesRow.condition, "Near Mint");
    assert.equal(context.editingSinglesRow.language, "Japanese");
    assert.equal(context.editingSinglesRow.quantity, 1);
  } finally {
    dateNowSpy.mockRestore();
  }
});

test("saveSinglesRowEditor persists market value currency and defaults UA editor drafts to USD market", () => {
  const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(7000);
  try {
    const context = createContext({
      currentSinglesCatalogSource: "ua",
      currency: "CAD",
      singlesPurchases: [],
      editingSinglesRowId: null,
      editingSinglesRow: {
        item: "Rei Ayanami",
        cardNumber: "UE15BT/EVA-1-004-ALT1",
        image: "",
        condition: "",
        language: "",
        cost: 10,
        currency: "CAD",
        quantity: 1,
        marketValue: 46,
        marketValueCurrency: "USD"
      }
    });

    context.saveSinglesRowEditor();

    const rows = context.singlesPurchases as SinglesPurchaseEntry[];
    assert.equal(rows[0]?.marketValueCurrency, "USD");

    context.resetSinglesRowDraft();
    assert.equal(context.editingSinglesRow.marketValueCurrency, "USD");
  } finally {
    dateNowSpy.mockRestore();
  }
});

test("editing quantity stepper stays compact and never drops below one", () => {
  const context = createContext({
    editingSinglesRow: {
      item: "Rei Ayanami",
      cardNumber: "UE15BT/EVA-1-004-ALT1",
      image: "",
      condition: "",
      language: "",
      cost: 1,
      currency: "CAD",
      quantity: 1,
      marketValue: 2
    }
  });

  assert.equal(context.getEditingSinglesQuantity(), 1);
  context.decreaseEditingSinglesQuantity();
  assert.equal(context.editingSinglesRow.quantity, 1);

  context.increaseEditingSinglesQuantity();
  context.increaseEditingSinglesQuantity();
  assert.equal(context.editingSinglesRow.quantity, 3);

  context.setEditingSinglesQuantity(0);
  assert.equal(context.editingSinglesRow.quantity, 1);
});

test("manual image helpers update and clear the editing row image", () => {
  const context = createContext({
    editingSinglesRow: {
      item: "Manual item",
      cardNumber: "",
      image: "",
      condition: "",
      language: "",
      cost: 1,
      currency: "CAD",
      quantity: 1,
      marketValue: 2
    }
  });

  assert.equal(context.singlesImageUploadBusy, false);
  assert.equal(context.singlesImageUploadError, "");
  assert.equal(typeof context.setEditingSinglesImageFromDataUrl, "function");
  assert.equal(typeof context.clearEditingSinglesImage, "function");

  context.singlesImageUploadError = "old error";
  context.setEditingSinglesImageFromDataUrl(" data:image/jpeg;base64,abc ");
  assert.equal(context.editingSinglesRow.image, "data:image/jpeg;base64,abc");
  assert.equal(context.singlesImageUploadError, "");

  context.clearEditingSinglesImage();
  assert.equal(context.editingSinglesRow.image, "");
  assert.equal(context.singlesImageUploadError, "");
});

test("uploaded manual image previews before the item name is typed", () => {
  const context = createContext({
    showCatalogSuggestions: false,
    editingSinglesRow: {
      item: "",
      cardNumber: "",
      image: "data:image/jpeg;base64,abc",
      condition: "",
      language: "",
      cost: 1,
      currency: "CAD",
      quantity: 1,
      marketValue: 2
    }
  });

  assert.equal(
    getComputed<string>("editingSinglesPreviewImage").call(context),
    "data:image/jpeg;base64,abc"
  );
});

test("manual image upload reports invalid files without changing the editor image", async () => {
  const context = createContext({
    t: (key: string) => ({
      singlesEditorImageUploadInvalidType: "Choose an image file."
    })[key] || key,
    editingSinglesRow: {
      item: "Manual item",
      cardNumber: "",
      image: "data:image/jpeg;base64,old",
      condition: "",
      language: "",
      cost: 1,
      currency: "CAD",
      quantity: 1,
      marketValue: 2
    }
  });

  await context.applySinglesImageFile({ type: "text/plain", name: "notes.txt" } as File);

  assert.equal(context.singlesImageUploadBusy, false);
  assert.equal(context.singlesImageUploadError, "Choose an image file.");
  assert.equal(context.editingSinglesRow.image, "data:image/jpeg;base64,old");
  assert.deepEqual(context.notify.mock.calls.at(-1), ["Choose an image file.", "warning"]);
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
      image: "https://img.example.com/updated.jpg",
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
  assert.equal(rows[1]?.image, "https://img.example.com/updated.jpg");
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
    singlesItemSuggestions: [{ title: "X", value: "X|||0", name: "X", cardNo: "", rarity: "", marketPrice: null }],
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
          image: "https://img.example.com/rukia.jpg",
          rarity: "C",
          marketPrice: 0.22
        }
      ]
    })
  }));
  vi.stubGlobal("fetch", fetchMock);

  try {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
    const context = createContext({
      currentLotId: 44,
      lots: [
        {
          id: 44,
          lotType: "singles",
          singlesCatalogSource: "pokemon"
        }
      ]
    });
    context.currentSinglesCatalogSource = "pokemon";

    await context.fetchSinglesItemSuggestions("rukia");

    assert.equal(fetchMock.mock.calls.length, 1);
    const fetchCalls = fetchMock.mock.calls as unknown as Array<[RequestInfo | URL]>;
    const requestUrl = String(fetchCalls[0]?.[0] || "");
    assert.equal(requestUrl.includes("game=pokemon"), true);
    assert.equal(requestUrl.includes("q=rukia"), true);
    assert.equal(requestUrl.includes("limit=25"), true);
    assert.equal((context.singlesItemSuggestions as Array<{ name: string }>)[0]?.name, "Rukia Kuchiki");
    assert.equal(
      (context.singlesItemSuggestions as Array<{ image: string }>)[0]?.image,
      "https://img.example.com/rukia.jpg"
    );

    context.currentSinglesCatalogSource = "none";
    await context.fetchSinglesItemSuggestions("rukia");
    assert.equal(fetchMock.mock.calls.length, 1);
    assert.deepEqual(context.singlesItemSuggestions, []);
  } finally {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  }
});

test("fetchSinglesItemSuggestions filters multi-field queries across name, number, and rarity", async () => {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      items: [
        {
          name: "Rei Ayanami",
          cardNo: "UE15BT/EVA-1-004-ALT1",
          image: "https://img.example.com/rei-r.jpg",
          rarity: "R★",
          marketPrice: 46
        },
        {
          name: "Rei Ayanami",
          cardNo: "UE15BT/EVA-1-003",
          image: "https://img.example.com/rei-c.jpg",
          rarity: "R",
          marketPrice: 12
        }
      ]
    })
  }));
  vi.stubGlobal("fetch", fetchMock);

  try {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
    const context = createContext({
      currentSinglesCatalogSource: "ua"
    });

    await context.fetchSinglesItemSuggestions("rei r*");

    const fetchCalls = fetchMock.mock.calls as unknown as Array<[RequestInfo | URL]>;
    const requestUrl = new URL(String(fetchCalls[0]?.[0] || ""));
    assert.equal(requestUrl.searchParams.get("q"), "rei r*");
    assert.equal((context.singlesItemSuggestions as Array<{ rarity: string }>).length, 1);
    assert.equal((context.singlesItemSuggestions as Array<{ rarity: string }>)[0]?.rarity, "R★");
  } finally {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  }
});

test("fetchSinglesItemSuggestions supports rarity-only wildcard queries like r*", async () => {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      items: [
        {
          name: "Rei Ayanami",
          cardNo: "UE15BT/EVA-1-004-ALT1",
          image: "https://img.example.com/rei-r.jpg",
          rarity: "R★",
          marketPrice: 46
        },
        {
          name: "Asuka Shikinami Langley",
          cardNo: "UE15BT/EVA-1-012-ALT1",
          image: "https://img.example.com/asuka-c.jpg",
          rarity: "R",
          marketPrice: 10
        }
      ]
    })
  }));
  vi.stubGlobal("fetch", fetchMock);

  try {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
    const context = createContext({
      currentSinglesCatalogSource: "ua"
    });

    await context.fetchSinglesItemSuggestions("r*");

    const fetchCalls = fetchMock.mock.calls as unknown as Array<[RequestInfo | URL]>;
    const requestUrl = new URL(String(fetchCalls[0]?.[0] || ""));
    assert.equal(requestUrl.searchParams.get("q"), "r*");
    assert.equal((context.singlesItemSuggestions as Array<{ rarity: string }>).length, 1);
    assert.equal((context.singlesItemSuggestions as Array<{ rarity: string }>)[0]?.rarity, "R★");
  } finally {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  }
});

test("fetchSinglesItemSuggestions supports multi-star rarity queries like sr** and sr***", async () => {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      items: [
        {
          name: "Rei Ayanami",
          cardNo: "UE15BT/EVA-1-004-ALT1",
          image: "https://img.example.com/rei-sr2.jpg",
          rarity: "SR★★",
          marketPrice: 46
        },
        {
          name: "Asuka Shikinami Langley",
          cardNo: "UE15BT/EVA-1-012-ALT1",
          image: "https://img.example.com/asuka-sr3.jpg",
          rarity: "SR★★★",
          marketPrice: 10
        },
        {
          name: "Mari Makinami Illustrious",
          cardNo: "UE15BT/EVA-1-017",
          image: "https://img.example.com/mari-sr.jpg",
          rarity: "SR",
          marketPrice: 8
        }
      ]
    })
  }));
  vi.stubGlobal("fetch", fetchMock);

  try {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
    const context = createContext({
      currentSinglesCatalogSource: "ua"
    });

    await context.fetchSinglesItemSuggestions("sr**");
    assert.equal((context.singlesItemSuggestions as Array<{ rarity: string }>).length, 2);
    assert.deepEqual(
      (context.singlesItemSuggestions as Array<{ rarity: string }>).map((item) => item.rarity),
      ["SR★★", "SR★★★"]
    );

    await context.fetchSinglesItemSuggestions("sr***");
    assert.equal((context.singlesItemSuggestions as Array<{ rarity: string }>).length, 1);
    assert.equal((context.singlesItemSuggestions as Array<{ rarity: string }>)[0]?.rarity, "SR★★★");
  } finally {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  }
});

test("fetchSinglesItemSuggestions keeps full multi-token rarity queries like sr** eva", async () => {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      items: [
        {
          name: "Evangelion Proto Type-00",
          cardNo: "UE15BT/EVA-1-080-ALT2",
          image: "https://exburst.dev/uaen/cards/sd/UE15BT_EVA-1-080_p2.webp",
          rarity: "SR★★",
          marketPrice: 188.19
        },
        {
          name: "Shanks",
          cardNo: "OP11-118",
          image: "https://img.example.com/shanks.jpg",
          rarity: "SR★★",
          marketPrice: 99
        }
      ]
    })
  }));
  vi.stubGlobal("fetch", fetchMock);

  try {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
    const context = createContext({
      currentSinglesCatalogSource: "ua"
    });

    await context.fetchSinglesItemSuggestions("sr** eva");

    const fetchCalls = fetchMock.mock.calls as unknown as Array<[RequestInfo | URL]>;
    const requestUrl = new URL(String(fetchCalls[0]?.[0] || ""));
    assert.equal(requestUrl.searchParams.get("q"), "sr** eva");
    assert.equal((context.singlesItemSuggestions as Array<{ name: string }>).length, 1);
    assert.equal(
      (context.singlesItemSuggestions as Array<{ name: string }>)[0]?.name,
      "Evangelion Proto Type-00"
    );
  } finally {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  }
});

test("preloadSinglesEditorPreview caches and resolves the editor image", async () => {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      items: [
        {
          name: "Rei Ayanami",
          cardNo: "UE15BT/EVA-1-004-ALT1",
          image: "https://img.example.com/rei-large.jpg",
          rarity: "SR",
          marketPrice: 46
        }
      ]
    })
  }));
  vi.stubGlobal("fetch", fetchMock);

  try {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
    const context = createContext({
      currentSinglesCatalogSource: "ua",
      showCatalogSuggestions: true,
      editingSinglesRow: {
        item: "Rei Ayanami",
        cardNumber: "UE15BT/EVA-1-004-ALT1",
        condition: "",
        language: "",
        cost: 0,
        currency: "CAD",
        quantity: 1,
        marketValue: 46
      }
    });

    await context.preloadSinglesEditorPreview();

    assert.equal(fetchMock.mock.calls.length, 1);
    assert.equal(context.singlesEditorPreviewLoading, false);
    assert.equal(context.editingSinglesRow.image, "https://img.example.com/rei-large.jpg");
    assert.equal(
      getComputed<string>("editingSinglesPreviewImage").call(context),
      "https://img.example.com/rei-large.jpg"
    );
  } finally {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  }
});

test("catalog source computed getters/setters and labels normalize values", () => {
  const context = createContext({
    currentLotId: 9,
    lots: [
      { id: 9, lotType: "singles", singlesCatalogSource: "pkmn" }
    ],
    currentLotCatalogSource: "ua",
    setCurrentSinglesCatalogSource: vi.fn(),
    showCatalogSourceSheet: true
  });

  const sourceComputed = (singlesConfigWindowDefinition.computed as unknown as Record<string, { get?: (this: AnyContext) => unknown; set?: (this: AnyContext, v: unknown) => void }>).currentSinglesCatalogSource;
  assert.equal(sourceComputed.get?.call(context), "pokemon");
  sourceComputed.set?.call(context, "none");
  assert.deepEqual((context.setCurrentSinglesCatalogSource as ReturnType<typeof vi.fn>).mock.calls[0], ["none"]);

  context.currentSinglesCatalogSource = "none";
  assert.equal(getComputed<boolean>("showCatalogSuggestions").call(context), false);
  assert.equal(getComputed<string>("currentSinglesCatalogSourceLabel").call(context), "Custom");

  context.currentSinglesCatalogSource = "pokemon";
  assert.equal(getComputed<string>("currentSinglesCatalogSourceLabel").call(context), "Pokemon");

  context.currentSinglesCatalogSource = "ua";
  assert.equal(getComputed<string>("currentSinglesCatalogSourceLabel").call(context), "Union Arena");

  context.chooseSinglesCatalogSource("pokemon");
  assert.equal(context.showCatalogSourceSheet, false);
  assert.equal((context.setCurrentSinglesCatalogSource as ReturnType<typeof vi.fn>).mock.calls.length, 2);
});

test("search update, cancel, and cards api resolution cover debounce and fallback branches", async () => {
  vi.useFakeTimers();
  const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
  try {
    const abortSpy = vi.fn();
    const context = createContext({
      showCatalogSuggestions: true,
      singlesItemSearchAbortController: { abort: abortSpy },
      singlesItemSearchTimerId: setTimeout(() => {}, 99999),
      fetchSinglesItemSuggestions: vi.fn(),
      singlesItemSuggestions: [{ title: "old" }],
      singlesItemSearchLoading: true,
      editingSinglesRow: {
        item: "Old Card",
        image: "https://img.example.com/old.jpg",
        cardNumber: "OLD-001",
        condition: "",
        language: "",
        cost: 0,
        currency: "CAD",
        quantity: 1,
        marketValue: 0
      }
    });

    context.cancelSinglesItemSearch();
    assert.equal(clearTimeoutSpy.mock.calls.length > 0, true);
    assert.equal(abortSpy.mock.calls.length, 1);
    assert.equal(context.singlesItemSearchTimerId, null);
    assert.equal(context.singlesItemSearchAbortController, null);

    context.showCatalogSuggestions = false;
    context.onSinglesItemSearchUpdate("abc");
    assert.deepEqual(context.singlesItemSuggestions, []);
    assert.equal(context.singlesItemMenuOpen, false);
    assert.equal(context.singlesItemSearchLoading, false);

    context.showCatalogSuggestions = true;
    context.onSinglesItemSearchUpdate("a");
    assert.deepEqual(context.singlesItemSuggestions, []);
    assert.equal(context.singlesItemMenuOpen, false);
    assert.equal(context.editingSinglesRow.image, "");
    assert.equal(context.editingSinglesRow.cardNumber, "");
    assert.equal(context.singlesItemSearchLoading, false);

    context.onSinglesItemSearchUpdate("ab");
    vi.advanceTimersByTime(400);
    await vi.runAllTimersAsync();
    assert.deepEqual((context.fetchSinglesItemSuggestions as ReturnType<typeof vi.fn>).mock.calls[0], ["ab"]);
  } finally {
    clearTimeoutSpy.mockRestore();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  }
});

test("fetchSinglesItemSuggestions handles missing base, failed response, and aborted fetch", async () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const context = createContext({
    currentSinglesCatalogSource: "pokemon",
    singlesItemSuggestions: [{ title: "keep" }]
  });

  await context.fetchSinglesItemSuggestions("query");
  assert.deepEqual(context.singlesItemSuggestions, []);

  const failedFetch = vi.fn(async () => ({ ok: false, status: 500 }));
  vi.stubGlobal("fetch", failedFetch);
  vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
  await context.fetchSinglesItemSuggestions("query");
  assert.equal(context.singlesItemSearchLoading, false);
  assert.equal(context.singlesItemSearchAbortController, null);
  assert.deepEqual(context.singlesItemSuggestions, []);

  const abortedFetch = vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => {
    init?.signal?.dispatchEvent(new Event("abort"));
    (init?.signal as AbortSignal & { aborted?: boolean }).aborted = true;
    throw new Error("aborted");
  });
  vi.stubGlobal("fetch", abortedFetch);
  await context.fetchSinglesItemSuggestions("query");
  assert.equal(context.singlesItemSearchLoading, false);
  warnSpy.mockRestore();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("row editor helpers handle selection, editing branch, and remove confirmation paths", () => {
  const context = createContext({
    showCatalogSuggestions: true,
    editingSinglesRow: {
      item: "",
      cardNumber: "",
      condition: "",
      language: "",
      cost: 0,
      currency: "CAD",
      quantity: 1,
      marketValue: 0
    },
    closeSinglesRowEditor: vi.fn(),
    removeSinglesPurchaseRow: vi.fn(),
    preloadSinglesEditorPreview: vi.fn(async () => undefined),
    askConfirmation: vi.fn((_payload, onConfirm: () => void) => onConfirm())
  });

  context.handleAddSinglesPurchase();
  assert.equal(context.showSinglesRowEditor, true);
  assert.equal(context.editingSinglesRowId, null);

  const selected = {
    title: "A #1",
    value: "A|1|C",
    name: "A",
    cardNo: "1",
    image: "https://img.example.com/a.jpg",
    rarity: "C",
    marketPrice: 2.5
  };
  context.onSinglesItemSelected(selected);
  assert.equal(context.editingSinglesRow.item, "A");
  assert.equal(context.editingSinglesRow.cardNumber, "1");
  assert.equal(context.editingSinglesRow.image, "https://img.example.com/a.jpg");
  assert.equal(context.editingSinglesRow.marketValue, 2.5);
  assert.equal(context.singlesItemSearchText, "");
  assert.equal(context.singlesItemMenuOpen, false);

  context.editingSinglesRow.item = "";
  context.editingSinglesRow.cardNumber = "";
  context.editingSinglesRow.marketValue = 0;
  context.singlesItemSuggestions = [selected];
  context.onSinglesItemSelected(selected.value);
  assert.equal(context.editingSinglesRow.item, "A");
  assert.equal(context.editingSinglesRow.cardNumber, "1");
  assert.equal(context.editingSinglesRow.marketValue, 2.5);

  context.editingSinglesRow.cardNumber = "OLD";
  context.onSinglesItemSelected({
    ...selected,
    value: "A|2|C",
    cardNo: "2"
  });
  assert.equal(context.editingSinglesRow.cardNumber, "2");

  context.onSinglesItemSelected("typed value");
  context.onSinglesItemSelected(null);
  assert.equal(context.formatSuggestionRarity(""), "—");
  assert.equal(context.formatSuggestionRarity("Rare"), "Rare");

  context.currency = "USD";
  context.openSinglesRowEditor();
  assert.equal(context.editingSinglesRowId, null);
  assert.equal(context.showSinglesRowEditor, true);

  context.openSinglesRowEditor({
    id: 7,
    item: "Edit",
    cardNumber: "E7",
    condition: "",
    language: "",
    cost: 1,
    currency: "CAD",
    quantity: 2,
    marketValue: 3
  } as SinglesPurchaseEntry);
  assert.equal(context.editingSinglesRowId, 7);
  assert.equal(context.editingSinglesRow.item, "Edit");
  assert.equal(context.singlesItemSearchText, "");

  context.removeSinglesRowFromEditor();
  assert.equal((context.removeSinglesPurchaseRow as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal((context.closeSinglesRowEditor as ReturnType<typeof vi.fn>).mock.calls.length, 1);

  context.editingSinglesRowId = null;
  context.removeSinglesRowFromEditor();
  assert.equal((context.closeSinglesRowEditor as ReturnType<typeof vi.fn>).mock.calls.length, 2);
});

test("maybeOpenSinglesItemSuggestions reopens cached results or fetches for current text", () => {
  const fetchSinglesItemSuggestions = vi.fn();
  const context = createContext({
    showCatalogSuggestions: true,
    editingSinglesRow: {
      item: "Rei Ayanami",
      cardNumber: "",
      condition: "",
      language: "",
      cost: 0,
      currency: "CAD",
      quantity: 1,
      marketValue: 0
    },
    singlesItemSearchText: "",
    singlesItemSuggestions: [],
    fetchSinglesItemSuggestions
  });

  context.maybeOpenSinglesItemSuggestions();
  assert.deepEqual(fetchSinglesItemSuggestions.mock.calls[0], ["Rei Ayanami"]);
  assert.equal(context.singlesItemSearchText, "");
  assert.equal(context.singlesItemMenuOpen, false);

  context.singlesItemSearchText = "rei";
  context.singlesItemSuggestions = [
    {
      title: "Rei",
      value: "Rei|||0",
      name: "Rei",
      cardNo: "",
      image: "",
      rarity: "",
      marketPrice: null
    }
  ];
  context.maybeOpenSinglesItemSuggestions();
  assert.equal(context.singlesItemMenuOpen, true);
});

test("catalog editor selection stays unique for duplicate names", () => {
  const context = createContext({
    showCatalogSuggestions: true,
    editingSinglesRow: {
      item: "Goreinu",
      cardNumber: "UEX04BT/HTR-2-013-ALT1",
      image: "https://img.example.com/goreinu-alt1.jpg",
      condition: "",
      language: "",
      cost: 0,
      currency: "CAD",
      quantity: 1,
      marketValue: 0.92
    },
    singlesItemSuggestions: [
      {
        title: "Goreinu #UE02BT/HTR-1-004",
        value: "Goreinu|UE02BT/HTR-1-004|C",
        name: "Goreinu",
        cardNo: "UE02BT/HTR-1-004",
        image: "https://img.example.com/goreinu-a.jpg",
        rarity: "C",
        marketPrice: 0.07
      },
      {
        title: "Goreinu #UEX04BT/HTR-2-013-ALT1",
        value: "Goreinu|UEX04BT/HTR-2-013-ALT1|R",
        name: "Goreinu",
        cardNo: "UEX04BT/HTR-2-013-ALT1",
        image: "https://img.example.com/goreinu-alt1.jpg",
        rarity: "R",
        marketPrice: 0.92
      }
    ]
  });

  assert.equal(
    getComputed<string | null>("currentSinglesEditorSelectionValue").call(context),
    "Goreinu|UEX04BT/HTR-2-013-ALT1|R"
  );

  const items = getComputed<Array<{ title: string }>>("singlesEditorCatalogItems").call(context);
  assert.equal(items[0]?.title, "Goreinu #UE02BT/HTR-1-004");
  assert.equal(items[1]?.title, "Goreinu #UEX04BT/HTR-2-013-ALT1");
});

test("catalog editor clears active selection while the user edits search text", () => {
  const context = createContext({
    showCatalogSuggestions: true,
    editingSinglesRow: {
      item: "Goreinu",
      cardNumber: "UEX04BT/HTR-2-013-ALT1",
      image: "https://img.example.com/goreinu-alt1.jpg",
      condition: "",
      language: "",
      cost: 0,
      currency: "CAD",
      quantity: 1,
      marketValue: 0.92
    },
    singlesItemSearchText: "",
    singlesItemSuggestions: [
      {
        title: "Goreinu #UEX04BT/HTR-2-013-ALT1",
        value: "Goreinu|UEX04BT/HTR-2-013-ALT1|R",
        name: "Goreinu",
        cardNo: "UEX04BT/HTR-2-013-ALT1",
        image: "https://img.example.com/goreinu-alt1.jpg",
        rarity: "R",
        marketPrice: 0.92
      }
    ]
  });

  assert.equal(
    getComputed<string | null>("currentSinglesEditorSelectionValue").call(context),
    "Goreinu|UEX04BT/HTR-2-013-ALT1|R"
  );

  context.onSinglesItemSearchUpdate("gor");

  assert.equal(context.editingSinglesRow.item, "");
  assert.equal(context.editingSinglesRow.cardNumber, "");
  assert.equal(context.editingSinglesRow.image, "");
  assert.equal(context.singlesItemSearchText, "gor");
  assert.equal(getComputed<string | null>("currentSinglesEditorSelectionValue").call(context), null);
});

test("catalog selection change picks the matching duplicate instead of the first same-name card", () => {
  const context = createContext({
    showCatalogSuggestions: true,
    onSinglesItemSelected: vi.fn(),
    singlesEditorCatalogItems: [
      {
        title: "Goreinu #UE02BT/HTR-1-004",
        value: "Goreinu|UE02BT/HTR-1-004|C",
        name: "Goreinu",
        cardNo: "UE02BT/HTR-1-004",
        image: "https://img.example.com/goreinu-a.jpg",
        rarity: "C",
        marketPrice: 0.07
      },
      {
        title: "Goreinu #UEX04BT/HTR-2-013-ALT1",
        value: "Goreinu|UEX04BT/HTR-2-013-ALT1|R",
        name: "Goreinu",
        cardNo: "UEX04BT/HTR-2-013-ALT1",
        image: "https://img.example.com/goreinu-alt1.jpg",
        rarity: "R",
        marketPrice: 0.92
      }
    ]
  });

  context.onSinglesCatalogSelectionChange("Goreinu|UEX04BT/HTR-2-013-ALT1|R");

  assert.equal((context.onSinglesItemSelected as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal((context.onSinglesItemSelected as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.cardNo, "UEX04BT/HTR-2-013-ALT1");
});

test("catalog editor clear action resets both selection and search text", () => {
  const context = createContext({
    showCatalogSuggestions: true,
    editingSinglesRow: {
      item: "Mari Makinami Illustrious",
      cardNumber: "UE15BT/EVA-1-017-ALT1",
      image: "https://img.example.com/mari.jpg",
      condition: "",
      language: "",
      cost: 0,
      currency: "CAD",
      quantity: 1,
      marketValue: 15
    },
    singlesItemSearchText: "mar",
    singlesItemSuggestions: [
      {
        title: "Mari Makinami Illustrious #UE15BT/EVA-1-017-ALT1",
        value: "Mari Makinami Illustrious|UE15BT/EVA-1-017-ALT1|SR",
        name: "Mari Makinami Illustrious",
        cardNo: "UE15BT/EVA-1-017-ALT1",
        image: "https://img.example.com/mari.jpg",
        rarity: "SR",
        marketPrice: 15
      }
    ],
    singlesItemMenuOpen: true,
    singlesItemSearchLoading: true,
    cancelSinglesItemSearch: vi.fn()
  });

  context.clearSinglesCatalogSelection();

  assert.equal(context.editingSinglesRow.item, "");
  assert.equal(context.editingSinglesRow.cardNumber, "");
  assert.equal(context.editingSinglesRow.image, "");
  assert.equal(context.singlesItemSearchText, "");
  assert.equal(context.singlesItemMenuOpen, false);
  assert.equal(context.singlesItemSearchLoading, false);
  assert.deepEqual(context.singlesItemSuggestions, []);
  assert.equal((context.cancelSinglesItemSearch as ReturnType<typeof vi.fn>).mock.calls.length, 1);
});

test("catalog editor backspace releases a selected card into editable search text", () => {
  const context = createContext({
    showCatalogSuggestions: true,
    editingSinglesRow: {
      item: "Rei Ayanami",
      cardNumber: "UE15BT/EVA-1-004-ALT1",
      image: "https://img.example.com/rei.jpg",
      condition: "",
      language: "",
      cost: 0,
      currency: "CAD",
      quantity: 1,
      marketValue: 46
    },
    singlesItemSearchText: ""
  });
  const event = {
    preventDefault: vi.fn()
  } as unknown as KeyboardEvent;

  context.onSinglesItemBackspace(event);

  assert.equal((event.preventDefault as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal(context.editingSinglesRow.item, "");
  assert.equal(context.editingSinglesRow.cardNumber, "");
  assert.equal(context.editingSinglesRow.image, "");
  assert.equal(context.singlesItemSearchText, "Rei Ayanami");
  assert.equal(getComputed<string | null>("currentSinglesEditorSelectionValue").call(context), null);

  context.cancelSinglesItemSearch();
});

test("image preview opens only for valid images and closes cleanly", () => {
  const context = createContext();

  context.openSinglesImagePreview("", "Card A");
  assert.equal(context.showSinglesImagePreview, false);

  context.openSinglesImagePreview("https://img.example.com/card-a.jpg", "Card A");
  assert.equal(context.showSinglesImagePreview, true);
  assert.equal(context.singlesImagePreviewSrc, "https://img.example.com/card-a.jpg");
  assert.equal(context.singlesImagePreviewTitle, "Card A");

  context.closeSinglesImagePreview();
  assert.equal(context.showSinglesImagePreview, false);
  assert.equal(context.singlesImagePreviewSrc, "");
  assert.equal(context.singlesImagePreviewTitle, "");
});

test("desktop selection, scroll, icons, watcher, and lifecycle branches execute", () => {
  const context = createContext({
    useDesktopVirtualization: false,
    desktopRowsScrollTop: 5,
    selectedDesktopRowIds: [1, 2],
    isDesktopSelectMode: false,
    mobileRenderCount: 10,
    visibleSinglesPurchases: [{ id: 1 }],
    loadSinglesInfoNoticeState: vi.fn(),
    resetMobileRowsPagination: vi.fn(),
    cancelSinglesItemSearch: vi.fn()
  });

  context.onDesktopRowsScroll({ target: { scrollTop: 999 } } as unknown as Event);
  assert.equal(context.desktopRowsScrollTop, 5);

  context.useDesktopVirtualization = true;
  context.onDesktopRowsScroll({ target: { scrollTop: 77 } } as unknown as Event);
  assert.equal(context.desktopRowsScrollTop, 77);

  context.toggleDesktopSelectMode();
  assert.equal(context.isDesktopSelectMode, true);
  context.toggleDesktopSelectMode();
  assert.equal(context.isDesktopSelectMode, false);
  assert.deepEqual(context.selectedDesktopRowIds, []);

  assert.equal(context.sortIconFor("item"), "mdi-swap-vertical");
  context.desktopSortBy = "item";
  context.desktopSortDesc = false;
  assert.equal(context.sortIconFor("item"), "mdi-arrow-up");
  context.desktopSortDesc = true;
  assert.equal(context.sortIconFor("item"), "mdi-arrow-down");

  const watchHandler = (singlesConfigWindowDefinition.watch as unknown as Record<string, (this: AnyContext) => void>).visibleSinglesPurchases;
  watchHandler.call(context);
  assert.equal(context.mobileRenderCount, 1);

  (singlesConfigWindowDefinition.mounted as unknown as (this: AnyContext) => void).call(context);
  assert.equal((context.loadSinglesInfoNoticeState as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal((context.resetMobileRowsPagination as ReturnType<typeof vi.fn>).mock.calls.length, 1);

  (singlesConfigWindowDefinition.beforeUnmount as unknown as (this: AnyContext) => void).call(context);
  assert.equal((context.cancelSinglesItemSearch as ReturnType<typeof vi.fn>).mock.calls.length, 1);

  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const bridge = (singlesConfigWindowDefinition.setup as (props: { ctx: Record<string, unknown> }) => Record<string, unknown>)({
    ctx: { testValue: 123 }
  });
  warnSpy.mockRestore();
  assert.equal(bridge.testValue, 123);
});
