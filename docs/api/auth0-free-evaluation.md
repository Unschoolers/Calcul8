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

The user subsequently supplied Default App's public client ID `iJ91FR4M6AIgD8P68qPQ8Zpo3BgO8Qhe` and confirmed saving Application Type **Native**. This is user-reported configuration, not independently authenticated dashboard evidence; effective token endpoint authentication and grant settings remain unverified. No secret or token was requested. External client callbacks and the future WhatFees account-linking callback are separate registrations. Actual resource identifiers, RFC9068 token configuration, grant lifecycle proof and Free eligibility remain open; do not enable routes from this discovery result.

## Native client setup and anonymous preflight

Use Default App only as the initial development public-client test. The coordinator's proposed callback is the exact loopback URL `http://127.0.0.1:8787/callback`. This is a local desktop test target, not a deployed WhatFees route or an Android callback. [RFC8252 section7.3](https://www.rfc-editor.org/rfc/rfc8252#section-7.3) describes native-client loopback redirects; the login browser and a future test listener must run on the same computer. No local listener or runnable login harness is introduced in this documentation increment, and no interactive authorization link should be opened before that listener is ready.

In **Default App**, complete the following development settings and save. These are proposed settings to apply, not assertions about the current dashboard:

| Setting | Development value |
| --- | --- |
| Application Type | Native (user confirmed saving) |
| Allowed Callback URLs | Add exactly `http://127.0.0.1:8787/callback`, without a wildcard |
| Advanced Settings → Grant Types | Enable Authorization Code; for this test client leave other grants disabled, including Refresh Token until the lifecycle gate is resolved |
| Token Endpoint Authentication Method | Must be `none`; absence of the dashboard field is not independent proof of the effective value |

[Auth0's PKCE prerequisites](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce/add-login-using-the-authorization-code-flow-with-pkce) require a Native/SPA client, an allowed callback and Authorization Code. There is no need to add logout URLs, web origins or production resource identifiers for this initial local connection test. At least one suitable test login connection must be available; configuring Native alone does not prove that.

A bounded anonymous `/authorize` preflight on 2026-10-27 used this issuer/client, the proposed exact callback, `response_type=code`, `response_mode=query`, `scope=openid`, fresh random state/nonce and an S256 challenge, with `prompt=none`. It used no cookies or credentials, followed no redirects and performed no token exchange. Auth0 returned **HTTP403 with a Callback URL mismatch page**. This establishes the next setup blocker; it does not prove effective `none`, completed PKCE, API access or Free refresh compatibility. No redirect URL, code, token, raw error page, verifier or user identity was printed or persisted; only a fixed-field diagnostic summary was retained locally. No authorization code was returned.

After registration, repeat the anonymous preflight. A callback error such as `login_required` with the exact matching state/issuer can establish request acceptance, not successful PKCE or token validity. A later interactive test must run with a live local listener, verify state/issuer/nonce and the provider-signed ID token, exchange with the original verifier and no client secret, and reject replay. Request no `offline_access` or WhatFees resource authority in that initial connection-only test. No account linking, grant activation or protected route follows from an identity-only result.
