import { describe, expect, it, vi } from "vitest";
import type {
  ExternalPrincipal,
  ExternalPrincipalAuthority,
  ExternalScope
} from "./contracts";
import { ExternalError } from "./errors";
import { createExternalScopeService } from "./scope";

const principal = (overrides: Partial<ExternalPrincipal> = {}): ExternalPrincipal => ({
  userId: " user-7 ",
  issuer: "https://issuer.example",
  subject: "subject-7",
  clientId: "client-7",
  resource: "https://api.example",
  tokenId: "token-7",
  grantId: "grant-7",
  scopes: ["lots:read"],
  issuedAt: 100,
  expiresAt: 200,
  ...overrides
});

function setup(options: {
  member?: boolean;
  assertError?: Error;
  revalidateError?: Error;
  afterMembership?: () => void;
} = {}) {
  const authority: ExternalPrincipalAuthority = {
    assertExternalPrincipal: vi.fn((candidate: ExternalPrincipal) => {
      if (options.assertError) throw options.assertError;
      if (candidate.userId !== " user-7 ") throw new ExternalError("invalid_token");
    }),
    revalidateExternalPrincipal: vi.fn(async () => {
      if (options.revalidateError) throw options.revalidateError;
    })
  };
  const hasWorkspaceMembership = vi.fn(async () => {
    options.afterMembership?.();
    return options.member ?? true;
  });
  return {
    authority,
    hasWorkspaceMembership,
    options,
    service: createExternalScopeService({ ...authority, hasWorkspaceMembership })
  };
}

describe("external OAuth scope provenance and final authorization", () => {
  it("issues frozen canonical personal and workspace scopes after authority and membership checks", async () => {
    const { service, authority, hasWorkspaceMembership } = setup();
    const actor = principal();

    const personal = await service.resolveExternalScope({ principal: actor });
    expect(personal).toEqual({
      actorUserId: "user-7",
      requestedWorkspaceId: undefined,
      scopeType: "user",
      scopeId: "user-7",
      partitionKey: "user-7",
      workspaceScopeEnabled: true
    });
    expect(Object.isFrozen(personal)).toBe(true);

    const workspace = await service.resolveExternalScope({ principal: actor, workspaceId: " team-42 " });
    expect(workspace).toEqual({
      actorUserId: "user-7",
      requestedWorkspaceId: "team-42",
      scopeType: "workspace",
      scopeId: "team-42",
      partitionKey: "ws:team-42",
      workspaceScopeEnabled: true
    });
    expect(Object.isFrozen(workspace)).toBe(true);
    expect(authority.assertExternalPrincipal).toHaveBeenCalledTimes(3);
    expect(hasWorkspaceMembership).toHaveBeenCalledWith("user-7", "team-42");
    expect(hasWorkspaceMembership).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed workspace IDs using the centralized parser", async () => {
    const { service, hasWorkspaceMembership } = setup();
    await expect(service.resolveExternalScope({ principal: principal(), workspaceId: "bad/tenant" }))
      .rejects.toMatchObject({ code: "invalid_request", status: 400 });
    expect(hasWorkspaceMembership).not.toHaveBeenCalled();
  });

  it("rechecks principal authority after workspace membership awaits at entry", async () => {
    const options: { assertError?: Error; afterMembership?: () => void } = {};
    options.afterMembership = () => {
      options.assertError = new ExternalError("invalid_token");
    };
    const { service, authority } = setup(options);

    await expect(service.resolveExternalScope({ principal: principal(), workspaceId: "team-42" }))
      .rejects.toMatchObject({ code: "invalid_token", status: 401 });
    expect(authority.assertExternalPrincipal).toHaveBeenCalledTimes(2);
  });

  it("denies nonmembers and maps membership storage errors to safe 503 errors", async () => {
    const nonmember = setup({ member: false });
    await expect(nonmember.service.resolveExternalScope({ principal: principal(), workspaceId: "team-42" }))
      .rejects.toMatchObject({ code: "forbidden", status: 403 });

    const storage = setup();
    storage.hasWorkspaceMembership.mockRejectedValueOnce(new Error("private database detail"));
    await expect(storage.service.resolveExternalScope({ principal: principal(), workspaceId: "team-42" }))
      .rejects.toMatchObject({ code: "temporarily_unavailable", status: 503, message: "The service is temporarily unavailable." });
  });

  it("rejects absent, foreign, or invalid principals before scope resolution", async () => {
    const { service, authority, hasWorkspaceMembership } = setup();
    await expect(service.resolveExternalScope({ principal: principal({ userId: "other-user" }) }))
      .rejects.toMatchObject({ code: "invalid_token", status: 401 });
    await expect(service.resolveExternalScope({ principal: undefined as never }))
      .rejects.toMatchObject({ code: "authentication_required", status: 401 });
    expect(authority.assertExternalPrincipal).toHaveBeenCalledTimes(1);
    expect(hasWorkspaceMembership).not.toHaveBeenCalled();
  });

  it("preserves fixed authority errors and translates known legacy HTTP errors", async () => {
    const invalid = setup({ assertError: new ExternalError("invalid_token") });
    await expect(invalid.service.resolveExternalScope({ principal: principal() }))
      .rejects.toMatchObject({ code: "invalid_token", status: 401 });

    const denied = setup({ assertError: Object.assign(new Error("sensitive message"), { status: 403 }) });
    await expect(denied.service.resolveExternalScope({ principal: principal() }))
      .rejects.toMatchObject({ code: "forbidden", status: 403, message: "Access is forbidden." });
  });

  it("requires the exact issued scope and principal at the final boundary", async () => {
    const { service, authority } = setup();
    const actor = principal();
    const scope = await service.resolveExternalScope({ principal: actor, workspaceId: "team-42" });
    const finalInput = {
      principal: actor,
      scope,
      expectedResource: "https://api.example/mcp",
      requiredScopes: ["lots:read"] as readonly ExternalScope[]
    };

    await expect(service.revalidateExternalAccess({ ...finalInput, scope: { ...scope } }))
      .rejects.toMatchObject({ code: "invalid_token", status: 401 });
    await expect(service.revalidateExternalAccess({ ...finalInput, principal: principal() }))
      .rejects.toMatchObject({ code: "invalid_token", status: 401 });
    const changed = { ...scope, partitionKey: "workspace:other-team" };
    await expect(service.revalidateExternalAccess({ ...finalInput, scope: changed }))
      .rejects.toMatchObject({ code: "invalid_token", status: 401 });
    expect(authority.revalidateExternalPrincipal).not.toHaveBeenCalled();
  });

  it("revalidates resource and scopes, rechecks membership, then checks principal expiry", async () => {
    const { service, authority, hasWorkspaceMembership } = setup();
    const actor = principal();
    const scope = await service.resolveExternalScope({ principal: actor, workspaceId: "team-42" });
    const requiredScopes: readonly ExternalScope[] = ["lots:read", "sales:read"];
    await service.revalidateExternalAccess({
      principal: actor,
      scope,
      expectedResource: "https://api.example/mcp",
      requiredScopes
    });

    expect(authority.revalidateExternalPrincipal).toHaveBeenCalledWith({
      principal: actor,
      expectedResource: "https://api.example/mcp",
      requiredScopes
    });
    expect(hasWorkspaceMembership).toHaveBeenCalledTimes(2);
    expect(authority.assertExternalPrincipal).toHaveBeenCalledTimes(3);
  });

  it("denies membership removed after scope resolution", async () => {
    const { service, hasWorkspaceMembership, authority } = setup();
    const actor = principal();
    const scope = await service.resolveExternalScope({ principal: actor, workspaceId: "team-42" });
    hasWorkspaceMembership.mockResolvedValueOnce(false);

    await expect(service.revalidateExternalAccess({
      principal: actor,
      scope,
      expectedResource: "https://api.example",
      requiredScopes: ["lots:read"]
    })).rejects.toMatchObject({ code: "forbidden", status: 403 });
    expect(authority.assertExternalPrincipal).toHaveBeenCalledTimes(2);
  });

  it("fails closed on stale grants, expiry crossing, and final authority or membership storage errors", async () => {
    const stale = setup({ revalidateError: new ExternalError("invalid_token") });
    const staleActor = principal();
    const staleScope = await stale.service.resolveExternalScope({ principal: staleActor });
    await expect(stale.service.revalidateExternalAccess({
      principal: staleActor,
      scope: staleScope,
      expectedResource: "https://api.example",
      requiredScopes: ["lots:read"]
    })).rejects.toMatchObject({ code: "invalid_token", status: 401 });

    const expired = setup();
    const expiredActor = principal();
    const expiredScope = await expired.service.resolveExternalScope({ principal: expiredActor });
    expired.options.assertError = new ExternalError("invalid_token");
    await expect(expired.service.revalidateExternalAccess({
      principal: expiredActor,
      scope: expiredScope,
      expectedResource: "https://api.example",
      requiredScopes: ["lots:read"]
    })).rejects.toMatchObject({ code: "invalid_token", status: 401 });
    expect(expired.authority.revalidateExternalPrincipal).toHaveBeenCalledTimes(1);

    const storage = setup();
    const storageActor = principal();
    const storageScope = await storage.service.resolveExternalScope({ principal: storageActor, workspaceId: "team-42" });
    storage.hasWorkspaceMembership.mockRejectedValueOnce(new Error("membership reader detail"));
    await expect(storage.service.revalidateExternalAccess({
      principal: storageActor,
      scope: storageScope,
      expectedResource: "https://api.example",
      requiredScopes: ["lots:read"]
    })).rejects.toMatchObject({ code: "temporarily_unavailable", status: 503 });
    expect(storage.authority.assertExternalPrincipal).toHaveBeenCalledTimes(2);

    const readerFailure = setup({ revalidateError: new Error("grant reader detail") });
    const readerActor = principal();
    const readerScope = await readerFailure.service.resolveExternalScope({ principal: readerActor });
    await expect(readerFailure.service.revalidateExternalAccess({
      principal: readerActor,
      scope: readerScope,
      expectedResource: "https://api.example",
      requiredScopes: ["lots:read"]
    })).rejects.toMatchObject({ code: "temporarily_unavailable", status: 503 });
  });

  it("returns a frozen service object and rejects an incomplete authority", () => {
    const { service } = setup();
    expect(Object.isFrozen(service)).toBe(true);
    expect(() => createExternalScopeService({
      assertExternalPrincipal: () => undefined,
      revalidateExternalPrincipal: async () => undefined,
      hasWorkspaceMembership: undefined as never
    })).toThrow();
  });
});
