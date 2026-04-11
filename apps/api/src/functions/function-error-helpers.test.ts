import assert from "node:assert/strict";
import { test } from "vitest";
import { HttpError } from "../lib/auth";
import { createApiConfig, createHttpRequest, createInvocationContext } from "../test-support/function-test-helpers";
import { handleApiFunctionError, readHttpErrorStatus } from "./function-error-helpers";

test("handleApiFunctionError emits warn telemetry for configured statuses and logs unexpected errors", () => {
  const request = createHttpRequest();
  const context = createInvocationContext();

  const response = handleApiFunctionError({
    request: request as never,
    context: context as never,
    config: createApiConfig(),
    route: "sync_push",
    workspaceScope: "workspace",
    error: new HttpError(409, "Conflict"),
    failureMessage: "Failed to sync.",
    logMessage: "Failed to sync."
  });

  assert.equal(response.status, 409);
  assert.equal((response.jsonBody as { error: string }).error, "Conflict");
  assert.equal(context.warn.mock.calls.length, 1);
  assert.equal(context.warn.mock.calls[0]?.[0], "api.telemetry");
  assert.equal(context.warn.mock.calls[0]?.[1]?.outcome, "http_409");
  assert.equal(context.error.mock.calls.length, 1);
});

test("handleApiFunctionError can normalize handled errors and suppress context error logging", () => {
  const request = createHttpRequest();
  const context = createInvocationContext();

  const response = handleApiFunctionError({
    request: request as never,
    context: context as never,
    config: createApiConfig(),
    route: "lot_live_pricing_save",
    workspaceScope: "workspace",
    error: new Error("stale entity"),
    failureMessage: "Failed to save live pricing.",
    logMessage: "Failed to save live pricing.",
    normalizeError: () => new HttpError(409, "stale entity"),
    shouldLogError: () => false
  });

  assert.equal(response.status, 409);
  assert.equal((response.jsonBody as { error: string }).error, "stale entity");
  assert.equal(context.warn.mock.calls.length, 1);
  assert.equal(context.error.mock.calls.length, 0);
});

test("readHttpErrorStatus reads HttpError and plain status objects", () => {
  assert.equal(readHttpErrorStatus(new HttpError(403, "Forbidden")), 403);
  assert.equal(readHttpErrorStatus({ status: 401 }), 401);
  assert.equal(readHttpErrorStatus(new Error("boom")), null);
});