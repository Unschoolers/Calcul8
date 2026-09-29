import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import type { ApiConfig } from "../../types";

const docs = new Map<string, Record<string, any>>();
let etag = 0;
vi.mock("./core", () => ({
  getContainers: () => ({ entitlements: {
    items: { create: async (doc: Record<string, any>) => {
      const key = `${doc.userId}:${doc.id}`;
      if (docs.has(key)) throw Object.assign(new Error("conflict"), { statusCode: 409 });
      docs.set(key, { ...doc, _etag: String(++etag) });
    } },
    item: (id: string, scope: string) => ({
      read: async () => {
        const resource = docs.get(`${scope}:${id}`);
        if (!resource) throw Object.assign(new Error("missing"), { statusCode: 404 });
        return { resource: { ...resource } };
      },
      replace: async (doc: Record<string, any>, options: { accessCondition: { condition: string } }) => {
        const key = `${scope}:${id}`;
        if (docs.get(key)?._etag !== options.accessCondition.condition) throw Object.assign(new Error("stale"), { statusCode: 412 });
        docs.set(key, { ...doc, _etag: String(++etag) });
      }
    })
  } }),
  withCosmosRetry: async (fn: () => Promise<unknown>) => fn(),
  isNotFoundError: (error: any) => error.statusCode === 404,
  isConflictError: (error: any) => error.statusCode === 409,
  isPreconditionFailedError: (error: any) => error.statusCode === 412
}));
import { createShopifyLotLeaseStore } from "./shopifyLotLeaseRepository";

beforeEach(() => { docs.clear(); etag = 0; });

test("a busy lot marks the lease dirty and the owner reruns before releasing", async () => {
  const store = createShopifyLotLeaseStore({} as ApiConfig);
  const first = await store.request("ws:one", 4, 120_000);
  assert.equal(first.kind, "acquired");
  if (first.kind !== "acquired") return;
  assert.equal((await store.request("ws:one", 4, 120_000)).kind, "busy");
  const dirty = await store.finish("ws:one", 4, first.lease);
  assert.equal(dirty.kind, "dirty");
  if (dirty.kind !== "dirty") return;
  await store.renew("ws:one", 4, first.lease, 120_000);
  first.lease.revision = dirty.revision;
  assert.equal((await store.finish("ws:one", 4, first.lease)).kind, "released");
  const next = await store.request("ws:one", 4, 120_000);
  assert.equal(next.kind, "acquired");
  await assert.rejects(() => store.renew("ws:one", 4, first.lease, 120_000), /lease lost/);
});
