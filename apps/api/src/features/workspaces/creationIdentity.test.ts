import { strict as assert } from "node:assert";
import { test } from "vitest";
import {
  buildWorkspaceCreationFingerprint,
  deriveWorkspaceCreationId,
  normalizeWorkspaceIdempotencyKey
} from "./creationIdentity";

test("workspace creation identity is deterministic for the owner and normalized key", () => {
  const key = normalizeWorkspaceIdempotencyKey(" create-ABC_123 ");

  assert.equal(key, "create-ABC_123");
  assert.equal(
    deriveWorkspaceCreationId(" owner-1 ", key),
    deriveWorkspaceCreationId("owner-1", key)
  );
  assert.match(deriveWorkspaceCreationId("owner-1", key), /^ws_[0-9a-f]{16}$/);
});

test("workspace creation fingerprint normalizes name but detects a changed request", () => {
  assert.equal(
    buildWorkspaceCreationFingerprint("owner-1", "  Team   One "),
    buildWorkspaceCreationFingerprint("owner-1", "Team One")
  );
  assert.notEqual(
    buildWorkspaceCreationFingerprint("owner-1", "Team One"),
    buildWorkspaceCreationFingerprint("owner-1", "Team Two")
  );
});

test("workspace idempotency keys reject invalid external input", () => {
  assert.throws(() => normalizeWorkspaceIdempotencyKey(""), /required/i);
  assert.throws(() => normalizeWorkspaceIdempotencyKey("contains spaces"), /invalid/i);
  assert.throws(() => normalizeWorkspaceIdempotencyKey("x".repeat(129)), /128/);
});
