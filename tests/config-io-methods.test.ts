import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { configIoMethods } from "../src/app-core/methods/config-io.ts";

type MockStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
};

class MockFileReader {
  public onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
  public onerror: (() => void) | null = null;
  public result: string | ArrayBuffer | null = null;
  readAsText = vi.fn((file: { __text?: string; __error?: boolean }) => {
    if (file.__error) {
      this.onerror?.();
      return;
    }
    this.result = file.__text ?? "";
    this.onload?.({ target: this } as unknown as ProgressEvent<FileReader>);
  });
}

function withMockedLocalStorage(run: () => void): void {
  const original = (globalThis as { localStorage?: MockStorage }).localStorage;
  const data = new Map<string, string>();

  const storage: MockStorage = {
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

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage
  });

  try {
    run();
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: original
    });
  }
}

beforeEach(() => {
  vi.restoreAllMocks();
});

test("exportLots warns when no lots exist", () => {
  const notify = vi.fn();
  const ctx = {
    lots: [],
    notify
  };

  configIoMethods.exportLots.call(ctx as never);

  assert.equal(notify.mock.calls[0]?.[0], "No lots to export");
});

test("exportLots creates downloadable bundle with linked sales", () => {
  const createObjectURL = vi.fn(() => "blob:mock-url");
  const revokeObjectURL = vi.fn();
  const click = vi.fn();
  const anchor = { href: "", download: "", click } as unknown as HTMLAnchorElement;
  const createElement = vi.fn((tag: string) => {
    if (tag === "a") return anchor;
    throw new Error(`unexpected tag: ${tag}`);
  });
  const notify = vi.fn();

  const originalDocument = (globalThis as { document?: Document }).document;
  const originalUrl = globalThis.URL;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement } as Partial<Document>
  });
  Object.defineProperty(globalThis, "URL", {
    configurable: true,
    value: {
      createObjectURL,
      revokeObjectURL
    }
  });

  try {
    const ctx = {
      lots: [{ id: 1, name: "Lot A" }],
      currentLotId: 1,
      loadSalesForLotId: vi.fn(() => [{ id: 11, type: "pack", quantity: 1, packsCount: 1, price: 5, date: "2026-02-01" }]),
      notify
    };

    configIoMethods.exportLots.call(ctx as never);

    assert.equal(createObjectURL.mock.calls.length, 1);
    assert.equal(click.mock.calls.length, 1);
    assert.equal(revokeObjectURL.mock.calls.length, 1);
    assert.equal(notify.mock.calls.at(-1)?.[0], "Lots exported");
  } finally {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: originalDocument
    });
    Object.defineProperty(globalThis, "URL", {
      configurable: true,
      value: originalUrl
    });
  }
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

test("handleFileImport imports lots and linked sales from bundle", () => {
  withMockedLocalStorage(() => {
    const notify = vi.fn();
    const saveLotsToStorage = vi.fn();
    const loadLot = vi.fn();
    const getSalesStorageKey = vi.fn((lotId: number) => `whatfees_sales_${lotId}`);
    const originalFileReader = (globalThis as { FileReader?: typeof FileReader }).FileReader;
    Object.defineProperty(globalThis, "FileReader", {
      configurable: true,
      value: MockFileReader
    });

    try {
      const ctx = {
        lots: [],
        currentLotId: null,
        saveLotsToStorage,
        loadLot,
        getSalesStorageKey,
        notify
      };

      const filePayload = {
        lastLotId: 20,
        lots: [
          {
            id: 10,
            name: "Bulk Lot",
            lotType: "bulk",
            purchaseDate: "2026-02-01",
            createdAt: "2026-02-01",
            sales: [{ id: 1, type: "pack", quantity: 1, packsCount: 1, price: 5, date: "2026-02-01" }]
          },
          {
            id: 20,
            name: "Singles Lot",
            lotType: "singles",
            purchaseDate: "2026-02-02",
            createdAt: "2026-02-02",
            sales: []
          }
        ]
      };
      const input = {
        files: [{ __text: JSON.stringify(filePayload) }],
        value: "has-file"
      } as unknown as HTMLInputElement;

      configIoMethods.handleFileImport.call(ctx as never, {
        target: input
      } as unknown as Event);

      assert.equal(Array.isArray(ctx.lots), true);
      assert.equal((ctx.lots as Array<{ id: number }>).length, 2);
      assert.equal((ctx.lots as Array<{ id: number }>)[1]?.id, 20);
      assert.equal(ctx.currentLotId, 20);
      assert.equal(saveLotsToStorage.mock.calls.length, 1);
      assert.equal(loadLot.mock.calls.length, 1);
      assert.equal(notify.mock.calls.at(-1)?.[0], "Imported 2 lot(s)");
      assert.equal(input.value, "");
      assert.equal(localStorage.getItem("whatfees_sales_10") !== null, true);
    } finally {
      Object.defineProperty(globalThis, "FileReader", {
        configurable: true,
        value: originalFileReader
      });
    }
  });
});

