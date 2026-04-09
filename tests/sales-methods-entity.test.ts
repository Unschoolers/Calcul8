import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const {
  canUseAuthoritativeSalesLiveApiMock,
  saveAuthoritativeSaleMock,
  deleteAuthoritativeSaleMock,
  fetchAuthoritativeSalesMock,
  cacheAuthoritativeSalesMock
} = vi.hoisted(() => ({
  canUseAuthoritativeSalesLiveApiMock: vi.fn(),
  saveAuthoritativeSaleMock: vi.fn(),
  deleteAuthoritativeSaleMock: vi.fn(),
  fetchAuthoritativeSalesMock: vi.fn(),
  cacheAuthoritativeSalesMock: vi.fn()
}));

vi.mock("chart.js/auto", () => ({
  default: class MockChart {
    static getChart = vi.fn(() => null);
  }
}));

vi.mock("../src/app-core/methods/config-shared.ts", async () => {
  const actual = await vi.importActual<typeof import("../src/app-core/methods/config-shared.ts")>(
    "../src/app-core/methods/config-shared.ts"
  );
  return {
    ...actual,
    getTodayDate: () => "2026-03-17"
  };
});

vi.mock("../src/app-core/methods/sales-live-api.ts", () => {
  class SalesLiveApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }

  return {
    SalesLiveApiError,
    canUseAuthoritativeSalesLiveApi: canUseAuthoritativeSalesLiveApiMock,
    saveAuthoritativeSale: saveAuthoritativeSaleMock,
    deleteAuthoritativeSale: deleteAuthoritativeSaleMock,
    fetchAuthoritativeSales: fetchAuthoritativeSalesMock,
    cacheAuthoritativeSales: cacheAuthoritativeSalesMock
  };
});

import { salesMethods } from "../src/app-core/methods/sales.ts";
import { SalesLiveApiError } from "../src/app-core/methods/sales-live-api.ts";

class MockHtmlCanvasElement {
  getContext = vi.fn(() => ({ id: "ctx" }));
}

function createContext(overrides: Record<string, unknown> = {}) {
  const context = {
    currentLotId: 1,
    currentLotType: "bulk",
    currentTab: "sales",
    isOffline: false,
    canUsePaidActions: true,
    packsPerBox: 16,
    singlesPurchases: [],
    singlesSoldCountByPurchaseId: {},
    sales: [],
    salesByLotId: new Map(),
    lots: [],
    portfolioSelectedLotIds: [],
    portfolioChartView: "trend",
    allLotPerformance: [],
    salesCacheEpoch: 0,
    editingSale: null,
    newSale: {
      type: "pack",
      quantity: 1,
      packsCount: null,
      price: 10,
      buyerShipping: 0,
      date: "2026-03-17"
    },
    notify: vi.fn(),
    cancelSale: vi.fn(),
    initSalesChart: vi.fn(),
    initPortfolioChart: vi.fn(),
    loadSalesForLotId: vi.fn(() => []),
    getSalesStorageKey: (lotId: number) => `sales_${lotId}`,
    getSalesCacheEntry(lotId: number) {
      const raw = globalThis.localStorage?.getItem?.(`sales_${lotId}`) ?? null;
      if (!raw) {
        return { status: "missing" as const, sales: [] };
      }
      try {
        const parsed = JSON.parse(raw);
        const sales = Array.isArray(parsed) ? parsed : [];
        const hasExplicitLoadedState = globalThis.localStorage?.getItem?.(`sales_status_${lotId}`) === "loaded";
        return {
          status: hasExplicitLoadedState || sales.length > 0 ? "loaded" as const : "missing" as const,
          sales
        };
      } catch {
        return { status: "missing" as const, sales: [] };
      }
    },
    getAllSalesByLotId(lotIds?: number[] | null) {
      return salesMethods.getAllSalesByLotId.call(this as never, lotIds ?? null);
    },
    formatCurrency: (value: number) => `$${value.toFixed(2)}`,
    formatDate: (value: string) => value,
    netFromGross: vi.fn((gross: number) => gross),
    $nextTick: (callback: () => void) => callback(),
    ...overrides
  };
  return context;
}

beforeEach(() => {
  vi.clearAllMocks();
  canUseAuthoritativeSalesLiveApiMock.mockReturnValue(true);
  vi.stubGlobal("HTMLCanvasElement", MockHtmlCanvasElement as unknown as typeof HTMLCanvasElement);
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn()
  });
});

test("saveSale uses authoritative API and appends the saved sale metadata", async () => {
  const cancelSale = vi.fn();
  const ctx = createContext({
    cancelSale
  });
  saveAuthoritativeSaleMock.mockResolvedValue({
    id: 1,
    type: "pack",
    quantity: 1,
    packsCount: 1,
    price: 10,
    buyerShipping: 0,
    date: "2026-03-17",
    version: 2
  });

  salesMethods.saveSale.call(ctx as never);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(saveAuthoritativeSaleMock.mock.calls.length, 1);
  assert.equal((ctx.sales as Array<{ version?: number }>).length, 1);
  assert.equal((ctx.sales as Array<{ version?: number }>)[0]?.version, 2);
  assert.equal(cancelSale.mock.calls.length, 1);
  assert.equal(cacheAuthoritativeSalesMock.mock.calls.length, 1);
});

test("getAllSalesByLotId prefers in-memory current lot sales and loads the rest by lot id", () => {
  const loadSalesForLotId = vi.fn((lotId: number) => {
    if (lotId === 2) {
      return [{
        id: 22,
        type: "pack",
        quantity: 1,
        packsCount: 1,
        price: 20,
        buyerShipping: 0,
        date: "2026-03-17"
      }];
    }
    return [];
  });
  const ctx = createContext({
    currentLotId: 1,
    lots: [{ id: 1 }, { id: 2 }, { id: 3 }],
    sales: [{
      id: 11,
      type: "pack",
      quantity: 1,
      packsCount: 1,
      price: 10,
      buyerShipping: 0,
      date: "2026-03-17"
    }],
    loadSalesForLotId
  });

  const allSalesByLotId = salesMethods.getAllSalesByLotId.call(ctx as never, [1, 2]);

  assert.deepEqual([...allSalesByLotId.keys()], [1, 2]);
  assert.equal(allSalesByLotId.get(1)?.[0]?.id, 11);
  assert.equal(allSalesByLotId.get(2)?.[0]?.id, 22);
  assert.deepEqual(loadSalesForLotId.mock.calls, [[2]]);
});

test("addWheelSaleToLot uses authoritative persistence for non-current lots too", async () => {
  const notify = vi.fn();
  const loadSalesForLotId = vi.fn(() => []);
  const ctx = createContext({
    currentLotId: 1,
    notify,
    loadSalesForLotId
  });
  saveAuthoritativeSaleMock.mockResolvedValue({
    id: 77,
    type: "wheel",
    quantity: 1,
    packsCount: 1,
    price: 10,
    buyerShipping: 0,
    date: "2026-03-17",
    version: 1
  });

  salesMethods.addWheelSaleToLot.call(ctx as never, 2, {
    id: 77,
    type: "wheel",
    quantity: 1,
    packsCount: 1,
    price: 10,
    buyerShipping: 0,
    date: "2026-03-17"
  });
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(saveAuthoritativeSaleMock.mock.calls.length, 1);
  assert.deepEqual(saveAuthoritativeSaleMock.mock.calls[0]?.slice(1), [2, {
    id: 77,
    type: "wheel",
    quantity: 1,
    packsCount: 1,
    price: 10,
    buyerShipping: 0,
    date: "2026-03-17"
  }, 0]);
  assert.equal(cacheAuthoritativeSalesMock.mock.calls.length, 1);
  assert.equal(loadSalesForLotId.mock.calls.length, 1);
  assert.deepEqual(notify.mock.calls.at(-1), ["Wheel sale recorded", "success"]);
});

test("saveSale ignores duplicate submit clicks while the authoritative save is in flight", async () => {
  let resolveSave: ((value: unknown) => void) | null = null;
  const savePromise = new Promise((resolve) => {
    resolveSave = resolve;
  });
  const ctx = createContext();
  saveAuthoritativeSaleMock.mockReturnValue(savePromise);

  salesMethods.saveSale.call(ctx as never);
  salesMethods.saveSale.call(ctx as never);
  await Promise.resolve();

  assert.equal(saveAuthoritativeSaleMock.mock.calls.length, 1);

  resolveSave?.({
    id: 1,
    type: "pack",
    quantity: 1,
    packsCount: 1,
    price: 10,
    buyerShipping: 0,
    date: "2026-03-17",
    version: 2
  });
  await Promise.resolve();
  await Promise.resolve();
});

test("saveSale does not duplicate a sale already inserted by realtime before the save resolves", async () => {
  let resolveSave: ((value: unknown) => void) | null = null;
  const savePromise = new Promise((resolve) => {
    resolveSave = resolve;
  });
  const ctx = createContext();
  saveAuthoritativeSaleMock.mockReturnValue(savePromise);

  salesMethods.saveSale.call(ctx as never);
  await Promise.resolve();

  ctx.sales = [{
    id: 1,
    type: "box",
    quantity: 2,
    packsCount: 2,
    price: 82,
    buyerShipping: 0,
    date: "2026-03-19",
    version: 3
  }];

  resolveSave?.({
    id: 1,
    type: "box",
    quantity: 2,
    packsCount: 2,
    price: 82,
    buyerShipping: 0,
    date: "2026-03-19",
    version: 3
  });
  await Promise.resolve();
  await Promise.resolve();

  assert.equal((ctx.sales as Array<{ id: number }>).length, 1);
  assert.equal((ctx.sales as Array<{ id: number }>)[0]?.id, 1);
});

test("saveSale cancels the stale editor and reloads latest sales on authoritative conflict", async () => {
  const cancelSale = vi.fn();
  const initSalesChart = vi.fn();
  const latestSales = [
    {
      id: 11,
      type: "box",
      quantity: 4,
      packsCount: 4,
      price: 85,
      buyerShipping: 0,
      date: "2026-03-08",
      version: 12
    }
  ];
  const ctx = createContext({
    editingSale: {
      id: 11,
      type: "box",
      quantity: 4,
      packsCount: 4,
      price: 82,
      buyerShipping: 0,
      date: "2026-03-08",
      version: 3
    },
    sales: [{
      id: 11,
      type: "box",
      quantity: 4,
      packsCount: 4,
      price: 82,
      buyerShipping: 0,
      date: "2026-03-08",
      version: 3
    }],
    cancelSale,
    initSalesChart
  });
  saveAuthoritativeSaleMock.mockRejectedValue(new SalesLiveApiError(409, "stale"));
  fetchAuthoritativeSalesMock.mockResolvedValue(latestSales);

  salesMethods.saveSale.call(ctx as never);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(ctx.sales, latestSales);
  assert.equal(cancelSale.mock.calls.length, 1);
  assert.equal(initSalesChart.mock.calls.length, 1);
  assert.deepEqual((ctx.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1), [
    "Sales changed in the cloud. Pulled latest sales and canceled your save.",
    "warning"
  ]);
});

test("deleteSale reloads latest sales on authoritative conflict", async () => {
  const latestSales = [
    {
      id: 7,
      type: "pack",
      quantity: 1,
      packsCount: 1,
      price: 15,
      buyerShipping: 0,
      date: "2026-03-17",
      version: 3
    }
  ];
  const ctx = createContext({
    sales: [{
      id: 1,
      type: "pack",
      quantity: 1,
      packsCount: 1,
      price: 10,
      buyerShipping: 0,
      date: "2026-03-17",
      version: 2
    }],
    askConfirmation: vi.fn((_opts, onConfirm: () => void) => onConfirm())
  });
  deleteAuthoritativeSaleMock.mockRejectedValue(new SalesLiveApiError(409, "stale"));
  fetchAuthoritativeSalesMock.mockResolvedValue(latestSales);

  salesMethods.deleteSale.call(ctx as never, 1);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(deleteAuthoritativeSaleMock.mock.calls.length, 1);
  assert.deepEqual(ctx.sales, latestSales);
  assert.deepEqual((ctx.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1), [
    "Sales changed in the cloud. Pulled latest sales instead of deleting.",
    "warning"
  ]);
});

test("deleteSale stays stable if realtime already removed the sale before delete resolves", async () => {
  let resolveDelete: (() => void) | null = null;
  const deletePromise = new Promise<void>((resolve) => {
    resolveDelete = resolve;
  });
  const ctx = createContext({
    sales: [{
      id: 1,
      type: "box",
      quantity: 2,
      packsCount: 2,
      price: 82,
      buyerShipping: 0,
      date: "2026-03-19",
      version: 3
    }],
    askConfirmation: vi.fn((_opts, onConfirm: () => void) => onConfirm())
  });
  deleteAuthoritativeSaleMock.mockReturnValue(deletePromise);

  salesMethods.deleteSale.call(ctx as never, 1);
  await Promise.resolve();

  ctx.sales = [];

  resolveDelete?.();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(ctx.sales, []);
  assert.equal(cacheAuthoritativeSalesMock.mock.calls.length, 1);
  assert.deepEqual((ctx.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1), [
    "Sale deleted",
    "info"
  ]);
});
test("initPortfolioChart hydrates missing authoritative sales for selected non-current lots", async () => {
  const portfolioCanvas = new MockHtmlCanvasElement();
  const localStorageMock = globalThis.localStorage as {
    getItem: ReturnType<typeof vi.fn>;
    setItem: ReturnType<typeof vi.fn>;
  };
  localStorageMock.getItem.mockImplementation((key: string) => {
    if (key === "sales_2") return null;
    return "[]";
  });
  fetchAuthoritativeSalesMock.mockResolvedValue([
    {
      id: 21,
      type: "pack",
      quantity: 1,
      packsCount: 1,
      price: 12,
      buyerShipping: 0,
      date: "2026-03-17",
      version: 1
    }
  ]);

  const ctx = createContext({
    currentTab: "portfolio",
    currentLotId: 1,
    lots: [
      {
        id: 1,
        name: "Lot 1",
        purchaseDate: "2026-03-01",
        createdAt: "2026-03-01",
        sellingTaxPercent: 15
      },
      {
        id: 2,
        name: "Lot 2",
        purchaseDate: "2026-03-02",
        createdAt: "2026-03-02",
        sellingTaxPercent: 15
      }
    ],
    portfolioSelectedLotIds: [1, 2],
    sales: [],
    allLotPerformance: [
      {
        lotId: 1,
        lotName: "Lot 1",
        totalRevenue: 0,
        totalCost: 100
      },
      {
        lotId: 2,
        lotName: "Lot 2",
        totalRevenue: 12,
        totalCost: 90
      }
    ],
    $refs: {
      portfolioWindow: {
        $refs: {
          portfolioChartCanvas: portfolioCanvas
        }
      }
    }
  });

  salesMethods.initPortfolioChart.call(ctx as never);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(fetchAuthoritativeSalesMock.mock.calls, [[ctx, 2]]);
  assert.deepEqual(cacheAuthoritativeSalesMock.mock.calls, [[ctx, 2, [{
    id: 21,
    type: "pack",
    quantity: 1,
    packsCount: 1,
    price: 12,
    buyerShipping: 0,
    date: "2026-03-17",
    version: 1
  }]]]);
  assert.equal(ctx.salesCacheEpoch, 1);
  assert.equal((ctx.initPortfolioChart as ReturnType<typeof vi.fn>).mock.calls.length, 1);
});


