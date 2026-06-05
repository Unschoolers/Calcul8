import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

const {
  canUseAuthoritativeSalesLiveApiMock,
  fetchAuthoritativeAllSalesMock,
  fetchAuthoritativeSalesMock,
  fetchWithRetryMock,
  handleExpiredAuthMock,
  readEntitlementCacheMock,
  resolveApiBaseUrlMock
} = vi.hoisted(() => ({
  canUseAuthoritativeSalesLiveApiMock: vi.fn(),
  fetchAuthoritativeAllSalesMock: vi.fn(),
  fetchAuthoritativeSalesMock: vi.fn(),
  fetchWithRetryMock: vi.fn(),
  handleExpiredAuthMock: vi.fn(),
  readEntitlementCacheMock: vi.fn(),
  resolveApiBaseUrlMock: vi.fn()
}));

vi.mock("../src/app-core/methods/ui/common/shared.ts", () => ({
  fetchWithRetry: fetchWithRetryMock,
  handleExpiredAuth: handleExpiredAuthMock,
  readEntitlementCache: readEntitlementCacheMock,
  resolveApiBaseUrl: resolveApiBaseUrlMock
}));

vi.mock("../src/app-core/methods/entity-api-shared.ts", () => ({
  canUseAuthoritativeSalesLiveApi: canUseAuthoritativeSalesLiveApiMock
}));

vi.mock("../src/app-core/methods/lot-sales-api.ts", () => ({
  fetchAuthoritativeAllSales: fetchAuthoritativeAllSalesMock,
  fetchAuthoritativeSales: fetchAuthoritativeSalesMock
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
    get length(): number {
      return map.size;
    },
    key(index: number): string | null {
      return Array.from(map.keys())[index] ?? null;
    },
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
    adminImportSourceWorkspaceId: "",
    isAdminImportInProgress: false,
    currentLotId: 2,
    lots: [{ id: 1 }, { id: 2 }],
    sales: [],
    salesByLotId: new Map(),
    wheelConfigs: [],
    activeWheelConfigId: null,
    salesCacheEpoch: 0,
    activeScopeType: "personal",
    activeWorkspaceId: null,
    systemPricingDefaults: {
      sellingCurrency: "CAD",
      sellingTaxPercent: 15,
      sellingShippingPerOrder: 0,
      targetProfitPercent: 15,
      spotsPerBox: 5,
      feeProfilePreset: "whatnot",
      platformFeePercent: 8,
      additionalFeePercent: 2.9,
      additionalFeeAppliesTo: "sale_plus_shipping",
      fixedFeePerOrder: 0.3
    },
    getSalesStorageKey: (lotId: number) => `whatfees_sales_${lotId}`,
    loadSalesForLotId: vi.fn(() => []),
    saveLotsToStorage: vi.fn(),
    saveWheelConfigsToStorage: vi.fn(),
    saveSystemPricingDefaultsToStorage: vi.fn(),
    loadLot: vi.fn(),
    pullCloudSync: vi.fn(async () => undefined),
    notify: vi.fn(),
    canUseAdminLotSyncTools: configIoMethods.canUseAdminLotSyncTools,
    ...overrides
  };
}

function createPortfolioReportContext(overrides: Record<string, unknown> = {}) {
  return {
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
        lotType: "Bulk",
        salesCount: 2,
        soldPacks: 5,
        totalPacks: 16,
        totalRevenue: 100,
        totalCost: 80,
        totalProfit: 20,
        marginPercent: 20,
        realizedCost: 80,
        realizedProfit: 20,
        realizedMarginPercent: 20,
        forecastProfitAverage: 24,
        lastSaleDate: "2026-02-21"
      }
    ],
    formatCurrency: (value: number) => value.toFixed(2),
    formatDate: (date: string) => date,
    notify: vi.fn(),
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
  canUseAuthoritativeSalesLiveApiMock.mockReturnValue(true);
  fetchAuthoritativeAllSalesMock.mockResolvedValue(null);
  fetchAuthoritativeSalesMock.mockResolvedValue([]);
  resolveApiBaseUrlMock.mockReturnValue("https://api.example");
  vi.stubGlobal("localStorage", createMockStorage());
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test("copyPortfolioReportTable uses clipboard API when available", async () => {
  const writeText = vi.fn(async () => undefined);
  const originalNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      clipboard: { writeText }
    }
  });

  try {
    const ctx = createPortfolioReportContext();

    await configIoMethods.copyPortfolioReportTable.call(ctx as never);

    assert.equal(writeText.mock.calls.length, 1);
    const tsv = String(writeText.mock.calls[0]?.[0] ?? "");
    assert.equal(tsv.includes("WhatFees Portfolio"), true);
    assert.equal(tsv.includes("Lot A"), true);
    assert.equal(tsv.includes("Realized Status"), true);
    assert.equal(tsv.includes("Current Lot P/L"), true);
    assert.equal(tsv.includes("Forecast Avg"), true);
    assert.equal(tsv.includes("Realized sales"), true);
    assert.equal(ctx.notify.mock.calls.at(-1)?.[0], "Portfolio table copied. Paste into Sheets or Excel.");
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator
    });
  }
});

test("savePortfolioReportTable downloads the same TSV payload", () => {
  const createObjectURL = vi.fn(() => "blob:portfolio-report");
  const revokeObjectURL = vi.fn();
  const click = vi.fn();
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalBlob = globalThis.Blob;
  const originalDocument = globalThis.document;

  vi.stubGlobal("Blob", vi.fn(function BlobMock(this: { parts: unknown[]; options: unknown }, parts: unknown[], options: unknown) {
    this.parts = parts;
    this.options = options;
  }) as unknown as typeof Blob);
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  vi.stubGlobal("document", {
    createElement(tagName: string) {
      if (tagName.toLowerCase() === "a") {
        return {
          href: "",
          download: "",
          click
        } as unknown as HTMLAnchorElement;
      }
      throw new Error(`Unexpected element creation: ${tagName}`);
    }
  });

  try {
    const ctx = createPortfolioReportContext();

    configIoMethods.savePortfolioReportTable.call(ctx as never);

    assert.equal(createObjectURL.mock.calls.length, 1);
    assert.equal(click.mock.calls.length, 1);
    assert.equal(revokeObjectURL.mock.calls.length, 1);
    const blobInstance = createObjectURL.mock.calls[0]?.[0] as { parts?: unknown[] };
    const tsv = String(blobInstance?.parts?.[0] ?? "");
    assert.equal(tsv.includes("WhatFees Portfolio"), true);
    assert.equal(tsv.includes("Lot A"), true);
    assert.equal(tsv.includes("Current Lot P/L"), true);
    assert.equal(ctx.notify.mock.calls.at(-1)?.[0], "Portfolio report saved.");
  } finally {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    if (originalBlob === undefined) {
      delete (globalThis as { Blob?: typeof Blob }).Blob;
    } else {
      vi.stubGlobal("Blob", originalBlob);
    }
    if (originalDocument === undefined) {
      delete (globalThis as { document?: Document }).document;
    } else {
      vi.stubGlobal("document", originalDocument);
    }
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

test("importLotsFromUserId imports, force-pulls sync, and rehydrates per-lot sales", async () => {
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
  assert.equal(requestInit.headers?.Authorization, undefined);
  assert.equal(requestInit.headers?.["Content-Type"], "application/json");
  assert.equal(JSON.parse(String(requestInit.body)).sourceUserId, "1234567890");
  assert.equal(ctx.pullCloudSync.mock.calls.length, 1);
  assert.deepEqual(ctx.pullCloudSync.mock.calls[0], [true]);
  assert.deepEqual(fetchAuthoritativeSalesMock.mock.calls, [
    [ctx, 1],
    [ctx, 2]
  ]);
  assert.equal(ctx.notify.mock.calls.at(-1)?.[0], "Imported cloud sync data from user 1234567890.");
  assert.equal(ctx.isAdminImportInProgress, false);
  assert.equal(localStorage.getItem("whatfees_sync_client_version"), null);
});

test("importLotsFromUserId applies the imported overwrite snapshot before any fallback pull can push stale dev data", async () => {
  fetchWithRetryMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      version: 994,
      snapshot: {
        lots: [{
          id: 1780489007286,
          name: "My hero academia",
          lotType: "bulk",
          usesSystemPricingDefaults: true
        }],
        salesByLot: {},
        wheelConfigs: [{
          id: 42,
          name: "Imported wheel",
          spinPrice: 10,
          targetMargin: 40,
          createdAt: "",
          tiers: []
        }],
        activeWheelConfigId: 42,
        systemPricingDefaults: {
          sellingCurrency: "CAD",
          sellingTaxPercent: 15,
          sellingShippingPerOrder: 0,
          targetProfitPercent: 20,
          spotsPerBox: 5,
          feeProfilePreset: "whatnot",
          platformFeePercent: 8,
          additionalFeePercent: 2.9,
          additionalFeeAppliesTo: "sale_plus_shipping",
          fixedFeePerOrder: 0.3
        },
        version: 994,
        updatedAt: "2026-06-04T19:38:48.000Z"
      }
    })
  });

  const ctx = createImportContext({
    adminImportSourceUserId: "1234567890",
    currentLotId: 1779748689543,
    lots: [{ id: 1779748689543, name: "Custom", lotType: "singles" }]
  });

  await configIoMethods.importLotsFromUserId.call(ctx as never);

  assert.deepEqual(ctx.pullCloudSync.mock.calls, [[true]]);
  assert.equal(ctx.lots.length, 1);
  assert.equal(ctx.lots[0]?.id, 1780489007286);
  assert.equal(ctx.lots[0]?.name, "My hero academia");
  assert.equal(ctx.currentLotId, 1780489007286);
  assert.equal(ctx.activeWheelConfigId, 42);
  assert.equal(ctx.systemPricingDefaults.targetProfitPercent, 20);
  assert.equal(ctx.saveLotsToStorage.mock.calls.length, 1);
  assert.equal(ctx.saveSystemPricingDefaultsToStorage.mock.calls.length, 1);
});

test("importLotsFromUserId clears stale local sales and hydrates all imported lot sales", async () => {
  const storage = createMockStorage({
    whatfees_sales_1780489007286: JSON.stringify([{ id: 9001, price: 999 }]),
    whatfees_sales_status_1780489007286: "loaded",
    whatfees_sales_sync_meta_1780489007286: JSON.stringify({
      activeCount: 1,
      latestUpdatedAt: "2026-06-04T00:00:00.000Z"
    })
  });
  vi.stubGlobal("localStorage", storage);
  fetchWithRetryMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      version: 994,
      snapshot: {
        lots: [{
          id: 1780489007286,
          name: "My hero academia",
          lotType: "bulk"
        }],
        salesByLot: {},
        wheelConfigs: [],
        activeWheelConfigId: null,
        version: 994,
        updatedAt: "2026-06-04T19:38:48.000Z"
      }
    })
  });
  fetchAuthoritativeAllSalesMock.mockResolvedValue(new Map([
    [1780489007286, [{
      id: 9100,
      type: "pack",
      quantity: 1,
      packsCount: 1,
      price: 25,
      buyerShipping: 0,
      date: "2026-06-04"
    }]]
  ]));

  const ctx = createImportContext({
    adminImportSourceUserId: "1234567890",
    currentLotId: 1780489007286,
    lots: [{ id: 1780489007286, name: "My hero academia", lotType: "bulk" }]
  });

  await configIoMethods.importLotsFromUserId.call(ctx as never);

  assert.equal(storage.getItem("whatfees_sales_1780489007286"), null);
  assert.equal(storage.getItem("whatfees_sales_status_1780489007286"), null);
  assert.equal(storage.getItem("whatfees_sales_sync_meta_1780489007286"), null);
  assert.deepEqual(fetchAuthoritativeAllSalesMock.mock.calls, [[ctx, [1780489007286]]]);
  assert.equal(fetchAuthoritativeSalesMock.mock.calls.length, 0);
  assert.deepEqual(ctx.sales, [{
    id: 9100,
    type: "pack",
    quantity: 1,
    packsCount: 1,
    price: 25,
    buyerShipping: 0,
    date: "2026-06-04"
  }]);
  assert.equal(ctx.salesCacheEpoch, 1);
});

test("importLotsFromUserId targets the active workspace scope when importing from a workspace", async () => {
  fetchWithRetryMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, version: 475 })
  });

  const ctx = createImportContext({
    activeScopeType: "workspace",
    activeWorkspaceId: "team-42",
    adminImportSourceUserId: "1234567890"
  });

  await configIoMethods.importLotsFromUserId.call(ctx as never);

  assert.equal(fetchWithRetryMock.mock.calls.length, 1);
  const requestInit = fetchWithRetryMock.mock.calls[0]?.[1] as {
    body?: string;
  };
  assert.deepEqual(JSON.parse(String(requestInit.body)), {
    sourceUserId: "1234567890",
    workspaceId: "team-42"
  });
  assert.equal(localStorage.getItem("whatfees_sync_client_version"), null);
  assert.equal(localStorage.getItem("whatfees_sync_client_version__ws__team-42"), null);
  assert.deepEqual(ctx.pullCloudSync.mock.calls[0], [true]);
});

test("importLotsFromUserId includes an explicit source workspace scope when provided", async () => {
  fetchWithRetryMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, version: 475 })
  });

  const ctx = createImportContext({
    activeScopeType: "workspace",
    activeWorkspaceId: "dev-team",
    adminImportSourceUserId: "1234567890",
    adminImportSourceWorkspaceId: "prod-team"
  });

  await configIoMethods.importLotsFromUserId.call(ctx as never);

  assert.equal(fetchWithRetryMock.mock.calls.length, 1);
  const requestInit = fetchWithRetryMock.mock.calls[0]?.[1] as {
    body?: string;
  };
  assert.deepEqual(JSON.parse(String(requestInit.body)), {
    sourceUserId: "1234567890",
    sourceWorkspaceId: "prod-team",
    workspaceId: "dev-team"
  });
  assert.equal(localStorage.getItem("whatfees_sync_client_version__ws__dev-team"), null);
});

test("importLotsFromUserId does not advance the local sync version before a fallback pull applies data", async () => {
  fetchWithRetryMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, version: 475 })
  });

  const ctx = createImportContext({
    adminImportSourceUserId: "1234567890"
  });

  await configIoMethods.importLotsFromUserId.call(ctx as never);

  assert.equal(localStorage.getItem("whatfees_sync_client_version"), null);
  assert.deepEqual(ctx.pullCloudSync.mock.calls[0], [true]);
});

test("importLotsFromUserId skips authoritative hydration when entity sales API is unavailable", async () => {
  canUseAuthoritativeSalesLiveApiMock.mockReturnValue(false);
  fetchWithRetryMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ ok: true })
  });

  const ctx = createImportContext();

  await configIoMethods.importLotsFromUserId.call(ctx as never);

  assert.equal(fetchAuthoritativeSalesMock.mock.calls.length, 0);
});
