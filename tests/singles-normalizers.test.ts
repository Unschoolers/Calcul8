import assert from "node:assert/strict";
import { test } from "vitest";
import {
  normalizeUniquePositiveIntIds,
  toNonNegativeInt,
  toNonNegativeNumber,
  toPositiveIntOrNull
} from "../src/app-core/shared/singles-normalizers.ts";

test("toPositiveIntOrNull normalizes valid ids and rejects invalid input", () => {
  assert.equal(toPositiveIntOrNull(5), 5);
  assert.equal(toPositiveIntOrNull("6"), 6);
  assert.equal(toPositiveIntOrNull(2.9), 2);
  assert.equal(toPositiveIntOrNull(0), null);
  assert.equal(toPositiveIntOrNull(-1), null);
  assert.equal(toPositiveIntOrNull(Number.NaN), null);
});

test("toNonNegativeInt floors positive values and clamps invalid values to zero", () => {
  assert.equal(toNonNegativeInt(4.9), 4);
  assert.equal(toNonNegativeInt("3"), 3);
  assert.equal(toNonNegativeInt(0), 0);
  assert.equal(toNonNegativeInt(-2), 0);
  assert.equal(toNonNegativeInt(Number.NaN), 0);
});

test("toNonNegativeNumber keeps finite non-negative values and clamps invalid values", () => {
  assert.equal(toNonNegativeNumber(4.25), 4.25);
  assert.equal(toNonNegativeNumber("3.5"), 3.5);
  assert.equal(toNonNegativeNumber(0), 0);
  assert.equal(toNonNegativeNumber(-2), 0);
  assert.equal(toNonNegativeNumber(Number.NaN), 0);
});

test("normalizeUniquePositiveIntIds returns unique normalized ids in order", () => {
  assert.deepEqual(
    normalizeUniquePositiveIntIds([1, "2", 2.9, 2, -1, 0, Number.NaN, 1, "5.1"]),
    [1, 2, 5]
  );
  assert.deepEqual(normalizeUniquePositiveIntIds([]), []);
  assert.deepEqual(normalizeUniquePositiveIntIds(null), []);
});
