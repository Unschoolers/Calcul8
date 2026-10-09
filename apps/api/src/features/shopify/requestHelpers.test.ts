import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

const { resolveScopeAuthorizationMock } = vi.hoisted(() => ({ resolveScopeAuthorizationMock: vi.fn() }));
vi.mock("../../lib/scopeAuthorization", () => ({ resolveScopeAuthorization: resolveScopeAuthorizationMock }));

import { resolveShopifyScope } from "./requestHelpers";

beforeEach(() => vi.clearAllMocks());

test("Shopify scope keeps provider scope keys from shared authorization", async () => {
  resolveScopeAuthorizationMock.mockResolvedValue({
    allowed: true,
    scope: { actorUserId: "actor", scopeType: "workspace", scopeId: "team-42", partitionKey: "ws:team-42" },
    connectionScopeKey: "ws:team-42"
  });
  assert.deepEqual(await resolveShopifyScope({} as never, "actor", "team-42"), {
    actorUserId: "actor", scopeType: "workspace", scopeId: "team-42", partitionKey: "ws:team-42", connectionScopeKey: "ws:team-42"
  });
});

test.each([
  ["workspace_membership_required", "User is not a member of this workspace."],
  ["workspace_owner_required", "Only a workspace owner can manage the Shopify integration"]
] as const)("Shopify formats %s denials with provider copy", async (denialCode, message) => {
  resolveScopeAuthorizationMock.mockResolvedValue({ allowed: false, denialCode });
  await assert.rejects(() => resolveShopifyScope({} as never, "actor", "team-42", true), (error: { status?: number; message?: string; code?: string }) => {
    assert.equal(error.status, 403);
    assert.equal(error.message, message);
    assert.equal(error.code, denialCode);
    return true;
  });
});
