import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import type { Sale } from "../src/types/app.ts";

const {
  chartCtorMock,
  chartGetChartMock,
  calculateSparklineDataMock,
  calculateNetFromGrossMock,
  getTodayDateMock
} = vi.hoisted(() => ({
  chartCtorMock: vi.fn(),
  chartGetChartMock: vi.fn(),
  calculateSparklineDataMock: vi.fn(() => [0, 20, 40]),
  calculateNetFromGrossMock: vi.fn((gross: number) => gross * 0.8),
  getTodayDateMock: vi.fn(() => "2026-02-21")
}));

vi.mock("chart.js/auto", () => {
  class MockChart {
    public static getChart = chartGetChartMock;
    public stop = vi.fn();
    public destroy = vi.fn();
    constructor(
      public readonly ctx: unknown,
      public readonly config: unknown
    ) {
      chartCtorMock(ctx, config, this);
    }
  }

  return {
    default: MockChart
  };
});

vi.mock("../src/domain/calculations.ts", async () => {
  const actual = await vi.importActual<typeof import("../src/domain/calculations.ts")>(
    "../src/domain/calculations.ts"
  );
  return {
    ...actual,
    calculateSparklineData: calculateSparklineDataMock,
    calculateNetFromGross: calculateNetFromGrossMock
  };
});

vi.mock("../src/app-core/methods/config-shared.ts", async () => {
  const actual = await vi.importActual<typeof import("../src/app-core/methods/config-shared.ts")>(
    "../src/app-core/methods/config-shared.ts"
  );
  return {
    ...actual,
    getTodayDate: getTodayDateMock
  };
});

import { salesMethods } from "../src/app-core/methods/sales.ts";

class MockHtmlInputElement {
  focus = vi.fn();
}

class MockHtmlCanvasElement {
  context = { id: "ctx" };
  getContext = vi.fn(() => this.context);
}

type Ctx = Record<string, unknown>;

function makeSale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: 1,
    type: "pack",
    quantity: 1,
    packsCount: 1,
    price: 10,
    date: "2026-02-21",
    ...overrides
  };
}

function createContext(overrides: Ctx = {}): Ctx {
  return {
    currentTab: "sales",
    currentLotId: 1,
    currentLotType: "bulk",
    lots: [
      {
        id: 1,
        name: "Lot 1",
        purchaseDate: "2026-02-01",
        sellingTaxPercent: 15
      }
    ],
    sales: [] as Sale[],
    allLotPerformance: [
      {
        lotId: 1,
        lotName: "Lot 1",
        totalRevenue: 100,
        totalCost: 80
      }
    ],
    portfolioSelectedLotIds: [1],
    chartView: "pie",
    portfolioChartView: "breakdown",
    salesChart: null,
    portfolioChart: null,
    soldPacksCount: 1,
    totalPacks: 10,
    totalRevenue: 20,
    totalCaseCost: 100,
    packPrice: 6,
    packsPerBox: 16,
    sellingTaxPercent: 15,
    sellingShippingPerOrder: 3,
    livePackPrice: 9,
    liveBoxPriceSell: 99,
    liveSpotPrice: 11,
    packPriceSell: 6,
    spotPrice: 8,
    boxPriceSell: 80,
    canUsePaidActions: true,
    hasProAccess: true,
    targetProfitPercent: 15,
    editingSale: null,
    singlesPurchases: [],
    onSinglesPurchaseRowsChange: vi.fn(),
    selectedSinglesSaleMaxQuantity: null,
    newSale: {
      type: "pack",
      quantity: 1,
      packsCount: null,
      singlesPurchaseEntryId: null,
      price: 0,
      buyerShipping: 0,
      date: "2026-02-21"
    },
    showAddSaleModal: false,
    netFromGross: vi.fn((gross: number) => gross * 0.9),
    calculatePriceForUnits: vi.fn((units: number, targetNetRevenue: number) =>
      Math.round((Number(targetNetRevenue) || 0) / Math.max(1, Number(units) || 1))
    ),
    formatCurrency: (value: number) => value.toFixed(2),
    formatDate: (value: string) => `D:${value}`,
    loadSalesForLotId: vi.fn().mockReturnValue([]),
    getSalesStorageKey: (lotId: number) => `sales_${lotId}`,
    askConfirmation: vi.fn((_opts, onConfirm: () => void) => onConfirm()),
    notify: vi.fn(),
    cancelSale: vi.fn(),
    initSalesChart: vi.fn(),
    initPortfolioChart: vi.fn(),
    $nextTick: (callback: () => void) => callback(),
    $refs: {},
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("HTMLInputElement", MockHtmlInputElement as unknown as typeof HTMLInputElement);
  vi.stubGlobal("HTMLCanvasElement", MockHtmlCanvasElement as unknown as typeof HTMLCanvasElement);
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn()
  });
});

test("openAddSaleModal uses type default price and focuses quantity input", () => {
  const quantityInput = new MockHtmlInputElement();
  const ctx = createContext({
    $refs: {
      saleQuantityInput: quantityInput
    }
  });

  salesMethods.openAddSaleModal.call(ctx as never, "box");
  assert.equal((ctx.newSale as Sale).price, 99);
  assert.equal(ctx.showAddSaleModal, true);
  assert.equal(quantityInput.focus.mock.calls.length, 1);
});

test("openAddSaleModal focuses nested input from $el fallback", () => {
  const input = new MockHtmlInputElement();
  const ctx = createContext({
    $refs: {
      saleQuantityInput: {
        $el: {
          querySelector: vi.fn(() => input)
        }
      }
    }
  });

  salesMethods.openAddSaleModal.call(ctx as never, "pack");
  assert.equal(input.focus.mock.calls.length, 1);
});

test("saveSalesToStorage catches storage errors", () => {
  const failingStorage = {
    setItem: vi.fn(() => {
      throw new Error("disk full");
    })
  };
  vi.stubGlobal("localStorage", failingStorage);
  const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const ctx = createContext();

  salesMethods.saveSalesToStorage.call(ctx as never);

  assert.equal(consoleSpy.mock.calls.length > 0, true);
  consoleSpy.mockRestore();
});

test("loadSalesFromStorage handles loader errors and resets sales", () => {
  const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const ctx = createContext({
    sales: [makeSale({ id: 99 })],
    loadSalesForLotId: vi.fn(() => {
      throw new Error("boom");
    })
  });

  salesMethods.loadSalesFromStorage.call(ctx as never);

  assert.deepEqual(ctx.sales, []);
  assert.equal(consoleSpy.mock.calls.length > 0, true);
  consoleSpy.mockRestore();
});

test("onNewSaleTypeChange updates bulk draft type and default price when not editing", () => {
  const ctx = createContext({
    currentLotType: "bulk",
    editingSale: null,
    newSale: {
      type: "pack",
      quantity: 1,
      packsCount: 4,
      singlesPurchaseEntryId: 10,
      singlesItems: [{ lineId: 1, singlesPurchaseEntryId: 10, quantity: 1, price: 5 }],
      price: 123,
      buyerShipping: 0,
      date: "2026-02-21"
    }
  });

  salesMethods.onNewSaleTypeChange.call(ctx as never, "rtyh");

  assert.equal((ctx.newSale as { type?: string }).type, "rtyh");
  assert.equal((ctx.newSale as { singlesPurchaseEntryId?: number | null }).singlesPurchaseEntryId, null);
  assert.equal((ctx.newSale as { singlesItems?: unknown }).singlesItems, undefined);
  assert.equal((ctx.newSale as { price?: number }).price, 11);
});

test("onNewSaleTypeChange keeps existing price while editing an existing sale", () => {
  const ctx = createContext({
    currentLotType: "bulk",
    editingSale: makeSale({ id: 42, price: 77 }),
    newSale: {
      type: "pack",
      quantity: 1,
      packsCount: null,
      singlesPurchaseEntryId: null,
      price: 321,
      buyerShipping: 0,
      date: "2026-02-21"
    }
  });

  salesMethods.onNewSaleTypeChange.call(ctx as never, "box");

  assert.equal((ctx.newSale as { type?: string }).type, "box");
  assert.equal((ctx.newSale as { price?: number }).price, 321);
});

test("onNewSaleTypeChange forces pack type for singles lots", () => {
  const ctx = createContext({
    currentLotType: "singles",
    newSale: {
      type: "box",
      quantity: 1,
      packsCount: null,
      singlesPurchaseEntryId: null,
      price: 10,
      buyerShipping: 0,
      date: "2026-02-21"
    }
  });

  salesMethods.onNewSaleTypeChange.call(ctx as never, "rtyh");
  assert.equal((ctx.newSale as { type?: string }).type, "pack");
});

test("saveSale shows error when editing sale is missing from list", () => {
  const existingSale: Sale = {
    id: 42,
    type: "pack",
    quantity: 1,
    packsCount: 1,
    price: 10,
    date: "2026-02-21"
  };
  const ctx = createContext({
    editingSale: existingSale,
    sales: [],
    newSale: {
      type: "pack",
      quantity: 2,
      packsCount: null,
      price: 10,
      buyerShipping: 0,
      date: "2026-02-21"
    }
  });

  salesMethods.saveSale.call(ctx as never);
  assert.equal((ctx.notify as ReturnType<typeof vi.fn>).mock.calls[0]?.[0], "Could not find the sale to update. Please try again.");
});

test("deleteSale confirms and refreshes charts for current tab", () => {
  const ctx = createContext({
    sales: [
      {
        id: 1,
        type: "pack",
        quantity: 1,
        packsCount: 1,
        price: 10,
        date: "2026-02-21"
      },
      {
        id: 2,
        type: "pack",
        quantity: 1,
        packsCount: 1,
        price: 11,
        date: "2026-02-21"
      }
    ]
  });

  salesMethods.deleteSale.call(ctx as never, 1);
  assert.equal((ctx.sales as Sale[]).length, 1);
  assert.equal((ctx.initSalesChart as ReturnType<typeof vi.fn>).mock.calls.length, 1);
});

test("cancelSale resets modal and draft values", () => {
  const ctx = createContext({
    showAddSaleModal: true,
    editingSale: { id: 99 },
    newSale: {
      type: "box",
      quantity: 5,
      packsCount: 80,
      singlesPurchaseEntryId: null,
      price: 50,
      buyerShipping: 2,
      date: "2026-01-01"
    }
  });

  salesMethods.cancelSale.call(ctx as never);
  assert.equal(ctx.showAddSaleModal, false);
  assert.equal(ctx.editingSale, null);
  assert.equal((ctx.newSale as Sale).type, "pack");
  assert.equal((ctx.newSale as Sale).date, "2026-02-21");
});

test("saveSale links selected singles card without mutating purchase quantity", () => {
  const ctx = createContext({
    currentLotType: "singles",
    singlesPurchases: [
      { id: 11, item: "Card A", cardNumber: "001", cost: 10, quantity: 3, marketValue: 12 }
    ],
    newSale: {
      type: "pack",
      quantity: 2,
      packsCount: null,
      singlesPurchaseEntryId: 11,
      price: 25,
      buyerShipping: 0,
      date: "2026-02-21"
    }
  });

  salesMethods.saveSale.call(ctx as never);

  assert.equal((ctx.sales as Sale[]).length, 1);
  assert.equal((ctx.sales as Sale[])[0]?.singlesPurchaseEntryId, 11);
  assert.equal((ctx.singlesPurchases as Array<{ id: number; quantity: number }>)[0]?.quantity, 3);
});

test("onSinglesSaleCardSelectionChange sets selection and defaults quantity to 1", () => {
  const ctx = createContext({
    currentLotType: "singles",
    selectedSinglesSaleMaxQuantity: 5,
    singlesPurchases: [
      { id: 77, item: "Card X", cost: 3, quantity: 5, marketValue: 4 }
    ],
    newSale: {
      type: "pack",
      quantity: null,
      packsCount: null,
      singlesPurchaseEntryId: null,
      price: 0,
      buyerShipping: 0,
      date: "2026-02-21"
    }
  });

  salesMethods.onSinglesSaleCardSelectionChange.call(ctx as never, 77);

  assert.equal((ctx.newSale as { singlesPurchaseEntryId?: number | null }).singlesPurchaseEntryId, 77);
  assert.equal((ctx.newSale as { quantity?: number | null }).quantity, 1);
});

test("onSinglesSaleCardSelectionChange caps quantity by selected max", () => {
  const ctx = createContext({
    currentLotType: "singles",
    selectedSinglesSaleMaxQuantity: 2,
    singlesPurchases: [
      { id: 88, item: "Card Y", cost: 3, quantity: 2, marketValue: 4 }
    ],
    newSale: {
      type: "pack",
      quantity: 6,
      packsCount: null,
      singlesPurchaseEntryId: null,
      price: 0,
      buyerShipping: 0,
      date: "2026-02-21"
    }
  });

  salesMethods.onSinglesSaleCardSelectionChange.call(ctx as never, 88);

  assert.equal((ctx.newSale as { quantity?: number | null }).quantity, 2);
});

test("onSinglesSaleCardSelectionChange defaults singles sale price to total cost for non-pro", () => {
  const calculatePriceForUnits = vi.fn(() => 45);
  const ctx = createContext({
    currentLotType: "singles",
    hasProAccess: false,
    targetProfitPercent: 15,
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    calculatePriceForUnits,
    selectedSinglesSaleMaxQuantity: 5,
    singlesPurchases: [
      { id: 99, item: "Card NP", cost: 23, quantity: 5, marketValue: 40, currency: "CAD" }
    ],
    newSale: {
      type: "pack",
      quantity: 2,
      packsCount: null,
      singlesPurchaseEntryId: null,
      price: 0,
      buyerShipping: 0,
      date: "2026-02-21"
    }
  });

  salesMethods.onSinglesSaleCardSelectionChange.call(ctx as never, 99);

  assert.deepEqual(calculatePriceForUnits.mock.calls[0], [2, 80]);
  assert.equal((ctx.newSale as { price?: number }).price, 90);
});

test("onSinglesSaleCardSelectionChange sets price even when quantity starts empty", () => {
  const calculatePriceForUnits = vi.fn(() => 40);
  const ctx = createContext({
    currentLotType: "singles",
    hasProAccess: false,
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    calculatePriceForUnits,
    selectedSinglesSaleMaxQuantity: 5,
    singlesPurchases: [
      { id: 109, item: "Card Z", cost: 23, quantity: 5, marketValue: 40, currency: "CAD" }
    ],
    newSale: {
      type: "pack",
      quantity: null,
      packsCount: null,
      singlesPurchaseEntryId: null,
      price: 0,
      buyerShipping: 0,
      date: "2026-02-21"
    }
  });

  salesMethods.onSinglesSaleCardSelectionChange.call(ctx as never, 109);

  assert.equal((ctx.newSale as { quantity?: number | null }).quantity, 1);
  assert.deepEqual(calculatePriceForUnits.mock.calls[0], [1, 40]);
  assert.equal((ctx.newSale as { price?: number }).price, 40);
});

test("onSinglesSaleCardSelectionChange defaults singles sale price using target profit for pro", () => {
  const calculatePriceForUnits = vi.fn(() => 54);
  const ctx = createContext({
    currentLotType: "singles",
    hasProAccess: true,
    targetProfitPercent: 20,
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    calculatePriceForUnits,
    selectedSinglesSaleMaxQuantity: 5,
    singlesPurchases: [
      { id: 100, item: "Card P", cost: 23, quantity: 5, marketValue: 40, currency: "CAD" }
    ],
    newSale: {
      type: "pack",
      quantity: 2,
      packsCount: null,
      singlesPurchaseEntryId: null,
      price: 0,
      buyerShipping: 0,
      date: "2026-02-21"
    }
  });

  salesMethods.onSinglesSaleCardSelectionChange.call(ctx as never, 100);

  assert.deepEqual(calculatePriceForUnits.mock.calls[0], [2, 96]);
  assert.equal((ctx.newSale as { price?: number }).price, 108);
});

test("onSinglesSaleCardSelectionChange pro pricing falls back to cost when market is not set", () => {
  const calculatePriceForUnits = vi.fn(() => 31);
  const ctx = createContext({
    currentLotType: "singles",
    hasProAccess: true,
    targetProfitPercent: 20,
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    calculatePriceForUnits,
    selectedSinglesSaleMaxQuantity: 5,
    singlesPurchases: [
      { id: 101, item: "Card P2", cost: 23, quantity: 5, marketValue: 0, currency: "CAD" }
    ],
    newSale: {
      type: "pack",
      quantity: 1,
      packsCount: null,
      singlesPurchaseEntryId: null,
      price: 0,
      buyerShipping: 0,
      date: "2026-02-21"
    }
  });

  salesMethods.onSinglesSaleCardSelectionChange.call(ctx as never, 101);

  assert.deepEqual(calculatePriceForUnits.mock.calls[0], [1, 27.599999999999998]);
  assert.equal((ctx.newSale as { price?: number }).price, 31);
});

test("onSinglesSaleCardSelectionChange updates total price while editing when selecting a new card", () => {
  const calculatePriceForUnits = vi.fn(() => 62);
  const ctx = createContext({
    currentLotType: "singles",
    hasProAccess: true,
    targetProfitPercent: 10,
    editingSale: {
      id: 1,
      type: "pack",
      quantity: 1,
      packsCount: 1,
      singlesPurchaseEntryId: 200,
      price: 25,
      date: "2026-02-21"
    },
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    calculatePriceForUnits,
    selectedSinglesSaleMaxQuantity: 5,
    singlesPurchases: [
      { id: 200, item: "Old", cost: 10, quantity: 5, marketValue: 20, currency: "CAD" },
      { id: 201, item: "New", cost: 12, quantity: 5, marketValue: 50, currency: "CAD" }
    ],
    newSale: {
      type: "pack",
      quantity: 1,
      packsCount: null,
      singlesPurchaseEntryId: 200,
      price: 25,
      buyerShipping: 0,
      date: "2026-02-21"
    }
  });

  salesMethods.onSinglesSaleCardSelectionChange.call(ctx as never, 201);

  assert.equal((ctx.newSale as { singlesPurchaseEntryId?: number | null }).singlesPurchaseEntryId, 201);
  assert.deepEqual(calculatePriceForUnits.mock.calls[0], [1, 55.00000000000001]);
  assert.equal((ctx.newSale as { price?: number }).price, 62);
});

test("onSinglesSaleCardSelectionChange clears total price when card is deselected", () => {
  const ctx = createContext({
    currentLotType: "singles",
    newSale: {
      type: "pack",
      quantity: 1,
      packsCount: null,
      singlesPurchaseEntryId: 200,
      price: 55,
      buyerShipping: 0,
      date: "2026-02-21"
    }
  });

  salesMethods.onSinglesSaleCardSelectionChange.call(ctx as never, null);

  assert.equal((ctx.newSale as { singlesPurchaseEntryId?: number | null }).singlesPurchaseEntryId, null);
  assert.equal((ctx.newSale as { price?: number | null }).price, null);
});

test("onSinglesSaleLineCardSelectionChange uses line quantity for default line price", () => {
  const calculatePriceForUnits = vi.fn(() => 77);
  const ctx = createContext({
    currentLotType: "singles",
    hasProAccess: true,
    targetProfitPercent: 15,
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    calculatePriceForUnits,
    singlesPurchases: [
      { id: 301, item: "Card L", cost: 20, quantity: 4, marketValue: 50, currency: "CAD" }
    ],
    newSale: {
      type: "pack",
      quantity: 2,
      packsCount: null,
      singlesPurchaseEntryId: null,
      singlesItems: [
        {
          lineId: 1,
          singlesPurchaseEntryId: null,
          quantity: 2,
          price: null
        }
      ],
      price: 0,
      buyerShipping: 0,
      date: "2026-02-21"
    }
  });

  salesMethods.onSinglesSaleLineCardSelectionChange.call(ctx as never, 0, 301);

  assert.deepEqual(calculatePriceForUnits.mock.calls[0], [2, 114.99999999999999]);
  assert.equal((ctx.newSale as { price?: number | null }).price, 154);
  assert.equal((ctx.newSale as { quantity?: number | null }).quantity, 2);
});

test("onSinglesSaleLineQuantityChange updates qty and recalculates linked line price", () => {
  const calculatePriceForUnits = vi.fn(() => 88);
  const ctx = createContext({
    currentLotType: "singles",
    hasProAccess: true,
    targetProfitPercent: 15,
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    calculatePriceForUnits,
    singlesPurchases: [
      { id: 401, item: "Card Q", cost: 10, quantity: 20, marketValue: 12, currency: "CAD" }
    ],
    newSale: {
      type: "pack",
      quantity: 1,
      packsCount: null,
      singlesPurchaseEntryId: null,
      singlesItems: [
        {
          lineId: 1,
          singlesPurchaseEntryId: 401,
          quantity: 1,
          price: 55
        }
      ],
      price: 55,
      buyerShipping: 0,
      date: "2026-02-21"
    }
  });

  (ctx.newSale as { singlesItems: Array<{ quantity: number }> }).singlesItems[0]!.quantity = 1;
  salesMethods.onSinglesSaleLineQuantityChange.call(ctx as never, 0, 12);

  const line = (ctx.newSale as { singlesItems: Array<{ quantity: number; price: number }> }).singlesItems[0]!;
  assert.equal(line.quantity, 12);
  assert.equal(calculatePriceForUnits.mock.calls.length, 1);
  assert.deepEqual(calculatePriceForUnits.mock.calls[0], [12, 165.6]);
  assert.equal(line.price, 1056);
  assert.equal((ctx.newSale as { quantity?: number | null }).quantity, 12);
  assert.equal((ctx.newSale as { price?: number | null }).price, 1056);
});

test("onSinglesSaleLineQuantityChange keeps unlinked line price as entered", () => {
  const ctx = createContext({
    currentLotType: "singles",
    newSale: {
      type: "pack",
      quantity: 1,
      packsCount: null,
      singlesPurchaseEntryId: null,
      singlesItems: [
        {
          lineId: 1,
          singlesPurchaseEntryId: null,
          quantity: 1,
          price: 55
        }
      ],
      price: 55,
      buyerShipping: 0,
      date: "2026-02-21"
    }
  });

  (ctx.newSale as { singlesItems: Array<{ quantity: number }> }).singlesItems[0]!.quantity = 1;
  salesMethods.onSinglesSaleLineQuantityChange.call(ctx as never, 0, 12);

  const line = (ctx.newSale as { singlesItems: Array<{ quantity: number; price: number }> }).singlesItems[0]!;
  assert.equal(line.quantity, 12);
  assert.equal(line.price, 55);
  assert.equal((ctx.newSale as { quantity?: number | null }).quantity, 12);
  assert.equal((ctx.newSale as { price?: number | null }).price, 55);
});

test("addSinglesSaleLine and removeSinglesSaleLine mutate line collection safely", () => {
  const ctx = createContext({
    currentLotType: "singles",
    newSale: {
      type: "pack",
      quantity: 1,
      packsCount: null,
      singlesPurchaseEntryId: null,
      singlesItems: [
        {
          lineId: 1,
          singlesPurchaseEntryId: 401,
          quantity: 2,
          price: 50
        }
      ],
      price: 50,
      buyerShipping: 0,
      date: "2026-02-21"
    }
  });

  salesMethods.addSinglesSaleLine.call(ctx as never);
  assert.equal(((ctx.newSale as { singlesItems?: unknown[] }).singlesItems || []).length, 2);

  salesMethods.removeSinglesSaleLine.call(ctx as never, 1);
  assert.equal(((ctx.newSale as { singlesItems?: unknown[] }).singlesItems || []).length, 1);

  salesMethods.removeSinglesSaleLine.call(ctx as never, 0);
  const lines = ((ctx.newSale as { singlesItems?: Array<{ singlesPurchaseEntryId?: number | null; quantity?: number; price?: number | null }> }).singlesItems || []);
  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.singlesPurchaseEntryId ?? null, null);
  assert.equal(lines[0]?.quantity, 1);
  assert.equal(lines[0]?.price ?? null, null);
});

test("getSinglesSaleLineMaxQuantity releases editing quantity and excludes other draft lines", () => {
  const editingSale: Sale = {
    id: 10,
    type: "pack",
    quantity: 2,
    packsCount: 2,
    singlesPurchaseEntryId: 51,
    price: 20,
    date: "2026-02-21"
  };

  const ctx = createContext({
    currentLotType: "singles",
    editingSale,
    singlesSoldCountByPurchaseId: { 51: 4 },
    singlesPurchases: [
      { id: 51, item: "Card Max", cost: 5, quantity: 5, marketValue: 6, currency: "CAD" }
    ],
    newSale: {
      type: "pack",
      quantity: null,
      packsCount: null,
      singlesPurchaseEntryId: null,
      singlesItems: [
        { lineId: 1, singlesPurchaseEntryId: 51, quantity: 1, price: 10 },
        { lineId: 2, singlesPurchaseEntryId: 51, quantity: 1, price: 10 }
      ],
      price: null,
      buyerShipping: 0,
      date: "2026-02-21"
    }
  });

  assert.equal(salesMethods.getSinglesSaleLineMaxQuantity.call(ctx as never, 0), 2);
});

test("saveSale blocks singles linked quantity above available stock", () => {
  const notify = vi.fn();
  const ctx = createContext({
    currentLotType: "singles",
    singlesPurchases: [
      { id: 22, item: "Card B", cardNumber: "002", cost: 8, quantity: 1, marketValue: 9 }
    ],
    newSale: {
      type: "pack",
      quantity: 2,
      packsCount: null,
      singlesPurchaseEntryId: 22,
      price: 10,
      buyerShipping: 0,
      date: "2026-02-21"
    },
    notify
  });

  salesMethods.saveSale.call(ctx as never);

  assert.equal((ctx.sales as Sale[]).length, 0);
  assert.equal(
    notify.mock.calls.some((call) => String(call[0]).includes("exceeds selected item stock")),
    true
  );
});

test("saveSale requires total price when singles sale is not linked to a card", () => {
  const notify = vi.fn();
  const ctx = createContext({
    currentLotType: "singles",
    newSale: {
      type: "pack",
      quantity: 1,
      packsCount: null,
      singlesPurchaseEntryId: null,
      price: 0,
      buyerShipping: 0,
      date: "2026-02-21"
    },
    notify
  });

  salesMethods.saveSale.call(ctx as never);

  assert.equal((ctx.sales as Sale[]).length, 0);
  assert.equal(notify.mock.calls[0]?.[0], "Please enter a total price when no item is linked.");
});

test("saveSale aggregates multiple singles lines including duplicate linked cards", () => {
  const ctx = createContext({
    currentLotType: "singles",
    singlesPurchases: [
      { id: 71, item: "Card Multi", cardNumber: "071", cost: 8, quantity: 3, marketValue: 9 }
    ],
    newSale: {
      type: "pack",
      quantity: null,
      packsCount: null,
      singlesPurchaseEntryId: null,
      singlesItems: [
        { lineId: 1, singlesPurchaseEntryId: 71, quantity: 2, price: 40 },
        { lineId: 2, singlesPurchaseEntryId: 71, quantity: 1, price: 22 }
      ],
      price: null,
      buyerShipping: 0,
      date: "2026-02-21"
    }
  });

  salesMethods.saveSale.call(ctx as never);

  assert.equal((ctx.sales as Sale[]).length, 1);
  assert.equal((ctx.sales as Sale[])[0]?.quantity, 3);
  assert.equal((ctx.sales as Sale[])[0]?.price, 62);
  assert.equal((ctx.sales as Sale[])[0]?.packsCount, 3);
  assert.equal((ctx.sales as Sale[])[0]?.priceIsTotal, true);
  assert.equal(Array.isArray((ctx.sales as Sale[])[0]?.singlesItems), true);
});

test("saveSale blocks singles lines when duplicate linked quantity exceeds stock", () => {
  const notify = vi.fn();
  const ctx = createContext({
    currentLotType: "singles",
    singlesPurchases: [
      { id: 81, item: "Card Multi", cardNumber: "081", cost: 8, quantity: 2, marketValue: 9 }
    ],
    newSale: {
      type: "pack",
      quantity: null,
      packsCount: null,
      singlesPurchaseEntryId: null,
      singlesItems: [
        { lineId: 1, singlesPurchaseEntryId: 81, quantity: 2, price: 40 },
        { lineId: 2, singlesPurchaseEntryId: 81, quantity: 1, price: 22 }
      ],
      price: null,
      buyerShipping: 0,
      date: "2026-02-21"
    },
    notify
  });

  salesMethods.saveSale.call(ctx as never);

  assert.equal((ctx.sales as Sale[]).length, 0);
  assert.equal(
    notify.mock.calls.some((call) => String(call[0]).includes("exceeds selected item stock")),
    true
  );
});

test("saveSale blocks singles lines linked to removed inventory entries", () => {
  const notify = vi.fn();
  const ctx = createContext({
    currentLotType: "singles",
    singlesPurchases: [],
    newSale: {
      type: "pack",
      quantity: null,
      packsCount: null,
      singlesPurchaseEntryId: null,
      singlesItems: [
        { lineId: 1, singlesPurchaseEntryId: 999, quantity: 1, price: 12 }
      ],
      price: null,
      buyerShipping: 0,
      date: "2026-02-21"
    },
    notify
  });

  salesMethods.saveSale.call(ctx as never);

  assert.equal((ctx.sales as Sale[]).length, 0);
  assert.equal(notify.mock.calls[0]?.[0], "Selected item is no longer available.");
});

test("saveSale stores RTYH packsCount and normalizes invalid date", () => {
  const ctx = createContext({
    currentLotType: "bulk",
    newSale: {
      type: "rtyh",
      quantity: 3,
      packsCount: 7,
      singlesPurchaseEntryId: null,
      price: 15,
      buyerShipping: 0,
      date: "invalid-date"
    }
  });

  salesMethods.saveSale.call(ctx as never);

  assert.equal((ctx.sales as Sale[]).length, 1);
  const saved = (ctx.sales as Sale[])[0]!;
  assert.equal(saved.type, "rtyh");
  assert.equal(saved.packsCount, 7);
  assert.equal(saved.date, "2026-02-21");
});

test("saveSale refreshes charts for portfolio tab through $nextTick scheduler", () => {
  const initPortfolioChart = vi.fn();
  const initSalesChart = vi.fn();
  const nextTick = vi.fn((cb: () => void) => cb());
  const ctx = createContext({
    currentTab: "portfolio",
    initPortfolioChart,
    initSalesChart,
    $nextTick: nextTick,
    newSale: {
      type: "pack",
      quantity: 1,
      packsCount: null,
      singlesPurchaseEntryId: null,
      price: 10,
      buyerShipping: 0,
      date: "2026-02-21"
    }
  });

  salesMethods.saveSale.call(ctx as never);

  assert.equal(nextTick.mock.calls.length, 1);
  assert.equal(initPortfolioChart.mock.calls.length, 1);
  assert.equal(initSalesChart.mock.calls.length, 0);
});

test("saveSale editing singles sale can reassign card without mutating purchase quantities", () => {
  const existingSale: Sale = {
    id: 900,
    type: "pack",
    quantity: 1,
    packsCount: 1,
    singlesPurchaseEntryId: 11,
    price: 10,
    buyerShipping: 0,
    date: "2026-02-21"
  };

  const ctx = createContext({
    currentLotType: "singles",
    editingSale: existingSale,
    sales: [existingSale],
    singlesPurchases: [
      { id: 11, item: "Card A", cardNumber: "001", cost: 10, quantity: 1, marketValue: 11 },
      { id: 22, item: "Card B", cardNumber: "002", cost: 9, quantity: 2, marketValue: 10 }
    ],
    newSale: {
      type: "pack",
      quantity: 2,
      packsCount: null,
      singlesPurchaseEntryId: 22,
      price: 20,
      buyerShipping: 0,
      date: "2026-02-21"
    }
  });

  salesMethods.saveSale.call(ctx as never);

  assert.equal((ctx.sales as Sale[]).length, 1);
  assert.equal((ctx.sales as Sale[])[0]?.singlesPurchaseEntryId, 22);
  const quantities = (ctx.singlesPurchases as Array<{ id: number; quantity: number }>)
    .reduce<Record<number, number>>((acc, entry) => ({ ...acc, [entry.id]: entry.quantity }), {});
  assert.equal(quantities[11], 1);
  assert.equal(quantities[22], 2);
});

test("saveSale editing singles sale tolerates missing previously linked card row", () => {
  const existingSale: Sale = {
    id: 901,
    type: "pack",
    quantity: 1,
    packsCount: 1,
    singlesPurchaseEntryId: 999,
    price: 10,
    buyerShipping: 0,
    date: "2026-02-21"
  };

  const ctx = createContext({
    currentLotType: "singles",
    editingSale: existingSale,
    sales: [existingSale],
    singlesPurchases: [
      { id: 22, item: "Card B", cardNumber: "002", cost: 9, quantity: 2, marketValue: 10 }
    ],
    newSale: {
      type: "pack",
      quantity: 1,
      packsCount: null,
      singlesPurchaseEntryId: 22,
      price: 20,
      buyerShipping: 0,
      date: "2026-02-21"
    }
  });

  salesMethods.saveSale.call(ctx as never);

  assert.equal((ctx.sales as Sale[]).length, 1);
  assert.equal((ctx.sales as Sale[])[0]?.singlesPurchaseEntryId, 22);
  assert.equal((ctx.singlesPurchases as Array<{ id: number; quantity: number }>)[0]?.quantity, 2);
});

test("editSale initializes singles draft lines from legacy linked sale and normalizes date", () => {
  const sale: Sale = {
    id: 333,
    type: "pack",
    quantity: 2,
    packsCount: 2,
    singlesPurchaseEntryId: 55,
    price: 40,
    buyerShipping: 1,
    date: "not-a-date"
  };
  const focusInput = new MockHtmlInputElement();
  const ctx = createContext({
    currentLotType: "singles",
    $refs: {
      saleQuantityInput: focusInput
    }
  });

  salesMethods.editSale.call(ctx as never, sale);

  assert.equal(ctx.showAddSaleModal, true);
  const newSale = ctx.newSale as {
    date: string;
    quantity: number;
    price: number;
    singlesItems?: Array<{ singlesPurchaseEntryId?: number | null; quantity?: number; price?: number | null }>;
  };
  assert.equal(newSale.date, "2026-02-21");
  assert.equal(newSale.quantity, 2);
  assert.equal(newSale.price, 40);
  assert.equal((newSale.singlesItems || [])[0]?.singlesPurchaseEntryId, 55);
  assert.equal((newSale.singlesItems || [])[0]?.quantity, 2);
  assert.equal((newSale.singlesItems || [])[0]?.price, 40);
  assert.equal(focusInput.focus.mock.calls.length, 1);
});

test("deleteSale removes sale without mutating linked singles purchase quantity", () => {
  const ctx = createContext({
    currentLotType: "singles",
    singlesPurchases: [
      { id: 31, item: "Card C", cardNumber: "003", cost: 5, quantity: 1, marketValue: 6 }
    ],
    sales: [
      {
        id: 1,
        type: "pack",
        quantity: 1,
        packsCount: 1,
        singlesPurchaseEntryId: 31,
        price: 7,
        date: "2026-02-21"
      }
    ]
  });

  salesMethods.deleteSale.call(ctx as never, 1);

  assert.equal((ctx.singlesPurchases as Array<{ id: number; quantity: number }>)[0]?.quantity, 1);
  assert.equal((ctx.sales as Sale[]).length, 0);
});

test("initSalesChart line mode returns early when no sales", () => {
  const trendCanvas = new MockHtmlCanvasElement();
  const ctx = createContext({
    chartView: "trend",
    sales: [],
    $refs: {
      salesWindow: {
        $refs: {
          salesTrendChart: trendCanvas
        }
      }
    }
  });

  salesMethods.initSalesChart.call(ctx as never);
  assert.equal(chartCtorMock.mock.calls.length, 0);
});

test("initSalesChart creates line chart for trend view", () => {
  const trendCanvas = new MockHtmlCanvasElement();
  const existingChart = {
    stop: vi.fn(),
    destroy: vi.fn()
  };
  chartGetChartMock.mockReturnValue(existingChart);

  const ctx = createContext({
    chartView: "trend",
    sales: [
      {
        id: 1,
        type: "pack",
        quantity: 1,
        packsCount: 1,
        price: 10,
        date: "2026-02-20"
      }
    ],
    $refs: {
      salesWindow: {
        $refs: {
          salesTrendChart: trendCanvas
        }
      }
    }
  });

  salesMethods.initSalesChart.call(ctx as never);
  assert.equal(existingChart.destroy.mock.calls.length, 1);
  assert.equal(chartCtorMock.mock.calls.length, 1);
  const config = chartCtorMock.mock.calls[0]?.[1] as { type: string };
  assert.equal(config.type, "line");
});

test("initSalesChart creates pie chart and destroys stale sales chart safely", () => {
  const pieCanvas = new MockHtmlCanvasElement();
  const ctx = createContext({
    salesChart: {
      stop: vi.fn(() => {
        throw new Error("already stopped");
      }),
      destroy: vi.fn()
    },
    chartView: "pie",
    $refs: {
      salesWindow: {
        $refs: {
          salesChartCanvas: pieCanvas
        }
      }
    }
  });

  salesMethods.initSalesChart.call(ctx as never);
  assert.equal(chartCtorMock.mock.calls.length, 1);
  const config = chartCtorMock.mock.calls[0]?.[1] as { type: string };
  assert.equal(config.type, "doughnut");
});

test("initSalesChart uses card inventory labels in singles pie mode", () => {
  const pieCanvas = new MockHtmlCanvasElement();
  const ctx = createContext({
    currentLotType: "singles",
    chartView: "pie",
    soldPacksCount: 3,
    totalPacks: 10,
    totalRevenue: 77,
    $refs: {
      salesWindow: {
        $refs: {
          salesChartCanvas: pieCanvas
        }
      }
    }
  });

  salesMethods.initSalesChart.call(ctx as never);
  const config = chartCtorMock.mock.calls[0]?.[1] as {
    type: string;
    data: {
      labels: string[];
      datasets: Array<{ data: number[] }>;
    };
  };
  assert.equal(config.type, "doughnut");
  assert.deepEqual(config.data.labels, ["Sold items: 3", "Remaining items: 7"]);
  assert.deepEqual(config.data.datasets[0]?.data, [3, 7]);
});

test("initPortfolioChart creates breakdown doughnut chart", () => {
  const portfolioCanvas = new MockHtmlCanvasElement();
  const ctx = createContext({
    currentTab: "portfolio",
    portfolioChartView: "breakdown",
    $refs: {
      portfolioWindow: {
        $refs: {
          portfolioChartCanvas: portfolioCanvas
        }
      }
    }
  });

  salesMethods.initPortfolioChart.call(ctx as never);
  assert.equal(chartCtorMock.mock.calls.length, 1);
  const config = chartCtorMock.mock.calls[0]?.[1] as { type: string };
  assert.equal(config.type, "pie");
});

test("initPortfolioChart uses right-side legend for mobile breakdown", () => {
  const portfolioCanvas = new MockHtmlCanvasElement();
  const ctx = createContext({
    currentTab: "portfolio",
    portfolioChartView: "breakdown",
    $vuetify: {
      display: {
        smAndDown: true
      }
    },
    $refs: {
      portfolioWindow: {
        $refs: {
          portfolioChartCanvas: portfolioCanvas
        }
      }
    }
  });

  salesMethods.initPortfolioChart.call(ctx as never);
  assert.equal(chartCtorMock.mock.calls.length, 1);
  const config = chartCtorMock.mock.calls[0]?.[1] as {
    type: string;
    data: { labels: string[] };
    options: {
      maintainAspectRatio: boolean;
      aspectRatio: number;
      plugins: { legend: { position: string } };
    };
  };
  assert.equal(config.type, "pie");
  assert.equal(config.options.plugins.legend.position, "bottom");
  assert.equal(config.options.maintainAspectRatio, true);
  assert.equal(config.options.aspectRatio, 2);
  assert.equal(config.data.labels[0], "Lot 1");
});

test("initPortfolioChart creates cumulative trend chart", () => {
  const portfolioCanvas = new MockHtmlCanvasElement();
  const ctx = createContext({
    currentTab: "portfolio",
    portfolioChartView: "trend",
    lots: [
      {
        id: 1700000000000,
        name: "Lot T",
        purchaseDate: "2026-02-01",
        createdAt: "2026-02-01",
        sellingTaxPercent: 15
      }
    ],
    currentLotId: 1700000000000,
    sales: [
      {
        id: 10,
        type: "pack",
        quantity: 2,
        packsCount: 2,
        price: 12,
        buyerShipping: 1,
        date: "2026-02-21"
      }
    ],
    allLotPerformance: [
      {
        lotId: 1700000000000,
        lotName: "Lot T",
        totalRevenue: 120,
        totalCost: 80
      }
    ],
    portfolioSelectedLotIds: [1700000000000],
    $refs: {
      portfolioWindow: {
        $refs: {
          portfolioChartCanvas: portfolioCanvas
        }
      }
    }
  });

  salesMethods.initPortfolioChart.call(ctx as never);
  assert.equal(chartCtorMock.mock.calls.length, 1);
  const config = chartCtorMock.mock.calls[0]?.[1] as {
    type: string;
    data: { datasets: Array<{ label?: string; data?: number[] }> };
  };
  assert.equal(config.type, "line");
  assert.equal(calculateNetFromGrossMock.mock.calls.length > 0, true);
  assert.equal(config.data.datasets.length, 2);
  assert.equal(config.data.datasets[0]?.label, "Actual cumulative P/L");
  assert.equal(config.data.datasets[1]?.label, "Target P/L");
});

test("initPortfolioChart creates sell-through bar chart", () => {
  const portfolioCanvas = new MockHtmlCanvasElement();
  const ctx = createContext({
    currentTab: "portfolio",
    portfolioChartView: "sellthrough",
    lots: [
      {
        id: 1700000000001,
        name: "Lot S",
        purchaseDate: "2026-02-01",
        createdAt: "2026-02-01",
        sellingTaxPercent: 15
      }
    ],
    currentLotId: 1700000000001,
    sales: [
      {
        id: 11,
        type: "pack",
        quantity: 2,
        packsCount: 2,
        price: 12,
        buyerShipping: 1,
        date: "2026-02-21"
      }
    ],
    allLotPerformance: [
      {
        lotId: 1700000000001,
        lotName: "Lot S",
        totalRevenue: 120,
        totalCost: 80,
        totalPacks: 10
      }
    ],
    portfolioSelectedLotIds: [1700000000001],
    $refs: {
      portfolioWindow: {
        $refs: {
          portfolioChartCanvas: portfolioCanvas
        }
      }
    }
  });

  salesMethods.initPortfolioChart.call(ctx as never);
  assert.equal(chartCtorMock.mock.calls.length, 1);
  const config = chartCtorMock.mock.calls[0]?.[1] as {
    type: string;
    data: { datasets: Array<{ label?: string }> };
  };
  assert.equal(config.type, "bar");
  assert.equal(config.data.datasets[0]?.label, "Sell-through %");
});

test("initPortfolioChart creates profit margin chart", () => {
  const portfolioCanvas = new MockHtmlCanvasElement();
  const ctx = createContext({
    currentTab: "portfolio",
    portfolioChartView: "margin",
    allLotPerformance: [
      {
        lotId: 1700000000002,
        lotName: "Lot M",
        salesCount: 1,
        totalRevenue: 140,
        totalCost: 100,
        totalProfit: 40,
        marginPercent: 40,
        realizedCost: 100,
        realizedProfit: 40,
        realizedMarginPercent: 28.6
      }
    ],
    portfolioSelectedLotIds: [1700000000002],
    $refs: {
      portfolioWindow: {
        $refs: {
          portfolioChartCanvas: portfolioCanvas
        }
      }
    }
  });

  salesMethods.initPortfolioChart.call(ctx as never);
  assert.equal(chartCtorMock.mock.calls.length, 1);
  const config = chartCtorMock.mock.calls[0]?.[1] as {
    type: string;
    options: { indexAxis?: string };
    data: { datasets: Array<{ label?: string; data?: number[] }> };
  };
  assert.equal(config.type, "bar");
  assert.equal(config.options.indexAxis, "y");
  assert.equal(config.data.datasets[0]?.label, "Sold profit margin %");
  assert.deepEqual(config.data.datasets[0]?.data, [28.6]);
});

test("initPortfolioChart returns early when tab is not portfolio", () => {
  const ctx = createContext({
    currentTab: "sales"
  });

  salesMethods.initPortfolioChart.call(ctx as never);
  assert.equal(chartCtorMock.mock.calls.length, 0);
});
