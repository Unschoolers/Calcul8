import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { hydrateMissingPortfolioSales } from "../src/app-core/methods/sales-portfolio-hydration.ts";

function createContext(overrides: Record<string, unknown> = {}) {
  const context = {
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
    salesCacheEpoch: 0,
    ...overrides
  };
  return context;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((key: string) => {
      if (key === "sales_3") return JSON.stringify([{ id: 3 }]);
      return null;
    })
  });
});

test("hydrateMissingPortfolioSales skips when not in portfolio, offline, or api disabled", async () => {
  const fetchSales = vi.fn();

  hydrateMissingPortfolioSales(createContext({ currentTab: "sales" }) as never, {
    force: false
  }, {
    canUseAuthoritativeApi: () => true,
    fetchSales,
    cacheSales: vi.fn(),
    refreshCharts: vi.fn()
  });
  hydrateMissingPortfolioSales(createContext({ isOffline: true }) as never, {
    force: false
  }, {
    canUseAuthoritativeApi: () => true,
    fetchSales,
    cacheSales: vi.fn(),
    refreshCharts: vi.fn()
  });
  hydrateMissingPortfolioSales(createContext() as never, {
    force: false
  }, {
    canUseAuthoritativeApi: () => false,
    fetchSales,
    cacheSales: vi.fn(),
    refreshCharts: vi.fn()
  });

  await Promise.resolve();
  assert.equal(fetchSales.mock.calls.length, 0);
});

test("hydrateMissingPortfolioSales fetches only missing non-current lots and refreshes once", async () => {
  const fetchSalesByLot = vi.fn(async (_context, lotIds: number[]) => new Map(
    lotIds.map((lotId) => [lotId, [{ id: lotId }]])
  ));
  const cacheSales = vi.fn();
  const refreshCharts = vi.fn();
  const context = createContext({
    getSalesStorageKey: (lotId: number) => `sales_${lotId}`
  });

  const localStorageMock = globalThis.localStorage as {
    getItem: ReturnType<typeof vi.fn>;
  };
  localStorageMock.getItem.mockImplementation((key: string) => {
    if (key === "sales_3") return JSON.stringify([{ id: 3 }]);
    return null;
  });

  hydrateMissingPortfolioSales(context as never, {
    force: false
  }, {
    canUseAuthoritativeApi: () => true,
    fetchSales: vi.fn(),
    fetchSalesByLot,
    cacheSales,
    refreshCharts
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(fetchSalesByLot.mock.calls[0]?.[1], [2]);
  assert.equal(cacheSales.mock.calls.length, 1);
  assert.equal(cacheSales.mock.calls[0]?.[1], 2);
  assert.equal(context.salesCacheEpoch, 1);
  assert.equal(refreshCharts.mock.calls.length, 1);
});

test("hydrateMissingPortfolioSales respects an explicitly loaded empty sales cache when not forced", async () => {
  const fetchSales = vi.fn(async (_context, lotId: number) => [{ id: lotId }]);
  const context = createContext({
    getSalesStorageKey: (lotId: number) => `sales_${lotId}`
  });
  const localStorageMock = globalThis.localStorage as {
    getItem: ReturnType<typeof vi.fn>;
  };
  localStorageMock.getItem.mockImplementation((key: string) => {
    if (key === "sales_2") return "[]";
    if (key === "sales_status_2") return "loaded";
    if (key === "sales_3") return JSON.stringify([{ id: 3 }]);
    return null;
  });

  hydrateMissingPortfolioSales(context as never, { force: false }, {
    canUseAuthoritativeApi: () => true,
    fetchSales,
    cacheSales: vi.fn(),
    refreshCharts: vi.fn()
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(fetchSales.mock.calls.map((call) => call[1]), []);
});

test("hydrateMissingPortfolioSales force-refreshes selected non-current lots even when cached", async () => {
  const fetchSales = vi.fn(async (_context, lotId: number) => [{ id: lotId }]);
  const cacheSales = vi.fn();
  const refreshCharts = vi.fn();
  const context = createContext({
    getSalesStorageKey: (lotId: number) => `sales_${lotId}`
  });

  const localStorageMock = globalThis.localStorage as {
    getItem: ReturnType<typeof vi.fn>;
  };
  localStorageMock.getItem.mockImplementation((key: string) => {
    if (key === "sales_2") return JSON.stringify([{ id: 200 }]);
    if (key === "sales_3") return JSON.stringify([{ id: 300 }]);
    return null;
  });

  hydrateMissingPortfolioSales(context as never, { force: true }, {
    canUseAuthoritativeApi: () => true,
    fetchSales,
    cacheSales,
    refreshCharts
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(fetchSales.mock.calls.map((call) => call[1]), [2, 3]);
  assert.equal(cacheSales.mock.calls.length, 2);
  assert.equal(context.salesCacheEpoch, 1);
  assert.equal(refreshCharts.mock.calls.length, 1);
});

test("hydrateMissingPortfolioSales does not double-fetch a lot already hydrating", async () => {
  let resolveFetch: (() => void) | null = null;
  const fetchSalesByLot = vi.fn(() => new Promise<Map<number, Array<{ id: number }>>>((resolve) => {
    resolveFetch = () => resolve(new Map([[2, [{ id: 2 }]]]));
  }));
  const context = createContext();
  const deps = {
    canUseAuthoritativeApi: () => true,
    fetchSales: vi.fn(),
    fetchSalesByLot,
    cacheSales: vi.fn(),
    refreshCharts: vi.fn()
  };

  hydrateMissingPortfolioSales(context as never, { force: false }, deps);
  hydrateMissingPortfolioSales(context as never, { force: false }, deps);

  assert.equal(fetchSalesByLot.mock.calls.length, 1);

  resolveFetch?.();
  await Promise.resolve();
  await Promise.resolve();
});
