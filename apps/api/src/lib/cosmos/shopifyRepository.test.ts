import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";
import type { ApiConfig } from "../../types";

const docs = new Map<string, Record<string, unknown>>();
vi.mock("./core", () => ({
  getContainers: () => ({ entitlements: {
    items: { upsert: async (doc: Record<string, unknown>) => { docs.set(`${doc.userId}:${doc.id}`, { ...doc, _etag: "etag-1" }); return { resource: doc }; } },
    item: (id: string, partition: string) => ({
      read: async () => ({ resource: docs.get(`${partition}:${id}`) }),
      delete: async (options?: { accessCondition?: { condition: string } }) => {
        const key = `${partition}:${id}`;
        const doc = docs.get(key);
        if (options?.accessCondition?.condition && options.accessCondition.condition !== doc?._etag) throw new Error("precondition failed");
        docs.delete(key);
      }
    })
  } }),
  withCosmosRetry: async (fn: () => Promise<unknown>) => fn(),
  isNotFoundError: () => false
}));

import { createShopifyStore, getShopifyConnection, deleteShopifyConnection } from "./shopifyRepository";

beforeEach(() => docs.clear());
const config = {} as ApiConfig;

test("Shopify OAuth state can be claimed only once", async () => {
  const store = createShopifyStore(config);
  const state = { state: "nonce", shop: "mine.myshopify.com", actorUserId: "42", scopeKey: "user:42", scopeType: "user" as const, scopeId: "42", appReturnUrl: "https://app.example.com/", expiresAt: new Date(Date.now() + 60_000).toISOString() };
  await store.createState(state);
  assert.deepEqual(await store.consumeState("nonce"), state);
  assert.equal(await store.consumeState("nonce"), null);
});

test("Shopify connection is scoped and never returns its token through a status projection", async () => {
  const store = createShopifyStore(config);
  await store.putConnection({ scopeKey: "user:42", scopeType: "user", scopeId: "42", shop: "mine.myshopify.com", accessTokenCiphertext: "ciphertext", scopes: ["write_inventory"], connectedByUserId: "42", updatedAt: "2026-09-28T00:00:00Z" });
  assert.equal((await getShopifyConnection(config, "user:42"))?.shop, "mine.myshopify.com");
  assert.equal(await getShopifyConnection(config, "user:other"), null);
  await deleteShopifyConnection(config, "user:42");
  assert.equal(await getShopifyConnection(config, "user:42"), null);
});
