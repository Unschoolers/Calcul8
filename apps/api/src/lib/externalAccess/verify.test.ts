import { beforeAll, describe, expect, it } from "vitest";
import { generateKeyPair, SignJWT } from "jose";
import type {
  ExternalAccessConfiguration,
  ExternalAuthorizationReader,
  ExternalGrant,
  ExternalScope
} from "./contracts";
import { ExternalError } from "./errors";
import { validateExternalAccessConfiguration } from "./configuration";
import { createExternalAccessService } from "./verify";
import { buildSyncScopePartitionKey } from "../scopeKeys";

const NOW = 1_800_000_000;
const ISSUER = "https://issuer.example.test/";
const REST = "https://api.example.test/api/v1";
const MCP = "https://api.example.test/mcp";
const CLIENT = "whatfees-test-client";
const GRANT_ID = "a7c84118-2b5a-41e4-9f20-5b44328c7241";
const ACCOUNT_GENERATION = "generation-1";
const SCOPES: ExternalScope[] = ["lots:read", "sales:read"];
const KID = "test-signing-key";

let privateKey: CryptoKey;
let publicKey: CryptoKey;

beforeAll(async () => {
  ({ privateKey, publicKey } = await generateKeyPair("RS256"));
});

function configuration(): ExternalAccessConfiguration {
  return validateExternalAccessConfiguration({
    issuer: ISSUER,
    jwksUri: "https://issuer.example.test/.well-known/jwks.json",
    resources: { rest: REST, mcp: MCP },
    clientIds: [CLIENT]
  });
}

function grant(overrides: Partial<ExternalGrant> = {}): ExternalGrant {
  return {
    id: GRANT_ID,
    userId: "user-123",
    accountGeneration: ACCOUNT_GENERATION,
    issuer: ISSUER,
    subject: "issuer-subject-123",
    clientId: CLIENT,
    resource: REST,
    scopes: SCOPES,
    notBefore: NOW - 60,
    expiresAt: NOW + 600,
    revokedAt: null,
    ...overrides
  };
}

function reader(options: {
  currentGrant?: ExternalGrant | null;
  active?: boolean;
  getGrant?: ExternalAuthorizationReader["getGrant"];
  isAccountActive?: ExternalAuthorizationReader["isAccountActive"];
} = {}): ExternalAuthorizationReader {
  return {
    getGrant: options.getGrant ?? (async () => options.currentGrant === undefined ? grant() : options.currentGrant),
    isAccountActive: options.isAccountActive ?? (async () => options.active ?? true)
  };
}

async function token(claims: Record<string, unknown> = {}, options: {
  key?: CryptoKey | Uint8Array;
  alg?: string;
  typ?: string;
  kid?: string;
  includeKid?: boolean;
  extraHeader?: Record<string, unknown>;
} = {}): Promise<string> {
  const { key = privateKey, alg = "RS256", typ = "at+jwt", kid = KID, includeKid = true, extraHeader = {} } = options;
  const jwt = new SignJWT({
    iss: ISSUER,
    aud: REST,
    sub: "issuer-subject-123",
    jti: "token-123",
    iat: NOW - 10,
    exp: NOW + 240,
    client_id: CLIENT,
    scope: SCOPES.join(" "),
    whatfees_grant_id: GRANT_ID,
    ...claims
  })
    .setProtectedHeader({ alg, typ, ...(includeKid ? { kid } : {}), ...extraHeader });

  return jwt.sign(key);
}

async function service(options: {
  currentGrant?: ExternalGrant | null;
  active?: boolean;
  getGrant?: ExternalAuthorizationReader["getGrant"];
  isAccountActive?: ExternalAuthorizationReader["isAccountActive"];
  now?: () => number;
} = {}) {
  return createExternalAccessService(configuration(), reader(options), {
    now: options.now ?? (() => NOW),
    getKey: async () => publicKey
  });
}

const validRequest = { expectedResource: REST, requiredScopes: ["lots:read"] as const };

describe("createExternalAccessService", () => {
  it("verifies a real signed access token and returns a frozen principal with private provenance", async () => {
    const access = await service();
    const principal = await access.validateExternalAccessToken({ bearerToken: await token(), ...validRequest });

    expect(principal).toEqual({
      userId: "user-123",
      issuer: ISSUER,
      subject: "issuer-subject-123",
      clientId: CLIENT,
      resource: REST,
      tokenId: "token-123",
      grantId: GRANT_ID,
      scopes: SCOPES,
      issuedAt: NOW - 10,
      expiresAt: NOW + 240
    });
    expect(Object.isFrozen(principal)).toBe(true);
    expect(Object.isFrozen(principal.scopes)).toBe(true);
    expect(() => access.assertExternalPrincipal(principal)).not.toThrow();
    await expect(access.revalidateExternalPrincipal({ principal, ...validRequest })).resolves.toBeUndefined();
  });

  it.each([
    ["an invalid RSA signature", async () => token({}, { key: (await generateKeyPair("RS256")).privateKey })],
    ["a non-RS256 algorithm", async () => token({}, { alg: "HS256", key: new Uint8Array(32).fill(7) })],
    ["a missing key id", async () => token({}, { includeKid: false })],
    ["an ID token type", async () => token({}, { typ: "JWT" })],
    ["a wrong issuer", async () => token({ iss: "https://other-issuer.example.test/" })],
    ["a missing expiration", async () => token({ exp: undefined })],
    ["a missing issued-at time", async () => token({ iat: undefined })],
    ["an embedded JWK", async () => token({}, { extraHeader: { jwk: { kty: "RSA" } } })],
    ["an embedded key URL", async () => token({}, { extraHeader: { jku: "https://attacker.example/jwks" } })],
    ["an embedded certificate URL", async () => token({}, { extraHeader: { x5u: "https://attacker.example/cert" } })],
    ["an unknown client", async () => token({ client_id: "unregistered-client" })],
    ["an azp-only token", async () => token({ client_id: undefined, azp: CLIENT })],
    ["a missing subject", async () => token({ sub: undefined })],
    ["a missing token id", async () => token({ jti: undefined })],
    ["a missing grant binding", async () => token({ whatfees_grant_id: undefined })],
    ["a malformed grant binding", async () => token({ whatfees_grant_id: "not-a-uuid" })],
    ["duplicate scopes", async () => token({ scope: "lots:read lots:read" })],
    ["a write scope", async () => token({ scope: "lots:read lots:write" })],
    ["an unknown scope", async () => token({ scope: "lots:read admin:all" })]
  ])("rejects %s as an invalid token", async (_name, makeToken) => {
    const access = await service();
    await expect(access.validateExternalAccessToken({ bearerToken: await makeToken(), ...validRequest }))
      .rejects.toMatchObject({ code: "invalid_token" });
  });

  it("rejects a token with a multi-audience claim", async () => {
    const access = await service();
    const signed = await new SignJWT({ client_id: CLIENT, scope: SCOPES.join(" "), whatfees_grant_id: GRANT_ID })
      .setProtectedHeader({ alg: "RS256", typ: "at+jwt", kid: KID })
      .setIssuer(ISSUER).setAudience([REST, MCP]).setSubject("issuer-subject-123")
      .setJti("token-123").setIssuedAt(NOW - 10).setExpirationTime(NOW + 240).sign(privateKey);
    await expect(access.validateExternalAccessToken({ bearerToken: signed, ...validRequest }))
      .rejects.toMatchObject({ code: "invalid_token" });
  });

  it("accepts the RFC 9068 application/at+jwt type and singleton audience array", async () => {
    const access = await service();
    const signed = await new SignJWT({
      iss: ISSUER, aud: [REST], sub: "issuer-subject-123", jti: "token-123",
      iat: NOW - 10, exp: NOW + 240, client_id: CLIENT,
      scope: SCOPES.join(" "), whatfees_grant_id: GRANT_ID
    }).setProtectedHeader({ alg: "RS256", typ: "application/at+jwt", kid: KID }).sign(privateKey);
    await expect(access.validateExternalAccessToken({ bearerToken: signed, ...validRequest }))
      .resolves.toMatchObject({ resource: REST, subject: "issuer-subject-123" });
  });

  it("rejects tokens intended for another resource and insufficient scopes", async () => {
    const access = await service();
    const signed = await new SignJWT({ client_id: CLIENT, scope: SCOPES.join(" "), whatfees_grant_id: GRANT_ID })
      .setProtectedHeader({ alg: "RS256", typ: "at+jwt", kid: KID })
      .setIssuer(ISSUER).setAudience(MCP).setSubject("issuer-subject-123")
      .setJti("token-123").setIssuedAt(NOW - 10).setExpirationTime(NOW + 240).sign(privateKey);
    await expect(access.validateExternalAccessToken({ bearerToken: signed, ...validRequest }))
      .rejects.toMatchObject({ code: "invalid_token" });
    await expect(access.validateExternalAccessToken({
      bearerToken: await token(), expectedResource: REST, requiredScopes: ["account:read"]
    })).rejects.toMatchObject({ code: "insufficient_scope" });
  });

  it("checks the configured maximum token lifetime and future issue time", async () => {
    const access = await service();
    await expect(access.validateExternalAccessToken({
      bearerToken: await token({ exp: NOW + 301 }), ...validRequest
    })).rejects.toMatchObject({ code: "invalid_token" });
    await expect(access.validateExternalAccessToken({
      bearerToken: await token({ iat: NOW + 31 }), ...validRequest
    })).rejects.toMatchObject({ code: "invalid_token" });
  });

  it("validates nbf against the injected clock", async () => {
    const access = await service();
    await expect(access.validateExternalAccessToken({
      bearerToken: await token({ nbf: NOW + 10 }), ...validRequest
    })).resolves.toMatchObject({ subject: "issuer-subject-123" });
  });

  it("rejects a not-before time at or after token expiration even within clock tolerance", async () => {
    const access = await service();
    await expect(access.validateExternalAccessToken({
      bearerToken: await token({ nbf: NOW + 20, exp: NOW + 1 }), ...validRequest
    })).rejects.toMatchObject({ code: "invalid_token" });
  });

  it.each([
    ["a missing grant", null],
    ["a revoked grant", grant({ revokedAt: NOW - 1 })],
    ["an expired grant", grant({ expiresAt: NOW })],
    ["a grant for another subject", grant({ subject: "someone-else" })],
    ["a grant for another client", grant({ clientId: "other-client" })],
    ["a grant for another resource", grant({ resource: MCP })],
    ["a grant missing token scope", grant({ scopes: ["sales:read"] })],
    ["a grant that began after token issue", grant({ notBefore: NOW + 1 })],
    ["a different grant generation", grant({ id: "a7c84118-2b5a-41e4-9f20-5b44328c7242" })]
  ])("denies %s", async (_name, currentGrant) => {
    const access = await service({ currentGrant });
    await expect(access.validateExternalAccessToken({ bearerToken: await token(), ...validRequest }))
      .rejects.toMatchObject({ code: "invalid_token" });
  });

  it.each([
    ["workspace partition", buildSyncScopePartitionKey("workspace", "team-42")],
    ["leading and trailing spaces", " victim "],
    ["leading space", " victim"],
    ["trailing space", "victim "],
    ["embedded space", "vict im"]
  ])("rejects a grant with %s as local user ID before account lookup", async (_label, userId) => {
    expect(userId).toBeTruthy();
    let accountReads = 0;
    const access = await service({
      currentGrant: grant({ userId: userId! }),
      isAccountActive: async () => { accountReads += 1; return true; }
    });
    await expect(access.validateExternalAccessToken({ bearerToken: await token(), ...validRequest }))
      .rejects.toMatchObject({ code: "invalid_token", status: 401 });
    expect(accountReads).toBe(0);
  });

  it("requires a strictly active account generation", async () => {
    const access = await service({ active: false });
    await expect(access.validateExternalAccessToken({ bearerToken: await token(), ...validRequest }))
      .rejects.toMatchObject({ code: "invalid_token" });
  });

  it("uses the earlier of token and grant expiry as the principal boundary", async () => {
    const access = await service({ currentGrant: grant({ expiresAt: NOW + 100 }) });
    const principal = await access.validateExternalAccessToken({ bearerToken: await token(), ...validRequest });
    expect(principal.expiresAt).toBe(NOW + 100);
    await expect(access.revalidateExternalPrincipal({ principal, ...validRequest })).resolves.toBeUndefined();
  });

  it("treats account-reader failures as a fixed availability error", async () => {
    const access = await service({
      isAccountActive: async () => { throw new Error("private account lookup detail"); }
    });
    await expect(access.validateExternalAccessToken({ bearerToken: await token(), ...validRequest }))
      .rejects.toMatchObject({ code: "temporarily_unavailable", message: "The service is temporarily unavailable." });
  });

  it("maps storage failures to a fixed temporarily unavailable error", async () => {
    const access = await service({ getGrant: async () => { throw new Error("cosmos secret detail"); } });
    await expect(access.validateExternalAccessToken({ bearerToken: await token(), ...validRequest }))
      .rejects.toMatchObject({ code: "temporarily_unavailable", message: "The service is temporarily unavailable." });
  });

  it("rejects fabricated and cloned principals at authority boundaries", async () => {
    const access = await service();
    const principal = await access.validateExternalAccessToken({ bearerToken: await token(), ...validRequest });
    const clone = { ...principal };
    expect(() => access.assertExternalPrincipal(clone)).toThrow(ExternalError);
    await expect(access.revalidateExternalPrincipal({ principal: clone, ...validRequest }))
      .rejects.toMatchObject({ code: "invalid_token" });
  });

  it("returns insufficient_scope when revalidation requires a scope absent from the principal", async () => {
    const access = await service();
    const principal = await access.validateExternalAccessToken({
      bearerToken: await token({ scope: "lots:read" }),
      expectedResource: REST,
      requiredScopes: ["lots:read"]
    });
    await expect(access.revalidateExternalPrincipal({
      principal,
      expectedResource: REST,
      requiredScopes: ["sales:read"]
    })).rejects.toMatchObject({ code: "insufficient_scope", status: 403 });
  });

  it("rechecks revocation on the same service that issued the principal", async () => {
    let currentGrant = grant();
    const access = await service({ getGrant: async () => currentGrant });
    const principal = await access.validateExternalAccessToken({ bearerToken: await token(), ...validRequest });
    currentGrant = grant({ revokedAt: NOW });
    await expect(access.revalidateExternalPrincipal({ principal, ...validRequest }))
      .rejects.toMatchObject({ code: "invalid_token" });
  });

  it("rejects a principal that expires while account status is being read", async () => {
    let clock = NOW;
    let advanceClock = false;
    const access = await service({
      now: () => clock,
      isAccountActive: async () => { if (advanceClock) clock = NOW + 241; return true; }
    });
    const principal = await access.validateExternalAccessToken({ bearerToken: await token(), ...validRequest });
    advanceClock = true;
    await expect(access.revalidateExternalPrincipal({ principal, ...validRequest }))
      .rejects.toMatchObject({ code: "invalid_token" });
  });

  it("performs fresh grant reads on every validation", async () => {
    let reads = 0;
    const access = await service({ getGrant: async () => { reads += 1; return grant(); } });
    const signed = await token();
    await access.validateExternalAccessToken({ bearerToken: signed, ...validRequest });
    await access.validateExternalAccessToken({ bearerToken: signed, ...validRequest });
    expect(reads).toBe(2);
  });

  it("fails closed for invalid resource and required scope input", async () => {
    const access = await service();
    const signed = await token();
    await expect(access.validateExternalAccessToken({ bearerToken: signed, expectedResource: "https://evil.test", requiredScopes: [] }))
      .rejects.toMatchObject({ code: "invalid_request" });
    await expect(access.validateExternalAccessToken({ bearerToken: signed, expectedResource: REST, requiredScopes: ["lots:write" as ExternalScope] }))
      .rejects.toMatchObject({ code: "invalid_request" });
  });
});
