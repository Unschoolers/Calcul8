import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpError } from "./auth";
import { parseSyncLotsShape } from "./syncShape";

test("parseSyncLotsShape accepts lot payload", () => {
  const result = parseSyncLotsShape({
    lots: [{ id: 2 }],
    salesByLot: { "2": [{ id: "sale-2" }] }
  });

  assert.deepEqual(result.lots, [{ id: 2 }]);
  assert.deepEqual(result.salesByLot, { "2": [{ id: "sale-2" }] });
});

test("parseSyncLotsShape defaults missing salesByLot to empty object", () => {
  const result = parseSyncLotsShape({
    lots: [{ id: 2 }]
  });

  assert.deepEqual(result.lots, [{ id: 2 }]);
  assert.deepEqual(result.salesByLot, {});
});

test("parseSyncLotsShape rejects invalid shape", () => {
  assert.throws(
    () => parseSyncLotsShape({ salesByLot: {} }),
    (error: unknown) => error instanceof HttpError && error.status === 400
  );
});
