import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const {
  refreshWorkspaceRealtimeMock,
  stopWorkspaceRealtimeMock,
  refreshPersonalLotSalesIfStaleMock
} = vi.hoisted(() => ({
  refreshWorkspaceRealtimeMock: vi.fn(),
  stopWorkspaceRealtimeMock: vi.fn(),
  refreshPersonalLotSalesIfStaleMock: vi.fn(async () => false)
}));

vi.mock("../src/app-core/methods/ui/workspace/workspace-realtime.ts", () => ({
  refreshWorkspaceRealtime: refreshWorkspaceRealtimeMock,
  stopWorkspaceRealtime: stopWorkspaceRealtimeMock
}));

vi.mock("../src/app-core/methods/sales-freshness.ts", () => ({
  refreshPersonalLotSalesIfStale: refreshPersonalLotSalesIfStaleMock
}));

import { appWatch } from "../src/app-core/watch.ts";

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    currentLotId: 101,
    currentTab: "config",
    activeScopeType: "personal",
    activeWorkspaceId: null,
    speedDialOpenSales: false,
    portfolioChart: null,
    portfolioSalesByUserChart: null,
    sales: [],
    salesByLotId: new Map(),
    googleAuthEpoch: 0,
    hasProAccess: true,
    notify: vi.fn(),
    getSalesCacheEntry: vi.fn(() => ({
      status: "loaded",
      sales: []
    })),
    getSalesStorageKey: vi.fn((lotId: number) => `sales:${lotId}`),
    initSalesChart: vi.fn(),
    initPortfolioChart: vi.fn(),
    clearLiveSinglesSelection: vi.fn(),
    $nextTick(callback: () => void) {
      callback();
    },
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn()
  });
});

test("watch.currentTab triggers a sales freshness check when entering the sales tab", () => {
  const context = createContext();
  vi.useFakeTimers();
  context.currentTab = "sales";

  appWatch.currentTab.call(context as never, "sales");

  assert.equal(refreshWorkspaceRealtimeMock.mock.calls.length, 1);
  assert.deepEqual(refreshPersonalLotSalesIfStaleMock.mock.calls, []);
  assert.equal((context.initSalesChart as ReturnType<typeof vi.fn>).mock.calls.length, 0);

  vi.advanceTimersByTime(250);
  assert.equal((context.initSalesChart as ReturnType<typeof vi.fn>).mock.calls.length, 1);

  vi.advanceTimersByTime(250);
  assert.deepEqual(refreshPersonalLotSalesIfStaleMock.mock.calls, [[context, 101]]);
  vi.useRealTimers();
});

test("watch.currentTab triggers a sales freshness check when entering the portfolio tab", () => {
  const context = createContext();
  vi.useFakeTimers();
  context.currentTab = "portfolio";

  appWatch.currentTab.call(context as never, "portfolio");

  assert.equal(refreshWorkspaceRealtimeMock.mock.calls.length, 1);
  assert.deepEqual(refreshPersonalLotSalesIfStaleMock.mock.calls, []);
  assert.equal((context.initPortfolioChart as ReturnType<typeof vi.fn>).mock.calls.length, 0);

  vi.advanceTimersByTime(250);
  assert.equal((context.initPortfolioChart as ReturnType<typeof vi.fn>).mock.calls.length, 1);

  vi.advanceTimersByTime(250);
  assert.deepEqual(refreshPersonalLotSalesIfStaleMock.mock.calls, [[context, 101]]);
  vi.useRealTimers();
});

test("watch.currentTab cancels a deferred sales freshness check when leaving the tab before it settles", () => {
  const context = createContext();
  vi.useFakeTimers();
  context.currentTab = "sales";

  appWatch.currentTab.call(context as never, "sales");
  context.currentTab = "config";
  appWatch.currentTab.call(context as never, "config");
  vi.advanceTimersByTime(500);

  assert.equal(refreshPersonalLotSalesIfStaleMock.mock.calls.length, 0);
  assert.equal((context.initSalesChart as ReturnType<typeof vi.fn>).mock.calls.length, 0);
  vi.useRealTimers();
});

test("watch.currentLotId triggers a freshness check for the newly selected lot", () => {
  const context = createContext();

  appWatch.currentLotId.call(context as never, 202);

  assert.equal(refreshWorkspaceRealtimeMock.mock.calls.length, 1);
  assert.deepEqual(refreshPersonalLotSalesIfStaleMock.mock.calls, [[context, 202]]);
});

test("watch.currentTab skips the freshness check when there is no selected lot", () => {
  const context = createContext({
    currentLotId: null
  });

  appWatch.currentTab.call(context as never, "sales");

  assert.equal(refreshPersonalLotSalesIfStaleMock.mock.calls.length, 0);
});
