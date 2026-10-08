import assert from "node:assert/strict";
import { test } from "vitest";
import { getApiErrorMessage, normalizeApiErrorEnvelope, parseApiErrorEnvelope, parseApiErrorMessage } from "../src/app-core/shared/api-error-message.ts";

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
  const response = new Response("not json", { status: 422 });

  await assert.doesNotReject(async () => {
    const message = await parseApiErrorMessage(response, "fallback");
    assert.equal(message, "fallback");
  });
});

test("normalizes status, code, and message for domain-specific error mapping", async () => {
  assert.deepEqual(normalizeApiErrorEnvelope({ code: "ITEM_CONFLICT", error: " Conflict " }, 409, "fallback"), {
    status: 409,
    code: "ITEM_CONFLICT",
    message: "Conflict"
  });
  assert.deepEqual(await parseApiErrorEnvelope(new Response(JSON.stringify({ code: "RATE_LIMITED", message: "Try later" }), { status: 429 }), "fallback"), {
    status: 429,
    code: "RATE_LIMITED",
    message: "Try later"
  });
});

test("does not turn an aborted structured error body into fallback copy", async () => {
  const aborted = new DOMException("Aborted", "AbortError");
  const response = {
    status: 503,
    clone: () => ({ json: async () => { throw aborted; } })
  } as unknown as Response;
  await assert.rejects(parseApiErrorEnvelope(response, "fallback"), error => error === aborted);
});
