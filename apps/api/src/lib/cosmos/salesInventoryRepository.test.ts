import assert from "node:assert/strict";
import { test } from "vitest";
import type { ApiConfig } from "../../types";
import { deleteInventorySale, upsertInventorySale } from "./salesInventoryRepository";
import { EntityVersionConflictError, deleteSaleDocument, upsertSaleDocument } from "./salesRepository";

function createConfig(): ApiConfig {
  return {
    apiEnv: "dev", authBypassDev: true, migrationsAdminKey: "", googleClientId: "",
    googlePlayPackageName: "io.whatfees", googlePlayProProductIds: ["pro_access"],
    googlePlayServiceAccountEmail: "", googlePlayServiceAccountPrivateKey: "", allowedOrigins: [],
    cosmosEndpoint: "https://example.documents.azure.com:443/", cosmosKey: "key",
    cosmosDatabaseId: "whatfees", migrationCosmosDatabaseId: "whatfees",
    entitlementsContainerId: "entitlements", syncContainerId: "sync_data", migrationRunsContainerId: "migration_runs"
  };
}

function createStatefulCosmos(initial: Record<string, unknown>[]) {
  const docs = new Map(initial.map((doc) => [`${doc.userId}:${doc.id}`, structuredClone(doc)]));
  let batchCommits = 0;
  let beforeNextBatch: (() => Promise<void>) | null = null;
  let failAfterNextCommittedBatch = false;
  let readHook: ((id: string) => void) | null = null;
  let returnMalformedNextBatch = false;
  const batches: Array<Array<Record<string, unknown>>> = [];
  const events: string[] = [];
  const read = async (id: string, partitionKey: string) => {
    events.push(`read:${id}`);
    readHook?.(id);
    const resource = docs.get(`${partitionKey}:${id}`);
    if (!resource) throw { statusCode: 404 };
    return { resource: structuredClone(resource) };
  };
  const container = {
    item: (id: string, partitionKey: string) => ({
      read: () => read(id, partitionKey),
      replace: async (body: Record<string, unknown>, options?: { accessCondition?: { condition?: string } }) => {
        const key = `${partitionKey}:${id}`;
        const current = docs.get(key);
        if (!current || (options?.accessCondition?.condition && current._etag !== options.accessCondition.condition)) throw { statusCode: 412 };
        const next = { ...structuredClone(body), _etag: `etag-${Math.random()}` };
        docs.set(key, next);
        return { resource: structuredClone(next) };
      }
    }),
    items: {
      create: async (body: Record<string, unknown>) => {
        events.push(`create:${body.id}`);
        const key = `${body.userId}:${body.id}`;
        if (docs.has(key)) throw { statusCode: 409 };
        const next = { ...structuredClone(body), _etag: `etag-${Math.random()}` };
        docs.set(key, next);
        return { resource: structuredClone(next) };
      },
      query: (_spec: unknown, options?: { partitionKey?: string }) => ({
        fetchAll: async () => {
          events.push("query");
          const docType = (_spec as { parameters?: Array<{ name: string; value: unknown }> }).parameters?.find((entry) => entry.name === "@docType")?.value;
          const generation = ( _spec as { parameters?: Array<{ name: string; value: unknown }> }).parameters?.find((entry) => entry.name === "@presetSetId")?.value;
          const query = (_spec as { query?: string }).query ?? "";
          return { resources: [...docs.values()].filter((doc) =>
            (!options?.partitionKey || doc.userId === options.partitionKey)
            && (!query.includes("c.docType = @docType") || doc.docType === docType)
            && (!query.includes("c.presetSetId = @presetSetId") || doc.presetSetId === generation)
            && (!query.includes("NOT IS_DEFINED(c.presetSetId)") || !doc.presetSetId)
          ) };
        }
      }),
      batch: async (operations: Array<Record<string, unknown>>, partitionKey: string) => {
        batches.push(operations.map((operation) => structuredClone(operation)));
        if (beforeNextBatch) {
          const hook = beforeNextBatch;
          beforeNextBatch = null;
          await hook();
        }
        const staged = new Map(docs);
        const result: Array<{ statusCode: number }> = [];
        for (const operation of operations) {
          const body = operation.resourceBody as Record<string, unknown>;
          const id = String(operation.id ?? body.id ?? "");
          const key = `${partitionKey}:${id}`;
          const current = staged.get(key);
          if (operation.operationType === "Create") {
            if (current) throw { statusCode: 409 };
            staged.set(key, { ...structuredClone(body), _etag: `etag-${Math.random()}` });
          } else if (operation.operationType === "Replace") {
            if (!current || (operation.ifMatch && current._etag !== operation.ifMatch)) throw { statusCode: 412 };
            staged.set(key, { ...structuredClone(body), _etag: `etag-${Math.random()}` });
          }
          result.push({ statusCode: 200 });
        }
        if (returnMalformedNextBatch) {
          returnMalformedNextBatch = false;
          return { statusCode: 200, result: [] };
        }
        docs.clear();
        for (const [key, value] of staged) docs.set(key, value);
        batchCommits += 1;
        if (failAfterNextCommittedBatch) {
          failAfterNextCommittedBatch = false;
          throw new Error("connection lost after commit");
        }
        return { statusCode: 200, result };
      }
    }
  };
  return {
    container, docs, events,
    batches,
    get batchCommits() { return batchCommits; },
    beforeNextBatch(hook: () => Promise<void>) { beforeNextBatch = hook; },
    failAfterNextCommit() { failAfterNextCommittedBatch = true; },
    onRead(hook: (id: string) => void) { readHook = hook; },
    malformedNextBatch() { returnMalformedNextBatch = true; }
  };
}

function singlesState({ capacity = 1, salesMode = "entity", embeddedSales = [], entitySales = [] as Record<string, unknown>[] } = {}) {
  return createStatefulCosmos([
    { id: "sync:meta:user-1", docType: "sync_meta", userId: "user-1", version: 3, updatedAt: "2026-01-01T00:00:00Z", salesMode, presetSetId: "v3", wheelConfigs: [], _etag: "meta-3" },
    { id: "sync:preset:user-1:7", docType: "sync_preset", userId: "user-1", presetId: "7", presetSetId: "v3", preset: { id: 7, lotType: "singles", singlesPurchases: [{ id: 41, quantity: capacity }] }, sales: embeddedSales, version: 3, updatedAt: "2026-01-01T00:00:00Z" },
    ...entitySales.map((sale) => ({ id: `sale:user-1:7:${sale.saleId}`, docType: "sale", userId: "user-1", scopeKey: "user-1", lotId: "7", version: 1, updatedAt: "2026-01-01T00:00:00Z", updatedBy: "user-1", mutationId: "prior", deletedAt: null, ...sale }))
  ]);
}

function bulkState(boxesPurchased = 1) {
  return createStatefulCosmos([
    { id: "sync:meta:user-1", docType: "sync_meta", userId: "user-1", version: 1, updatedAt: "2026-01-01T00:00:00Z", salesMode: "entity", presetSetId: "v1", wheelConfigs: [], _etag: "meta-1" },
    { id: "sync:preset:user-1:7", docType: "sync_preset", userId: "user-1", presetId: "7", presetSetId: "v1", preset: { id: 7, lotType: "bulk", boxesPurchased, packsPerBox: 16 }, sales: [], version: 1, updatedAt: "2026-01-01T00:00:00Z" }
  ]);
}

function installState(state: ReturnType<typeof singlesState>) {
  return import("./core").then(async (core) => {
    const vi = (await import("vitest")).vi;
    const spy = vi.spyOn(core, "getContainers").mockReturnValue({ syncSnapshots: state.container } as never);
    return spy;
  });
}

test("only one concurrent sale can consume the last singles unit", async () => {
  const state = createStatefulCosmos([
    { id: "sync:meta:user-1", docType: "sync_meta", userId: "user-1", version: 3, updatedAt: "2026-01-01T00:00:00Z", salesMode: "entity", presetSetId: "v3", wheelConfigs: [], _etag: "meta-3" },
    { id: "sync:preset:user-1:7", docType: "sync_preset", userId: "user-1", presetId: "7", presetSetId: "v3", preset: { id: 7, lotType: "singles", singlesPurchases: [{ id: 41, quantity: 1 }] }, sales: [], version: 3, updatedAt: "2026-01-01T00:00:00Z" },
    { id: "sale:user-1:7:old", docType: "sale", userId: "user-1", scopeKey: "user-1", lotId: "7", saleId: "old", sale: { id: "old", type: "wheel", quantity: 1, packsCount: 0 }, version: 1, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", updatedBy: "user-1", mutationId: "old", deletedAt: null, _etag: "sale-1" }
  ]);
  const getContainers = await import("./core");
  const spy = (await import("vitest")).vi.spyOn(getContainers, "getContainers").mockReturnValue({ syncSnapshots: state.container } as never);
  try {
    const outcomes = await Promise.allSettled(["a", "b"].map((id) => upsertInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: id,
      sale: { id, type: "pack", quantity: 1, packsCount: 1, singlesItems: [{ singlesPurchaseEntryId: 41, quantity: 1, price: 1 }] },
      updatedBy: "user-1", mutationId: `m-${id}`, baseVersion: 0
    })));
    assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1, JSON.stringify(outcomes.map((outcome) => outcome.status === "rejected" ? String(outcome.reason) : "fulfilled")));
    assert.equal(outcomes.filter((outcome) => outcome.status === "rejected").length, 1);
    assert.equal(state.batchCommits, 1);
    const committed = [...state.docs.values()].filter((doc) => doc.docType === "sale" && doc.saleId !== "old" && !doc.deletedAt);
    assert.equal(committed.length, 1);
    const guardRead = state.events.indexOf("read:sales_inventory_guard:user-1:7");
    const guardCreate = state.events.indexOf("create:sales_inventory_guard:user-1:7");
    const firstQuery = state.events.indexOf("query");
    assert.ok(guardRead >= 0 && guardCreate > guardRead && firstQuery > guardCreate);
  } finally {
    spy.mockRestore();
  }
});

test("snapshot sales are overlaid by entities and entity mode ignores embedded sales", async () => {
  const embedded = [
    { id: 50, type: "pack", quantity: 1, packsCount: 1, singlesItems: [{ singlesPurchaseEntryId: 41, quantity: 1 }] },
    { id: 51, type: "pack", quantity: 1, packsCount: 1, singlesItems: [{ singlesPurchaseEntryId: 41, quantity: 1 }] }
  ];
  const entitySales = [
    { saleId: "50", sale: { id: "50", type: "wheel", quantity: 1, packsCount: 0 } },
    { saleId: "51", sale: { id: "51", type: "pack", quantity: 1, packsCount: 1 }, deletedAt: "2026-01-02T00:00:00.000Z" }
  ];
  const snapshotState = singlesState({ salesMode: "snapshot", embeddedSales: embedded, entitySales });
  const snapshotSpy = await installState(snapshotState);
  try {
    await upsertInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "new-snapshot", sale: { id: "new-snapshot", type: "pack", quantity: 1, packsCount: 1, singlesItems: [{ singlesPurchaseEntryId: 41, quantity: 1 }] },
      updatedBy: "user-1", mutationId: "m-snapshot", baseVersion: 0
    });
  } finally { snapshotSpy.mockRestore(); }

  const entityState = singlesState({ salesMode: "entity", embeddedSales: embedded });
  const entitySpy = await installState(entityState);
  try {
    await upsertInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "new-entity", sale: { id: "new-entity", type: "pack", quantity: 1, packsCount: 1, singlesItems: [{ singlesPurchaseEntryId: 41, quantity: 1 }] },
      updatedBy: "user-1", mutationId: "m-entity", baseVersion: 0
    });
    assert.equal(entityState.batchCommits, 1);
  } finally { entitySpy.mockRestore(); }
});

test("an entity tombstone suppresses its legacy snapshot sale during inventory validation", async () => {
  const state = singlesState({
    salesMode: "snapshot",
    embeddedSales: [{ id: 50, type: "pack", quantity: 1, packsCount: 1, singlesItems: [{ singlesPurchaseEntryId: 41, quantity: 1 }] }],
    entitySales: [{ saleId: "50", sale: { id: "50", type: "pack", quantity: 1, packsCount: 1 }, deletedAt: "2026-01-02T00:00:00.000Z" }]
  });
  const spy = await installState(state);
  try {
    await upsertInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "replacement", sale: { id: "replacement", type: "pack", quantity: 1, packsCount: 1, singlesItems: [{ singlesPurchaseEntryId: 41, quantity: 1 }] },
      updatedBy: "user-1", mutationId: "m-replacement", baseVersion: 0
    });
    assert.equal(state.batchCommits, 1);
  } finally { spy.mockRestore(); }
});

test("a snapshot-only delete writes a guarded tombstone while missing or deleted sales remain absent", async () => {
  const state = singlesState({ salesMode: "snapshot", embeddedSales: [{ id: 41, type: "wheel", quantity: 1, packsCount: 0, version: 2 }] });
  const spy = await installState(state);
  try {
    const deleted = await deleteInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "41", updatedBy: "user-1", mutationId: "m-delete", baseVersion: 2
    });
    assert.equal(deleted?.version, 3);
    assert.ok(deleted?.deletedAt);
    assert.equal(state.batchCommits, 1);
    assert.equal(await deleteInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "absent", updatedBy: "user-1", mutationId: "m-missing"
    }), null);
    assert.equal(state.batchCommits, 1);
  } finally { spy.mockRestore(); }
});

test("a sync metadata race triggers a full reread and rejects against changed purchase capacity", async () => {
  const state = singlesState({ capacity: 2 });
  state.beforeNextBatch(async () => {
    const meta = state.docs.get("user-1:sync:meta:user-1")!;
    state.docs.set("user-1:sync:meta:user-1", { ...meta, version: 4, _etag: "meta-4" });
    const preset = state.docs.get("user-1:sync:preset:user-1:7")!;
    state.docs.set("user-1:sync:preset:user-1:7", {
      ...preset,
      preset: { id: 7, lotType: "singles", singlesPurchases: [{ id: 41, quantity: 0 }] }
    });
  });
  const spy = await installState(state);
  try {
    await assert.rejects(() => upsertInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "new", sale: { id: "new", type: "pack", quantity: 1, packsCount: 1, singlesItems: [{ singlesPurchaseEntryId: 41, quantity: 1 }] },
      updatedBy: "user-1", mutationId: "m-race", baseVersion: 0
    }), /Sale exceeds available singles inventory/);
    assert.equal(state.batchCommits, 0);
  } finally { spy.mockRestore(); }
});

test("unlinked singles count toward aggregate stock, but forged linked references are rejected", async () => {
  const state = singlesState({ capacity: 2 });
  const spy = await installState(state);
  try {
    await upsertInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "unlinked", sale: { id: "unlinked", type: "pack", quantity: 1, packsCount: 1 },
      updatedBy: "user-1", mutationId: "m-unlinked", baseVersion: 0
    });
    await assert.rejects(() => upsertInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "duplicate-lines", sale: {
        id: "duplicate-lines", type: "pack", quantity: 2, packsCount: 2,
        singlesItems: [
          { singlesPurchaseEntryId: 41, quantity: 1, price: 1 },
          { singlesPurchaseEntryId: 41, quantity: 1, price: 1 }
        ]
      }, updatedBy: "user-1", mutationId: "m-duplicate-lines", baseVersion: 0
    }), /Sale exceeds available singles inventory/);
    await assert.rejects(() => upsertInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "forged", sale: { id: "forged", type: "pack", quantity: 1, packsCount: 1, singlesPurchaseEntryId: 999 },
      updatedBy: "user-1", mutationId: "m-forged", baseVersion: 0
    }), /purchase that does not exist/);
    await assert.rejects(() => upsertInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "forged-top-with-lines", sale: {
        id: "forged-top-with-lines", type: "pack", quantity: 1, packsCount: 1, singlesPurchaseEntryId: 999,
        singlesItems: [{ singlesPurchaseEntryId: 41, quantity: 1, price: 1 }]
      }, updatedBy: "user-1", mutationId: "m-forged-top-with-lines", baseVersion: 0
    }), /purchase that does not exist/);
    assert.equal(state.batchCommits, 1);
  } finally { spy.mockRestore(); }
});

test("a wheel win with singles or pack consumption counts as inventory and unknown sale types fail closed", async () => {
  const state = singlesState({ entitySales: [
    { saleId: "wheel-win", version: 1, sale: { id: "wheel-win", type: "wheel", quantity: 1, packsCount: 1, singlesPurchaseEntryId: 41 } }
  ] });
  const spy = await installState(state);
  try {
    await assert.rejects(() => upsertInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "another", sale: { id: "another", type: "pack", quantity: 1, packsCount: 1, singlesItems: [{ singlesPurchaseEntryId: 41, quantity: 1 }] },
      updatedBy: "user-1", mutationId: "m-another", baseVersion: 0
    }), /Sale exceeds available singles inventory/);
    await assert.rejects(() => upsertInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "unknown", sale: { id: "unknown", type: "mystery", quantity: 1, packsCount: 1 },
      updatedBy: "user-1", mutationId: "m-unknown", baseVersion: 0
    }), /invalid inventory consumption/);
    assert.equal(state.batchCommits, 0);
  } finally { spy.mockRestore(); }
});

test("trusted Shopify and Whatnot projections bypass stock rejection but still transact through the guard", async () => {
  const state = singlesState({ capacity: 0 });
  const spy = await installState(state);
  try {
    await upsertInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "external", sale: { id: "external", type: "pack", quantity: 1, packsCount: 1, externalProvider: "shopify" },
      updatedBy: "shopify:webhook", mutationId: "m-external", baseVersion: 0, trustedExternal: true
    });
    await assert.rejects(() => upsertInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "normal", sale: { id: "normal", type: "pack", quantity: 1, packsCount: 1 },
      updatedBy: "user-1", mutationId: "m-normal", baseVersion: 0
    }), /Sale exceeds available singles inventory/);
    assert.equal(state.batchCommits, 1);
    const deleted = await deleteInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "external", updatedBy: "shopify:webhook", mutationId: "m-external-delete", baseVersion: 1, trustedExternal: true
    });
    assert.ok(deleted?.deletedAt);
    assert.equal(state.batchCommits, 2);
    await assert.rejects(() => upsertInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "forged-external", sale: { id: "forged-external", type: "wheel", quantity: 1, packsCount: 0, externalProvider: "other" },
      updatedBy: "user-1", mutationId: "m-bypass", baseVersion: 0, trustedExternal: true
    }), /reserved for server-created/);
  } finally { spy.mockRestore(); }
});

test("bulk sales use safe integer pack accounting and retain zero consumption wheel spots", async () => {
  const state = bulkState(1);
  const spy = await installState(state);
  try {
    await upsertInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "spot", sale: { id: "spot", type: "wheel", quantity: 1, packsCount: 0 },
      updatedBy: "user-1", mutationId: "m-spot", baseVersion: 0
    });
    await assert.rejects(() => upsertInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "zero-pack", sale: { id: "zero-pack", type: "rtyh", quantity: 1, packsCount: 0 },
      updatedBy: "user-1", mutationId: "m-zero", baseVersion: 0
    }), /at least one pack/);
    await assert.rejects(() => upsertInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "fraction", sale: { id: "fraction", type: "pack", quantity: 1, packsCount: 1.5 },
      updatedBy: "user-1", mutationId: "m-fraction", baseVersion: 0
    }), /invalid inventory consumption/);
    await upsertInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "box", sale: { id: "box", type: "box", quantity: 1, packsCount: 0 },
      updatedBy: "user-1", mutationId: "m-box", baseVersion: 0
    });
    await assert.rejects(() => upsertInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "last-pack", sale: { id: "last-pack", type: "pack", quantity: 1, packsCount: 1 },
      updatedBy: "user-1", mutationId: "m-pack", baseVersion: 0
    }), /available lot inventory/);
    assert.equal(state.batchCommits, 2);
  } finally { spy.mockRestore(); }
});

test("malformed resolved batch status fails closed without applying a sale", async () => {
  const state = singlesState({ capacity: 2 });
  state.malformedNextBatch();
  const spy = await installState(state);
  try {
    await assert.rejects(() => upsertInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "new", sale: { id: "new", type: "wheel", quantity: 1, packsCount: 0 },
      updatedBy: "user-1", mutationId: "m-malformed", baseVersion: 0
    }), /incomplete operation result/);
    assert.equal(state.batchCommits, 0);
    assert.equal(state.docs.has("user-1:sale:user-1:7:new"), false);
  } finally { spy.mockRestore(); }
});

test("public upsert keeps identifier normalization and monotonic versions on an atomic batch", async () => {
  const state = singlesState({ capacity: 2 });
  const spy = await installState(state);
  try {
    const result = await upsertSaleDocument(createConfig(), {
      scopeKey: " user-1 ", lotId: " 7 ", saleId: " new-sale ", sale: { id: 1, type: "wheel", quantity: 1, packsCount: 0 },
      updatedBy: " actor-1 ", mutationId: " mutation-1 ", baseVersion: 0
    });
    assert.equal(result.id, "sale:user-1:7:new-sale");
    assert.equal(result.scopeKey, "user-1");
    assert.equal(result.updatedBy, "actor-1");
    assert.equal(result.version, 1);
    assert.equal(state.batchCommits, 1);
    assert.deepEqual(state.batches[0]?.map((operation) => operation.operationType), ["Replace", "Create", "Create", "Replace"]);
  } finally { spy.mockRestore(); }
});

test("public upsert rejects stale base versions before writing", async () => {
  const state = singlesState({ capacity: 3, entitySales: [
    { saleId: "existing", version: 3, sale: { id: "existing", type: "wheel", quantity: 1, packsCount: 0 } }
  ] });
  const spy = await installState(state);
  try {
    await assert.rejects(() => upsertSaleDocument(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "existing", sale: { id: "existing", type: "wheel", quantity: 1, packsCount: 0 },
      updatedBy: "user-1", mutationId: "m-stale", baseVersion: 2
    }), (error: unknown) => error instanceof EntityVersionConflictError);
    assert.equal(state.batchCommits, 0);
  } finally { spy.mockRestore(); }
});

test("public upsert replaces an existing sale under its ETag", async () => {
  const state = singlesState({ capacity: 3, entitySales: [
    { saleId: "existing", version: 3, sale: { id: "existing", type: "wheel", quantity: 1, packsCount: 0 }, _etag: "sale-etag-3" }
  ] });
  const spy = await installState(state);
  try {
    const result = await upsertSaleDocument(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "existing", sale: { id: "existing", type: "wheel", quantity: 1, packsCount: 0, memo: "updated" },
      updatedBy: "user-2", mutationId: "m-update", baseVersion: 3
    });
    assert.equal(result.version, 4);
    assert.equal(state.batches[0]?.[1]?.ifMatch, "sale-etag-3");
    assert.equal(state.batchCommits, 1);
  } finally { spy.mockRestore(); }
});

test("public delete returns null for missing or deleted sales and atomically tombstones active sales", async () => {
  const missingState = singlesState();
  const missingSpy = await installState(missingState);
  try {
    assert.equal(await deleteSaleDocument(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "missing", updatedBy: "user-1", mutationId: "m-missing"
    }), null);
    assert.equal(missingState.batchCommits, 0);
  } finally { missingSpy.mockRestore(); }

  const deletedState = singlesState({ entitySales: [
    { saleId: "already-deleted", version: 2, sale: { id: "already-deleted", type: "wheel", quantity: 1, packsCount: 0 }, deletedAt: "2026-01-02T00:00:00.000Z" }
  ] });
  const deletedSpy = await installState(deletedState);
  try {
    await assert.rejects(() => deleteSaleDocument(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "already-deleted", updatedBy: "user-1", mutationId: "m-deleted"
    }), (error: unknown) => error instanceof EntityVersionConflictError);
    assert.equal(await deleteSaleDocument(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "already-deleted", updatedBy: "user-1", mutationId: "m-current-delete", baseVersion: 2
    }), null);
    await assert.rejects(() => deleteSaleDocument(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "already-deleted", updatedBy: "user-1", mutationId: "m-stale-delete", baseVersion: 1
    }), (error: unknown) => error instanceof EntityVersionConflictError);
    assert.equal(deletedState.batchCommits, 0);
  } finally { deletedSpy.mockRestore(); }

  const activeState = singlesState({ entitySales: [
    { saleId: "active", version: 2, sale: { id: "active", type: "wheel", quantity: 1, packsCount: 0 }, _etag: "sale-etag-2" }
  ] });
  const activeSpy = await installState(activeState);
  try {
    const result = await deleteSaleDocument(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "active", updatedBy: "user-2", mutationId: "m-delete", baseVersion: 2
    });
    assert.equal(result?.version, 3);
    assert.ok(result?.deletedAt);
    assert.equal(activeState.batches[0]?.[1]?.ifMatch, "sale-etag-2");
    assert.equal(activeState.batchCommits, 1);
    await assert.rejects(() => deleteSaleDocument(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "active", updatedBy: "user-1", mutationId: "delete-without-version"
    }), (error: unknown) => error instanceof EntityVersionConflictError);
    assert.equal(activeState.batchCommits, 1);
  } finally { activeSpy.mockRestore(); }
});

test("an upsert retry after a committed but lost response returns the original document without another write", async () => {
  const state = singlesState({ capacity: 2 });
  state.failAfterNextCommit();
  const spy = await installState(state);
  const request = {
    scopeKey: "user-1", lotId: "7", saleId: "retry", sale: { id: "retry", type: "wheel", quantity: 1, packsCount: 0, memo: "first" },
    updatedBy: "user-1", mutationId: "retry-upsert", baseVersion: 0
  };
  try {
    await assert.rejects(() => upsertInventorySale(createConfig(), request), /connection lost after commit/);
    const meta = state.docs.get("user-1:sync:meta:user-1") as Record<string, unknown>;
    state.docs.set("user-1:sync:meta:user-1", { ...meta, version: 4, presetSetId: "active-empty", _etag: "meta-4" });
    const replay = await upsertInventorySale(createConfig(), request);
    assert.equal(replay.version, 1);
    assert.equal(replay.mutationId, "retry-upsert");
    assert.ok(replay.mutationFingerprint);
    assert.equal(state.batchCommits, 1);
  } finally { spy.mockRestore(); }
});

test("concurrent identical upserts commit once and both return the same version", async () => {
  const state = singlesState({ capacity: 2 });
  const spy = await installState(state);
  const request = {
    scopeKey: "user-1", lotId: "7", saleId: "concurrent", sale: { id: "concurrent", type: "wheel", quantity: 1, packsCount: 0 },
    updatedBy: "user-1", mutationId: "concurrent-upsert", baseVersion: 0
  };
  try {
    const results = await Promise.all([
      upsertInventorySale(createConfig(), request),
      upsertInventorySale(createConfig(), request)
    ]);
    assert.deepEqual(results.map((result) => result.version), [1, 1]);
    assert.equal(results[0]?.mutationFingerprint, results[1]?.mutationFingerprint);
    assert.equal(state.batchCommits, 1);
  } finally { spy.mockRestore(); }
});

test("a mutation ID reused for changed payload, operation, or original base version conflicts", async () => {
  const state = singlesState({ capacity: 4 });
  const spy = await installState(state);
  const request = {
    scopeKey: "user-1", lotId: "7", saleId: "identity", sale: { id: "identity", type: "wheel", quantity: 1, packsCount: 0 },
    updatedBy: "user-1", mutationId: "same-id", baseVersion: 0
  };
  try {
    await upsertInventorySale(createConfig(), request);
    await assert.rejects(() => upsertInventorySale(createConfig(), {
      ...request, sale: { ...request.sale, memo: "changed" }
    }), (error: unknown) => error instanceof EntityVersionConflictError);
    await assert.rejects(() => upsertInventorySale(createConfig(), {
      ...request, baseVersion: 1
    }), (error: unknown) => error instanceof EntityVersionConflictError);
    await assert.rejects(() => deleteInventorySale(createConfig(), {
      scopeKey: request.scopeKey, lotId: request.lotId, saleId: request.saleId,
      updatedBy: request.updatedBy, mutationId: request.mutationId, baseVersion: request.baseVersion
    }), (error: unknown) => error instanceof EntityVersionConflictError);
    assert.equal(state.batchCommits, 1);
  } finally { spy.mockRestore(); }
});

test("a replay from before a later mutation conflicts and never restores the old sale", async () => {
  const state = singlesState({ capacity: 4 });
  const spy = await installState(state);
  const original = {
    scopeKey: "user-1", lotId: "7", saleId: "later", sale: { id: "later", type: "wheel", quantity: 1, packsCount: 0, memo: "original" },
    updatedBy: "user-1", mutationId: "original-id", baseVersion: 0
  };
  try {
    await upsertInventorySale(createConfig(), original);
    const later = await upsertInventorySale(createConfig(), {
      ...original, sale: { ...original.sale, memo: "newer" }, mutationId: "newer-id", baseVersion: 1
    });
    await assert.rejects(() => upsertInventorySale(createConfig(), original), (error: unknown) => error instanceof EntityVersionConflictError);
    assert.equal(state.batchCommits, 2);
    const persisted = state.docs.get("user-1:sale:user-1:7:later") as Record<string, unknown>;
    assert.equal(persisted.version, later.version);
    assert.equal((persisted.sale as Record<string, unknown>).memo, "newer");
  } finally { spy.mockRestore(); }
});

test("an omitted base version only creates version zero and cannot replay over a later mutation", async () => {
  const state = singlesState({ capacity: 4 });
  const spy = await installState(state);
  const original = {
    scopeKey: "user-1", lotId: "7", saleId: "implicit-base", sale: { id: "implicit-base", type: "wheel", quantity: 1, packsCount: 0, memo: "original" },
    updatedBy: "user-1", mutationId: "implicit-original"
  };
  try {
    const created = await upsertInventorySale(createConfig(), original);
    assert.equal(created.version, 1);
    await upsertInventorySale(createConfig(), {
      ...original, sale: { ...original.sale, memo: "newer" }, mutationId: "implicit-newer", baseVersion: 1
    });
    await assert.rejects(() => upsertInventorySale(createConfig(), original), (error: unknown) => error instanceof EntityVersionConflictError);
    await assert.rejects(() => upsertInventorySale(createConfig(), {
      ...original, sale: { ...original.sale, memo: "reused ID" }, mutationId: "implicit-original", baseVersion: 2
    }), (error: unknown) => error instanceof EntityVersionConflictError);
    assert.equal(state.batchCommits, 2);
    const persisted = state.docs.get("user-1:sale:user-1:7:implicit-base") as Record<string, unknown>;
    assert.equal((persisted.sale as Record<string, unknown>).memo, "newer");
  } finally { spy.mockRestore(); }
});

test("a mutation ID reused for a different lot in the same scope conflicts", async () => {
  const state = createStatefulCosmos([
    { id: "sync:meta:user-1", docType: "sync_meta", userId: "user-1", version: 3, updatedAt: "2026-01-01T00:00:00Z", salesMode: "entity", presetSetId: "v3", wheelConfigs: [], _etag: "meta-3" },
    { id: "sync:preset:user-1:7", docType: "sync_preset", userId: "user-1", presetId: "7", presetSetId: "v3", preset: { id: 7, lotType: "singles", singlesPurchases: [{ id: 41, quantity: 2 }] }, sales: [], version: 3, updatedAt: "2026-01-01T00:00:00Z" },
    { id: "sync:preset:user-1:8", docType: "sync_preset", userId: "user-1", presetId: "8", presetSetId: "v3", preset: { id: 8, lotType: "singles", singlesPurchases: [{ id: 81, quantity: 2 }] }, sales: [], version: 3, updatedAt: "2026-01-01T00:00:00Z" }
  ]);
  const spy = await installState(state);
  try {
    await upsertInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "sale-7", sale: { id: "sale-7", type: "wheel", quantity: 1, packsCount: 0 },
      updatedBy: "user-1", mutationId: "scope-wide-id", baseVersion: 0
    });
    await assert.rejects(() => upsertInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "8", saleId: "sale-8", sale: { id: "sale-8", type: "wheel", quantity: 1, packsCount: 0 },
      updatedBy: "user-1", mutationId: "scope-wide-id", baseVersion: 0
    }), (error: unknown) => error instanceof EntityVersionConflictError);
    assert.equal(state.batchCommits, 1);
  } finally { spy.mockRestore(); }
});

test("a delete retry after a committed but lost response returns the original tombstone", async () => {
  const state = singlesState({ entitySales: [
    { saleId: "delete-retry", version: 2, sale: { id: "delete-retry", type: "wheel", quantity: 1, packsCount: 0 }, _etag: "sale-etag-2" }
  ] });
  state.failAfterNextCommit();
  const spy = await installState(state);
  const request = { scopeKey: "user-1", lotId: "7", saleId: "delete-retry", updatedBy: "user-1", mutationId: "delete-retry-id", baseVersion: 2 };
  try {
    await assert.rejects(() => deleteInventorySale(createConfig(), request), /connection lost after commit/);
    const replay = await deleteInventorySale(createConfig(), request);
    assert.equal(replay?.version, 3);
    assert.ok(replay?.deletedAt);
    assert.equal(replay?.mutationId, "delete-retry-id");
    assert.ok(replay?.mutationFingerprint);
    assert.equal(state.batchCommits, 1);
  } finally { spy.mockRestore(); }
});

test("active empty preset generation does not mix in retired lot history", async () => {
  const state = createStatefulCosmos([
    { id: "sync:meta:user-1", docType: "sync_meta", userId: "user-1", version: 4, updatedAt: "2026-01-02T00:00:00Z", salesMode: "entity", presetSetId: "active-empty", wheelConfigs: [], _etag: "meta-4" },
    { id: "sync:preset:user-1:7", docType: "sync_preset", userId: "user-1", presetId: "7", presetSetId: "retired", preset: { id: 7, lotType: "singles", singlesPurchases: [{ id: 41, quantity: 9 }] }, sales: [], version: 3, updatedAt: "2026-01-01T00:00:00Z" },
    { id: "sync:user-1", docType: "sync_snapshot", userId: "user-1", lots: [{ id: 7, lotType: "singles", singlesPurchases: [{ id: 41, quantity: 9 }] }], salesByLot: { "7": [] } }
  ]);
  const spy = await installState(state);
  try {
    await assert.rejects(() => upsertInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "must-not-write", sale: { id: "must-not-write", type: "wheel", quantity: 1, packsCount: 0 },
      updatedBy: "user-1", mutationId: "m-retired", baseVersion: 0
    }), /Lot was not found/);
    assert.equal(state.batchCommits, 0);
  } finally { spy.mockRestore(); }
});

test("an orphan whole-snapshot lot is invisible to sale validation without preset or metadata rows", async () => {
  const state = createStatefulCosmos([
    { id: "sync:user-1", docType: "sync_snapshot", userId: "user-1", lots: [{ id: 7, lotType: "singles", singlesPurchases: [{ id: 41, quantity: 3 }] }], salesByLot: { "7": [] } }
  ]);
  const spy = await installState(state);
  try {
    await assert.rejects(() => upsertInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "invisible", sale: { id: "invisible", type: "wheel", quantity: 1, packsCount: 0 },
      updatedBy: "user-1", mutationId: "m-invisible", baseVersion: 0
    }), /Lot was not found/);
    assert.equal(state.batchCommits, 0);
  } finally { spy.mockRestore(); }
});

test("raw whole-snapshot sales do not consume inventory for a current legacy preset lot", async () => {
  const state = createStatefulCosmos([
    { id: "sync:preset:user-1:7", docType: "sync_preset", userId: "user-1", presetId: "7", preset: { id: 7, lotType: "singles", singlesPurchases: [{ id: 41, quantity: 1 }] }, sales: [], version: 1, updatedAt: "2026-01-01T00:00:00Z" },
    { id: "sync:user-1", docType: "sync_snapshot", userId: "user-1", lots: [{ id: 7, lotType: "singles", singlesPurchases: [{ id: 41, quantity: 1 }] }], salesByLot: { "7": [{ id: 51, type: "pack", quantity: 1, packsCount: 1, singlesItems: [{ singlesPurchaseEntryId: 41, quantity: 1 }] }] } }
  ]);
  const spy = await installState(state);
  try {
    await upsertInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "current-sale", sale: { id: "current-sale", type: "pack", quantity: 1, packsCount: 1, singlesItems: [{ singlesPurchaseEntryId: 41, quantity: 1 }] },
      updatedBy: "user-1", mutationId: "m-current-sale", baseVersion: 0
    });
    assert.equal(state.batchCommits, 1);
  } finally { spy.mockRestore(); }
});

test("embedded sales on a legacy preset still consume inventory when metadata is absent", async () => {
  const state = createStatefulCosmos([
    { id: "sync:preset:user-1:7", docType: "sync_preset", userId: "user-1", presetId: "7", preset: { id: 7, lotType: "singles", singlesPurchases: [{ id: 41, quantity: 1 }] }, sales: [{ id: 51, type: "pack", quantity: 1, packsCount: 1, singlesItems: [{ singlesPurchaseEntryId: 41, quantity: 1 }] }], version: 1, updatedAt: "2026-01-01T00:00:00Z" }
  ]);
  const spy = await installState(state);
  try {
    await assert.rejects(() => upsertInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "over-capacity", sale: { id: "over-capacity", type: "pack", quantity: 1, packsCount: 1, singlesItems: [{ singlesPurchaseEntryId: 41, quantity: 1 }] },
      updatedBy: "user-1", mutationId: "m-over-capacity", baseVersion: 0
    }), /Sale exceeds available singles inventory/);
    assert.equal(state.batchCommits, 0);
  } finally { spy.mockRestore(); }
});

test("repeated sync metadata churn maps to a sale version conflict without a write", async () => {
  const state = singlesState({ capacity: 2 });
  let etagVersion = 3;
  state.onRead((id) => {
    if (id !== "sync:meta:user-1") return;
    etagVersion += 1;
    const current = state.docs.get("user-1:sync:meta:user-1") as Record<string, unknown>;
    state.docs.set("user-1:sync:meta:user-1", { ...current, _etag: `meta-${etagVersion}` });
  });
  const spy = await installState(state);
  try {
    await assert.rejects(() => upsertInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "churn", sale: { id: "churn", type: "wheel", quantity: 1, packsCount: 0 },
      updatedBy: "user-1", mutationId: "m-churn", baseVersion: 0
    }), (error: unknown) => error instanceof EntityVersionConflictError);
    assert.equal(state.batchCommits, 0);
  } finally { spy.mockRestore(); }
});

test("a historically oversold singles edit cannot move usage onto another entry even when aggregate stock is valid", async () => {
  const state = createStatefulCosmos([
    { id: "sync:meta:user-1", docType: "sync_meta", userId: "user-1", version: 3, updatedAt: "2026-01-01T00:00:00Z", salesMode: "entity", presetSetId: "v3", wheelConfigs: [], _etag: "meta-3" },
    { id: "sync:preset:user-1:7", docType: "sync_preset", userId: "user-1", presetId: "7", presetSetId: "v3", preset: { id: 7, lotType: "singles", singlesPurchases: [{ id: 41, quantity: 1 }, { id: 42, quantity: 10 }] }, sales: [], version: 3, updatedAt: "2026-01-01T00:00:00Z" },
    { id: "sale:user-1:7:shift", docType: "sale", userId: "user-1", scopeKey: "user-1", lotId: "7", saleId: "shift", sale: { id: "shift", type: "pack", quantity: 2, packsCount: 2, singlesItems: [{ singlesPurchaseEntryId: 41, quantity: 2 }] }, version: 1, updatedAt: "2026-01-01T00:00:00Z", updatedBy: "user-1", mutationId: "old", deletedAt: null, _etag: "sale-etag-1" }
  ]);
  const spy = await installState(state);
  try {
    await assert.rejects(() => upsertInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "shift", sale: {
        id: "shift", type: "pack", quantity: 2, packsCount: 2,
        singlesItems: [{ singlesPurchaseEntryId: 41, quantity: 1 }, { singlesPurchaseEntryId: 42, quantity: 1 }]
      }, updatedBy: "user-1", mutationId: "shift-edit", baseVersion: 1
    }), /cannot increase historical inventory consumption/);
    assert.equal(state.batchCommits, 0);
  } finally { spy.mockRestore(); }
});

test("a pack sale with zero summed singles-line consumption is rejected", async () => {
  const state = singlesState({ capacity: 2 });
  const spy = await installState(state);
  try {
    await assert.rejects(() => upsertInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "zero-lines", sale: {
        id: "zero-lines", type: "pack", quantity: 1, packsCount: 1,
        singlesItems: [{ singlesPurchaseEntryId: 41, quantity: 0 }]
      }, updatedBy: "user-1", mutationId: "m-zero-lines", baseVersion: 0
    }), /must consume at least one unit/);
    assert.equal(state.batchCommits, 0);
  } finally { spy.mockRestore(); }
});

test("a historically oversold bulk sale cannot trade sealed boxes for opened packs", async () => {
  const state = bulkState(1);
  const existing = {
    id: "sale:user-1:7:shift", docType: "sale", userId: "user-1", scopeKey: "user-1", lotId: "7", saleId: "shift",
    sale: { id: "shift", type: "box", quantity: 2, packsCount: 0 }, version: 1, createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z", updatedBy: "user-1", mutationId: "old", deletedAt: null, _etag: "sale-etag-1"
  };
  state.docs.set("user-1:sale:user-1:7:shift", existing);
  const spy = await installState(state);
  try {
    await assert.rejects(() => upsertInventorySale(createConfig(), {
      scopeKey: "user-1", lotId: "7", saleId: "shift", sale: { id: "shift", type: "pack", quantity: 1, packsCount: 1 },
      updatedBy: "user-1", mutationId: "shift-to-pack", baseVersion: 1
    }), /cannot shift historical inventory consumption/);
    assert.equal(state.batchCommits, 0);
  } finally { spy.mockRestore(); }
});
