# OAuth P0: resource-server contracts, revision 1

Status: development contract only; activation gates remain open. The [OAuth/public API plan](../plans/2026-10-22-oauth-public-api.md) is authoritative. This increment registers no routes and changes no browser authentication.

## Decision and evidence

Choose a managed authorization server, with **Auth0 as the concrete development candidate**, conditional on a real tenant proving the gates below. No tenant has been provisioned or paid service purchased. WhatFees remains a resource server, not a second issuer.

| Option | Evidence / cost | Decision |
| --- | --- | --- |
| Auth0 | Published B2C Free $0 up to 25,000 MAU; Essentials starts $35/month for 500 MAU, checked 2026-10-26. RFC9068 profile, PKCE and refresh rotation/reuse detection documented. Resource compatibility profile must be explicitly enabled. Required feature eligibility, residency and total cost remain unproved. | Dev candidate; no claim of free production compatibility. |
| Microsoft Entra | Existing Azure ecosystem; official documentation says old refresh tokens are not revoked merely by redeeming them. Current configuration would not prove our refresh reuse invariant. Registration/MCP compatibility still needs demonstration. | Not selected for this trial. |
| Maintained in-process oidc-provider | Vetted OAuth/OIDC implementation; requires Azure Functions integration, persistent issuer adapters, key custody/rotation, consent and incident operations. Incremental engineering and operating cost unmeasured. | No extra issuer framework or deployment. Revisit only with measured provider incompatibility/cost. |

Sources (revalidated 2026-10-26): [Auth0 pricing](https://auth0.com/pricing), [token profiles](https://auth0.com/docs/secure/tokens/access-tokens/access-token-profiles), [resource compatibility](https://auth0.com/ai/docs/mcp/guides/resource-param-compatibility-profile), [refresh rotation](https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation), [Entra refresh tokens](https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens), [oidc-provider](https://github.com/panva/node-oidc-provider), [jose](https://github.com/panva/jose), [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), [RFC9068](https://www.rfc-editor.org/rfc/rfc9068.html), [RFC9728](https://www.rfc-editor.org/rfc/rfc9728.html), [RFC9700](https://www.rfc-editor.org/rfc/rfc9700.html).

## Frozen deployment-safe exports

`apps/api/src/lib/externalAccess/contracts.ts` owns the types; `errors.ts` owns fixed public errors. Runtime modules stay inside `apps/api`.

- `ExternalPrincipal`: readonly internal authority with userId, issuer, subject, clientId, exact resource, scopes, tokenId, grantId, issuedAt and expiresAt (epoch seconds). Never serialize this as a public account DTO. No caller-supplied identity, role or entitlement claims.
- `ExternalGrant`: readonly exact consent generation, local account generation, issuer/subject/client/resource/scopes, notBefore/expiresAt and nullable revokedAt.
- `ExternalAuthorizationReader`: fresh authoritative `getGrant(grantId)` and `isAccountActive(userId, accountGeneration)`; no positive cache or permissive fallback.
- `ExternalAccessConfiguration`: configured issuer/JWKS, distinct rest/mcp resources, explicit clientIds allowlist.
- `ExternalAccessValidator` / `ValidateExternalAccessTokenInput`: bearerToken + expectedResource + requiredScopes -> principal. Validation never mints tokens.
- `ExternalScopeResolver` / `ResolveExternalScopeInput`: principal + optional workspaceId -> readonly existing `ResolvedSyncScope` through centralized permission rules.
- `RevalidateExternalAccessInput`: principal + resolved scope + expectedResource + requiredScopes for final service boundary validation.
- `ExternalError` has fixed status/message/code, frozen own properties and no raw token/cause/details. `ExternalErrorEnvelope` is `{ error: { code, message, correlationId } }`.

Initial scopes: `account:read`, `workspaces:read`, `lots:read`, `sales:read`, `pricing:calculate`. Reserved writes `lots:write`, `sales:write` are never authorized by the read-only validator.

Contract changes require integrator notification and contract reruns. Domain read ports and safe projections are a separate P5 freeze before REST/MCP business transports; no worker invents them here.

## Validation and consent policy

- Configure exact canonical HTTPS issuer, JWKS and separate REST/MCP resource identifiers. No production hostname guessed in source. No Host/Forwarded-derived authority or token-controlled jku/x5u URL. Allowlisted pre-registered clients initially; public registration/CIMD/DCR are not implicitly enabled.
- Verify JWT signatures using maintained `jose` (one in-process dependency, no runtime service). Fixed RS256 and RFC9068 `at+jwt` / `application/at+jwt`; exact singleton audience. Reject ID tokens, wrong issuer/resource/client, missing subject/jti, nonfinite or unordered times, malformed/unknown scopes. Maximum access TTL 300 seconds; maximum clock skew 30 seconds; optional nbf validated. Never let skew extend local grant expiry.
- Auth0 default azp dialect differs from RFC9068 client_id. Configure RFC9068 explicitly. Its documented sample can have API + userinfo audiences: our singleton restriction is stricter and is a compatibility gate, not a reason to loosen REST/MCP isolation.
- A signed private `whatfees_grant_id` UUID binds each token to one trusted local consent generation. Only a reviewed provider-side hook may set it; caller metadata cannot. New consent creates a new UUID; revoked grant IDs are never reactivated. Match issuer/subject/client/resource/scopes and token issue time against the grant. Principal expiry is the minimum of token and grant expiry.
- TypeScript readonly is not provenance. Runtime producers freeze copied scopes and principals; a private WeakMap/WeakSet rejects caller-created or mutated lookalikes at scope and final boundaries. Workspace membership is never conferred by a JWT.
- Account linking proves both the current cookie+CSRF WhatFees session and a separately verified issuer subject using a single-use transaction. No email linking and no subject sanitization as identity mapping. Existing Google-sub account IDs cannot be inferred from Auth0 subjects.
- Authorization code + PKCE S256 only for interactive clients, exact pre-registered redirect URIs, state/nonce/issuer binding and explicit auditable least-privilege consent. No password/implicit grant, user-controlled callback fetch or shared API keys.
- Provider owns access signing/rotation, code single use and refresh-family rotation/reuse detection. WhatFees stores neither raw refresh tokens nor signing keys. Prove resource/client/scope binding across authorization and refresh, conflicting audience/resource parameters, rollback and concurrent refresh on a real dev tenant.

## Authorization and storage barriers

Resolve personal/workspace scope with existing `resolveSyncScope` and `assertSyncScopeAccess`; use current active-workspace membership semantics, then recheck grant, account, required scopes, resource, expiry and membership immediately before returning data or committing. Copy/freeze resolved scope and reject caller-crafted partition keys. Existing entitlements, billing separation, rate limits, logging redaction and snapshot generation rules remain binding.

Potentially reuse the existing sessions container (`/id`) for prefixed typed grant/account documents. This is not a persistence authorization: schema, partition/TTL, ETag revoke-wins and account-erasure integration must be reviewed first. Default Cosmos Session consistency does not prove immediate revocation across instances/regions. Prove a strong-consistency policy or explicit safe revocation bound before activation. Deny on missing/deleted account generation or storage failure. Never recreate an erased account through consent refresh. Browser logout keeps its current session behavior; explicit external grant revocation is separate.

## Metadata and errors

Expose protected-resource metadata pointing to the real external issuer, never counterfeit authorization-server metadata at WhatFees. Keep host.json routePrefix `api`; no global routing changes. RFC9728 §3.3 requires well-known metadata.resource to match the derived resource identifier, and challenge-fetched metadata.resource to match the request URL. Fixed MCP endpoint can advertise its configured metadata URL. Canonical REST base metadata uses explicit well-known discovery; REST subresource challenges omit resource_metadata rather than claiming `/v1` equals `/v1/me`. Well-known routing and actual clients remain activation gates. A draft update is not a released replacement for this baseline.

Errors must wrap outer config/rate-limit guards too; never reuse the generic unknown-error response that exposes details. Public errors use fixed messages, generated correlation IDs and no bearer/claims/JWKS/grant dumps in logs.

## Activation gates (all currently open)

- [ ] Real dev tenant: exact issuer/JWKS/REST/MCP identifiers, client registration and feature/cost/residency fit.
- [ ] PKCE, state/nonce/issuer/redirect tests, consent/account linking and exact trusted grant hook.
- [ ] Real RFC9068 singleton audience tokens and resource binding on code and refresh exchanges.
- [ ] Code replay, refresh rotation/reuse/concurrency, key rotation, provider outage and revoke/logout end to end.
- [ ] Durable account/grant lifecycle, ETag revocation, erasure and authoritative read consistency proved.
- [ ] Final scope boundaries, safe domain ports/projections, API limits/entitlements, matching OpenAPI.
- [ ] Discovery routing and real REST/MCP client interoperability.
- [ ] Independent security sign-off, production runbook/budget/rollback and explicit release authorization.

No endpoint may be enabled while the required authority/lifecycle proofs are missing.
