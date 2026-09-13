import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";
import type { SalesPersistenceContext } from "../src/app-core/context/commerce.ts";
import type { Sale } from "../src/types/app.ts";
import { makeSale } from "./helpers/fixtures.ts";
import { getSalesStorageKey, getSalesSyncMetaKey } from "../src/app-core/storageKeys.ts";
import { getActiveStorageScope } from "../src/app-core/workspace-scope.ts";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../src/app-core/auth/index.ts", () => ({ hasAuthSignal: () => true }));
vi.mock("../src/app-core/methods/ui/common/shared.ts", () => ({
  fetchAuthenticatedApiResponse: request,
  resolveApiBaseUrl: () => "https://api.example.test"
}));

import { deleteSaleWithPersistence, saveSaleAuthoritatively } from "../src/app-core/methods/sales-persistence.ts";
import { fetchAuthoritativeAllSales, fetchAuthoritativeSales } from "../src/app-core/methods/lot-sales-api.ts";
import { hydrateAuthoritativeLotSalesWithSyncMeta, refreshPersonalLotSalesIfStale } from "../src/app-core/methods/sales-freshness.ts";
import { applyWorkspaceScope } from "../src/app-core/methods/ui/workspace/workspace-ui-helpers.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function createContext() {
  const sales = [makeSale({ id: 10 }), makeSale({ id: 11 })];
  const context: SalesPersistenceContext & { salesByLotId: Map<number, Sale[]> } = {
    activeScopeType: "workspace",
    activeWorkspaceId: "A",
    googleAuthEpoch: 0,
    hasProAccess: true,
    currentLotId: 1,
    currentTab: "sales",
    sales,
    salesByLotId: new Map([[1, sales]]),
    editingSale: null,
    getSalesStorageKey(lotId) { return getSalesStorageKey(lotId, getActiveStorageScope(this)); },
    askConfirmation: (_options, confirm) => confirm(),
    cancelSale: vi.fn(),
    notify: vi.fn(),
    initSalesChart: vi.fn(),
    initPortfolioChart: vi.fn(),
    $nextTick: async (callback) => { callback(); }
  };
  return context;
}

function startMutation(context: SalesPersistenceContext, operation: "save" | "delete") {
  if (operation === "delete") deleteSaleWithPersistence(context, 11);
  else saveSaleAuthoritatively(context, {
    lotId: 1, pendingSale: makeSale({ id: 12 }), editingSaleId: null, baseVersion: 0
  });
}

function selectOtherLot(context: ReturnType<typeof createContext>) {
  context.currentLotId = 2;
  // Reuse an id across lots: a delayed delete must not remove this sale.
  context.sales = [makeSale({ id: 11, price: 99 })];
  context.salesByLotId.set(2, context.sales);
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let storage: Map<string, string>;

async function navigate(context: ReturnType<typeof createContext>, scopeType: "personal" | "workspace", workspaceId: string | null) {
  // Exercise the real navigation boundary; storage loading is replaced by a new view below.
  const navigation = Object.assign(context, {
    lots: [], loadLotsFromStorage() {}, loadWheelFromStorage() {}, clearLiveSinglesSelection() {}
  });
  await applyWorkspaceScope(navigation as never, scopeType, workspaceId, {
    pullFromCloud: false, getGoogleIdToken: () => ""
  });
}

async function leaveAndReturn(context: ReturnType<typeof createContext>) {
  await navigate(context, "workspace", "B");
  await navigate(context, "workspace", "A");
  context.currentLotId = 1;
  context.sales = [makeSale({ id: 99 })];
  context.salesByLotId = new Map([[1, context.sales]]);
  storage.clear();
}

beforeEach(() => {
  request.mockReset();
  storage = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); }
  });
  vi.stubGlobal("window", { crypto: globalThis.crypto });
});
afterEach(() => vi.unstubAllGlobals());

for (const operation of ["save", "delete"] as const) {
  test(`delayed ${operation} updates only the originating lot and preserves the other lot's editor`, async () => {
    const context = createContext();
    const pending = deferred<Response>();
    request.mockReturnValueOnce(pending.promise);
    startMutation(context, operation);
    selectOtherLot(context);
    context.salesByLotId.get(1)!.push(makeSale({ id: 13 }));
    pending.resolve(response({ sale: makeSale({ id: 12 }) }));
    await flush();
    assert.deepEqual(context.sales.map((sale) => [sale.id, sale.price]), [[11, 99]]);
    const expected = operation === "save" ? [10, 11, 13, 12] : [10, 13];
    assert.deepEqual(context.salesByLotId.get(1)?.map((sale) => sale.id), expected);
    const key = getSalesStorageKey(1, { scopeType: "workspace", workspaceId: "A" });
    assert.deepEqual(JSON.parse(storage.get(key)!).map((sale: Sale) => sale.id), expected);
    assert.equal(vi.mocked(context.cancelSale).mock.calls.length, 0);
  });

  test(`${operation} conflict recovery stays on its original lot after navigation`, async () => {
    const context = createContext();
    const recovery = deferred<Response>();
    request.mockResolvedValueOnce(response({ error: "Conflict" }, 409));
    request.mockReturnValueOnce(recovery.promise);
    startMutation(context, operation);
    await flush();
    assert.equal(request.mock.calls.length, 2);
    selectOtherLot(context);
    recovery.resolve(response({ sales: [makeSale({ id: 15 })] }));
    await flush();
    assert.deepEqual(context.sales.map((sale) => [sale.id, sale.price]), [[11, 99]]);
    assert.deepEqual(context.salesByLotId.get(1)?.map((sale) => sale.id), [15]);
    assert.equal(vi.mocked(context.cancelSale).mock.calls.length, 0);
    assert.equal(vi.mocked(context.notify).mock.calls.length, 0);
  });

  for (const status of [200, 409]) {
    for (const change of ["workspace", "auth"] as const) {
      test(`${operation} response ${status} cannot affect a changed ${change}`, async () => {
        const context = createContext();
        const pending = deferred<Response>();
        request.mockReturnValueOnce(pending.promise);
        startMutation(context, operation);
        if (change === "workspace") context.activeWorkspaceId = "B";
        else context.googleAuthEpoch += 1;
        context.sales = [makeSale({ id: 11, price: 99 })];
        context.salesByLotId = new Map([[1, context.sales]]);
        pending.resolve(response({ sale: makeSale({ id: 12 }), error: "Conflict" }, status));
        await flush();
        assert.deepEqual(context.sales.map((sale) => [sale.id, sale.price]), [[11, 99]]);
        assert.deepEqual(context.salesByLotId.get(1)?.map((sale) => [sale.id, sale.price]), [[11, 99]]);
        assert.equal(storage.size, 0);
        assert.equal(request.mock.calls.length, 1, "must not fetch the old lot under a new scope");
        assert.equal(vi.mocked(context.cancelSale).mock.calls.length, 0);
        assert.equal(vi.mocked(context.notify).mock.calls.length, 0);
      });
    }
  }

  test(`${operation} conflict fetch cannot cache or apply results after switching workspaces`, async () => {
    const context = createContext();
    const recovery = deferred<Response>();
    request.mockResolvedValueOnce(response({ error: "Conflict" }, 409));
    request.mockReturnValueOnce(recovery.promise);
    startMutation(context, operation);
    await flush();
    assert.equal(request.mock.calls.length, 2);
    context.activeWorkspaceId = "B";
    context.sales = [makeSale({ id: 99 })];
    context.salesByLotId = new Map([[1, context.sales]]);
    recovery.resolve(response({ sales: [makeSale({ id: 15 })] }));
    await flush();
    assert.deepEqual(context.sales.map((sale) => sale.id), [99]);
    assert.deepEqual(context.salesByLotId.get(1)?.map((sale) => sale.id), [99]);
    assert.equal(storage.size, 0);
    assert.equal(vi.mocked(context.cancelSale).mock.calls.length, 0);
    assert.equal(vi.mocked(context.notify).mock.calls.length, 0);
  });
}

for (const kind of ["single", "all"] as const) {
  test(`${kind} sales fetch discards results after the authenticated session changes`, async () => {
    const context = createContext();
    const pending = deferred<Response>();
    request.mockReturnValueOnce(pending.promise);
    const fetch = kind === "single" ? fetchAuthoritativeSales(context, 1) : fetchAuthoritativeAllSales(context, [1]);
    context.googleAuthEpoch += 1;
    pending.resolve(response({ sales: [makeSale({ id: 15 })], salesByLot: { 1: [makeSale({ id: 15 })] } }));
    assert.equal(await fetch, null);
    assert.deepEqual(context.sales.map((sale) => sale.id), [10, 11]);
    assert.equal(storage.size, 0);
  });
}

test("an in-flight save does not silently drop a save on another lot", async () => {
  const context = createContext();
  const first = deferred<Response>();
  const second = deferred<Response>();
  request.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  startMutation(context, "save");
  selectOtherLot(context);
  saveSaleAuthoritatively(context, { lotId: 2, pendingSale: makeSale({ id: 22 }), editingSaleId: null, baseVersion: 0 });
  const requestsStarted = request.mock.calls.length;
  second.resolve(response({ sale: makeSale({ id: 22 }) }));
  first.resolve(response({ sale: makeSale({ id: 12 }) }));
  await flush();
  assert.equal(requestsStarted, 2);
  assert.deepEqual(context.sales.map((sale) => sale.id), [11, 22]);
  assert.deepEqual(context.salesByLotId.get(1)?.map((sale) => sale.id), [10, 11, 12]);
});

test("sales hydration cannot write freshness metadata into a newly selected workspace", async () => {
  const context = { ...createContext(), getSalesCacheEntry: () => ({ status: "loaded" as const, sales: [] as Sale[] }) };
  const sales = deferred<Response>();
  const meta = deferred<Response>();
  request.mockReturnValueOnce(sales.promise).mockReturnValueOnce(meta.promise);
  const hydration = hydrateAuthoritativeLotSalesWithSyncMeta(context, 1);
  context.activeWorkspaceId = "B";
  sales.resolve(response({ sales: [makeSale({ id: 15 })] }));
  meta.resolve(response({ salesMeta: { activeCount: 1, latestUpdatedAt: "2026-08-14T00:00:00Z" } }));
  assert.equal(await hydration, null);
  assert.equal(storage.size, 0);
});

for (const operation of ["save", "delete", "fetch"] as const) {
  test(`old ${operation} completion is discarded after leaving and returning to the same workspace`, async () => {
    const context = createContext();
    const pending = deferred<Response>();
    request.mockReturnValueOnce(pending.promise);
    const fetched = operation === "fetch" ? fetchAuthoritativeSales(context, 1) : null;
    if (operation !== "fetch") startMutation(context, operation);
    await leaveAndReturn(context);
    pending.resolve(response({ sale: makeSale({ id: 12 }), sales: [makeSale({ id: 15 })] }));
    if (fetched) assert.equal(await fetched, null);
    await flush();
    assert.deepEqual(context.sales.map((sale) => sale.id), [99]);
    assert.deepEqual(context.salesByLotId.get(1)?.map((sale) => sale.id), [99]);
    assert.equal(storage.size, 0);
    assert.equal(vi.mocked(context.cancelSale).mock.calls.length, 0);
  });
}

test("returning to a workspace can save immediately while an old visit's save is pending", async () => {
  const context = createContext();
  const pending = deferred<Response>();
  request.mockReturnValueOnce(pending.promise);
  startMutation(context, "save");
  await leaveAndReturn(context);
  request.mockResolvedValueOnce(response({ sale: makeSale({ id: 22 }) }));
  saveSaleAuthoritatively(context, { lotId: 1, pendingSale: makeSale({ id: 22 }), editingSaleId: null, baseVersion: 0 });
  const requestsStarted = request.mock.calls.length;
  pending.resolve(response({ sale: makeSale({ id: 12 }) }));
  await flush();
  assert.equal(requestsStarted, 2);
  assert.deepEqual(context.sales.map((sale) => sale.id), [99, 22]);
});

for (const change of ["auth", "visit"] as const) {
  test(`personal sales freshness starts a new check after a changed ${change}`, async () => {
    const context = { ...createContext(), getSalesCacheEntry: () => ({ status: "loaded" as const, sales: [] as Sale[] }) };
    context.activeScopeType = "personal";
    context.activeWorkspaceId = null;
    storage.set(getSalesSyncMetaKey(1), JSON.stringify({ activeCount: 2, latestUpdatedAt: null }));
    const oldResponse = deferred<Response>();
    request.mockReturnValueOnce(oldResponse.promise);
    const oldCheck = refreshPersonalLotSalesIfStale(context, 1);
    if (change === "auth") context.googleAuthEpoch += 1;
    else {
      await navigate(context, "workspace", "B");
      await navigate(context, "personal", null);
    }
    request.mockResolvedValueOnce(response({ salesMeta: { activeCount: 2, latestUpdatedAt: null } }));
    const newCheck = refreshPersonalLotSalesIfStale(context, 1);
    const requestsStarted = request.mock.calls.length;
    oldResponse.resolve(response({ salesMeta: { activeCount: 100, latestUpdatedAt: null } }));
    await Promise.all([oldCheck, newCheck]);
    assert.equal(requestsStarted, 2, "a new session/visit must not join the abandoned request");
    assert.deepEqual(JSON.parse(storage.get(getSalesSyncMetaKey(1))!), { activeCount: 2, latestUpdatedAt: null });
  });
}
