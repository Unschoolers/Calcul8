import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

const {
  canUseAuthoritativeSalesLiveApiMock,
  fetchAuthoritativeSalesMock,
  fetchAuthoritativeLivePricingMock,
  cacheAuthoritativeSalesMock
} = vi.hoisted(() => ({
  canUseAuthoritativeSalesLiveApiMock: vi.fn(),
  fetchAuthoritativeSalesMock: vi.fn(),
  fetchAuthoritativeLivePricingMock: vi.fn(),
  cacheAuthoritativeSalesMock: vi.fn()
}));

vi.mock("../src/app-core/methods/sales-live-api.ts", () => ({
  canUseAuthoritativeSalesLiveApi: canUseAuthoritativeSalesLiveApiMock,
  fetchAuthoritativeSales: fetchAuthoritativeSalesMock,
  fetchAuthoritativeLivePricing: fetchAuthoritativeLivePricingMock,
  cacheAuthoritativeSales: cacheAuthoritativeSalesMock
}));

import {
  markLivePricingPollingBaseline,
  pollAuthoritativeLotEntities,
  startLotEntityPolling,
  stopLotEntityPolling
} from "../src/app-core/methods/ui/lot-entity-polling.ts";

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    currentLotId: 7,
    sales: [],
    liveSpotPrice: 1,
    liveBoxPriceSell: 2,
    livePackPrice: 3,
    currentLivePricingVersion: 1,
    isOffline: false,
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  canUseAuthoritativeSalesLiveApiMock.mockReturnValue(true);
  fetchAuthoritativeSalesMock.mockResolvedValue([]);
  fetchAuthoritativeLivePricingMock.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

test("pollAuthoritativeLotEntities updates sales and live pricing when local state is clean", async () => {
  const context = createContext({
    sales: [{
      id: 1,
      type: "pack",
      quantity: 1,
      packsCount: 1,
      price: 10,
      buyerShipping: 0,
      date: "2026-03-17",
      version: 1
    }]
  });
  markLivePricingPollingBaseline(context, {
    liveSpotPrice: 1,
    liveBoxPriceSell: 2,
    livePackPrice: 3,
    currentLivePricingVersion: 1
  });
  fetchAuthoritativeSalesMock.mockResolvedValue([{
    id: 2,
    type: "pack",
    quantity: 1,
    packsCount: 1,
    price: 25,
    buyerShipping: 0,
    date: "2026-03-17",
    version: 2
  }]);
  fetchAuthoritativeLivePricingMock.mockResolvedValue({
    liveSpotPrice: 11,
    liveBoxPriceSell: 22,
    livePackPrice: 33,
    version: 4
  });

  await pollAuthoritativeLotEntities(context as never);

  assert.equal((context.sales as Array<{ id: number }>)[0]?.id, 2);
  assert.equal(context.liveSpotPrice, 11);
  assert.equal(context.liveBoxPriceSell, 22);
  assert.equal(context.livePackPrice, 33);
  assert.equal(context.currentLivePricingVersion, 4);
  assert.equal(cacheAuthoritativeSalesMock.mock.calls.length, 1);
});

test("pollAuthoritativeLotEntities does not overwrite unsaved local live pricing edits", async () => {
  const context = createContext({
    liveSpotPrice: 9,
    liveBoxPriceSell: 19,
    livePackPrice: 29,
    currentLivePricingVersion: 1
  });
  markLivePricingPollingBaseline(context, {
    liveSpotPrice: 1,
    liveBoxPriceSell: 2,
    livePackPrice: 3,
    currentLivePricingVersion: 1
  });
  fetchAuthoritativeLivePricingMock.mockResolvedValue({
    liveSpotPrice: 11,
    liveBoxPriceSell: 22,
    livePackPrice: 33,
    version: 2
  });

  await pollAuthoritativeLotEntities(context as never);

  assert.equal(context.liveSpotPrice, 9);
  assert.equal(context.liveBoxPriceSell, 19);
  assert.equal(context.livePackPrice, 29);
  assert.equal(context.currentLivePricingVersion, 1);
});

test("startLotEntityPolling polls every 30 seconds until stopped", async () => {
  vi.useFakeTimers();
  const context = createContext();

  startLotEntityPolling(context as never);
  await vi.advanceTimersByTimeAsync(30_000);
  await vi.advanceTimersByTimeAsync(30_000);
  stopLotEntityPolling(context as never);
  await vi.advanceTimersByTimeAsync(30_000);

  assert.equal(fetchAuthoritativeSalesMock.mock.calls.length, 2);
  assert.equal(fetchAuthoritativeLivePricingMock.mock.calls.length, 2);
});
