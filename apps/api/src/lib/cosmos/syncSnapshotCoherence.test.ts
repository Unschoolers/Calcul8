import assert from "node:assert/strict";
import { test, vi } from "vitest";
import type { SyncMetaDocument, SyncPresetDocument } from "../../types";

const { withCosmosRetryMock, isNotFoundErrorMock } = vi.hoisted(() => ({
  withCosmosRetryMock: vi.fn(async <T>(operation: () => Promise<T>) => operation()),
  isNotFoundErrorMock: vi.fn((error: unknown) => (error as { statusCode?: number })?.statusCode === 404)
}));

vi.mock("./core", () => ({
  isNotFoundError: isNotFoundErrorMock,
  withCosmosRetry: withCosmosRetryMock
}));

import { loadCoherentSyncSnapshotInputs, SyncSnapshotConflictError } from "./syncSnapshotRepository.shared";

function createContainer(readMeta: () => Promise<SyncMetaDocument | null>, queryResult: SyncPresetDocument[]) {
  const query = vi.fn(() => ({ fetchAll: vi.fn().mockResolvedValue({ resources: queryResult }) }));
  const read = vi.fn(async () => ({ resource: await readMeta() }));
  return {
    container: {
      item: vi.fn(() => ({ read })),
      items: { query }
    } as never,
    query,
    read
  };
}

function meta(version: number, presetSetId: string, etag: string): SyncMetaDocument {
  return {
    id: "sync:meta:user-1",
    docType: "sync_meta",
    userId: "user-1",
    version,
    updatedAt: "2026-10-17T00:00:00.000Z",
    presetSetId,
    _etag: etag
  } as SyncMetaDocument;
}

test("legacy snapshot query selects only documents with an absent, null, or empty generation", async () => {
  const current = [{
    id: "legacy",
    docType: "sync_preset",
    userId: "user-1",
    presetId: "1",
    preset: { id: 1 },
    sales: [],
    version: 1,
    updatedAt: "2026-10-17T00:00:00.000Z"
  }] as SyncPresetDocument[];
  const { container, query } = createContainer(async () => null, current);

  const result = await loadCoherentSyncSnapshotInputs(container, "user-1");

  assert.equal(result.metaDocument, null);
  assert.deepEqual(result.presetDocuments, current);
  const spec = query.mock.calls[0]?.[0] as { query: string; parameters: Array<{ name: string; value: unknown }> };
  assert.match(spec.query, /NOT IS_DEFINED\(c\.presetSetId\)/);
  assert.match(spec.query, /IS_NULL\(c\.presetSetId\)/);
  assert.match(spec.query, /c\.presetSetId = ''/);
  assert.equal(spec.query.includes("c.docType = @docType"), true);
});

test("coherent loader retries when a valid metadata ETag changes across the preset query", async () => {
  const oldMeta = meta(7, "v7:old", "etag-old");
  const newMeta = meta(8, "v8:new", "etag-new");
  let reads = 0;
  const documents = [{
    id: "new-preset",
    docType: "sync_preset",
    userId: "user-1",
    presetId: "2",
    presetSetId: "v8:new",
    preset: { id: 2 },
    sales: [],
    version: 8,
    updatedAt: "2026-10-17T00:00:00.000Z"
  }] as SyncPresetDocument[];
  const { container, query } = createContainer(async () => (++reads === 1 ? oldMeta : newMeta), documents);

  const result = await loadCoherentSyncSnapshotInputs(container, "user-1");

  assert.equal(result.metaDocument?._etag, "etag-new");
  assert.deepEqual(result.presetDocuments, documents);
  assert.equal(query.mock.calls.length, 2);
});

test("coherent loader retries if the metadata ETag disappears and reports bounded churn", async () => {
  const present = meta(3, "v3:g", "etag-3");
  let reads = 0;
  const { container, query } = createContainer(async () => (++reads % 2 === 1 ? present : ({ ...present, _etag: "" } as SyncMetaDocument)), []);

  await assert.rejects(() => loadCoherentSyncSnapshotInputs(container, "user-1"), SyncSnapshotConflictError);
  assert.equal(query.mock.calls.length, 3);
  assert.equal(reads, 6);
});

test("coherent loader accepts matching nonempty metadata ETag and generation", async () => {
  const sameMeta = meta(9, "v9:g", "etag-9");
  const { container } = createContainer(async () => sameMeta, []);

  const result = await loadCoherentSyncSnapshotInputs(container, "user-1");

  assert.equal(result.metaDocument?._etag, "etag-9");
  assert.deepEqual(result.presetDocuments, []);
});
