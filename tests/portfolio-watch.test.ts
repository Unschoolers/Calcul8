import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { portfolioComputed } from "../src/app-core/computed/portfolio.ts";
import { createDenseVolumeFixture } from "./helpers/volume-fixtures.ts";

const { hydrateMissingWhatnotScopeSalesMock } = vi.hoisted(() => ({
  hydrateMissingWhatnotScopeSalesMock: vi.fn()
}));
vi.mock("../src/app-core/methods/whatnot-fee-hydration.ts", () => ({
  hydrateMissingWhatnotScopeSales: hydrateMissingWhatnotScopeSalesMock
}));

import { appWatch } from "../src/app-core/watch.ts";

test("deep lot changes refresh portfolio charts when receipt filtering changes selected lots", () => {
  const { lot: fixtureLot } = createDenseVolumeFixture();
  const lot = { ...fixtureLot, id: 44, expectedReceiptDate: "2026-01-01" };
  const queued: Array<() => void> = [];
  const initPortfolioChart = vi.fn();
  const context = {
    currentTab: "portfolio",
    currentLotId: 1,
    lots: [lot],
    sales: [],
    salesByLotId: {},
    portfolioLotFilterIds: [],
    portfolioLotTypeFilter: "both",
    portfolioDashboardPreset: "all",
    portfolioReceiptFilter: "awaiting",
    salesCacheEpoch: 0,
    getAllSalesByLotId: () => new Map([[44, []]]),
    getSalesCacheEntry: () => ({ status: "loaded" as const, sales: [] }),
    loadSalesForLotId: () => [],
    initPortfolioChart,
    $nextTick: (callback: () => void) => { queued.push(callback); }
  };

  assert.deepEqual(portfolioComputed.portfolioSelectedLotIds.call(context as never), [44]);
  lot.expectedReceiptDate = "";
  assert.deepEqual(portfolioComputed.portfolioSelectedLotIds.call(context as never), []);

  appWatch.lots.handler.call(context as never);
  assert.equal(queued.length, 1);
  assert.equal(initPortfolioChart.mock.calls.length, 0);
  queued[0]?.();
  assert.equal(initPortfolioChart.mock.calls.length, 1);
});
