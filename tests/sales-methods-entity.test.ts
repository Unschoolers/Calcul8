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
  default: class MockChart {}
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

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    currentLotId: 1,
    currentLotType: "bulk",
    currentTab: "sales",
    canUsePaidActions: true,
    packsPerBox: 16,
    singlesPurchases: [],
    singlesSoldCountByPurchaseId: {},
    sales: [],
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
    $nextTick: (callback: () => void) => callback(),
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  canUseAuthoritativeSalesLiveApiMock.mockReturnValue(true);
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
