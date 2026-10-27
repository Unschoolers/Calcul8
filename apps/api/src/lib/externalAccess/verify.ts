import type { JWTVerifyGetKey } from "jose";
import type {
  ExternalAccessConfiguration,
  ExternalAccessService,
  ExternalAuthorizationReader,
  ExternalGrant,
  ExternalPrincipal,
  ExternalScope,
  RevalidateExternalPrincipalInput,
  ValidateExternalAccessTokenInput
} from "./contracts";
import { EXTERNAL_READ_SCOPES } from "./contracts";
import { ExternalError } from "./errors";
import { validateExternalAccessConfiguration } from "./configuration";

const MAX_TOKEN_BYTES = 8192;
const MAX_CLAIM_STRING_LENGTH = 256;
const MAX_TOKEN_TTL_SECONDS = 300;
const CLOCK_TOLERANCE_SECONDS = 30;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPE_SET = new Set<string>(EXTERNAL_READ_SCOPES);

interface VerifyOptions {
  readonly now?: () => number;
  readonly getKey?: JWTVerifyGetKey;
}

interface GrantSnapshot {
  readonly id: string;
  readonly userId: string;
  readonly accountGeneration: string;
  readonly issuer: string;
  readonly subject: string;
  readonly clientId: string;
  readonly resource: string;
  readonly scopes: readonly ExternalScope[];
  readonly notBefore: number;
  readonly expiresAt: number;
  readonly revokedAt: null;
}

interface PrincipalProvenance {
  readonly grant: GrantSnapshot;
}

function invalidToken(): never {
  throw new ExternalError("invalid_token");
}

function invalidRequest(): never {
  throw new ExternalError("invalid_request");
}

function unavailable(): never {
  throw new ExternalError("temporarily_unavailable");
}

function isBoundedString(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= MAX_CLAIM_STRING_LENGTH
    && !/[\u0000-\u001f\u007f]/.test(value);
}

// Personal partitions use the local account ID verbatim; workspace partitions reserve ws:.
function isLocalUserId(value: unknown): value is string {
  return isBoundedString(value) && /^[A-Za-z0-9._:@-]+$/.test(value) && !value.startsWith("ws:");
}

function isEpochSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function currentEpochSeconds(now: () => number): number {
  const value = now();
  if (!isEpochSeconds(value)) invalidToken();
  return value;
}

function isExternalScope(value: unknown): value is ExternalScope {
  return typeof value === "string" && SCOPE_SET.has(value);
}

function parseScopes(value: unknown): readonly ExternalScope[] | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024) return null;
  const values = value.split(" ");
  if (values.some((scope) => !isExternalScope(scope))) return null;
  if (new Set(values).size !== values.length) return null;
  return Object.freeze(values as ExternalScope[]);
}

function parseRequestedScopes(value: readonly ExternalScope[]): readonly ExternalScope[] {
  if (!Array.isArray(value) || value.length === 0) invalidRequest();
  const copy = [...value];
  if (copy.some((scope) => !isExternalScope(scope)) || new Set(copy).size !== copy.length) invalidRequest();
  return copy;
}

function matchesSet<T extends string>(subset: readonly T[], superset: readonly T[]): boolean {
  const available = new Set(superset);
  return subset.every((scope) => available.has(scope));
}

function snapshotGrant(value: unknown): GrantSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const grant = value as Partial<ExternalGrant>;
  const scopes = Array.isArray(grant.scopes) ? [...grant.scopes] : null;
  if (!scopes || scopes.length === 0 || scopes.some((scope) => !isExternalScope(scope))
    || new Set(scopes).size !== scopes.length
    || !isBoundedString(grant.id) || !UUID_V4.test(grant.id) || grant.id !== grant.id.toLowerCase()
    || !isLocalUserId(grant.userId) || !isBoundedString(grant.accountGeneration)
    || !isBoundedString(grant.issuer) || !isBoundedString(grant.subject)
    || !isBoundedString(grant.clientId) || !isBoundedString(grant.resource)
    || !isEpochSeconds(grant.notBefore) || !isEpochSeconds(grant.expiresAt)
    || grant.expiresAt <= grant.notBefore || grant.revokedAt !== null) return null;

  return Object.freeze({
    id: grant.id,
    userId: grant.userId,
    accountGeneration: grant.accountGeneration,
    issuer: grant.issuer,
    subject: grant.subject,
    clientId: grant.clientId,
    resource: grant.resource,
    scopes: Object.freeze(scopes as ExternalScope[]),
    notBefore: grant.notBefore,
    expiresAt: grant.expiresAt,
    revokedAt: null
  });
}

function grantMatchesToken(
  grant: GrantSnapshot,
  claims: { issuer: string; subject: string; clientId: string; resource: string; grantId: string; scopes: readonly ExternalScope[]; issuedAt: number },
  now: number
): boolean {
  return grant.id === claims.grantId
    && grant.issuer === claims.issuer
    && grant.subject === claims.subject
    && grant.clientId === claims.clientId
    && grant.resource === claims.resource
    && matchesSet(claims.scopes, grant.scopes)
    && grant.notBefore <= now
    && now < grant.expiresAt
    && claims.issuedAt >= grant.notBefore;
}

function sameGrantLifecycle(left: GrantSnapshot, right: GrantSnapshot): boolean {
  return left.id === right.id
    && left.userId === right.userId
    && left.accountGeneration === right.accountGeneration
    && left.issuer === right.issuer
    && left.subject === right.subject
    && left.clientId === right.clientId
    && left.resource === right.resource
    && left.notBefore === right.notBefore
    && left.expiresAt === right.expiresAt
    && left.revokedAt === right.revokedAt
    && left.scopes.length === right.scopes.length
    && left.scopes.every((scope) => right.scopes.includes(scope));
}

function validateRequestedAuthority(
  configuration: ExternalAccessConfiguration,
  expectedResource: string,
  requiredScopes: readonly ExternalScope[]
): readonly ExternalScope[] {
  if (typeof expectedResource !== "string"
    || !Object.values(configuration.resources).includes(expectedResource)) invalidRequest();
  return parseRequestedScopes(requiredScopes);
}

function requirePrincipalProvenance(
  principal: ExternalPrincipal,
  provenance: WeakMap<object, PrincipalProvenance>,
  now: () => number
): PrincipalProvenance {
  if (!principal || typeof principal !== "object") invalidToken();
  const source = provenance.get(principal);
  if (!source || !Object.isFrozen(principal) || !Object.isFrozen(principal.scopes)
    || currentEpochSeconds(now) >= principal.expiresAt) invalidToken();
  return source;
}

export async function createExternalAccessService(
  inputConfiguration: ExternalAccessConfiguration,
  reader: ExternalAuthorizationReader,
  options: VerifyOptions = {}
): Promise<ExternalAccessService> {
  const configuration = validateExternalAccessConfiguration(inputConfiguration);
  const now = options.now ?? (() => Date.now() / 1000);
  const provenance = new WeakMap<object, PrincipalProvenance>();
  const jose = await import("jose");
  let remoteResolver: JWTVerifyGetKey | undefined;
  if (!options.getKey) {
    remoteResolver = jose.createRemoteJWKSet(new URL(configuration.jwksUri), {
      timeoutDuration: 5000,
      cooldownDuration: 30_000,
      cacheMaxAge: 600_000
    });
  }
  const keyResolver = options.getKey ?? remoteResolver!;

  async function readGrant(grantId: string): Promise<GrantSnapshot> {
    let loaded: ExternalGrant | null;
    try {
      loaded = await reader.getGrant(grantId);
    } catch {
      unavailable();
    }
    const snapshot = snapshotGrant(loaded);
    if (!snapshot) invalidToken();
    return snapshot;
  }

  async function requireActiveAccount(grant: GrantSnapshot): Promise<void> {
    let active: boolean;
    try {
      active = await reader.isAccountActive(grant.userId, grant.accountGeneration);
    } catch {
      unavailable();
    }
    if (active !== true) invalidToken();
  }

  async function validateExternalAccessToken(input: ValidateExternalAccessTokenInput): Promise<ExternalPrincipal> {
    const requiredScopes = validateRequestedAuthority(configuration, input?.expectedResource, input?.requiredScopes);
    const bearerToken = input?.bearerToken;
    if (typeof bearerToken !== "string" || bearerToken.length === 0
      || new TextEncoder().encode(bearerToken).byteLength > MAX_TOKEN_BYTES) invalidToken();

    let parsedHeader: ReturnType<typeof jose.decodeProtectedHeader>;
    try {
      parsedHeader = jose.decodeProtectedHeader(bearerToken);
    } catch {
      invalidToken();
    }
    if (parsedHeader.alg !== "RS256"
      || !isBoundedString(parsedHeader.kid)
      || parsedHeader.jku !== undefined
      || parsedHeader.x5u !== undefined
      || parsedHeader.jwk !== undefined) invalidToken();

    const verificationTime = currentEpochSeconds(now);
    let result: Awaited<ReturnType<typeof jose.jwtVerify>>;
    let keyResolutionError: unknown;
    try {
      result = await jose.jwtVerify(bearerToken, async (protectedHeader, token) => {
        try {
          return await keyResolver(protectedHeader, token);
        } catch (error) {
          keyResolutionError = error;
          throw new Error("Key resolution failed.");
        }
      }, {
        algorithms: ["RS256"],
        issuer: configuration.issuer,
        audience: input.expectedResource,
        requiredClaims: ["iss", "sub", "aud", "exp", "iat", "jti"],
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
        currentDate: new Date(verificationTime * 1000)
      });
    } catch {
      if (keyResolutionError !== undefined) {
        if (keyResolutionError instanceof Error && keyResolutionError.name === "JWKSNoMatchingKey") invalidToken();
        unavailable();
      }
      invalidToken();
    }

    const { payload, protectedHeader } = result;
    if ((protectedHeader.typ !== "at+jwt" && protectedHeader.typ !== "application/at+jwt")
      || protectedHeader.kid !== parsedHeader.kid) invalidToken();
    const audience = payload.aud;
    const exactAudience = typeof audience === "string"
      ? audience === input.expectedResource
      : Array.isArray(audience) && audience.length === 1 && audience[0] === input.expectedResource;
    const clientId = payload.client_id;
    const subject = payload.sub;
    const tokenId = payload.jti;
    const grantId = payload.whatfees_grant_id;
    const issuedAt = payload.iat;
    const expiresAt = payload.exp;
    const scopes = parseScopes(payload.scope);
    const currentTime = currentEpochSeconds(now);

    if (payload.iss !== configuration.issuer
      || !exactAudience
      || !isBoundedString(clientId)
      || !configuration.clientIds.includes(clientId)
      || !isBoundedString(subject)
      || !isBoundedString(tokenId)
      || !isBoundedString(grantId)
      || !UUID_V4.test(grantId)
      || !isEpochSeconds(issuedAt)
      || !isEpochSeconds(expiresAt)
      || expiresAt <= issuedAt
      || (payload.nbf !== undefined && (!isEpochSeconds(payload.nbf) || payload.nbf >= expiresAt))
      || expiresAt - issuedAt > MAX_TOKEN_TTL_SECONDS
      || issuedAt > currentTime + CLOCK_TOLERANCE_SECONDS
      || expiresAt <= currentTime
      || !scopes) invalidToken();

    if (!matchesSet(requiredScopes, scopes)) throw new ExternalError("insufficient_scope");

    const authority = { issuer: payload.iss, subject, clientId, resource: input.expectedResource, grantId, scopes, issuedAt };
    const grant = await readGrant(grantId);
    if (!grantMatchesToken(grant, authority, now())) invalidToken();
    await requireActiveAccount(grant);
    if (currentEpochSeconds(now) >= expiresAt || currentEpochSeconds(now) >= grant.expiresAt) invalidToken();

    const principal: ExternalPrincipal = Object.freeze({
      userId: grant.userId,
      issuer: payload.iss,
      subject,
      clientId,
      resource: input.expectedResource,
      tokenId,
      grantId,
      scopes: Object.freeze([...scopes]),
      issuedAt,
      expiresAt: Math.min(expiresAt, grant.expiresAt)
    });
    provenance.set(principal, Object.freeze({ grant }));
    return principal;
  }

  function assertExternalPrincipal(principal: ExternalPrincipal): void {
    requirePrincipalProvenance(principal, provenance, now);
  }

  async function revalidateExternalPrincipal(input: RevalidateExternalPrincipalInput): Promise<void> {
    const requiredScopes = validateRequestedAuthority(configuration, input?.expectedResource, input?.requiredScopes);
    const source = requirePrincipalProvenance(input?.principal, provenance, now);
    const principal = input.principal;
    if (principal.resource !== input.expectedResource) invalidToken();
    if (!matchesSet(requiredScopes, principal.scopes)) throw new ExternalError("insufficient_scope");

    const grant = await readGrant(source.grant.id);
    if (!sameGrantLifecycle(source.grant, grant)
      || !grantMatchesToken(grant, {
        issuer: principal.issuer,
        subject: principal.subject,
        clientId: principal.clientId,
        resource: principal.resource,
        grantId: principal.grantId,
        scopes: principal.scopes,
        issuedAt: principal.issuedAt
      }, now())) invalidToken();
    await requireActiveAccount(grant);
    if (currentEpochSeconds(now) >= principal.expiresAt || currentEpochSeconds(now) >= grant.expiresAt) invalidToken();
  }

  return Object.freeze({
    validateExternalAccessToken,
    assertExternalPrincipal,
    revalidateExternalPrincipal
  });
}
