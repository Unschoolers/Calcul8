import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { configIoMethods } from "../src/app-core/methods/config-io.ts";

beforeEach(() => {
  vi.restoreAllMocks();
});

test("copyPortfolioReportTable uses clipboard API when available", async () => {
  const notify = vi.fn();
  const writeText = vi.fn(async () => undefined);
  const originalNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      clipboard: { writeText }
    }
  });

  try {
    const ctx = {
      hasPortfolioData: true,
      portfolioTotals: {
        lotCount: 1,
        profitableLotCount: 1,
        totalSalesCount: 2,
        totalRevenue: 100,
        totalCost: 80,
        totalProfit: 20
      },
      allLotPerformance: [
        {
          lotId: 1,
          lotName: "Lot A",
          salesCount: 2,
          soldPacks: 5,
          totalPacks: 16,
          totalRevenue: 100,
          totalCost: 80,
          totalProfit: 20,
          marginPercent: 20,
          lastSaleDate: "2026-02-21"
        }
      ],
      formatCurrency: (value: number) => value.toFixed(2),
      formatDate: (date: string) => date,
      notify
    };

    await configIoMethods.copyPortfolioReportTable.call(ctx as never);

    assert.equal(writeText.mock.calls.length, 1);
    const tsv = String(writeText.mock.calls[0]?.[0] ?? "");
    assert.equal(tsv.includes("WhatFees Portfolio"), true);
    assert.equal(tsv.includes("Lot A"), true);
    assert.equal(notify.mock.calls.at(-1)?.[0], "Portfolio table copied. Paste into Sheets or Excel.");
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator
    });
  }
});
