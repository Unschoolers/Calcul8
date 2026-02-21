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

function createContext(overrides: Ctx = {}): Ctx {
  return {
    currentTab: "sales",
    currentLotId: 1,
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
    editingSale: null,
    newSale: {
      type: "pack",
      quantity: 1,
      packsCount: null,
      price: 0,
      buyerShipping: 0,
      date: "2026-02-21"
    },
    showAddSaleModal: false,
    netFromGross: vi.fn((gross: number) => gross * 0.9),
    formatCurrency: (value: number) => value.toFixed(2),
    formatDate: (value: string) => `D:${value}`,
    loadSalesForLotId: vi.fn().mockReturnValue([]),
    getSalesStorageKey: (lotId: number) => `sales_${lotId}`,
    askConfirmation: vi.fn((_opts, onConfirm: () => void) => onConfirm()),
    notify: vi.fn(),
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
          salesChart: pieCanvas
        }
      }
    }
  });

  salesMethods.initSalesChart.call(ctx as never);
  assert.equal(chartCtorMock.mock.calls.length, 1);
  const config = chartCtorMock.mock.calls[0]?.[1] as { type: string };
  assert.equal(config.type, "doughnut");
});

test("initPortfolioChart creates breakdown doughnut chart", () => {
  const portfolioCanvas = new MockHtmlCanvasElement();
  const ctx = createContext({
    currentTab: "portfolio",
    portfolioChartView: "breakdown",
    $refs: {
      portfolioWindow: {
        $refs: {
          portfolioChart: portfolioCanvas
        }
      }
    }
  });

  salesMethods.initPortfolioChart.call(ctx as never);
  assert.equal(chartCtorMock.mock.calls.length, 1);
  const config = chartCtorMock.mock.calls[0]?.[1] as { type: string };
  assert.equal(config.type, "doughnut");
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
          portfolioChart: portfolioCanvas
        }
      }
    }
  });

  salesMethods.initPortfolioChart.call(ctx as never);
  assert.equal(chartCtorMock.mock.calls.length, 1);
  const config = chartCtorMock.mock.calls[0]?.[1] as { type: string };
  assert.equal(config.type, "line");
  assert.equal(calculateNetFromGrossMock.mock.calls.length > 0, true);
});

test("initPortfolioChart returns early when tab is not portfolio", () => {
  const ctx = createContext({
    currentTab: "sales"
  });

  salesMethods.initPortfolioChart.call(ctx as never);
  assert.equal(chartCtorMock.mock.calls.length, 0);
});
