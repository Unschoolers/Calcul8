# Auth0 Free evaluation, 2026-10-27

The user selected Auth0 under a Free-plan budget constraint. No paid feature, tenant, client, flow or deployment is activated by this decision.

Start from [Auth0 Free](https://auth0.com/pricing), using the provider-assigned tenant domain. Do not activate a paid subscription, add-on or billing-dependent custom domain. Free pricing currently lists $0/month, up to25,000 monthly active users and no credit card needed for signup; custom domains require credit-card verification. Pricing and actual feature eligibility must be rechecked before production. A trial may expose features absent from Free: passing while on a trial does not establish Free eligibility.

The user supplied the development tenant `whatfees.ca.auth0.com` on 2026-10-27. Its public discovery was retrieved and assessed below. Select region/residency deliberately; a domain alone does not establish residency, Free-plan entitlement, callback or resource configuration. Initial PKCE behavior still requires a real client registration while lifecycle activation remains blocked.

A critical compatibility item remains unresolved. [Auth0 Support](https://support.auth0.com/center/s/article/find-requested-scopes-in-actions-for-refresh-token-client-credential-exchange-or-resource-owner-password-grant) explicitly calls access to `event.refresh_token` in Post-Login Actions an Enterprise feature. The [revocation documentation](https://auth0.com/docs/secure/tokens/refresh-tokens/revoke-refresh-tokens) also restricts the newer refresh-token Management API endpoints to Enterprise, while documenting older device-credential endpoints separately. These facts do not prove every safe Free design impossible, but the proposed per-family binding cannot rely on those Enterprise-only mechanisms.

For WhatFees, a supported immutable `whatfees_grant_id` binding across refresh and fresh consent, or a precise supported revocation-ordering alternative, is still required. A mutable current-grant pointer per user/client is not an equivalent proof: an old exchange could acquire the new grant after reconsent. Do not enable refresh, consent/grant activation or API routes on that assumption; do not relax P0 or upgrade the plan to bypass this gate. Discovery consistency and ordinary rotation alone do not establish it.

## Public tenant verification, 2026-10-27

Only public HTTPS discovery and JWKS were read. No dashboard settings, client registration, subscription, credentials or runtime configuration were changed.

| Item | Observed value |
| --- | --- |
| Issuer | `https://whatfees.ca.auth0.com/` (trailing slash required) |
| Discovery | `https://whatfees.ca.auth0.com/.well-known/openid-configuration` — HTTP 200 |
| JWKS | `https://whatfees.ca.auth0.com/.well-known/jwks.json` — HTTP 200 |
| Authorization | `https://whatfees.ca.auth0.com/authorize` |
| Token | `https://whatfees.ca.auth0.com/oauth/token` |
| Revocation | `https://whatfees.ca.auth0.com/oauth/revoke` |
| Existing metadata assessment | `metadata_consistent`, 13/13 checks, `activationReady: false` |
| Public keys at retrieval | Two importable RSA/RS256 public signing keys, 2048 bits each; no real token signature verified |

The discovery advertises S256, authorization code, refresh, public-client authentication `none`, OpenID scope, RS256 ID tokens and `authorization_response_iss_parameter_supported: true`. Other advertised grants or `plain` PKCE do not authorize WhatFees to use them; P0 still permits only code + S256. Advertised refresh and revocation do not prove client settings, immutable grant binding or revocation ordering.

Reproduction used the existing checker from immutable source `8b3aeda1dc67af476bd8b819030dadf8caf4b783` (PR47 merged into the resource-core branch), built in an isolated detached worktree. The check used the exact issuer/JWKS above plus **assessment-only fixtures** `https://metadata-check.invalid/rest`, `https://metadata-check.invalid/mcp` and client `metadata-check-only-NOT-A-REGISTERED-CLIENT`, because the checker requires a complete configuration although its discovery checks do not evaluate resources or registered clients. Those reserved invalid-domain fixtures are not deployment identifiers, evidence of resource support, or an actual client allowlist. No such configuration was committed or activated.

The discovery snapshot was 2834 bytes, SHA256 `063c0ae4e4967e7c49f86ac2713f3a2e2f06799ab94980ca83ed831ca27c93e0`; the JWKS snapshot was 3036 bytes, SHA256 `c96ab67f12b35fe351417bbe86d3bd55c39a3e4e273a6661d2b2a5b92f7a9cae`, retrieved around 15:10 UTC. These are observations, not pins for future rotating keys or changing discovery documents.

Fresh verification: `npm --prefix apps/api run build` passed; the existing CLI accepted the retrieved discovery with all 13 checks passing and activation false. `node --test apps/api/test/provider-readiness-cli.test.mjs` passed 6/6; from `apps/api`, `TZ=UTC ./node_modules/.bin/vitest run --config vitest.config.mjs src/features/externalOAuth/providerReadiness.test.ts` passed 6/6. An initial Vitest invocation from the repository root found no tests; correcting the working directory resolved that invocation error without changing code or tests. No full application suite was needed for this documentation-only change.

Next public input: the development application's **Client ID and application type**, found in [Auth0 application settings](https://auth0.com/docs/get-started/applications/application-settings); no secret or token. If no appropriate test application exists, establish its type and exact callback before requesting a real PKCE exchange. External client callbacks and the future WhatFees account-linking callback are separate registrations. Actual resource identifiers, RFC9068 token configuration, grant lifecycle proof and Free eligibility remain open; do not enable routes from this discovery result.
