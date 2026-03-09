import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

const {
  fetchWithRetryMock,
  handleExpiredAuthMock,
  readEntitlementCacheMock,
  resolveApiBaseUrlMock
} = vi.hoisted(() => ({
  fetchWithRetryMock: vi.fn(),
  handleExpiredAuthMock: vi.fn(),
  readEntitlementCacheMock: vi.fn(),
  resolveApiBaseUrlMock: vi.fn()
}));

vi.mock("../src/app-core/methods/ui/shared.ts", () => ({
  fetchWithRetry: fetchWithRetryMock,
  GOOGLE_TOKEN_KEY: "whatfees_google_token",
  handleExpiredAuth: handleExpiredAuthMock,
  readEntitlementCache: readEntitlementCacheMock,
  resolveApiBaseUrl: resolveApiBaseUrlMock
}));

import { configIoMethods } from "../src/app-core/methods/config-io.ts";

type MockStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
};

function createMockStorage(seed: Record<string, string> = {}): MockStorage {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem(key: string): string | null {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      map.set(key, String(value));
    },
    removeItem(key: string): void {
      map.delete(key);
    },
    clear(): void {
      map.clear();
    }
  };
}

function createImportContext(overrides: Record<string, unknown> = {}) {
  return {
    adminImportSourceUserId: "",
    isAdminImportInProgress: false,
    pullCloudSync: vi.fn(async () => undefined),
    notify: vi.fn(),
    canUseAdminLotSyncTools: configIoMethods.canUseAdminLotSyncTools,
    ...overrides
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.stubEnv("VITE_ENABLE_ADMIN_SYNC_IMPORT", "true");
  readEntitlementCacheMock.mockReturnValue({
    userId: "107850224060485991888",
    hasProAccess: true,
    updatedAt: null,
    cachedAt: Date.now()
  });
  resolveApiBaseUrlMock.mockReturnValue("https://api.example");
  vi.stubGlobal("localStorage", createMockStorage({ whatfees_google_token: "id-token" }));
});

afterEach(() => {
  vi.unstubAllEnvs();
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

test("importLotsFromUserId blocks non-admin users", async () => {
  readEntitlementCacheMock.mockReturnValue({
    userId: "not-admin",
    hasProAccess: false,
    updatedAt: null,
    cachedAt: Date.now()
  });
  const ctx = createImportContext({
    adminImportSourceUserId: "1234567890"
  });

  await configIoMethods.importLotsFromUserId.call(ctx as never);

  assert.equal(ctx.notify.mock.calls.length, 1);
  assert.equal(ctx.notify.mock.calls[0]?.[0], "Forbidden.");
  assert.equal(fetchWithRetryMock.mock.calls.length, 0);
});

test("importLotsFromUserId blocks when admin sync import flag is disabled", async () => {
  vi.stubEnv("VITE_ENABLE_ADMIN_SYNC_IMPORT", "false");
  const ctx = createImportContext({
    adminImportSourceUserId: "1234567890"
  });

  await configIoMethods.importLotsFromUserId.call(ctx as never);

  assert.equal(ctx.notify.mock.calls.length, 1);
  assert.equal(ctx.notify.mock.calls[0]?.[0], "Forbidden.");
  assert.equal(fetchWithRetryMock.mock.calls.length, 0);
});

test("importLotsFromUserId validates source user id before calling API", async () => {
  const ctx = createImportContext({
    adminImportSourceUserId: "bad"
  });

  await configIoMethods.importLotsFromUserId.call(ctx as never);

  assert.equal(ctx.notify.mock.calls.length, 1);
  assert.equal(ctx.notify.mock.calls[0]?.[0], "Invalid source userId format.");
  assert.equal(fetchWithRetryMock.mock.calls.length, 0);
});

test("importLotsFromUserId handles expired auth from API", async () => {
  fetchWithRetryMock.mockResolvedValue({
    ok: false,
    status: 401,
    json: async () => ({ error: "Invalid token" })
  });

  const ctx = createImportContext({
    adminImportSourceUserId: "1234567890"
  });

  await configIoMethods.importLotsFromUserId.call(ctx as never);

  assert.equal(handleExpiredAuthMock.mock.calls.length, 1);
  assert.equal(ctx.pullCloudSync.mock.calls.length, 0);
  assert.equal(ctx.notify.mock.calls.at(-1)?.[0], "Your sign-in expired. Please sign in again.");
  assert.equal(ctx.isAdminImportInProgress, false);
});

test("importLotsFromUserId imports and then pulls cloud sync on success", async () => {
  fetchWithRetryMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ ok: true })
  });

  const ctx = createImportContext({
    adminImportSourceUserId: "1234567890"
  });

  await configIoMethods.importLotsFromUserId.call(ctx as never);

  assert.equal(fetchWithRetryMock.mock.calls.length, 1);
  assert.equal(fetchWithRetryMock.mock.calls[0]?.[0], "https://api.example/ops/sync/import-user");
  const requestInit = fetchWithRetryMock.mock.calls[0]?.[1] as {
    headers?: Record<string, string>;
    body?: string;
  };
  assert.equal(requestInit.headers?.Authorization, "Bearer id-token");
  assert.equal(JSON.parse(String(requestInit.body)).sourceUserId, "1234567890");
  assert.equal(ctx.pullCloudSync.mock.calls.length, 1);
  assert.equal(ctx.notify.mock.calls.at(-1)?.[0], "Imported cloud sync data from user 1234567890.");
  assert.equal(ctx.isAdminImportInProgress, false);
});
