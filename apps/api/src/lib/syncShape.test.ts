import assert from "node:assert/strict";
import { test } from "vitest";
import { HttpError } from "./auth";
import { parseSyncLotsShape, parseSyncWheelConfigs } from "./syncShape";

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

test("parseSyncLotsShape rejects non-object lots and sales", () => {
  assert.throws(
    () => parseSyncLotsShape({ lots: [1] }),
    (error: unknown) => error instanceof HttpError
      && error.status === 400
      && error.message === "Field 'lots[0]' must be an object."
  );

  assert.throws(
    () => parseSyncLotsShape({ lots: [{ id: 2 }], salesByLot: { "2": [null] } }),
    (error: unknown) => error instanceof HttpError
      && error.status === 400
      && error.message === "Field 'salesByLot.2[0]' must be an object."
  );
});

test("parseSyncLotsShape requires lot ids at the boundary", () => {
  assert.throws(
    () => parseSyncLotsShape({ lots: [{ name: "Missing id" }] }),
    (error: unknown) => error instanceof HttpError
      && error.status === 400
      && error.message === "Field 'lots[0].id' must be a string or number."
  );
});

test("parseSyncWheelConfigs accepts object arrays and defaults missing input", () => {
  assert.deepEqual(parseSyncWheelConfigs(null), []);
  assert.deepEqual(parseSyncWheelConfigs([{ id: 91, name: "Wheel" }]), [{ id: 91, name: "Wheel" }]);
});

test("parseSyncWheelConfigs rejects invalid entries", () => {
  assert.throws(
    () => parseSyncWheelConfigs(["bad"]),
    (error: unknown) => error instanceof HttpError
      && error.status === 400
      && error.message === "Field 'wheelConfigs[0]' must be an object."
  );
});
