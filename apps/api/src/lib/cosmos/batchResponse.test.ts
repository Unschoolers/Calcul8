import assert from "node:assert/strict";
import { test } from "vitest";
import { assertSuccessfulCosmosBatch, CosmosBatchConflictError } from "./batchResponse";

test("accepts only a complete successful transactional batch response", () => {
  assert.doesNotThrow(() => assertSuccessfulCosmosBatch({ statusCode: 200, result: [{ statusCode: 201 }, { statusCode: 204 }] }, 2));
});

test("rejects resolved batches with operation failures or incomplete results", () => {
  assert.throws(() => assertSuccessfulCosmosBatch({ statusCode: 200, result: [{ statusCode: 201 }, { statusCode: 400 }] }, 2));
  assert.throws(() => assertSuccessfulCosmosBatch({ statusCode: 200, result: [{ statusCode: 201 }] }, 2));
  assert.throws(() => assertSuccessfulCosmosBatch({ statusCode: 200 }, 1));
});

test("classifies top-level and per-operation 409/412 as retryable conflicts", () => {
  for (const statusCode of [409, 412]) {
    assert.throws(
      () => assertSuccessfulCosmosBatch({ statusCode, result: [] }, 1),
      (error: unknown) => error instanceof CosmosBatchConflictError
    );
    assert.throws(
      () => assertSuccessfulCosmosBatch({ statusCode: 200, result: [{ statusCode }] }, 1),
      (error: unknown) => error instanceof CosmosBatchConflictError
    );
  }
  assert.throws(
    () => assertSuccessfulCosmosBatch({ code: 200, result: [{ statusCode: 424 }, { statusCode: 412 }] }, 2),
    (error: unknown) => error instanceof CosmosBatchConflictError
  );
});
