import { beforeEach, expect, test, vi } from "vitest";
import type { ApiConfig } from "../../types";
import type { DetailsAttempt } from "../../features/shopify/operationTypes";

const docs = new Map<string, Record<string, unknown>>();
let revision = 0;
vi.mock("./core", () => ({
  getContainers: () => ({ entitlements: {
    items: {
      create: async (doc: Record<string, unknown>) => { const key = `${doc.userId}:${doc.id}`; if (docs.has(key)) throw { statusCode: 409 }; const resource = { ...doc, _etag: `v${++revision}` }; docs.set(key, resource); return { resource }; },
      query: (_query: unknown, { partitionKey }: { partitionKey: string }) => ({ fetchAll: async () => ({ resources: [...docs.values()].filter(item => item.userId === partitionKey) }) })
    },
    item: (id: string, partition: string) => ({
      read: async () => ({ resource: docs.get(`${partition}:${id}`) }),
      replace: async (doc: Record<string, unknown>, options: { accessCondition: { condition: string } }) => { const key = `${partition}:${id}`; if (docs.get(key)?._etag !== options.accessCondition.condition) throw { statusCode: 412 }; const resource = { ...doc, _etag: `v${++revision}` }; docs.set(key, resource); return { resource }; }
    })
  } }),
  withCosmosRetry: async (fn: () => Promise<unknown>) => fn(),
  isNotFoundError: (error: { statusCode?: number }) => error.statusCode === 404,
  isConflictError: (error: { statusCode?: number }) => error.statusCode === 409,
  isPreconditionFailedError: (error: { statusCode?: number }) => error.statusCode === 412
}));
import { createShopifyOperationStore } from "./shopifyOperationRepository";
beforeEach(() => { docs.clear(); revision = 0; });
const config = {} as ApiConfig;
const record: DetailsAttempt = { kind: "details", scopeKey: "u", lotId: 7, shop: "a.myshopify.com", operationId: "unsafe:/operation", fingerprint: "f", generation: 1, bindingVersion: "b", productId: "p", variantId: "v", inventoryItemId: "i", locationId: "l", expected: { title: "Old", price: "1.00" }, draft: { title: "New", price: "2.00" }, currency: "CAD", outcome: { title: "pending", price: "unknown" }, updatedAt: "now" };

test("durable attempts preserve exact identity and optimistic versions while separating scopes and lots", async () => {
  const store = createShopifyOperationStore(config);
  const first = await store.put(record);
  expect(first.version).toBe("v1");
  expect(await store.get("u", 7, record.operationId)).toEqual(first);
  expect(await store.get("other", 7, record.operationId)).toBeNull();
  expect(await store.get("u", 8, record.operationId)).toBeNull();
  await expect(store.put(record)).rejects.toThrow(/changed/i);
  const next = await store.put({ ...first, outcome: { title: "confirmed", price: "pending" } });
  expect(next.version).toBe("v2");
  await expect(store.put(first)).rejects.toThrow(/changed/i);
  expect((await store.list("u", 7)).map(item => item.operationId)).toEqual([record.operationId]);
  expect(await store.list("u", 8)).toEqual([]);
  expect([...docs.values()][0]?.id).toMatch(/^shopify_operation:7:[a-f0-9]{64}$/);
});

test("a mismatched stored identity is rejected rather than treated as absence", async () => {
  const store = createShopifyOperationStore(config); await store.put(record);
  const doc = [...docs.values()][0]!; doc.operationId = "different";
  await expect(store.get("u", 7, record.operationId)).rejects.toThrow(/identity/i);
});
