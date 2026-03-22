import assert from "node:assert/strict";
import { test } from "vitest";
import {
  inferDateFromTimestampId,
  resolveLotBusinessDate,
  resolveLotCreatedDate,
  toDateOnly
} from "../src/shared/lot-dates.ts";

test("toDateOnly preserves date-only strings and normalizes ISO timestamps", () => {
  assert.equal(toDateOnly("2026-03-22"), "2026-03-22");
  assert.equal(toDateOnly("2026-03-22T14:30:00.000Z"), "2026-03-22");
  assert.equal(toDateOnly(""), null);
  assert.equal(toDateOnly("banana"), null);
});

test("inferDateFromTimestampId is UTC-stable", () => {
  assert.equal(inferDateFromTimestampId(1704067200000), "2024-01-01");
  assert.equal(inferDateFromTimestampId("1704067200000"), "2024-01-01");
  assert.equal(inferDateFromTimestampId(42), null);
});

test("resolveLotBusinessDate prefers purchaseDate then createdAt then lotId then fallback", () => {
  assert.equal(
    resolveLotBusinessDate({
      purchaseDate: "2026-02-01",
      createdAt: "2026-01-31T23:59:59.000Z",
      lotId: 1704067200000,
      fallbackDate: "2026-01-01"
    }),
    "2026-02-01"
  );

  assert.equal(
    resolveLotBusinessDate({
      createdAt: "2026-01-31T23:59:59.000Z",
      lotId: 1704067200000,
      fallbackDate: "2026-01-01"
    }),
    "2026-01-31"
  );

  assert.equal(
    resolveLotBusinessDate({
      lotId: 1704067200000,
      fallbackDate: "2026-01-01"
    }),
    "2024-01-01"
  );

  assert.equal(
    resolveLotBusinessDate({
      fallbackDate: "2026-01-01"
    }),
    "2026-01-01"
  );
});

test("resolveLotCreatedDate prefers createdAt before purchaseDate", () => {
  assert.equal(
    resolveLotCreatedDate({
      createdAt: "2026-01-15T20:00:00.000Z",
      purchaseDate: "2026-02-01",
      lotId: 1704067200000,
      fallbackDate: "2026-01-01"
    }),
    "2026-01-15"
  );
});
