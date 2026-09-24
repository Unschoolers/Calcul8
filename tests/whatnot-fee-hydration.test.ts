import assert from "node:assert/strict";
import { test } from "vitest";
import { hydrateMissingWhatnotScopeSales } from "../src/app-core/methods/whatnot-fee-hydration.ts";

function createContext() {
  const loaded = new Map<number, unknown[]>();
  return {
    activeScopeType: "workspace" as const,
    activeWorkspaceId: "workspace-a",
    googleAuthEpoch: 1,
    hasProAccess: true,
    isOffline: false,
    salesCacheEpoch: 0,
    lots: [{ id: 1 }, { id: 2 }],
    loaded,
    getSalesCacheEntry(id: number) {
      return { status: (loaded.has(id) ? "loaded" : "missing") as "loaded" | "missing", sales: loaded.get(id) ?? [] };
    }
  };
}

test("Whatnot scope hydration batches all missing lots once and keeps loaded-empty distinct", async () => {
  const context = createContext();
  context.loaded.set(1, []);
  const fetchAll = async (_ctx: unknown, ids: number[]) => new Map(ids.map((id) => [id, [{ id }]]));
  const cache = (ctx: typeof context, id: number, sales: unknown[]) => ctx.loaded.set(id, sales);
  const deps = { canUseApi: () => true, fetchAll, cache };

  hydrateMissingWhatnotScopeSales(context as never, deps as never);
  hydrateMissingWhatnotScopeSales(context as never, deps as never);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(context.loaded.get(1), []);
  assert.deepEqual(context.loaded.get(2), [{ id: 2 }]);
  assert.equal(context.salesCacheEpoch, 1);
});

test("late Whatnot scope hydration does not write after workspace changes", async () => {
  const context = createContext();
  let resolveFetch!: (value: Map<number, unknown[]>) => void;
  const fetchAll = () => new Promise<Map<number, unknown[]>>((resolve) => { resolveFetch = resolve; });
  const cache = (ctx: typeof context, id: number, sales: unknown[]) => ctx.loaded.set(id, sales);

  hydrateMissingWhatnotScopeSales(context as never, {
    canUseApi: () => true, fetchAll, cache
  } as never);
  context.activeWorkspaceId = "workspace-b";
  resolveFetch(new Map([[1, []], [2, []]]));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(context.loaded.size, 0);
  assert.equal(context.salesCacheEpoch, 0);
});

test.each(["null response", "rejected request"])("Whatnot scope hydration retries after a %s on a later lifecycle event", async (failureMode) => {
  const context = createContext();
  let calls = 0;
  const fetchAll = async (_ctx: unknown, ids: number[]) => {
    calls += 1;
    if (calls === 1) {
      if (failureMode === "rejected request") throw new Error("temporary outage");
      return null;
    }
    return new Map(ids.map((id) => [id, []]));
  };
  const cache = (ctx: typeof context, id: number, sales: unknown[]) => ctx.loaded.set(id, sales);
  const deps = { canUseApi: () => true, fetchAll, cache };

  hydrateMissingWhatnotScopeSales(context as never, deps as never);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 1);
  assert.equal(context.salesCacheEpoch, 0);

  hydrateMissingWhatnotScopeSales(context as never, deps as never);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 2);
  assert.equal(context.salesCacheEpoch, 1);
  assert.deepEqual(context.loaded.get(1), []);
  assert.deepEqual(context.loaded.get(2), []);
});
