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
