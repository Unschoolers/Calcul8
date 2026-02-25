import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import type { Lot } from "../src/types/app.ts";

const {
  readStorageWithLegacyMock,
  removeStorageWithLegacyMock,
  getLegacySalesStorageKeyMock
} = vi.hoisted(() => ({
  readStorageWithLegacyMock: vi.fn(),
  removeStorageWithLegacyMock: vi.fn(),
  getLegacySalesStorageKeyMock: vi.fn((lotId: number) => `legacy_sales_${lotId}`)
}));

vi.mock("../src/app-core/storageKeys.ts", async () => {
  const actual = await vi.importActual<typeof import("../src/app-core/storageKeys.ts")>(
    "../src/app-core/storageKeys.ts"
  );
  return {
    ...actual,
    readStorageWithLegacy: readStorageWithLegacyMock,
    removeStorageWithLegacy: removeStorageWithLegacyMock,
    getLegacySalesStorageKey: getLegacySalesStorageKeyMock,
    getLegacyStorageKeys: () => ({
      LAST_LOT_ID: "legacy_last_lot_id",
      PRESETS: "legacy_presets",
      ENTITLEMENT_CACHE: "legacy_entitlement_cache",
      PRO_ACCESS: "legacy_pro_access",
      GOOGLE_ID_TOKEN: "legacy_google_id_token",
      GOOGLE_PROFILE_CACHE: "legacy_google_profile_cache",
      DEBUG_USER_ID: "legacy_debug_user_id",
      SYNC_CLIENT_VERSION: "legacy_sync_client_version"
    })
  };
});

import { configLotMethods } from "../src/app-core/methods/config-lots.ts";

type Ctx = Record<string, unknown>;

type CsvPicker = {
  type: string;
  accept: string;
  files?: Array<{ name: string }>;
  onchange: (() => void) | null;
  click: () => void;
};

function makeLot(overrides: Partial<Lot> = {}): Lot {
  return {
    id: 101,
    name: "Lot A",
    lotType: "singles",
    boxPriceCost: 70,
    boxesPurchased: 16,
    packsPerBox: 16,
    spotsPerBox: 5,
    costInputMode: "perBox",
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    purchaseDate: "2026-02-22",
    purchaseShippingCost: 2,
    purchaseTaxPercent: 12,
    sellingTaxPercent: 15,
    sellingShippingPerOrder: 0,
    includeTax: true,
    spotPrice: 1,
    boxPriceSell: 2,
    packPrice: 3,
    targetProfitPercent: 10,
    singlesPurchases: [],
    ...overrides
  };
}

function createContext(overrides: Ctx = {}): Ctx {
  const lot = makeLot();
  return {
    boxPriceCost: lot.boxPriceCost,
    boxesPurchased: lot.boxesPurchased,
    packsPerBox: lot.packsPerBox,
    spotsPerBox: lot.spotsPerBox,
    costInputMode: lot.costInputMode,
    currency: lot.currency,
    sellingCurrency: lot.sellingCurrency,
    exchangeRate: lot.exchangeRate,
    purchaseDate: lot.purchaseDate,
    purchaseShippingCost: lot.purchaseShippingCost,
    purchaseTaxPercent: lot.purchaseTaxPercent,
    sellingTaxPercent: lot.sellingTaxPercent,
    sellingShippingPerOrder: lot.sellingShippingPerOrder,
    includeTax: lot.includeTax,
    spotPrice: lot.spotPrice,
    boxPriceSell: lot.boxPriceSell,
    packPrice: lot.packPrice,
    targetProfitPercent: lot.targetProfitPercent,
    liveSpotPrice: 9,
    liveBoxPriceSell: 10,
    livePackPrice: 11,
    lots: [lot],
    currentLotId: lot.id,
    currentLotType: "singles",
    hasProAccess: true,
    currentTab: "config",
    singlesPurchases: [],
    singlesCsvImportHeaders: [],
    singlesCsvImportRows: [],
    singlesCsvImportCurrency: "CAD",
    singlesCsvImportMode: "merge",
    singlesCsvMapItem: null,
    singlesCsvMapCardNumber: null,
    singlesCsvMapCondition: null,
    singlesCsvMapLanguage: null,
    singlesCsvMapCost: null,
    singlesCsvMapQuantity: null,
    singlesCsvMapMarketValue: null,
    showSinglesCsvMapperModal: false,
    newLotName: "",
    newLotType: "bulk",
    renameLotName: "",
    showRenameLotModal: false,
    purchaseUiMode: "expert",
    saveLotsToStorage: vi.fn(),
    notify: vi.fn(),
    onSinglesPurchaseRowsChange: vi.fn(),
    cancelSinglesPurchasesCsvImport: vi.fn(),
    autoSaveSetup: vi.fn(),
    syncLivePricesFromDefaults: vi.fn(),
    recalculateDefaultPrices: vi.fn(),
    pushCloudSync: vi.fn(async () => undefined),
    loadLot: vi.fn(),
    loadSalesFromStorage: vi.fn(),
    loadSalesForLotId: vi.fn(() => []),
    getSalesStorageKey: (lotId: number) => `sales_${lotId}`,
    askConfirmation: vi.fn((_opts, onConfirm: () => void) => onConfirm()),
    initSalesChart: vi.fn(),
    initPortfolioChart: vi.fn(),
    $nextTick: (callback: () => void) => callback(),
    ...overrides
  };
}

function installCsvEnvironment(rawResult: unknown): void {
  const picker: CsvPicker = {
    type: "",
    accept: "",
    files: [{ name: "cards.csv" }],
    onchange: null,
    click(): void {
      this.onchange?.();
    }
  };

  class MockFileReader {
    result: string | ArrayBuffer | null = null;
    onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => void) | null = null;
    onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => void) | null = null;

    readAsText(): void {
      this.result = rawResult as string | ArrayBuffer | null;
      this.onload?.call(this as unknown as FileReader, {} as ProgressEvent<FileReader>);
    }
  }

  vi.stubGlobal("document", {
    createElement: vi.fn(() => picker)
  });
  vi.stubGlobal("FileReader", MockFileReader as unknown as typeof FileReader);
}

beforeEach(() => {
  vi.clearAllMocks();
  readStorageWithLegacyMock.mockReturnValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("add/remove/clear singles rows only mutate in singles mode", () => {
  const ctx = createContext({
    singlesPurchases: [],
    onSinglesPurchaseRowsChange: vi.fn()
  });

  configLotMethods.addSinglesPurchaseRow.call(ctx as never);
  const addedRows = ctx.singlesPurchases as Array<{ id: number; quantity: number }>;
  assert.equal(addedRows.length, 1);
  assert.equal(addedRows[0]?.quantity, 1);

  const addedId = addedRows[0]!.id;
  configLotMethods.removeSinglesPurchaseRow.call(ctx as never, addedId);
  assert.equal((ctx.singlesPurchases as unknown[]).length, 0);

  (ctx.singlesPurchases as unknown[]) = [{ id: 1 }];
  configLotMethods.clearSinglesPurchases.call(ctx as never);
  assert.equal((ctx.singlesPurchases as unknown[]).length, 0);
  assert.equal((ctx.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "Cleared singles purchase rows.");

  const bulkCtx = createContext({
    currentLotType: "bulk",
    singlesPurchases: [{ id: 1 }]
  });
  configLotMethods.addSinglesPurchaseRow.call(bulkCtx as never);
  configLotMethods.removeSinglesPurchaseRow.call(bulkCtx as never, 1);
  configLotMethods.clearSinglesPurchases.call(bulkCtx as never);
  assert.equal((bulkCtx.singlesPurchases as unknown[]).length, 1);
});

test("addSinglesPurchaseRow generates a non-colliding id when Date.now matches an existing row id", () => {
  const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(5000);
  try {
    const ctx = createContext({
      currentLotType: "singles",
      singlesPurchases: [
        {
          id: 5000,
          item: "Card A",
          cardNumber: "001",
          condition: "",
          language: "",
          cost: 1,
          currency: "CAD",
          quantity: 1,
          marketValue: 1
        }
      ],
      onSinglesPurchaseRowsChange: vi.fn()
    });

    configLotMethods.addSinglesPurchaseRow.call(ctx as never);

    const rows = ctx.singlesPurchases as Array<{ id: number }>;
    assert.equal(rows.length, 2);
    assert.equal(rows[1]?.id, 5001);
  } finally {
    dateNowSpy.mockRestore();
  }
});

test("onSinglesPurchaseRowsChange normalizes entries and writes to selected singles lot", () => {
  const lot = makeLot({
    id: 900,
    lotType: "singles",
    singlesPurchases: []
  });
  const ctx = createContext({
    lots: [lot],
    currentLotId: 900,
    currentLotType: "singles",
    singlesPurchases: [
      {
        id: 0,
        item: "  Card A  ",
        cardNumber: " 007 ",
        condition: "  Near Mint ",
        language: " English ",
        cost: -10,
        quantity: "3.9",
        marketValue: "4.25"
      },
      {
        id: Number.NaN,
        item: "   ",
        cardNumber: 12345,
        cost: "oops",
        quantity: -1,
        marketValue: -4
      }
    ],
    recalculateDefaultPrices: vi.fn()
  });

  configLotMethods.onSinglesPurchaseRowsChange.call(ctx as never);

  const rows = ctx.singlesPurchases as Array<{
    id: number;
    item: string;
    cardNumber: string;
    condition: string;
    language: string;
    cost: number;
    quantity: number;
    marketValue: number;
  }>;
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.id > 0, true);
  assert.equal(rows[0]?.item, "Card A");
  assert.equal(rows[0]?.cardNumber, "007");
  assert.equal(rows[0]?.condition, "Near Mint");
  assert.equal(rows[0]?.language, "English");
  assert.equal(rows[0]?.cost, 0);
  assert.equal(rows[0]?.quantity, 3);
  assert.equal(rows[0]?.marketValue, 4.25);
  assert.equal(rows[1]?.item, "");
  assert.equal(rows[1]?.cardNumber, "");
  assert.equal(rows[1]?.condition, "");
  assert.equal(rows[1]?.language, "");
  assert.equal(rows[1]?.cost, 0);
  assert.equal(rows[1]?.quantity, 0);
  assert.equal(rows[1]?.marketValue, 0);
  assert.equal(Array.isArray(lot.singlesPurchases), true);
  assert.equal(lot.singlesPurchases?.length, 2);
  assert.equal((ctx.recalculateDefaultPrices as ReturnType<typeof vi.fn>).mock.calls.length, 1);
});

test("importSinglesPurchasesCsv infers header mapping aliases", () => {
  installCsvEnvironment(
    "Item,Card Number,Condition,Language,Price,Qty,Market Value\nPikachu,025,Near Mint,English,$3.50,2,$5.00\nCharizard,006,Good,French,12.75,1,15"
  );
  const ctx = createContext({
    currentLotType: "singles"
  });

  configLotMethods.importSinglesPurchasesCsv.call(ctx as never);

  assert.equal(ctx.showSinglesCsvMapperModal, true);
  assert.deepEqual(ctx.singlesCsvImportHeaders, ["Item", "Card Number", "Condition", "Language", "Price", "Qty", "Market Value"]);
  assert.equal(ctx.singlesCsvMapItem, 0);
  assert.equal(ctx.singlesCsvMapCardNumber, 1);
  assert.equal(ctx.singlesCsvMapCondition, 2);
  assert.equal(ctx.singlesCsvMapLanguage, 3);
  assert.equal(ctx.singlesCsvMapCost, 4);
  assert.equal(ctx.singlesCsvMapQuantity, 5);
  assert.equal(ctx.singlesCsvMapMarketValue, 6);
  assert.equal(ctx.singlesCsvImportCurrency, "CAD");
  assert.equal(ctx.singlesCsvImportMode, "merge");
});

test("importSinglesPurchasesCsv generates empty mapping when no header aliases match", () => {
  installCsvEnvironment(
    "Blue-Eyes White Dragon,2,14.99\nDark Magician,1,9.99"
  );
  const ctx = createContext({
    currentLotType: "singles"
  });

  configLotMethods.importSinglesPurchasesCsv.call(ctx as never);

  assert.equal(ctx.showSinglesCsvMapperModal, true);
  assert.deepEqual(ctx.singlesCsvImportHeaders, ["Column 1", "Column 2", "Column 3"]);
  assert.equal((ctx.singlesCsvImportRows as string[][]).length, 2);
  assert.equal(ctx.singlesCsvMapItem, null);
  assert.equal(ctx.singlesCsvMapCardNumber, null);
  assert.equal(ctx.singlesCsvMapCondition, null);
  assert.equal(ctx.singlesCsvMapLanguage, null);
  assert.equal(ctx.singlesCsvMapCost, null);
  assert.equal(ctx.singlesCsvMapQuantity, null);
  assert.equal(ctx.singlesCsvMapMarketValue, null);
  assert.equal(ctx.singlesCsvImportCurrency, "CAD");
  assert.equal(ctx.singlesCsvImportMode, "merge");
});

test("importSinglesPurchasesCsv reports read errors when file content is not text", () => {
  installCsvEnvironment(new ArrayBuffer(8));
  const ctx = createContext({
    currentLotType: "singles"
  });

  configLotMethods.importSinglesPurchasesCsv.call(ctx as never);

  assert.equal((ctx.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "Could not read CSV file.");
});

test("confirmSinglesPurchasesCsvImport warns when import data is missing", () => {
  const ctx = createContext({
    currentLotType: "singles",
    showSinglesCsvMapperModal: true,
    cancelSinglesPurchasesCsvImport: vi.fn(() => {
      configLotMethods.cancelSinglesPurchasesCsvImport.call(ctx as never);
    })
  });

  configLotMethods.confirmSinglesPurchasesCsvImport.call(ctx as never);

  assert.equal(ctx.showSinglesCsvMapperModal, false);
  assert.equal((ctx.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "No CSV data available to import.");
});

test("confirmSinglesPurchasesCsvImport requires item and quantity mappings", () => {
  const ctx = createContext({
    currentLotType: "singles",
    singlesCsvImportHeaders: ["Item", "Qty"],
    singlesCsvImportRows: [["Pikachu", "2"]],
    singlesCsvMapItem: null,
    singlesCsvMapQuantity: 1
  });

  configLotMethods.confirmSinglesPurchasesCsvImport.call(ctx as never);
  assert.equal((ctx.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "Map Item and Quantity columns before importing.");
});

test("confirmSinglesPurchasesCsvImport imports mapped rows with optional cost mapping", () => {
  const lot = makeLot({
    id: 404,
    lotType: "singles",
    singlesPurchases: []
  });
  const ctx = createContext({
    lots: [lot],
    currentLotId: 404,
    currentLotType: "singles",
    singlesPurchases: [],
    singlesCsvImportHeaders: ["Name", "Qty", "Card #", "Condition", "Language", "Market"],
    singlesCsvImportRows: [
      [" Pikachu ", "2", "025", "Near Mint", "English", "$5.50"],
      ["No Quantity", "", "001", "Good", "French", "$1"],
      ["Zero Qty", "0", "002", "Good", "French", "$2"],
      ["Charmander", "3.8", "004", "Good", "French", "$2.75"]
    ],
    singlesCsvImportCurrency: "USD",
    singlesCsvMapItem: 0,
    singlesCsvMapCardNumber: 2,
    singlesCsvMapCondition: 3,
    singlesCsvMapLanguage: 4,
    singlesCsvMapCost: null,
    singlesCsvMapQuantity: 1,
    singlesCsvMapMarketValue: 5,
    onSinglesPurchaseRowsChange: vi.fn(() => {
      configLotMethods.onSinglesPurchaseRowsChange.call(ctx as never);
    }),
    cancelSinglesPurchasesCsvImport: vi.fn(() => {
      configLotMethods.cancelSinglesPurchasesCsvImport.call(ctx as never);
    })
  });

  configLotMethods.confirmSinglesPurchasesCsvImport.call(ctx as never);

  const rows = ctx.singlesPurchases as Array<{
    item: string;
    cardNumber: string;
    condition?: string;
    language?: string;
    cost: number;
    currency?: string;
    quantity: number;
    marketValue: number;
  }>;
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.item, "Pikachu");
  assert.equal(rows[0]?.cardNumber, "025");
  assert.equal(rows[0]?.condition, "Near Mint");
  assert.equal(rows[0]?.language, "English");
  assert.equal(rows[0]?.cost, 0);
  assert.equal(rows[0]?.currency, "USD");
  assert.equal(rows[0]?.quantity, 2);
  assert.equal(rows[0]?.marketValue, 5.5);
  assert.equal(rows[1]?.item, "Charmander");
  assert.equal(rows[1]?.condition, "Good");
  assert.equal(rows[1]?.language, "French");
  assert.equal(rows[1]?.currency, "USD");
  assert.equal(rows[1]?.quantity, 3);
  assert.equal((ctx.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "Imported 2 items from CSV (2 skipped: missing Item or Quantity).");
  assert.equal(ctx.showSinglesCsvMapperModal, false);
  assert.equal(lot.singlesPurchases?.length, 2);
});

test("confirmSinglesPurchasesCsvImport merges matching item + card number into existing rows", () => {
  const lot = makeLot({
    id: 505,
    lotType: "singles",
    singlesPurchases: [
      {
        id: 10,
        item: "Pikachu",
        cardNumber: "025",
        cost: 2,
        quantity: 2,
        marketValue: 3
      }
    ]
  });
  const ctx = createContext({
    lots: [lot],
    currentLotId: 505,
    currentLotType: "singles",
    singlesPurchases: [
      {
        id: 10,
        item: "Pikachu",
        cardNumber: "025",
        cost: 2,
        quantity: 2,
        marketValue: 3
      }
    ],
    singlesCsvImportHeaders: ["Name", "Qty", "Card #"],
    singlesCsvImportRows: [
      ["Pikachu", "5", "025"],
      ["Pikachu", "1", "025"],
      ["Charmander", "2", "004"]
    ],
    singlesCsvMapItem: 0,
    singlesCsvMapCardNumber: 2,
    singlesCsvMapCondition: null,
    singlesCsvMapLanguage: null,
    singlesCsvMapCost: null,
    singlesCsvMapQuantity: 1,
    singlesCsvMapMarketValue: null,
    onSinglesPurchaseRowsChange: vi.fn(() => {
      configLotMethods.onSinglesPurchaseRowsChange.call(ctx as never);
    }),
    cancelSinglesPurchasesCsvImport: vi.fn(() => {
      configLotMethods.cancelSinglesPurchasesCsvImport.call(ctx as never);
    })
  });

  configLotMethods.confirmSinglesPurchasesCsvImport.call(ctx as never);

  const rows = ctx.singlesPurchases as Array<{
    item: string;
    cardNumber: string;
    quantity: number;
  }>;
  assert.equal(rows.length, 2);
  const pikachu = rows.find((entry) => entry.item === "Pikachu" && entry.cardNumber === "025");
  const charmander = rows.find((entry) => entry.item === "Charmander" && entry.cardNumber === "004");
  assert.equal(pikachu?.quantity, 4);
  assert.equal(charmander?.quantity, 2);
  assert.equal(
    (ctx.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0],
    "Imported 1 item from CSV (2 merged into existing rows)."
  );
  assert.equal(lot.singlesPurchases?.length, 2);
});

test("confirmSinglesPurchasesCsvImport sync mode replaces existing rows then merges duplicates from import", () => {
  const lot = makeLot({
    id: 606,
    lotType: "singles",
    singlesPurchases: [
      {
        id: 10,
        item: "Old Card",
        cardNumber: "001",
        cost: 2,
        quantity: 2,
        marketValue: 3
      }
    ]
  });
  const ctx = createContext({
    lots: [lot],
    currentLotId: 606,
    currentLotType: "singles",
    singlesPurchases: [
      {
        id: 10,
        item: "Old Card",
        cardNumber: "001",
        cost: 2,
        quantity: 2,
        marketValue: 3
      }
    ],
    singlesCsvImportHeaders: ["Name", "Qty", "Card #"],
    singlesCsvImportRows: [
      ["Pikachu", "5", "025"],
      ["Pikachu", "1", "025"],
      ["Charmander", "2", "004"]
    ],
    singlesCsvImportCurrency: "USD",
    singlesCsvImportMode: "sync",
    singlesCsvMapItem: 0,
    singlesCsvMapCardNumber: 2,
    singlesCsvMapCondition: null,
    singlesCsvMapLanguage: null,
    singlesCsvMapCost: null,
    singlesCsvMapQuantity: 1,
    singlesCsvMapMarketValue: null,
    onSinglesPurchaseRowsChange: vi.fn(() => {
      configLotMethods.onSinglesPurchaseRowsChange.call(ctx as never);
    }),
    cancelSinglesPurchasesCsvImport: vi.fn(() => {
      configLotMethods.cancelSinglesPurchasesCsvImport.call(ctx as never);
    })
  });

  configLotMethods.confirmSinglesPurchasesCsvImport.call(ctx as never);

  const rows = ctx.singlesPurchases as Array<{
    item: string;
    cardNumber: string;
    quantity: number;
    currency?: string;
  }>;
  assert.equal(rows.length, 2);
  assert.equal(rows.some((entry) => entry.item === "Old Card"), false);
  const pikachu = rows.find((entry) => entry.item === "Pikachu" && entry.cardNumber === "025");
  const charmander = rows.find((entry) => entry.item === "Charmander" && entry.cardNumber === "004");
  assert.equal(pikachu?.quantity, 6);
  assert.equal(pikachu?.currency, "USD");
  assert.equal(charmander?.quantity, 2);
  assert.equal(charmander?.currency, "USD");
  assert.equal(
    (ctx.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0],
    "Synced 2 items from CSV (1 existing row replaced; 1 merged into existing rows)."
  );
  assert.equal(lot.singlesPurchases?.length, 2);
});

test("confirmSinglesPurchasesCsvImport append mode appends rows without merging", () => {
  const lot = makeLot({
    id: 707,
    lotType: "singles",
    singlesPurchases: [
      {
        id: 11,
        item: "Pikachu",
        cardNumber: "025",
        cost: 2,
        quantity: 2,
        marketValue: 3
      }
    ]
  });
  const ctx = createContext({
    lots: [lot],
    currentLotId: 707,
    currentLotType: "singles",
    singlesPurchases: [
      {
        id: 11,
        item: "Pikachu",
        cardNumber: "025",
        cost: 2,
        quantity: 2,
        marketValue: 3
      }
    ],
    singlesCsvImportHeaders: ["Name", "Qty", "Card #"],
    singlesCsvImportRows: [
      ["Pikachu", "5", "025"],
      ["Pikachu", "1", "025"],
      ["Charmander", "2", "004"]
    ],
    singlesCsvImportMode: "append",
    singlesCsvMapItem: 0,
    singlesCsvMapCardNumber: 2,
    singlesCsvMapCondition: null,
    singlesCsvMapLanguage: null,
    singlesCsvMapCost: null,
    singlesCsvMapQuantity: 1,
    singlesCsvMapMarketValue: null,
    onSinglesPurchaseRowsChange: vi.fn(() => {
      configLotMethods.onSinglesPurchaseRowsChange.call(ctx as never);
    }),
    cancelSinglesPurchasesCsvImport: vi.fn(() => {
      configLotMethods.cancelSinglesPurchasesCsvImport.call(ctx as never);
    })
  });

  configLotMethods.confirmSinglesPurchasesCsvImport.call(ctx as never);

  const rows = ctx.singlesPurchases as Array<{ item: string; cardNumber: string; quantity: number }>;
  assert.equal(rows.length, 4);
  const pikachuRows = rows.filter((entry) => entry.item === "Pikachu" && entry.cardNumber === "025");
  assert.equal(pikachuRows.length, 3);
  assert.equal(pikachuRows[0]?.quantity, 2);
  assert.equal(pikachuRows[1]?.quantity, 5);
  assert.equal(pikachuRows[2]?.quantity, 1);
  assert.equal(
    (ctx.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0],
    "Appended 3 items from CSV."
  );
});

test("applyLivePricesToDefaults updates saved config when lot is selected", async () => {
  const ctx = createContext({
    currentLotId: 101,
    liveSpotPrice: 22.5,
    liveBoxPriceSell: 145,
    livePackPrice: 9.75,
    autoSaveSetup: vi.fn(),
    pushCloudSync: vi.fn(async () => undefined)
  });

  configLotMethods.applyLivePricesToDefaults.call(ctx as never);
  await Promise.resolve();

  assert.equal(ctx.spotPrice, 22.5);
  assert.equal(ctx.boxPriceSell, 145);
  assert.equal(ctx.packPrice, 9.75);
  assert.equal((ctx.autoSaveSetup as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal((ctx.pushCloudSync as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal((ctx.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "Live prices saved to config");

  const noLotCtx = createContext({
    currentLotId: null
  });
  configLotMethods.applyLivePricesToDefaults.call(noLotCtx as never);
  assert.equal((noLotCtx.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "Select a lot first");
});

test("renameCurrentLot closes modal when name is unchanged", () => {
  const ctx = createContext({
    currentLotId: 101,
    lots: [makeLot({ id: 101, name: "Lot A" })],
    renameLotName: "Lot A",
    showRenameLotModal: true
  });

  configLotMethods.renameCurrentLot.call(ctx as never);

  assert.equal(ctx.showRenameLotModal, false);
  assert.equal((ctx.saveLotsToStorage as ReturnType<typeof vi.fn>).mock.calls.length, 0);
  assert.equal((ctx.notify as ReturnType<typeof vi.fn>).mock.calls.length, 0);
});

test("loadLot resets mapper state and applies singles/pro access rules", () => {
  const lotId = 1704067200000;
  const lot = makeLot({
    id: lotId,
    lotType: "singles",
    purchaseDate: undefined,
    createdAt: undefined,
    taxRatePercent: 11,
    purchaseTaxPercent: undefined,
    sellingTaxPercent: undefined,
    targetProfitPercent: -5,
    singlesPurchases: [
      {
        id: 0,
        item: "  Card X  ",
        cardNumber: " 13 ",
        cost: "2.5" as unknown as number,
        quantity: "2" as unknown as number,
        marketValue: "3.5" as unknown as number
      }
    ]
  });
  const ctx = createContext({
    lots: [lot],
    currentLotId: lotId,
    hasProAccess: false,
    currentTab: "live",
    showSinglesCsvMapperModal: true,
    singlesCsvImportHeaders: ["A"],
    singlesCsvImportRows: [["B"]],
    singlesCsvImportCurrency: "USD",
    singlesCsvImportMode: "sync",
    singlesCsvMapItem: 0,
    singlesCsvMapCardNumber: 1,
    singlesCsvMapCondition: 5,
    singlesCsvMapLanguage: 6,
    singlesCsvMapCost: 2,
    singlesCsvMapQuantity: 3,
    singlesCsvMapMarketValue: 4,
    loadSalesFromStorage: vi.fn(),
    syncLivePricesFromDefaults: vi.fn(() => {
      configLotMethods.syncLivePricesFromDefaults.call(ctx as never);
    })
  });

  configLotMethods.loadLot.call(ctx as never);

  const purchaseDate = ctx.purchaseDate as string;
  assert.equal(ctx.showSinglesCsvMapperModal, false);
  assert.deepEqual(ctx.singlesCsvImportHeaders, []);
  assert.deepEqual(ctx.singlesCsvImportRows, []);
  assert.equal(ctx.singlesCsvImportCurrency, "CAD");
  assert.equal(ctx.singlesCsvImportMode, "merge");
  assert.equal(ctx.singlesCsvMapItem, null);
  assert.equal(ctx.singlesCsvMapCondition, null);
  assert.equal(ctx.singlesCsvMapLanguage, null);
  assert.equal(ctx.newLotType, "singles");
  assert.match(purchaseDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(ctx.purchaseTaxPercent, 11);
  assert.equal(ctx.sellingTaxPercent, 11);
  assert.equal(ctx.targetProfitPercent, 0);
  assert.equal(ctx.currentTab, "config");
  assert.equal((ctx.loadSalesFromStorage as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal((ctx.syncLivePricesFromDefaults as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  const singlesRows = ctx.singlesPurchases as Array<{ item: string; quantity: number }>;
  assert.equal(singlesRows[0]?.item, "Card X");
  assert.equal(singlesRows[0]?.quantity, 2);
});

test("deleteCurrentLot removes lot, linked sales keys, and last-lot key when needed", () => {
  const lotId = 999;
  readStorageWithLegacyMock.mockReturnValue(String(lotId));
  const ctx = createContext({
    currentLotId: lotId,
    lots: [makeLot({ id: lotId, name: "To Delete" }), makeLot({ id: 123, name: "Keep" })],
    loadSalesForLotId: vi.fn(() => [{ id: 1 }]),
    saveLotsToStorage: vi.fn()
  });

  configLotMethods.deleteCurrentLot.call(ctx as never);

  assert.equal((ctx.askConfirmation as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  const confirmOptions = (ctx.askConfirmation as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { text: string };
  assert.equal(
    confirmOptions.text,
    "Delete \"To Delete\" and 1 linked sale permanently?"
  );
  assert.equal((ctx.lots as Array<{ id: number }>).length, 1);
  assert.equal((ctx.lots as Array<{ id: number }>)[0]?.id, 123);
  assert.equal((removeStorageWithLegacyMock.mock.calls[0] ?? [])[0], "sales_999");
  assert.equal((removeStorageWithLegacyMock.mock.calls[0] ?? [])[1], "legacy_sales_999");
  assert.equal((removeStorageWithLegacyMock.mock.calls[1] ?? [])[0], "whatfees_last_lot_id");
  assert.equal((removeStorageWithLegacyMock.mock.calls[1] ?? [])[1], "legacy_last_lot_id");
  assert.equal(ctx.currentLotId, null);
  assert.equal((ctx.saveLotsToStorage as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal((ctx.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "Lot deleted");
});


