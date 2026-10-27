import type { ResolvedSyncScope } from "../syncScopeResolution";

export const EXTERNAL_READ_SCOPES = Object.freeze([
  "account:read",
  "workspaces:read",
  "lots:read",
  "sales:read",
  "pricing:calculate"
] as const);

export const RESERVED_EXTERNAL_WRITE_SCOPES = Object.freeze([
  "lots:write",
  "sales:write"
] as const);

export type ExternalScope = (typeof EXTERNAL_READ_SCOPES)[number];

export type ExternalResourceKind = "rest" | "mcp";

export interface ExternalPrincipal {
  readonly userId: string;
  readonly issuer: string;
  readonly subject: string;
  readonly clientId: string;
  readonly resource: string;
  readonly tokenId: string;
  readonly grantId: string;
  readonly scopes: readonly ExternalScope[];
  /** Unix epoch seconds. */
  readonly issuedAt: number;
  /** Unix epoch seconds. */
  readonly expiresAt: number;
}

export interface ExternalGrant {
  readonly id: string;
  readonly userId: string;
  readonly accountGeneration: string;
  readonly issuer: string;
  readonly subject: string;
  readonly clientId: string;
  readonly resource: string;
  readonly scopes: readonly ExternalScope[];
  /** Unix epoch seconds. */
  readonly notBefore: number;
  /** Unix epoch seconds. */
  readonly expiresAt: number;
  /** Unix epoch seconds, or null when the grant is active. */
  readonly revokedAt: number | null;
}

export interface ExternalAuthorizationReader {
  getGrant(grantId: string): Promise<ExternalGrant | null>;
  isAccountActive(userId: string, accountGeneration: string): Promise<boolean>;
}

export interface ExternalAccessConfiguration {
  readonly issuer: string;
  readonly jwksUri: string;
  readonly resources: Readonly<Record<ExternalResourceKind, string>>;
  readonly clientIds: readonly string[];
}

export interface ValidateExternalAccessTokenInput {
  readonly bearerToken: string;
  readonly expectedResource: string;
  readonly requiredScopes: readonly ExternalScope[];
}

export type ExternalAccessValidator = (
  input: ValidateExternalAccessTokenInput
) => Promise<ExternalPrincipal>;

export type ExternalResolvedScope = Readonly<ResolvedSyncScope>;

export interface ResolveExternalScopeInput {
  readonly principal: ExternalPrincipal;
  readonly workspaceId?: string;
}

export type ExternalScopeResolver = (
  input: ResolveExternalScopeInput
) => Promise<ExternalResolvedScope>;

export interface RevalidateExternalAccessInput {
  readonly principal: ExternalPrincipal;
  readonly scope: ExternalResolvedScope;
  readonly expectedResource: string;
  readonly requiredScopes: readonly ExternalScope[];
}

export interface ExternalErrorEnvelope {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly correlationId: string;
  };
}

/** Internal service-boundary port. Only the owning validator can attest provenance. */
export interface RevalidateExternalPrincipalInput {
  readonly principal: ExternalPrincipal;
  readonly expectedResource: string;
  readonly requiredScopes: readonly ExternalScope[];
}

export interface ExternalPrincipalAuthority {
  assertExternalPrincipal(principal: ExternalPrincipal): void;
  revalidateExternalPrincipal(input: RevalidateExternalPrincipalInput): Promise<void>;
}

export interface ExternalAccessService extends ExternalPrincipalAuthority {
  readonly validateExternalAccessToken: ExternalAccessValidator;
}
