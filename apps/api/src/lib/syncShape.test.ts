import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpError } from "./auth";
import { extractCanonicalSyncShape, parseCanonicalSyncShape, withDualSyncShape } from "./syncShape";

test("parseCanonicalSyncShape accepts legacy preset payload", () => {
  const result = parseCanonicalSyncShape({
    presets: [{ id: 1 }],
    salesByPreset: { "1": [{ id: "sale-1" }] }
  });

  assert.deepEqual(result.presets, [{ id: 1 }]);
  assert.deepEqual(result.salesByPreset, { "1": [{ id: "sale-1" }] });
});

test("parseCanonicalSyncShape accepts lot payload", () => {
  const result = parseCanonicalSyncShape({
    lots: [{ id: 2 }],
    salesByLot: { "2": [{ id: "sale-2" }] }
  });

  assert.deepEqual(result.presets, [{ id: 2 }]);
  assert.deepEqual(result.salesByPreset, { "2": [{ id: "sale-2" }] });
});

test("parseCanonicalSyncShape rejects invalid shape", () => {
  assert.throws(
    () => parseCanonicalSyncShape({ salesByPreset: {} }),
    (error: unknown) => error instanceof HttpError && error.status === 400
  );
});

test("extractCanonicalSyncShape prefers lot fields", () => {
  const result = extractCanonicalSyncShape({
    lots: [{ id: 3 }],
    salesByLot: { "3": [{ id: "sale-3" }] }
  });

  assert.ok(result);
  assert.deepEqual(result?.presets, [{ id: 3 }]);
  assert.deepEqual(result?.salesByPreset, { "3": [{ id: "sale-3" }] });
});

test("withDualSyncShape adds lot aliases", () => {
  const result = withDualSyncShape({
    presets: [{ id: 4 }],
    salesByPreset: { "4": [{ id: "sale-4" }] },
    version: 7,
    updatedAt: "2026-02-18T00:00:00.000Z"
  });

  assert.deepEqual(result.lots, [{ id: 4 }]);
  assert.deepEqual(result.salesByLot, { "4": [{ id: "sale-4" }] });
  assert.equal(result.version, 7);
});
