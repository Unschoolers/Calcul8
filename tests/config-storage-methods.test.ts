import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import { DEFAULT_VALUES } from "../src/constants.ts";

const {
  readStorageWithLegacyMock,
  migrateLegacySalesKeyMock,
  getLegacySalesStorageKeyMock,
  getLegacyStorageKeysMock,
  getSalesCacheStatusKeyMock
} = vi.hoisted(() => ({
  readStorageWithLegacyMock: vi.fn(),
  migrateLegacySalesKeyMock: vi.fn(),
  getLegacySalesStorageKeyMock: vi.fn((lotId: number) => `legacy_sales_${lotId}`),
  getSalesCacheStatusKeyMock: vi.fn((lotId: number) => `sales_status_${lotId}`),
  getLegacyStorageKeysMock: vi.fn(() => ({
    LAST_LOT_ID: "legacy_last_lot_id",
    PRESETS: "legacy_presets",
    ENTITLEMENT_CACHE: "legacy_entitlement_cache",
    PRO_ACCESS: "legacy_pro_access",
    GOOGLE_ID_TOKEN: "legacy_google_id_token",
    GOOGLE_PROFILE_CACHE: "legacy_google_profile_cache",
    DEBUG_USER_ID: "legacy_debug_user_id",
    SYNC_CLIENT_VERSION: "legacy_sync_client_version"
  }))
}));

vi.mock("../src/app-core/storageKeys.ts", async () => {
  const actual = await vi.importActual<typeof import("../src/app-core/storageKeys.ts")>(
    "../src/app-core/storageKeys.ts"
  );
  return {
    ...actual,
    readStorageWithLegacy: readStorageWithLegacyMock,
    migrateLegacySalesKey: migrateLegacySalesKeyMock,
    getLegacySalesStorageKey: getLegacySalesStorageKeyMock,
    getSalesCacheStatusKey: getSalesCacheStatusKeyMock,
    getLegacyStorageKeys: getLegacyStorageKeysMock
  };
});

import { configStorageMethods } from "../src/app-core/methods/config-storage.ts";
import { getScopedPresetsStorageKey, STORAGE_KEYS } from "../src/app-core/storageKeys.ts";

type MockStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
};

function withMockedLocalStorage(
  run: (data: Map<string, string>, controls: { throwOnSet: boolean }) => Promise<void> | void
): Promise<void> | void {
  const original = (globalThis as { localStorage?: MockStorage }).localStorage;
  const data = new Map<string, string>();
  const controls = { throwOnSet: false };
  const storage: MockStorage = {
    getItem(key: string): string | null {
      return data.has(key) ? data.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      if (controls.throwOnSet) {
        throw new Error("setItem failed");
      }
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

  const restore = () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: original
    });
  };

  try {
    const result = run(data, controls);
    if (result && typeof (result as Promise<void>).then === "function") {
      return (result as Promise<void>).finally(restore);
    }
    restore();
    return;
  } catch (error) {
    restore();
    throw error;
  }
}

function createContext(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const context: Record<string, unknown> = {
    activeScopeType: "personal",
    activeWorkspaceId: null,
    sellingTaxPercent: 15,
    exchangeRate: 1.4,
    lastFetchTime: null,
    salesByLotId: new Map(),
    lots: [],
    notify: vi.fn(),
    getSalesStorageKey: (lotId: number) => `whatfees_sales_${lotId}`,
    ...overrides
  };
  if (typeof context.getSalesCacheEntry !== "function") {
    context.getSalesCacheEntry = function getSalesCacheEntry(this: Record<string, unknown>, lotId: number) {
      return configStorageMethods.getSalesCacheEntry.call(this as never, lotId);
    };
  }
  return context;
}

beforeEach(() => {
  vi.clearAllMocks();
  readStorageWithLegacyMock.mockReturnValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("getSalesStorageKey returns namespaced key", () => {
  const key = configStorageMethods.getSalesStorageKey.call(createContext() as never, 42);
  assert.equal(key, "whatfees_sales_42");
});

test("getSalesStorageKey includes workspace scope for shared workspaces", () => {
  const key = configStorageMethods.getSalesStorageKey.call(createContext({
    activeScopeType: "workspace",
    activeWorkspaceId: "team-42"
  }) as never, 42);
  assert.equal(key, "whatfees_sales_team-42__42");
});

test("getSalesCacheEntry distinguishes missing sales from an explicitly loaded empty list", () => {
  withMockedLocalStorage((data) => {
    const context = createContext();

    readStorageWithLegacyMock.mockReturnValueOnce(null);
    assert.deepEqual(configStorageMethods.getSalesCacheEntry.call(context as never, 1), {
      status: "missing",
      sales: []
    });

    readStorageWithLegacyMock.mockReturnValueOnce("[]");
    assert.deepEqual(configStorageMethods.getSalesCacheEntry.call(context as never, 1), {
      status: "missing",
      sales: []
    });

    data.set("sales_status_1", "loaded");
    readStorageWithLegacyMock.mockReturnValueOnce("[]");
    assert.deepEqual(configStorageMethods.getSalesCacheEntry.call(context as never, 1), {
      status: "loaded",
      sales: []
    });
  });
});

test("loadSalesForLotId migrates legacy key and normalizes loaded sales", () => {
  withMockedLocalStorage(() => {
    readStorageWithLegacyMock.mockReturnValue(JSON.stringify([
      { id: 1, type: "pack", quantity: 1, packsCount: 1, price: 9, customer: " Sam ", memo: 123, buyerShipping: "2.5", date: "2026-02-25" },
      { id: 2, type: "box", quantity: 1, packsCount: 16, price: 100, buyerShipping: "oops", date: "2026-02-25" }
    ]));

    const context = createContext();
    const sales = configStorageMethods.loadSalesForLotId.call(context as never, 99);

    assert.equal(migrateLegacySalesKeyMock.mock.calls.length, 1);
    assert.equal(migrateLegacySalesKeyMock.mock.calls[0]?.[0], 99);
    assert.deepEqual(readStorageWithLegacyMock.mock.calls[0], ["whatfees_sales_99", "legacy_sales_99"]);
    assert.equal(sales.length, 2);
    assert.equal(sales[0]?.customer, " Sam ");
    assert.equal(sales[0]?.memo, undefined);
    assert.equal(sales[0]?.buyerShipping, 2.5);
    assert.equal(sales[1]?.buyerShipping, 0);
  });
});

test("loadSalesForLotId returns empty list on invalid JSON or missing value", () => {
  withMockedLocalStorage(() => {
    const context = createContext();

    readStorageWithLegacyMock.mockReturnValue(null);
    assert.deepEqual(configStorageMethods.loadSalesForLotId.call(context as never, 1), []);

    readStorageWithLegacyMock.mockReturnValue("not-json");
    assert.deepEqual(configStorageMethods.loadSalesForLotId.call(context as never, 1), []);
  });
});

test("loadSalesForLotId prefers the in-memory sales store when available", () => {
  withMockedLocalStorage(() => {
    const context = createContext({
      salesByLotId: new Map([
        [5, [{ id: 51, type: "pack", quantity: 1, packsCount: 1, price: 9, buyerShipping: 0, date: "2026-02-25" }]]
      ])
    });

    const sales = configStorageMethods.loadSalesForLotId.call(context as never, 5);

    assert.equal(readStorageWithLegacyMock.mock.calls.length, 0);
    assert.equal(sales.length, 1);
    assert.equal(sales[0]?.id, 51);
  });
});

test("netFromGross uses the current selling tax percent", () => {
  const context = createContext({
    sellingTaxPercent: 10
  });
  const result = configStorageMethods.netFromGross.call(context as never, 100, 5, 2);
  assert.equal(typeof result, "number");
  assert.equal(result > 0, true);
  assert.equal(result < 100, true);
});

test("getExchangeRate uses fresh local cache and skips network", async () => {
  await withMockedLocalStorage(async (data) => {
    const now = 2_000_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    data.set(STORAGE_KEYS.EXCHANGE_RATE_CACHE, JSON.stringify({
      cadRate: 1.31,
      fetchedAt: now - 1000
    }));
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const context = createContext({
      exchangeRate: 1.4,
      lastFetchTime: null
    });
    await configStorageMethods.getExchangeRate.call(context as never);

    assert.equal(context.exchangeRate, 1.31);
    assert.equal(context.lastFetchTime, now - 1000);
    assert.equal(fetchSpy.mock.calls.length, 0);
  });
});

test("getExchangeRate skips fetch when in-memory rate is still fresh", async () => {
  await withMockedLocalStorage(async () => {
    const now = 2_000_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const context = createContext({
      exchangeRate: 1.29,
      lastFetchTime: now - 5_000
    });
    await configStorageMethods.getExchangeRate.call(context as never);
    assert.equal(fetchSpy.mock.calls.length, 0);
    assert.equal(context.exchangeRate, 1.29);
  });
});

test("getExchangeRate fetches and writes cache on successful response", async () => {
  await withMockedLocalStorage(async (data) => {
    const now = 2_000_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ rates: { CAD: 1.42 } })
    })));

    const context = createContext({
      exchangeRate: 1.4,
      lastFetchTime: null
    });
    await configStorageMethods.getExchangeRate.call(context as never);

    assert.equal(context.exchangeRate, 1.42);
    assert.equal(context.lastFetchTime, now);
    const cached = JSON.parse(data.get(STORAGE_KEYS.EXCHANGE_RATE_CACHE) || "{}");
    assert.equal(cached.cadRate, 1.42);
    assert.equal(cached.fetchedAt, now);
  });
});

test("getExchangeRate falls back to stale cache when refresh fails", async () => {
  await withMockedLocalStorage(async (data) => {
    const now = 2_000_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const staleCache = {
      cadRate: 1.37,
      fetchedAt: now - (8 * 24 * 60 * 60 * 1000)
    };
    data.set(STORAGE_KEYS.EXCHANGE_RATE_CACHE, JSON.stringify(staleCache));
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({})
    })));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const context = createContext();
      await configStorageMethods.getExchangeRate.call(context as never);

      assert.equal(context.exchangeRate, staleCache.cadRate);
      assert.equal(context.lastFetchTime, staleCache.fetchedAt);
      assert.equal(warnSpy.mock.calls.at(-1)?.[0], "Failed to refresh exchange rate, using cached rate:");
    } finally {
      warnSpy.mockRestore();
    }
  });
});

test("getExchangeRate falls back to default when no cache exists and fetch fails", async () => {
  await withMockedLocalStorage(async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const context = createContext({
        exchangeRate: 99
      });
      await configStorageMethods.getExchangeRate.call(context as never);
      assert.equal(context.exchangeRate, DEFAULT_VALUES.EXCHANGE_RATE);
      assert.equal(warnSpy.mock.calls.at(-1)?.[0], "Failed to fetch exchange rate, using default:");
    } finally {
      warnSpy.mockRestore();
    }
  });
});

test("loadLotsFromStorage normalizes lot type and date fields", () => {
  readStorageWithLegacyMock.mockReturnValue(JSON.stringify([
    {
      id: 1704067200000,
      name: "Singles",
      lotType: "singles",
      purchaseDate: "2026-02-23"
    },
    {
      id: 1704067200001,
      name: "Legacy Bulk",
      createdAt: "2026-02-20T10:00:00Z"
    }
  ]));
  const context = createContext({
    lots: []
  });

  configStorageMethods.loadLotsFromStorage.call(context as never);

  const lots = context.lots as Array<{
    id: number;
    lotType: string;
    purchaseDate: string;
    createdAt: string;
  }>;
  assert.equal(lots.length, 2);
  assert.equal(lots[0]?.lotType, "singles");
  assert.equal(lots[0]?.purchaseDate, "2026-02-23");
  assert.match(lots[0]?.createdAt || "", /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(lots[1]?.lotType, "bulk");
  assert.match(lots[1]?.purchaseDate || "", /^\d{4}-\d{2}-\d{2}$/);
  assert.match(lots[1]?.createdAt || "", /^\d{4}-\d{2}-\d{2}$/);
});

test("loadLotsFromStorage maps legacy taxRatePercent into purchase and selling tax fields", () => {
  readStorageWithLegacyMock.mockReturnValue(JSON.stringify([
    {
      id: 1704067200000,
      name: "Legacy Tax Lot",
      taxRatePercent: 11
    }
  ]));
  const context = createContext({
    lots: []
  });

  configStorageMethods.loadLotsFromStorage.call(context as never);

  const lot = (context.lots as Array<{
    purchaseTaxPercent?: number;
    sellingTaxPercent?: number;
  }>)[0];
  assert.equal(lot?.purchaseTaxPercent, 11);
  assert.equal(lot?.sellingTaxPercent, 11);
});

test("loadLotsFromStorage fills default lot setup values for partial legacy lots", () => {
  readStorageWithLegacyMock.mockReturnValue(JSON.stringify([
    {
      id: 1704067200000,
      name: "Legacy Partial Lot"
    }
  ]));
  const context = createContext({
    lots: []
  });

  configStorageMethods.loadLotsFromStorage.call(context as never);

  const lot = (context.lots as Array<{
    boxPriceCost?: number;
    boxesPurchased?: number;
    packsPerBox?: number;
    spotsPerBox?: number;
    costInputMode?: string;
    currency?: string;
    sellingCurrency?: string;
    exchangeRate?: number;
    purchaseShippingCost?: number;
    sellingShippingPerOrder?: number;
    includeTax?: boolean;
    spotPrice?: number;
    boxPriceSell?: number;
    packPrice?: number;
    feeProfilePreset?: string;
    platformFeePercent?: number;
    additionalFeePercent?: number;
    additionalFeeAppliesTo?: string;
    fixedFeePerOrder?: number;
  }>)[0];
  assert.equal(lot?.boxPriceCost, DEFAULT_VALUES.BOX_PRICE);
  assert.equal(lot?.boxesPurchased, DEFAULT_VALUES.BOXES_PURCHASED);
  assert.equal(lot?.packsPerBox, DEFAULT_VALUES.PACKS_PER_BOX);
  assert.equal(lot?.spotsPerBox, DEFAULT_VALUES.SPOTS_PER_BOX);
  assert.equal(lot?.costInputMode, "perBox");
  assert.equal(lot?.currency, "CAD");
  assert.equal(lot?.sellingCurrency, "CAD");
  assert.equal(lot?.exchangeRate, DEFAULT_VALUES.EXCHANGE_RATE);
  assert.equal(lot?.purchaseShippingCost, DEFAULT_VALUES.PURCHASE_SHIPPING_COST);
  assert.equal(lot?.sellingShippingPerOrder, DEFAULT_VALUES.SELLING_SHIPPING_PER_ORDER);
  assert.equal(lot?.includeTax, true);
  assert.equal(lot?.spotPrice, DEFAULT_VALUES.SPOT_PRICE);
  assert.equal(lot?.boxPriceSell, DEFAULT_VALUES.BOX_PRICE_SELL);
  assert.equal(lot?.packPrice, DEFAULT_VALUES.PACK_PRICE);
  assert.equal(lot?.feeProfilePreset, "whatnot");
  assert.equal(lot?.platformFeePercent, 8);
  assert.equal(lot?.additionalFeePercent, 2.9);
  assert.equal(lot?.additionalFeeAppliesTo, "sale_plus_shipping");
  assert.equal(lot?.fixedFeePerOrder, 0.3);
});

test("loadLotsFromStorage reads workspace-scoped presets without touching personal storage", async () => {
  await withMockedLocalStorage(async (data) => {
    data.set(
      getScopedPresetsStorageKey({
        scopeType: "workspace",
        workspaceId: "team-42"
      }),
      JSON.stringify([{ id: 7, name: "Shared", purchaseDate: "2026-02-23" }])
    );

    const context = createContext({
      activeScopeType: "workspace",
      activeWorkspaceId: "team-42",
      lots: []
    });
    configStorageMethods.loadLotsFromStorage.call(context as never);

    const lots = context.lots as Array<{ id: number; name: string }>;
    assert.equal(lots.length, 1);
    assert.equal(lots[0]?.id, 7);
    assert.equal(readStorageWithLegacyMock.mock.calls.length, 0);
  });
});

test("loadLotsFromStorage clears in-memory lots when the active scope has no saved presets", async () => {
  await withMockedLocalStorage(async () => {
    const context = createContext({
      activeScopeType: "workspace",
      activeWorkspaceId: "team-42",
      lots: [{ id: 1, name: "Personal Lot" }]
    });

    configStorageMethods.loadLotsFromStorage.call(context as never);

    assert.deepEqual(context.lots, []);
    assert.equal(readStorageWithLegacyMock.mock.calls.length, 0);
  });
});

test("loadLotsFromStorage handles parse failures by clearing lots", () => {
  readStorageWithLegacyMock.mockReturnValue("not-json");
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const context = createContext({
      lots: [{ id: 1 }]
    });
    configStorageMethods.loadLotsFromStorage.call(context as never);
    assert.deepEqual(context.lots, []);
    assert.equal(errorSpy.mock.calls.at(-1)?.[0], "Failed to load lots:");
  } finally {
    errorSpy.mockRestore();
  }
});

test("saveLotsToStorage writes JSON and notifies on storage failure", async () => {
  await withMockedLocalStorage(async (data, controls) => {
    const context = createContext({
      lots: [{ id: 1, name: "A" }],
      notify: vi.fn()
    });
    configStorageMethods.saveLotsToStorage.call(context as never);
    assert.equal(typeof data.get(STORAGE_KEYS.PRESETS), "string");

    controls.throwOnSet = true;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      configStorageMethods.saveLotsToStorage.call(context as never);
      assert.equal((context.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0], "Could not save lots. Storage may be full.");
      assert.equal((context.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1], "error");
    } finally {
      errorSpy.mockRestore();
    }
  });
});

test("saveLotsToStorage writes to workspace-scoped presets for shared workspaces", async () => {
  await withMockedLocalStorage(async (data) => {
    const context = createContext({
      activeScopeType: "workspace",
      activeWorkspaceId: "team-42",
      lots: [{ id: 9, name: "Shared Lot" }]
    });

    configStorageMethods.saveLotsToStorage.call(context as never);

    assert.equal(
      typeof data.get(getScopedPresetsStorageKey({ scopeType: "workspace", workspaceId: "team-42" })),
      "string"
    );
    assert.equal(data.has(STORAGE_KEYS.PRESETS), false);
  });
});
