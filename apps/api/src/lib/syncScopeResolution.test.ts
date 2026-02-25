import assert from "node:assert/strict";
import { test } from "vitest";
import { HttpError } from "./auth";
import {
  assertSyncScopeAccess,
  resolveSyncScope,
  shouldWarnWorkspaceScopeFallback
} from "./syncScopeResolution";

test("resolveSyncScope returns personal scope and legacy partition key", () => {
  const scope = resolveSyncScope("user-123");
  assert.deepEqual(scope, {
    actorUserId: "user-123",
    requestedWorkspaceId: undefined,
    scopeType: "user",
    scopeId: "user-123",
    partitionKey: "user-123",
    workspaceScopeEnabled: true
  });
});

test("resolveSyncScope uses workspace partition when workspaceId is provided", () => {
  const scope = resolveSyncScope("user-123", "team-42");
  assert.equal(scope.scopeType, "workspace");
  assert.equal(scope.partitionKey, "ws:team-42");
  assert.equal(scope.requestedWorkspaceId, "team-42");
  assert.equal(scope.workspaceScopeEnabled, true);
  assert.equal(shouldWarnWorkspaceScopeFallback(scope), false);
});

test("resolveSyncScope rejects blank actor user id", () => {
  assert.throws(
    () => resolveSyncScope("   "),
    (error) => error instanceof HttpError && error.status === 401
  );
});

test("assertSyncScopeAccess no-ops for personal scope", async () => {
  const scope = resolveSyncScope("user-123");
  await assertSyncScopeAccess(scope);
});

test("assertSyncScopeAccess validates workspace membership", async () => {
  const workspaceScope = resolveSyncScope("user-123", "team-42");
  const hasWorkspaceAccess = async (_actorUserId: string, _workspaceId: string): Promise<boolean> => false;

  await assert.rejects(
    () => assertSyncScopeAccess(workspaceScope, hasWorkspaceAccess),
    (error) => error instanceof HttpError && error.status === 403
  );

  await assert.doesNotReject(
    () => assertSyncScopeAccess(workspaceScope, async () => true)
  );
});
