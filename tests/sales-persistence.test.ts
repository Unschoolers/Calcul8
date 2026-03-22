import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import type { Sale } from "../src/types/app.ts";
import {
  deleteSaleWithPersistence,
  persistSaleLocally,
  saveSaleAuthoritatively,
  saveSaleWithPersistence
} from "../src/app-core/methods/sales-persistence.ts";
import { makeSale } from "./helpers/fixtures.ts";

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    currentLotId: 1,
    sales: [] as Sale[],
    editingSale: null,
    askConfirmation: vi.fn((_opts, onConfirm: () => void) => onConfirm()),
    cancelSale: vi.fn(),
    notify: vi.fn(),
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

test("persistSaleLocally appends or replaces then cancels the draft", () => {
  const appendContext = createContext({
    sales: [],
    editingSale: null
  });
  persistSaleLocally(appendContext as never, makeSale({ id: 2 }), -1);
  assert.deepEqual((appendContext.sales as Sale[]).map((sale) => sale.id), [2]);
  assert.equal((appendContext.cancelSale as ReturnType<typeof vi.fn>).mock.calls.length, 1);

  const existing = makeSale({ id: 3 });
  const editContext = createContext({
    sales: [existing],
    editingSale: existing
  });
  persistSaleLocally(editContext as never, makeSale({ id: 3, price: 20 }), 0);
  assert.equal((editContext.sales as Sale[])[0]?.price, 20);
});

test("saveSaleAuthoritatively saves, caches, cancels, and refreshes", async () => {
  const refreshCharts = vi.fn();
  const context = createContext({
    sales: [makeSale({ id: 1, price: 10 })],
    cancelSale: vi.fn()
  });

  saveSaleAuthoritatively(context as never, {
    lotId: 1,
    pendingSale: makeSale({ id: 2, price: 25 }),
    editingSaleId: null,
    baseVersion: 0
  }, {
    canUseAuthoritativeApi: () => true,
    saveSale: vi.fn(async () => makeSale({ id: 2, price: 25 })),
    fetchSales: vi.fn(),
    cacheSales: vi.fn(),
    refreshCharts
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual((context.sales as Sale[]).map((sale) => sale.id), [1, 2]);
  assert.equal((context.cancelSale as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal(refreshCharts.mock.calls.length, 1);
});

test("deleteSaleWithPersistence deletes locally when api is unavailable", () => {
  const refreshCharts = vi.fn();
  const context = createContext({
    sales: [makeSale({ id: 5 })]
  });

  deleteSaleWithPersistence(context as never, 5, {
    canUseAuthoritativeApi: () => false,
    deleteSale: vi.fn(),
    fetchSales: vi.fn(),
    cacheSales: vi.fn(),
    refreshCharts
  });

  assert.equal((context.sales as Sale[]).length, 0);
  assert.equal((context.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "Sale deleted");
  assert.equal(refreshCharts.mock.calls.length, 1);
});

test("saveSaleWithPersistence chooses local or authoritative flow based on lot/api availability", () => {
  const localContext = createContext({
    currentLotId: null
  });
  const persistLocally = vi.fn();
  const refreshCharts = vi.fn();
  const saveAuthoritatively = vi.fn();

  saveSaleWithPersistence(localContext as never, {
    lotId: null,
    pendingSale: makeSale({ id: 7 }),
    editingSaleId: null,
    editingIndex: -1,
    baseVersion: 0
  }, {
    canUseAuthoritativeApi: () => true,
    persistLocally,
    refreshCharts,
    saveAuthoritatively
  });

  assert.equal(persistLocally.mock.calls.length, 1);
  assert.equal(refreshCharts.mock.calls.length, 1);
  assert.equal(saveAuthoritatively.mock.calls.length, 0);

  const authoritativeContext = createContext({
    currentLotId: 1
  });
  saveSaleWithPersistence(authoritativeContext as never, {
    lotId: 1,
    pendingSale: makeSale({ id: 8 }),
    editingSaleId: 8,
    editingIndex: 0,
    baseVersion: 3
  }, {
    canUseAuthoritativeApi: () => true,
    persistLocally: vi.fn(),
    refreshCharts: vi.fn(),
    saveAuthoritatively
  });

  assert.equal(saveAuthoritatively.mock.calls.length, 1);
});
