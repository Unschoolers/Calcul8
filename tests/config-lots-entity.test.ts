import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import { getSalesSyncMetaKey } from "../src/app-core/storageKeys.ts";

const {
  canUseAuthoritativeSalesLiveApiMock,
  fetchAuthoritativeAllSalesMock,
  fetchAuthoritativeLotSalesSyncMetaMock,
  fetchAuthoritativeSalesMock,
  fetchAuthoritativeLivePricingMock,
  saveAuthoritativeLivePricingMock
} = vi.hoisted(() => ({
  canUseAuthoritativeSalesLiveApiMock: vi.fn(),
  fetchAuthoritativeAllSalesMock: vi.fn(),
  fetchAuthoritativeLotSalesSyncMetaMock: vi.fn(),
  fetchAuthoritativeSalesMock: vi.fn(),
  fetchAuthoritativeLivePricingMock: vi.fn(),
  saveAuthoritativeLivePricingMock: vi.fn()
}));

vi.mock("../src/app-core/methods/entity-api-shared.ts", () => {
  class SalesLiveApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }

  return {
    SalesLiveApiError,
    canUseAuthoritativeSalesLiveApi: canUseAuthoritativeSalesLiveApiMock
  };
});

vi.mock("../src/app-core/methods/lot-sales-api.ts", () => ({
    fetchAuthoritativeAllSales: fetchAuthoritativeAllSalesMock,
    fetchAuthoritativeLotSalesSyncMeta: fetchAuthoritativeLotSalesSyncMetaMock,
    fetchAuthoritativeSales: fetchAuthoritativeSalesMock
}));

vi.mock("../src/app-core/methods/lot-live-pricing-api.ts", () => ({
    fetchAuthoritativeLivePricing: fetchAuthoritativeLivePricingMock,
    saveAuthoritativeLivePricing: saveAuthoritativeLivePricingMock
}));

import { configLotMethods } from "../src/app-core/methods/config-lots.ts";

type MockStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
};

function createMockStorage(): MockStorage {
  const data = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return data.has(key) ? data.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      data.set(key, String(value));
    },
    removeItem(key: string): void {
      data.delete(key);
    },
    clear(): void {
      data.clear();
    }
  };
}

function createContext(overrides: Record<string, unknown> = {}) {
  const lot = {
    id: 101,
    name: "Lot A",
    lotType: "bulk",
    boxPriceCost: 70,
    boxesPurchased: 16,
    packsPerBox: 16,
    spotsPerBox: 5,
    costInputMode: "perBox",
    currency: "CAD",
    sellingCurrency: "CAD",
    exchangeRate: 1.4,
    purchaseDate: "2026-03-01",
    purchaseShippingCost: 2,
    purchaseTaxPercent: 12,
    sellingTaxPercent: 15,
    sellingShippingPerOrder: 0,
    includeTax: true,
    spotPrice: 1,
    boxPriceSell: 2,
    packPrice: 3,
    targetProfitPercent: 10
  };

  return {
    lots: [lot],
    currentLotId: 101,
    currentLotType: "bulk",
    currentTab: "config",
    activeScopeType: "personal",
    activeWorkspaceId: null,
    hasProAccess: true,
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
    liveSpotPrice: 11,
    liveBoxPriceSell: 22,
    livePackPrice: 33,
    currentLivePricingVersion: 4,
    livePricingHydrationStatus: "hydrated",
    livePricingHydratedLotId: 101,
    singlesPurchases: [],
    sales: [],
    showSinglesCsvMapperModal: false,
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
    newLotType: "bulk",
    newLotCatalogSource: "ua",
    targetProfitPercent: 10,
    syncLivePricesFromDefaults: vi.fn(() => {
      configLotMethods.syncLivePricesFromDefaults.call(ctx as never);
    }),
    getSalesCacheEntry: vi.fn(() => ({
      status: "missing",
      sales: []
    })),
    loadSalesFromStorage: vi.fn(),
    autoSaveSetup: vi.fn(),
    pushCloudSync: vi.fn(async () => undefined),
    notify: vi.fn(),
    saveLotsToStorage: vi.fn(),
    loadLot: vi.fn(),
    initSalesChart: vi.fn(),
    initPortfolioChart: vi.fn(),
    clearLiveSinglesSelection: vi.fn(),
    $nextTick: (callback: () => void) => callback(),
    ...overrides
  };
}

let ctx = createContext();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", createMockStorage());
  localStorage.clear();
  canUseAuthoritativeSalesLiveApiMock.mockReturnValue(true);
  fetchAuthoritativeLotSalesSyncMetaMock.mockResolvedValue({
    activeCount: 0,
    latestUpdatedAt: null
  });
  ctx = createContext();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("applyLivePricesToDefaults saves authoritative live pricing and updates version", async () => {
  vi.useFakeTimers();
  saveAuthoritativeLivePricingMock.mockResolvedValue({
    liveSpotPrice: 11,
    liveBoxPriceSell: 22,
    livePackPrice: 33,
    version: 5
  });

  configLotMethods.applyLivePricesToDefaults.call(ctx as never);
  await vi.runAllTimersAsync();

  assert.equal(saveAuthoritativeLivePricingMock.mock.calls.length, 1);
  assert.equal(ctx.currentLivePricingVersion, 5);
  assert.equal((ctx.autoSaveSetup as ReturnType<typeof vi.fn>).mock.calls.length, 0);
  assert.deepEqual((ctx.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1), ["Live prices saved", "success"]);
});

test("applyLivePricesToDefaults coalesces repeated clicks into one authoritative save", async () => {
  vi.useFakeTimers();
  saveAuthoritativeLivePricingMock.mockResolvedValue({
    liveSpotPrice: 11,
    liveBoxPriceSell: 22,
    livePackPrice: 33,
    version: 5
  });

  configLotMethods.applyLivePricesToDefaults.call(ctx as never);
  configLotMethods.applyLivePricesToDefaults.call(ctx as never);
  configLotMethods.applyLivePricesToDefaults.call(ctx as never);
  await vi.advanceTimersByTimeAsync(500);

  assert.equal(saveAuthoritativeLivePricingMock.mock.calls.length, 1);
});

test("applyLivePricesToDefaults does not overwrite already-updated live values when the save resolves", async () => {
  vi.useFakeTimers();
  let resolveSave: (value: unknown) => void = () => {
    throw new Error("Save resolver was not initialized.");
  };
  const savePromise = new Promise((resolve) => {
    resolveSave = resolve;
  });
  saveAuthoritativeLivePricingMock.mockReturnValue(savePromise);

  configLotMethods.applyLivePricesToDefaults.call(ctx as never);
  await vi.advanceTimersByTimeAsync(500);

  ctx.liveSpotPrice = 77;
  ctx.liveBoxPriceSell = 88;
  ctx.livePackPrice = 99;
  ctx.currentLivePricingVersion = 5;

  resolveSave({
    liveSpotPrice: 11,
    liveBoxPriceSell: 22,
    livePackPrice: 33,
    version: 5
  });
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(ctx.liveSpotPrice, 77);
  assert.equal(ctx.liveBoxPriceSell, 88);
  assert.equal(ctx.livePackPrice, 99);
  assert.equal(ctx.currentLivePricingVersion, 5);
});

test("loadLot hydrates authoritative sales and live pricing after local defaults", async () => {
  fetchAuthoritativeSalesMock.mockResolvedValue([
    {
      id: 77,
      type: "pack",
      quantity: 1,
      packsCount: 1,
      price: 10,
      buyerShipping: 0,
      date: "2026-03-17",
      version: 2
    }
  ]);
  fetchAuthoritativeLivePricingMock.mockResolvedValue({
    liveSpotPrice: 44,
    liveBoxPriceSell: 55,
    livePackPrice: 66,
    version: 7
  });

  configLotMethods.loadLot.call(ctx as never);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(fetchAuthoritativeSalesMock.mock.calls.length, 1);
  assert.equal(fetchAuthoritativeLivePricingMock.mock.calls.length, 1);
});

test("loadLot skips full personal sales refresh when metadata matches but still hydrates live pricing", async () => {
  ctx = createContext({
    getSalesCacheEntry: vi.fn(() => ({
      status: "loaded",
      sales: [
        {
          id: 12,
          type: "pack",
          quantity: 1,
          packsCount: 1,
          price: 9,
          buyerShipping: 0,
          date: "2026-03-18",
          version: 1
        }
      ]
    }))
  });
  localStorage.setItem(getSalesSyncMetaKey(101), JSON.stringify({
    activeCount: 1,
    latestUpdatedAt: "2026-03-18T00:00:00.000Z"
  }));
  fetchAuthoritativeLotSalesSyncMetaMock.mockResolvedValue({
    activeCount: 1,
    latestUpdatedAt: "2026-03-18T00:00:00.000Z"
  });
  fetchAuthoritativeLivePricingMock.mockResolvedValue({
    liveSpotPrice: 44,
    liveBoxPriceSell: 55,
    livePackPrice: 66,
    version: 7
  });

  configLotMethods.loadLot.call(ctx as never);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(fetchAuthoritativeSalesMock.mock.calls.length, 0);
  assert.equal(fetchAuthoritativeLotSalesSyncMetaMock.mock.calls.length, 1);
  assert.equal(fetchAuthoritativeLivePricingMock.mock.calls.length, 1);
  assert.equal(ctx.liveSpotPrice, 44);
  assert.equal(ctx.liveBoxPriceSell, 55);
  assert.equal(ctx.livePackPrice, 66);
  assert.equal(ctx.currentLivePricingVersion, 7);
  assert.equal(ctx.livePricingHydrationStatus, "hydrated");
  assert.equal(ctx.livePricingHydratedLotId, 101);
});

test("loadLot records missing live pricing so null version no longer means unhydrated", async () => {
  ctx = createContext({
    getSalesCacheEntry: vi.fn(() => ({
      status: "loaded",
      sales: []
    }))
  });
  fetchAuthoritativeLivePricingMock.mockResolvedValue(null);

  configLotMethods.loadLot.call(ctx as never);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(fetchAuthoritativeLivePricingMock.mock.calls.length, 1);
  assert.equal(ctx.currentLivePricingVersion, null);
  assert.equal(ctx.livePricingHydrationStatus, "missing");
  assert.equal(ctx.livePricingHydratedLotId, 101);
});

test("loadLot refreshes personal sales when cached sales metadata changed in the cloud", async () => {
  ctx = createContext({
    getSalesCacheEntry: vi.fn(() => ({
      status: "loaded",
      sales: [
        {
          id: 12,
          type: "pack",
          quantity: 1,
          packsCount: 1,
          price: 9,
          buyerShipping: 0,
          date: "2026-03-18",
          version: 1,
          updatedAt: "2026-03-18T00:00:00.000Z"
        }
      ]
    }))
  });
  localStorage.setItem(getSalesSyncMetaKey(101), JSON.stringify({
    activeCount: 1,
    latestUpdatedAt: "2026-03-18T00:00:00.000Z"
  }));
  fetchAuthoritativeLotSalesSyncMetaMock.mockResolvedValue({
    activeCount: 2,
    latestUpdatedAt: "2026-03-19T00:00:00.000Z"
  });
  fetchAuthoritativeSalesMock.mockResolvedValue([
    {
      id: 88,
      type: "pack",
      quantity: 1,
      packsCount: 1,
      price: 10,
      buyerShipping: 0,
      date: "2026-03-19",
      version: 2,
      updatedAt: "2026-03-19T00:00:00.000Z"
    }
  ]);

  configLotMethods.loadLot.call(ctx as never);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(fetchAuthoritativeLotSalesSyncMetaMock.mock.calls.length, 1);
  assert.equal(fetchAuthoritativeSalesMock.mock.calls.length, 1);
});

test("loadLot still hydrates authoritative lot data in personal scope when the lot cache is missing", async () => {
  ctx = createContext({
    getSalesCacheEntry: vi.fn(() => ({
      status: "missing",
      sales: []
    }))
  });
  fetchAuthoritativeSalesMock.mockResolvedValue([]);
  fetchAuthoritativeLivePricingMock.mockResolvedValue({
    liveSpotPrice: 4,
    liveBoxPriceSell: 5,
    livePackPrice: 6,
    version: 2
  });

  configLotMethods.loadLot.call(ctx as never);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(fetchAuthoritativeSalesMock.mock.calls.length, 1);
  assert.equal(fetchAuthoritativeLivePricingMock.mock.calls.length, 1);
});

test("loadLot always hydrates authoritative lot data in workspace scope", async () => {
  ctx = createContext({
    activeScopeType: "workspace",
    activeWorkspaceId: "ws-123",
    getSalesCacheEntry: vi.fn(() => ({
      status: "loaded",
      sales: []
    }))
  });
  fetchAuthoritativeSalesMock.mockResolvedValue([]);
  fetchAuthoritativeLivePricingMock.mockResolvedValue(null);

  configLotMethods.loadLot.call(ctx as never);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(fetchAuthoritativeSalesMock.mock.calls.length, 1);
  assert.equal(fetchAuthoritativeLivePricingMock.mock.calls.length, 1);
});
