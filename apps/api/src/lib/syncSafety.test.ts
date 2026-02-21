import assert from "node:assert/strict";
import { test } from "vitest";
import { HttpError } from "./auth";
import { assertSafeSyncPush, hasSnapshotData, isEmptySyncPayload } from "./syncSafety";
import type { SyncSnapshotDocument } from "../types";

function makeSnapshot(
  overrides: Partial<SyncSnapshotDocument> = {}
): SyncSnapshotDocument {
  return {
    id: "sync:user-1",
    userId: "user-1",
    lots: [],
    salesByLot: {},
    version: 1,
    updatedAt: "2026-02-17T00:00:00.000Z",
    ...overrides
  };
}

test("isEmptySyncPayload detects empty data", () => {
  assert.equal(isEmptySyncPayload([], {}), true);
  assert.equal(isEmptySyncPayload([{ id: 1 }], {}), false);
  assert.equal(isEmptySyncPayload([], { "1": [{ id: 123 }] }), false);
});

test("hasSnapshotData detects existing cloud data", () => {
  assert.equal(hasSnapshotData(null), false);
  assert.equal(hasSnapshotData(makeSnapshot()), false);
  assert.equal(hasSnapshotData(makeSnapshot({ lots: [{ id: 1 }] })), true);
  assert.equal(hasSnapshotData(makeSnapshot({ salesByLot: { "1": [{ id: 10 }] } })), true);
});

test("assertSafeSyncPush blocks empty overwrite when cloud already has data", () => {
  const existing = makeSnapshot({
    lots: [{ id: 1, name: "Main" }]
  });

  assert.throws(
    () => assertSafeSyncPush(existing, [], {}, false),
    (error: unknown) => error instanceof HttpError && error.status === 409
  );
});

test("assertSafeSyncPush allows explicit empty overwrite", () => {
  const existing = makeSnapshot({
    lots: [{ id: 1, name: "Main" }]
  });

  assert.doesNotThrow(() => assertSafeSyncPush(existing, [], {}, true));
});

test("assertSafeSyncPush allows non-empty push when cloud has data", () => {
  const existing = makeSnapshot({
    lots: [{ id: 1, name: "Main" }]
  });

  assert.doesNotThrow(() =>
    assertSafeSyncPush(existing, [{ id: 1, name: "Main" }], { "1": [] }, false)
  );
});

