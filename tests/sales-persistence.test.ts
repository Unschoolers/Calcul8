import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import { reactive, toRaw } from "vue";
import type { Sale } from "../src/types/app.ts";
import type { PersistenceOutcome } from "../src/app-core/shared/persistence-outcomes.ts";
import {
  deleteSaleWithPersistence,
  persistSaleLocally,
  saveSaleAuthoritatively,
  saveSaleWithPersistence
} from "../src/app-core/methods/sales-persistence.ts";
import { makeSale } from "./helpers/fixtures.ts";
import { SalesLiveApiError } from "../src/app-core/methods/entity-api-shared.ts";

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    currentLotId: 1,
    sales: [] as Sale[],
    editingSale: null,
    askConfirmation: vi.fn((_opts, onConfirm: () => void) => onConfirm()),
    cancelSale: vi.fn(),
    notify: vi.fn(),
    ...overrides
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
});

test("persistSaleLocally appends or replaces then cancels the draft", () => {
  const appendContext = createContext({
    sales: [],
    editingSale: null
  });
  persistSaleLocally(appendContext as never, makeSale({ id: 2 }), -1);
  assert.deepEqual((appendContext.sales as Sale[]).map((sale) => sale.id), [2]);
  assert.equal((appendContext.cancelSale as ReturnType<typeof vi.fn>).mock.calls.length, 0);

  const existing = makeSale({ id: 3 });
  const editContext = createContext({
    sales: [existing],
    editingSale: existing
  });
  persistSaleLocally(editContext as never, makeSale({ id: 3, price: 20 }), 0);
  assert.equal((editContext.sales as Sale[])[0]?.price, 20);
});

test("saveSaleAuthoritatively saves, caches, cancels, and refreshes", async () => {
  const refreshCharts = vi.fn();
  const context = createContext({
    sales: [makeSale({ id: 1, price: 10 })],
    cancelSale: vi.fn()
  });

  const outcome = await saveSaleAuthoritatively(context as never, {
    lotId: 1,
    pendingSale: makeSale({ id: 2, price: 25 }),
    editingSaleId: null,
    baseVersion: 0
  }, {
    canUseAuthoritativeApi: () => true,
    saveSale: vi.fn(async () => makeSale({ id: 2, price: 25 })),
    fetchSales: vi.fn(),
    cacheSales: vi.fn(),
    refreshCharts
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual((context.sales as Sale[]).map((sale) => sale.id), [1, 2]);
  assert.equal((context.cancelSale as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal(refreshCharts.mock.calls.length, 1);
  assert.deepEqual(outcome, { kind: "confirmed", persistence: "cloud", cache: "saved", cloud: "confirmed" });
});

test("cloud-confirmed save closes only the originating editor when cache persistence fails", async () => {
  const editor = makeSale({ id: 3 });
  const context = createContext({ currentLotId: 1, editingSale: editor, sales: [editor] });
  const outcome = await saveSaleAuthoritatively(context as never, {
    lotId: 1,
    pendingSale: makeSale({ id: 3, price: 30 }),
    editingSaleId: 3,
    baseVersion: 1
  }, {
    canUseAuthoritativeApi: () => true,
    saveSale: vi.fn(async () => makeSale({ id: 3, price: 30 })),
    fetchSales: vi.fn(),
    cacheSales: () => { throw new Error("quota exceeded"); },
    refreshCharts: vi.fn()
  });

  assert.equal(outcome.kind, "failure");
  assert.equal(outcome.kind === "failure" && outcome.cloudConfirmed, true);
  assert.equal((context.cancelSale as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal((context.sales as Sale[])[0]?.price, 30);
});

test("cloud-confirmed cache failure does not cancel a newer reactive add-sale draft", async () => {
  const save = deferred<Sale>();
  const initialDraft = { type: "pack" as const, quantity: 1, price: 25, buyerShipping: 0, date: "2026-03-17" };
  const newerDraft = { ...initialDraft, price: 40 };
  const cancelSale = vi.fn();
  const context = reactive(createContext({
    currentLotId: 1,
    sales: [],
    newSale: initialDraft,
    editingSale: null,
    cancelSale
  })) as ReturnType<typeof createContext> & { newSale: typeof initialDraft };
  const result = saveSaleAuthoritatively(context as never, {
    lotId: 1,
    pendingSale: makeSale({ id: 67, price: 25 }),
    editingSaleId: null,
    baseVersion: 0
  }, {
    canUseAuthoritativeApi: () => true,
    saveSale: () => save.promise,
    fetchSales: vi.fn(),
    cacheSales: () => { throw new Error("quota exceeded"); },
    refreshCharts: vi.fn()
  });

  context.newSale = newerDraft;
  save.resolve(makeSale({ id: 67, price: 25 }));
  const outcome = await result;

  assert.equal(outcome.kind, "failure");
  assert.equal(outcome.kind === "failure" && outcome.cloudConfirmed, true);
  assert.equal(cancelSale.mock.calls.length, 0);
  assert.equal(context.newSale.price, 40);
});

test("conflict recovery retains conflict semantics when caching fetched state fails", async () => {
  const context = createContext({ editingSale: makeSale({ id: 3 }) });
  const outcome = await saveSaleAuthoritatively(context as never, {
    lotId: 1,
    pendingSale: makeSale({ id: 3, price: 30 }),
    editingSaleId: 3,
    baseVersion: 1
  }, {
    canUseAuthoritativeApi: () => true,
    saveSale: async () => { throw new SalesLiveApiError(409, "stale version"); },
    fetchSales: vi.fn(async () => [makeSale({ id: 3, price: 25 })]),
    cacheSales: () => { throw new Error("quota exceeded"); },
    refreshCharts: vi.fn()
  });

  assert.equal(outcome.kind, "conflict");
  assert.equal(outcome.kind === "conflict" && outcome.latestState, "loaded");
  assert.equal(outcome.kind === "conflict" && outcome.cacheFailure instanceof Error, true);
  assert.equal("cloudConfirmed" in outcome, false);
});

test("authoritative sale save stays pending until cloud confirmation", async () => {
  const save = deferred<Sale>();
  const context = createContext();
  const savePromise = saveSaleAuthoritatively(context as never, {
    lotId: 1,
    pendingSale: makeSale({ id: 21 }),
    editingSaleId: null,
    baseVersion: 0
  }, {
    canUseAuthoritativeApi: () => true,
    saveSale: () => save.promise,
    fetchSales: vi.fn(),
    cacheSales: vi.fn(),
    refreshCharts: vi.fn()
  });

  let completed = false;
  void savePromise.then(() => { completed = true; });
  await Promise.resolve();
  assert.equal(completed, false);
  assert.deepEqual(context.sales, []);
  save.resolve(makeSale({ id: 21 }));
  assert.deepEqual(await savePromise, { kind: "confirmed", persistence: "cloud", cache: "saved", cloud: "confirmed" });
  assert.deepEqual((context.sales as Sale[]).map((sale) => sale.id), [21]);
});

test("cache failure after cloud confirmation is reported without making the cloud save retryable", async () => {
  const saveSale = vi.fn(async () => makeSale({ id: 22 }));
  const cacheSales = vi.fn(() => { throw new Error("quota exceeded"); });
  const context = createContext();

  const outcome = await saveSaleAuthoritatively(context as never, {
    lotId: 1,
    pendingSale: makeSale({ id: 22 }),
    editingSaleId: null,
    baseVersion: 0
  }, {
    canUseAuthoritativeApi: () => true,
    saveSale,
    fetchSales: vi.fn(),
    cacheSales,
    refreshCharts: vi.fn()
  });

  assert.equal(saveSale.mock.calls.length, 1);
  assert.equal(outcome.kind, "failure");
  assert.equal(outcome.stage, "cache");
  assert.equal(outcome.cloudConfirmed, true);
  assert.equal((context.cancelSale as ReturnType<typeof vi.fn>).mock.calls.length, 1);
});

test("deleteSaleWithPersistence waits for local cache confirmation when api is unavailable", async () => {
  const refreshCharts = vi.fn();
  const localSave = deferred<{
    kind: "confirmed";
    persistence: "local";
    cache: "saved";
    cloud: "unavailable";
  }>();
  const context = createContext({
    sales: [makeSale({ id: 5 })],
    saveSalesToStorage: vi.fn(() => localSave.promise)
  });

  const result = deleteSaleWithPersistence(context as never, 5, {
    canUseAuthoritativeApi: () => false,
    deleteSale: vi.fn(),
    fetchSales: vi.fn(),
    cacheSales: vi.fn(),
    refreshCharts
  });

  assert.equal((context.sales as Sale[]).length, 0);
  assert.equal(refreshCharts.mock.calls.length, 0);
  let completed = false;
  void result.then(() => { completed = true; });
  await Promise.resolve();
  assert.equal(completed, false);
  localSave.resolve({ kind: "confirmed", persistence: "local", cache: "saved", cloud: "unavailable" });
  assert.deepEqual(await result, { kind: "confirmed", persistence: "local", cache: "saved", cloud: "unavailable" });
  assert.equal(refreshCharts.mock.calls.length, 1);
});

test("local save cache failure rolls back only its mutation so retry does not duplicate it", async () => {
  const unrelated = makeSale({ id: 18 });
  const pending = makeSale({ id: 23 });
  const context = createContext({ currentLotId: null, sales: [unrelated] });
  let writeCount = 0;
  const deps = {
    canUseAuthoritativeApi: () => false,
    persistLocally: persistSaleLocally,
    saveLocalSales: async () => {
      writeCount += 1;
      return writeCount === 1
        ? { kind: "failure", error: new Error("quota exceeded"), stage: "local" } as const
        : { kind: "confirmed", persistence: "local", cache: "saved", cloud: "unavailable" } as const;
    },
    refreshCharts: vi.fn(),
    saveAuthoritatively: vi.fn()
  };
  const request = {
    lotId: null,
    pendingSale: pending,
    editingSaleId: null,
    editingIndex: -1,
    baseVersion: 0
  };

  assert.equal((await saveSaleWithPersistence(context as never, request, deps)).kind, "failure");
  assert.deepEqual((context.sales as Sale[]).map((sale) => sale.id), [18]);
  assert.equal((await saveSaleWithPersistence(context as never, request, deps)).kind, "confirmed");
  assert.deepEqual((context.sales as Sale[]).map((sale) => sale.id), [18, 23]);
});

test.each(["add", "edit"] as const)("Vue reactive local %s rolls back and can be retried", async (mode) => {
  const original = makeSale({ id: 62, price: 10 });
  const unrelated = makeSale({ id: 63, price: 15 });
  const pending = makeSale({ id: mode === "add" ? 64 : 62, price: 25 });
  const context = reactive(createContext({
    currentLotId: null,
    sales: mode === "add" ? [unrelated] : [original, unrelated],
    editingSale: mode === "edit" ? original : null
  })) as ReturnType<typeof createContext>;
  let writes = 0;
  const deps = {
    canUseAuthoritativeApi: () => false,
    persistLocally: persistSaleLocally,
    saveLocalSales: async () => {
      writes += 1;
      return writes === 1
        ? { kind: "failure", error: new Error("quota exceeded"), stage: "local" } as const
        : { kind: "confirmed", persistence: "local", cache: "saved", cloud: "unavailable" } as const;
    },
    refreshCharts: vi.fn(),
    saveAuthoritatively: vi.fn()
  };
  const request = {
    lotId: null,
    pendingSale: pending,
    editingSaleId: mode === "edit" ? original.id : null,
    editingIndex: mode === "edit" ? 0 : -1,
    baseVersion: 0
  };

  assert.equal((await saveSaleWithPersistence(context as never, request, deps)).kind, "failure");
  assert.deepEqual(context.sales.map((sale) => sale.id), mode === "add" ? [63] : [62, 63]);
  if (mode === "edit") assert.equal(toRaw(context.sales[0]), original);

  assert.equal((await saveSaleWithPersistence(context as never, request, deps)).kind, "confirmed");
  assert.deepEqual(context.sales.map((sale) => sale.id), mode === "add" ? [63, 64] : [62, 63]);
  assert.equal(context.sales.find((sale) => sale.id === pending.id)?.price, 25);
});

test("Vue reactive rollback preserves a newer concurrent replacement with the same sale ID", async () => {
  const pending = makeSale({ id: 65, price: 25 });
  const replacement = makeSale({ id: 65, price: 40 });
  const localSave = deferred<PersistenceOutcome>();
  const context = reactive(createContext({
    currentLotId: null,
    sales: [makeSale({ id: 66 })]
  })) as ReturnType<typeof createContext>;
  const result = saveSaleWithPersistence(context as never, {
    lotId: null,
    pendingSale: pending,
    editingSaleId: null,
    editingIndex: -1,
    baseVersion: 0
  }, {
    canUseAuthoritativeApi: () => false,
    persistLocally: persistSaleLocally,
    saveLocalSales: () => localSave.promise,
    refreshCharts: vi.fn(),
    saveAuthoritatively: vi.fn()
  });

  context.sales[1] = replacement;
  localSave.resolve({ kind: "failure", error: new Error("quota exceeded"), stage: "local" });
  assert.equal((await result).kind, "failure");
  assert.deepEqual(context.sales.map((sale) => sale.id), [66, 65]);
  assert.equal(context.sales[1]?.price, 40);
});

test("local save finishing after a lot switch settles stale without touching the new lot", async () => {
  const localSave = deferred<PersistenceOutcome>();
  const otherSale = makeSale({ id: 44 });
  const context = createContext({
    currentLotId: null,
    sales: [],
    activeScopeType: "personal",
    activeWorkspaceId: null,
    googleAuthEpoch: 0
  });
  const result = saveSaleWithPersistence(context as never, {
    lotId: null,
    pendingSale: makeSale({ id: 45 }),
    editingSaleId: null,
    editingIndex: -1,
    baseVersion: 0
  }, {
    canUseAuthoritativeApi: () => false,
    persistLocally: persistSaleLocally,
    saveLocalSales: () => localSave.promise,
    refreshCharts: vi.fn(),
    saveAuthoritatively: vi.fn()
  });

  context.currentLotId = 9;
  context.sales = [otherSale];
  localSave.resolve({ kind: "confirmed", persistence: "local", cache: "saved", cloud: "unavailable" });
  assert.deepEqual(await result, { kind: "skipped", reason: "stale-scope" });
  assert.deepEqual(context.sales, [otherSale]);
});

test("local delete cache failure restores the row for retry and missing IDs are skipped", async () => {
  const sale = makeSale({ id: 5 });
  let writes = 0;
  const context = createContext({ sales: [sale], saveSalesToStorage: vi.fn(async () => {
    writes += 1;
    return writes === 1
      ? { kind: "failure", error: new Error("quota exceeded"), stage: "local" } as const
      : { kind: "confirmed", persistence: "local", cache: "saved", cloud: "unavailable" } as const;
  }) });
  const deps = {
    canUseAuthoritativeApi: () => false,
    deleteSale: vi.fn(), fetchSales: vi.fn(), cacheSales: vi.fn(), refreshCharts: vi.fn()
  };

  const failedDelete = await deleteSaleWithPersistence(context as never, 5, deps);
  assert.equal(failedDelete.kind, "failure");
  assert.deepEqual(context.sales, [sale]);
  const retriedDelete = await deleteSaleWithPersistence(context as never, 5, deps);
  assert.deepEqual(retriedDelete, { kind: "confirmed", persistence: "local", cache: "saved", cloud: "unavailable" });
  assert.deepEqual(context.sales, []);
  const missingDelete = await deleteSaleWithPersistence(context as never, 99, deps);
  assert.deepEqual(missingDelete, { kind: "skipped", reason: "not-found" });
  assert.deepEqual(context.sales, []);
});

test("local delete resolving after lot switch does not restore into or mutate the new lot", async () => {
  const sale = makeSale({ id: 5 });
  const localSave = deferred<PersistenceOutcome>();
  const context = createContext({
    sales: [sale],
    activeScopeType: "personal",
    activeWorkspaceId: null,
    googleAuthEpoch: 0,
    saveSalesToStorage: vi.fn(() => localSave.promise)
  });
  const result = deleteSaleWithPersistence(context as never, 5, {
    canUseAuthoritativeApi: () => false,
    deleteSale: vi.fn(), fetchSales: vi.fn(), cacheSales: vi.fn(), refreshCharts: vi.fn()
  });

  context.currentLotId = 9;
  context.sales = [makeSale({ id: 49 })];
  localSave.resolve({ kind: "confirmed", persistence: "local", cache: "saved", cloud: "unavailable" });
  assert.deepEqual(await result, { kind: "skipped", reason: "stale-scope" });
  assert.deepEqual((context.sales as Sale[]).map((entry) => entry.id), [49]);
});

test("deleteSaleWithPersistence resolves an explicit skipped outcome when confirmation is cancelled", async () => {
  const context = createContext({
    sales: [makeSale({ id: 5 })],
    askConfirmation: vi.fn((_options, _confirm, cancel: () => void) => cancel())
  });

  const outcome = await deleteSaleWithPersistence(context as never, 5, {
    canUseAuthoritativeApi: () => true,
    deleteSale: vi.fn(),
    fetchSales: vi.fn(),
    cacheSales: vi.fn(),
    refreshCharts: vi.fn()
  });

  assert.deepEqual(outcome, { kind: "skipped", reason: "cancelled" });
  assert.equal((context.sales as Sale[]).length, 1);
});

test("saveSaleWithPersistence waits for durable local storage before confirming", async () => {
  const localContext = createContext({
    currentLotId: null
  });
  const persistLocally = vi.fn();
  const refreshCharts = vi.fn();
  const saveAuthoritatively = vi.fn();

  const saveLocalSales = vi.fn(async () => ({ kind: "confirmed", persistence: "local", cache: "saved", cloud: "unavailable" } as const));
  const localPromise = saveSaleWithPersistence(localContext as never, {
    lotId: null,
    pendingSale: makeSale({ id: 7 }),
    editingSaleId: null,
    editingIndex: -1,
    baseVersion: 0
  }, {
    canUseAuthoritativeApi: () => true,
    persistLocally,
    saveLocalSales,
    refreshCharts,
    saveAuthoritatively
  });

  const localOutcome = await localPromise;

  assert.equal(persistLocally.mock.calls.length, 1);
  assert.equal(saveLocalSales.mock.calls.length, 1);
  assert.equal(refreshCharts.mock.calls.length, 1);
  assert.equal(localOutcome.kind, "confirmed");
  assert.equal((localContext.cancelSale as ReturnType<typeof vi.fn>).mock.calls.length, 1);
  assert.equal(saveAuthoritatively.mock.calls.length, 0);

  const authoritativeContext = createContext({
    currentLotId: 1
  });
  saveSaleWithPersistence(authoritativeContext as never, {
    lotId: 1,
    pendingSale: makeSale({ id: 8 }),
    editingSaleId: 8,
    editingIndex: 0,
    baseVersion: 3
  }, {
    canUseAuthoritativeApi: () => true,
    persistLocally: vi.fn(),
    saveLocalSales: vi.fn(async () => ({ kind: "confirmed", persistence: "local", cache: "saved", cloud: "unavailable" } as const)),
    refreshCharts: vi.fn(),
    saveAuthoritatively
  });

  assert.equal(saveAuthoritatively.mock.calls.length, 1);
});

test("failed local cache save keeps the sale draft open and reports failure", async () => {
  const context = createContext();
  const outcome = await saveSaleWithPersistence(context as never, {
    lotId: null,
    pendingSale: makeSale({ id: 23 }),
    editingSaleId: null,
    editingIndex: -1,
    baseVersion: 0
  }, {
    canUseAuthoritativeApi: () => false,
    persistLocally: vi.fn(),
    saveLocalSales: vi.fn(async () => ({ kind: "failure", error: new Error("quota exceeded"), stage: "local" } as const)),
    refreshCharts: vi.fn(),
    saveAuthoritatively: vi.fn()
  });

  assert.deepEqual(outcome, { kind: "failure", error: new Error("quota exceeded"), stage: "local" });
  assert.equal((context.cancelSale as ReturnType<typeof vi.fn>).mock.calls.length, 0);
});
