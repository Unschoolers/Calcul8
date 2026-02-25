import assert from "node:assert/strict";
import { test } from "vitest";
import { HttpError } from "./auth";
import { parseOptionalWorkspaceId } from "./syncScope";

test("parseOptionalWorkspaceId returns normalized id", () => {
  assert.equal(parseOptionalWorkspaceId("  team-42  "), "team-42");
});

test("parseOptionalWorkspaceId returns undefined for empty values", () => {
  assert.equal(parseOptionalWorkspaceId(undefined), undefined);
  assert.equal(parseOptionalWorkspaceId(null), undefined);
  assert.equal(parseOptionalWorkspaceId("   "), undefined);
});

test("parseOptionalWorkspaceId throws for invalid values", () => {
  assert.throws(
    () => parseOptionalWorkspaceId(123),
    (error) => error instanceof HttpError && error.status === 400
  );
  assert.throws(
    () => parseOptionalWorkspaceId("bad space"),
    (error) => error instanceof HttpError && error.status === 400
  );
});
