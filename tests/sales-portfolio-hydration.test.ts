import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { hydrateMissingPortfolioSales } from "../src/app-core/methods/sales-portfolio-hydration.ts";

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    currentTab: "portfolio",
    isOffline: false,
    currentLotId: 1,
    portfolioSelectedLotIds: [1, 2, 3],
    lots: [
      { id: 1, name: "Lot 1" },
      { id: 2, name: "Lot 2" },
      { id: 3, name: "Lot 3" }
    ],
    getSalesStorageKey: (lotId: number) => `sales_${lotId}`,
    salesCacheEpoch: 0,
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => {
      if (key === "sales_3") return "cached";
      return null;
    })
  });
});

test("hydrateMissingPortfolioSales skips when not in portfolio, offline, or api disabled", async () => {
  const fetchSales = vi.fn();

  hydrateMissingPortfolioSales(createContext({ currentTab: "sales" }) as never, {
    canUseAuthoritativeApi: () => true,
    fetchSales,
    cacheSales: vi.fn(),
    refreshCharts: vi.fn()
  });
  hydrateMissingPortfolioSales(createContext({ isOffline: true }) as never, {
    canUseAuthoritativeApi: () => true,
    fetchSales,
    cacheSales: vi.fn(),
    refreshCharts: vi.fn()
  });
  hydrateMissingPortfolioSales(createContext() as never, {
    canUseAuthoritativeApi: () => false,
    fetchSales,
    cacheSales: vi.fn(),
    refreshCharts: vi.fn()
  });

  await Promise.resolve();
  assert.equal(fetchSales.mock.calls.length, 0);
});

test("hydrateMissingPortfolioSales fetches only missing non-current lots and refreshes once", async () => {
  const fetchSales = vi.fn(async (_context, lotId: number) => [{ id: lotId }]);
  const cacheSales = vi.fn();
  const refreshCharts = vi.fn();
  const context = createContext();

  hydrateMissingPortfolioSales(context as never, {
    canUseAuthoritativeApi: () => true,
    fetchSales,
    cacheSales,
    refreshCharts
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(fetchSales.mock.calls.map((call) => call[1]), [2]);
  assert.equal(cacheSales.mock.calls.length, 1);
  assert.equal(cacheSales.mock.calls[0]?.[1], 2);
  assert.equal(context.salesCacheEpoch, 1);
  assert.equal(refreshCharts.mock.calls.length, 1);
});

test("hydrateMissingPortfolioSales does not double-fetch a lot already hydrating", async () => {
  let resolveFetch: (() => void) | null = null;
  const fetchSales = vi.fn(() => new Promise((resolve) => {
    resolveFetch = () => resolve([{ id: 2 }]);
  }));
  const context = createContext();
  const deps = {
    canUseAuthoritativeApi: () => true,
    fetchSales,
    cacheSales: vi.fn(),
    refreshCharts: vi.fn()
  };

  hydrateMissingPortfolioSales(context as never, deps);
  hydrateMissingPortfolioSales(context as never, deps);

  assert.equal(fetchSales.mock.calls.length, 1);

  resolveFetch?.();
  await Promise.resolve();
  await Promise.resolve();
});
