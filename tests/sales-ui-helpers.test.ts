import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import {
  cancelQueuedTabChartRefresh,
  firstFiniteNonNegative,
  focusSaleQuantityInput,
  formatCompactChartDate,
  queueTabChartRefreshAfterSettle,
  refreshChartsForCurrentTab,
  resolveDefaultSaleUnitPrice
} from "../src/app-core/methods/sales-ui-helpers.ts";

class MockHtmlInputElement {
  focus = vi.fn();
}

beforeEach(() => {
  vi.stubGlobal("HTMLInputElement", MockHtmlInputElement as unknown as typeof HTMLInputElement);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("firstFiniteNonNegative returns the first finite non-negative number", () => {
  assert.equal(firstFiniteNonNegative(undefined, -4, Number.NaN, 0, 5), 0);
  assert.equal(firstFiniteNonNegative(undefined, -4, Number.NaN, 7, 5), 7);
  assert.equal(firstFiniteNonNegative(undefined, -4, Number.NaN), null);
});

test("resolveDefaultSaleUnitPrice selects the right live or fallback sale price", () => {
  const context = {
    liveBoxPriceSell: 99,
    boxPriceSell: 88,
    liveSpotPrice: 15,
    spotPrice: 14,
    livePackPrice: undefined,
    packPrice: 7
  };

  assert.equal(resolveDefaultSaleUnitPrice(context as any, "box"), 99);
  assert.equal(resolveDefaultSaleUnitPrice(context as any, "rtyh"), 15);
  assert.equal(resolveDefaultSaleUnitPrice(context as any, "pack"), 7);
});

test("formatCompactChartDate returns a compact month/day label", () => {
  assert.equal(formatCompactChartDate("2026-03-09"), "Mar 9");
  assert.equal(formatCompactChartDate("not-a-date"), "not-a-date");
});

test("refreshChartsForCurrentTab schedules the right chart refresh", () => {
  const initSalesChart = vi.fn();
  const initPortfolioChart = vi.fn();
  const nextTick = vi.fn((callback: () => void) => {
    callback();
    return Promise.resolve();
  });

  refreshChartsForCurrentTab({
    currentTab: "portfolio",
    initSalesChart,
    initPortfolioChart,
    $nextTick: nextTick
  } as any);
  assert.equal(nextTick.mock.calls.length, 1);
  assert.equal(initPortfolioChart.mock.calls.length, 1);
  assert.equal(initSalesChart.mock.calls.length, 0);

  refreshChartsForCurrentTab({
    currentTab: "sales",
    initSalesChart,
    initPortfolioChart
  } as any);
  assert.equal(initSalesChart.mock.calls.length, 1);
});

test("queueTabChartRefreshAfterSettle waits for the settle window and supports cancellation", () => {
  vi.useFakeTimers();
  const initSalesChart = vi.fn();
  const initPortfolioChart = vi.fn();
  const nextTick = vi.fn((callback: () => void) => {
    callback();
    return Promise.resolve();
  });
  const context = {
    currentTab: "sales" as const,
    initSalesChart,
    initPortfolioChart,
    $nextTick: nextTick
  };

  queueTabChartRefreshAfterSettle(context as any, "sales", 250);
  assert.equal(initSalesChart.mock.calls.length, 0);

  vi.advanceTimersByTime(249);
  assert.equal(initSalesChart.mock.calls.length, 0);

  vi.advanceTimersByTime(1);
  assert.equal(nextTick.mock.calls.length, 1);
  assert.equal(initSalesChart.mock.calls.length, 1);

  queueTabChartRefreshAfterSettle(context as any, "sales", 250);
  cancelQueuedTabChartRefresh(context as any);
  vi.runAllTimers();

  assert.equal(initSalesChart.mock.calls.length, 1);
  vi.useRealTimers();
});

test("focusSaleQuantityInput supports direct and nested input refs", () => {
  const directFocus = vi.fn();
  focusSaleQuantityInput({
    $refs: {
      saleQuantityInput: {
        focus: directFocus
      }
    }
  } as any);
  assert.equal(directFocus.mock.calls.length, 1);

  const nestedInput = new MockHtmlInputElement();
  focusSaleQuantityInput({
    $refs: {
      saleQuantityInput: {
        $el: {
          querySelector: vi.fn(() => nestedInput)
        }
      }
    }
  } as any);
  assert.equal(nestedInput.focus.mock.calls.length, 1);
});
