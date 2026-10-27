import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { before, test } from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";

const require = createRequire(import.meta.url);
const { createExternalAccessService } = require("../../dist/lib/externalAccess/verify.js");
const { createExternalScopeService } = require("../../dist/lib/externalAccess/scope.js");
const { ExternalError } = require("../../dist/lib/externalAccess/errors.js");

const NOW = 2_000_000_000;
const GRANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "local-user-a";
const WORKSPACE_ID = "workspace-a";
const READ_SCOPES = ["account:read", "workspaces:read"];
const configuration = Object.freeze({
  issuer: "https://issuer.example.test/",
  jwksUri: "https://issuer.example.test/jwks",
  resources: Object.freeze({
    rest: "https://api.example.test/api/v1",
    mcp: "https://api.example.test/api/mcp"
  }),
  clientIds: Object.freeze(["test-client"])
});
let privateKey;
let getKey;

before(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const publicJwk = await exportJWK(pair.publicKey);
  getKey = createLocalJWKSet({ keys: [{ ...publicJwk, kid: "oracle-key", alg: "RS256", use: "sig" }] });
});

async function signedToken(overrides = {}) {
  return new SignJWT({
    iss: configuration.issuer,
    sub: "issuer-subject-a",
    aud: configuration.resources.rest,
    client_id: "test-client",
    jti: "oracle-token-a",
    whatfees_grant_id: GRANT_ID,
    scope: READ_SCOPES.join(" "),
    iat: NOW - 5,
    exp: NOW + 120,
    ...overrides
  }).setProtectedHeader({ alg: "RS256", typ: "at+jwt", kid: "oracle-key" }).sign(privateKey);
}

async function fixture() {
  const state = {
    now: NOW,
    active: true,
    member: true,
    grantReads: 0,
    accountReads: 0,
    membershipReads: 0,
    onGrant: undefined,
    onAccount: undefined,
    onMembership: undefined,
    grant: {
      id: GRANT_ID,
      userId: USER_ID,
      accountGeneration: "account-generation-a",
      issuer: configuration.issuer,
      subject: "issuer-subject-a",
      clientId: "test-client",
      resource: configuration.resources.rest,
      scopes: [...READ_SCOPES],
      notBefore: NOW - 10,
      expiresAt: NOW + 180,
      revokedAt: null
    }
  };
  const authority = await createExternalAccessService(configuration, {
    async getGrant(id) {
      assert.equal(id, GRANT_ID);
      state.grantReads += 1;
      await state.onGrant?.();
      return state.grant;
    },
    async isAccountActive(userId, generation) {
      assert.equal(userId, USER_ID);
      assert.equal(generation, "account-generation-a");
      state.accountReads += 1;
      await state.onAccount?.();
      return state.active;
    }
  }, { now: () => state.now, getKey });
  const scopes = createExternalScopeService({
    assertExternalPrincipal: authority.assertExternalPrincipal.bind(authority),
    revalidateExternalPrincipal: authority.revalidateExternalPrincipal.bind(authority),
    async hasWorkspaceMembership(userId, workspaceId) {
      assert.equal(userId, USER_ID);
      assert.equal(workspaceId, WORKSPACE_ID);
      state.membershipReads += 1;
      await state.onMembership?.();
      return state.member;
    }
  });
  const validate = (bearerToken) => authority.validateExternalAccessToken({
    bearerToken, expectedResource: configuration.resources.rest, requiredScopes: ["account:read"]
  });
  const final = (principal, scope, overrides = {}) => scopes.revalidateExternalAccess({
    principal, scope, expectedResource: configuration.resources.rest,
    requiredScopes: ["account:read"], ...overrides
  });
  return { state, authority, scopes, validate, final };
}

function fixedFailure(error, code, status) {
  assert.ok(error instanceof ExternalError);
  assert.equal(error.name, "ExternalError");
  assert.equal(error.code, code);
  assert.equal(error.status, status);
  assert.equal("cause" in error, false);
  assert.equal("details" in error, false);
  return true;
}

const invalidToken = (error) => fixedFailure(error, "invalid_token", 401);

test("real signed principal resolves only its own personal partition and revalidates freshly", async () => {
  const f = await fixture();
  const principal = await f.validate(await signedToken());
  assert.equal(principal.userId, USER_ID);
  assert.equal(principal.resource, configuration.resources.rest);
  assert.equal(principal.clientId, "test-client");
  assert.equal(principal.grantId, GRANT_ID);
  assert.equal(principal.expiresAt, NOW + 120);
  assert.deepEqual(principal.scopes, READ_SCOPES);
  assert.ok(Object.isFrozen(principal));
  assert.ok(Object.isFrozen(principal.scopes));
  const scope = await f.scopes.resolveExternalScope({ principal });
  assert.equal(scope.actorUserId, USER_ID);
  assert.equal(scope.scopeType, "user");
  assert.equal(scope.scopeId, USER_ID);
  assert.equal(scope.partitionKey, USER_ID);
  assert.ok(Object.isFrozen(scope));
  const beforeReads = [f.state.grantReads, f.state.accountReads];
  await f.final(principal, scope);
  assert.ok(f.state.grantReads > beforeReads[0]);
  assert.ok(f.state.accountReads > beforeReads[1]);
});

test("workspace membership is checked at entry and at the final boundary", async () => {
  const f = await fixture();
  const principal = await f.validate(await signedToken());
  const scope = await f.scopes.resolveExternalScope({ principal, workspaceId: WORKSPACE_ID });
  assert.equal(scope.scopeType, "workspace");
  assert.equal(scope.scopeId, WORKSPACE_ID);
  assert.equal(scope.partitionKey, `ws:${WORKSPACE_ID}`);
  assert.ok(Object.isFrozen(scope));
  assert.equal(f.state.membershipReads, 1);
  await f.final(principal, scope);
  assert.equal(f.state.membershipReads, 2);
  f.state.member = false;
  await assert.rejects(f.final(principal, scope), (error) => fixedFailure(error, "forbidden", 403));
  assert.equal(f.state.membershipReads, 3);
});

test("cloned, fabricated and foreign principals or scopes never acquire authority", async () => {
  const f = await fixture();
  const principal = await f.validate(await signedToken());
  const scope = await f.scopes.resolveExternalScope({ principal });
  for (const forged of [{ ...principal }, { ...principal, userId: "other-user" }]) {
    assert.throws(() => f.authority.assertExternalPrincipal(forged), invalidToken);
    await assert.rejects(f.scopes.resolveExternalScope({ principal: forged }), invalidToken);
    await assert.rejects(f.final(forged, scope), invalidToken);
  }
  for (const forged of [{ ...scope }, { ...scope, partitionKey: "other-user" }]) {
    await assert.rejects(f.final(principal, forged), invalidToken);
  }
  const secondPrincipal = await f.validate(await signedToken({ jti: "oracle-token-b" }));
  await assert.rejects(f.final(secondPrincipal, scope), invalidToken);
  const other = await fixture();
  assert.throws(() => other.authority.assertExternalPrincipal(principal), invalidToken);
  await assert.rejects(other.scopes.resolveExternalScope({ principal }), invalidToken);
  await assert.rejects(other.final(principal, scope), invalidToken);
});

test("real RSA verification and distinct REST/MCP audiences remain mandatory", async () => {
  const f = await fixture();
  const token = await signedToken();
  const parts = token.split(".");
  parts[2] = `${parts[2][0] === "A" ? "B" : "A"}${parts[2].slice(1)}`;
  await assert.rejects(f.validate(parts.join(".")), invalidToken);
  await assert.rejects(f.validate(await signedToken({ aud: configuration.resources.mcp })), invalidToken);
  await assert.rejects(f.validate(await signedToken({ aud: [configuration.resources.rest, configuration.resources.mcp] })), invalidToken);
  const principal = await f.validate(token);
  const scope = await f.scopes.resolveExternalScope({ principal });
  await assert.rejects(f.final(principal, scope, { expectedResource: configuration.resources.mcp }), invalidToken);
});

test("revoked grants and deleted accounts deny a previously issued principal freshly", async () => {
  for (const mode of ["revoked", "deleted"]) {
    const f = await fixture();
    const principal = await f.validate(await signedToken());
    const scope = await f.scopes.resolveExternalScope({ principal });
    if (mode === "revoked") f.state.grant = { ...f.state.grant, revokedAt: NOW };
    else f.state.active = false;
    await assert.rejects(f.final(principal, scope), invalidToken);
    await assert.rejects(f.validate(await signedToken()), invalidToken);
  }
});

test("final boundary enforces required scopes and the shorter local grant lifetime", async () => {
  const f = await fixture();
  f.state.grant.expiresAt = NOW + 30;
  const principal = await f.validate(await signedToken());
  assert.equal(principal.expiresAt, NOW + 30);
  const scope = await f.scopes.resolveExternalScope({ principal });
  await assert.rejects(f.final(principal, scope, { requiredScopes: ["pricing:calculate"] }),
    (error) => fixedFailure(error, "insufficient_scope", 403));
  f.state.now = NOW + 30;
  await assert.rejects(f.final(principal, scope), invalidToken);
});

test("authority storage and membership failures close the boundary with fixed errors", async () => {
  const f = await fixture();
  const principal = await f.validate(await signedToken());
  const scope = await f.scopes.resolveExternalScope({ principal, workspaceId: WORKSPACE_ID });
  const fail = async () => { throw new Error("private-storage-detail"); };
  f.state.onGrant = fail;
  await assert.rejects(f.final(principal, scope), (error) => fixedFailure(error, "temporarily_unavailable", 503));
  f.state.onGrant = undefined;
  f.state.onMembership = fail;
  await assert.rejects(f.final(principal, scope), (error) => {
    fixedFailure(error, "temporarily_unavailable", 503);
    assert.equal(JSON.stringify(error).includes("private-storage-detail"), false);
    return true;
  });
});

test("expiry is rechecked after asynchronous grant/account authority reads", async () => {
  for (const stage of ["onGrant", "onAccount"]) {
    const f = await fixture();
    f.state[stage] = async () => { f.state.now = NOW + 120; };
    await assert.rejects(f.validate(await signedToken()), invalidToken);
    f.state[stage] = undefined;
    f.state.now = NOW;
    const principal = await f.validate(await signedToken());
    const scope = await f.scopes.resolveExternalScope({ principal });
    f.state[stage] = async () => { f.state.now = NOW + 120; };
    await assert.rejects(f.final(principal, scope), invalidToken);
  }
});

test("expiry crossing workspace membership await denies entry and final return", async () => {
  const f = await fixture();
  const principal = await f.validate(await signedToken());
  f.state.onMembership = async () => { f.state.now = NOW + 120; };
  await assert.rejects(f.scopes.resolveExternalScope({ principal, workspaceId: WORKSPACE_ID }), invalidToken);
  f.state.now = NOW;
  f.state.onMembership = undefined;
  const scope = await f.scopes.resolveExternalScope({ principal, workspaceId: WORKSPACE_ID });
  f.state.onMembership = async () => { f.state.now = NOW + 120; };
  await assert.rejects(f.final(principal, scope), invalidToken);
});
