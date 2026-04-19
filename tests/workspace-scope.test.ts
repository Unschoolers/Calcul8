import assert from "node:assert/strict";
import { test } from "vitest";
import {
  getActiveStorageScope,
  getActiveWorkspaceId,
  getWorkspaceScopeKey,
  resolveWorkspaceScopeContext,
  toWorkspaceScopeContext
} from "../src/app-core/workspace-scope.ts";

test("workspace scope context resolves personal state consistently", () => {
  const scope = resolveWorkspaceScopeContext({
    activeScopeType: "personal",
    activeWorkspaceId: "team-42"
  });

  assert.deepEqual(scope, {
    scopeType: "personal",
    workspaceId: null,
    isWorkspace: false,
    isPersonal: true,
    scopeKey: "personal"
  });
  assert.deepEqual(getActiveStorageScope({
    activeScopeType: "personal",
    activeWorkspaceId: "team-42"
  }), {
    scopeType: "personal"
  });
  assert.equal(getActiveWorkspaceId({
    activeScopeType: "personal",
    activeWorkspaceId: "team-42"
  }), undefined);
});

test("workspace scope context resolves workspace state consistently", () => {
  const scope = resolveWorkspaceScopeContext({
    activeScopeType: "workspace",
    activeWorkspaceId: " team-42 "
  });

  assert.deepEqual(scope, {
    scopeType: "workspace",
    workspaceId: "team-42",
    isWorkspace: true,
    isPersonal: false,
    scopeKey: "workspace:team-42"
  });
  assert.deepEqual(getActiveStorageScope({
    activeScopeType: "workspace",
    activeWorkspaceId: " team-42 "
  }), {
    scopeType: "workspace",
    workspaceId: "team-42"
  });
  assert.equal(getActiveWorkspaceId({
    activeScopeType: "workspace",
    activeWorkspaceId: " team-42 "
  }), "team-42");
});

test("workspace scope helpers normalize direct storage scopes", () => {
  assert.equal(getWorkspaceScopeKey({ scopeType: "personal" }), "personal");
  assert.equal(getWorkspaceScopeKey({ scopeType: "workspace", workspaceId: "team-42" }), "workspace:team-42");
  assert.deepEqual(toWorkspaceScopeContext({ scopeType: "workspace", workspaceId: " team-42 " }), {
    scopeType: "workspace",
    workspaceId: "team-42",
    isWorkspace: true,
    isPersonal: false,
    scopeKey: "workspace:team-42"
  });
});
