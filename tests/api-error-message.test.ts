import assert from "node:assert/strict";
import { test } from "vitest";
import { getApiErrorMessage, parseApiErrorMessage } from "../src/app-core/shared/api-error-message.ts";

test("getApiErrorMessage prefers error then message fields", () => {
  assert.equal(getApiErrorMessage({ error: "Conflict" }, "fallback"), "Conflict");
  assert.equal(getApiErrorMessage({ message: "Readable message" }, "fallback"), "Readable message");
  assert.equal(getApiErrorMessage({ error: "   ", message: "Readable message" }, "fallback"), "Readable message");
});

test("getApiErrorMessage falls back for non-object payloads", () => {
  assert.equal(getApiErrorMessage(null, "fallback"), "fallback");
  assert.equal(getApiErrorMessage([], "fallback"), "fallback");
  assert.equal(getApiErrorMessage({ other: "value" }, "fallback"), "fallback");
});

test("parseApiErrorMessage falls back when response json cannot be parsed", async () => {
  const response = {
    json: async () => {
      throw new Error("bad json");
    }
  } as Response;

  await assert.doesNotReject(async () => {
    const message = await parseApiErrorMessage(response, "fallback");
    assert.equal(message, "fallback");
  });
});