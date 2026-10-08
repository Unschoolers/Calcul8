import assert from "node:assert/strict";
import { test } from "vitest";
import {
  buildEntitlementDocumentId,
  buildEntitlementScopeKey,
  buildLegacyUserEntitlementDocumentId,
  buildSyncScopePartitionKey
} from "./scopeKeys";

test("buildLegacyUserEntitlementDocumentId preserves current id format", () => {
  assert.equal(buildLegacyUserEntitlementDocumentId("google-user-1"), "entitlement:google-user-1");
});

test("scope key helpers build user and workspace formats", () => {
  assert.equal(buildEntitlementScopeKey("user", "abc"), "user:abc");
  assert.equal(buildEntitlementScopeKey("workspace", "w1"), "ws:w1");
  assert.equal(buildEntitlementDocumentId("workspace", "w1"), "entitlement:ws:w1");
  assert.equal(buildSyncScopePartitionKey("user", "abc"), "u:abc");
  assert.equal(buildSyncScopePartitionKey("workspace", "w1"), "ws:w1");
});

test("scope key helpers reject blank ids", () => {
  assert.equal(buildEntitlementScopeKey("user", ""), null);
  assert.equal(buildEntitlementDocumentId("workspace", "   "), null);
  assert.equal(buildSyncScopePartitionKey("user", " "), null);
});


test("API scope ids preserve nullish normalization for falsy external inputs", () => {
  for (const [input, expected] of [[0, "0"], [false, "false"], [NaN, "NaN"], [" padded ", "padded"]] as const) {
    assert.equal(buildEntitlementScopeKey("user", input), `user:${expected}`);
    assert.equal(buildEntitlementScopeKey("workspace", input), `ws:${expected}`);
    assert.equal(buildEntitlementDocumentId("user", input), `entitlement:user:${expected}`);
    assert.equal(buildSyncScopePartitionKey("user", input), `u:${expected}`);
    assert.equal(buildSyncScopePartitionKey("workspace", input), `ws:${expected}`);
    assert.equal(buildLegacyUserEntitlementDocumentId(input), `entitlement:${expected}`);
  }
  for (const input of [null, undefined, "", "   "]) {
    assert.equal(buildEntitlementScopeKey("user", input), null);
    assert.equal(buildEntitlementDocumentId("workspace", input), null);
    assert.equal(buildSyncScopePartitionKey("user", input), null);
    assert.equal(buildLegacyUserEntitlementDocumentId(input), "entitlement:");
  }
});
