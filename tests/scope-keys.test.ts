import assert from "node:assert/strict";
import { test } from "vitest";
import {
  buildEntitlementDocumentId,
  buildEntitlementScopeKey,
  buildSyncScopePartitionKey
} from "../src/app-core/utils/scopeKeys.ts";

test("scope key helpers build user scope keys", () => {
  assert.equal(buildEntitlementScopeKey("user", "abc"), "user:abc");
  assert.equal(buildEntitlementDocumentId("user", "abc"), "entitlement:user:abc");
  assert.equal(buildSyncScopePartitionKey("user", "abc"), "u:abc");
});

test("scope key helpers build workspace scope keys", () => {
  assert.equal(buildEntitlementScopeKey("workspace", "team-7"), "ws:team-7");
  assert.equal(buildEntitlementDocumentId("workspace", "team-7"), "entitlement:ws:team-7");
  assert.equal(buildSyncScopePartitionKey("workspace", "team-7"), "ws:team-7");
});

test("scope key helpers return null for blank ids", () => {
  assert.equal(buildEntitlementScopeKey("user", ""), null);
  assert.equal(buildEntitlementDocumentId("workspace", "   "), null);
  assert.equal(buildSyncScopePartitionKey("user", " "), null);
});
