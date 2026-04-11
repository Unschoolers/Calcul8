import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

const {
  canUseAuthoritativeSalesLiveApiMock,
  fetchAuthoritativeAllSalesMock,
  fetchAuthoritativeSalesMock,
  fetchAuthoritativeLivePricingMock,
  saveAuthoritativeLivePricingMock
} = vi.hoisted(() => ({
  canUseAuthoritativeSalesLiveApiMock: vi.fn(),
  fetchAuthoritativeAllSalesMock: vi.fn(),
  fetchAuthoritativeSalesMock: vi.fn(),
  fetchAuthoritativeLivePricingMock: vi.fn(),
  saveAuthoritativeLivePricingMock: vi.fn()
}));

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
    fetchAuthoritativeAllSales: fetchAuthoritativeAllSalesMock,
    fetchAuthoritativeSales: fetchAuthoritativeSalesMock,
    fetchAuthoritativeLivePricing: fetchAuthoritativeLivePricingMock,
    saveAuthoritativeLivePricing: saveAuthoritativeLivePricingMock
  };
});

import { configLotMethods } from "../src/app-core/methods/config-lots.ts";

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
  canUseAuthoritativeSalesLiveApiMock.mockReturnValue(true);
  ctx = createContext();
});

afterEach(() => {
  vi.useRealTimers();
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
  let resolveSave: ((value: unknown) => void) | null = null;
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

  resolveSave?.({
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

  assert.equal(fetchAuthoritativeSalesMock.mock.calls.length, 1);
  assert.equal(fetchAuthoritativeLivePricingMock.mock.calls.length, 1);
  assert.equal((ctx.sales as Array<{ id: number }>)[0]?.id, 77);
  assert.equal(ctx.liveSpotPrice, 44);
  assert.equal(ctx.liveBoxPriceSell, 55);
  assert.equal(ctx.livePackPrice, 66);
  assert.equal(ctx.currentLivePricingVersion, 7);
});
