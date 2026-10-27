# OAuth provider readiness implementation plan

> For agentic workers: use subagent-driven development with independent review. User authorized continuation; Terra6.1 workers. No automatic sensitive merge.

Goal: make the next real dev-tenant configuration reviewable with a bounded offline metadata assessment and an executable developer check.

Architecture: Auth0 remains the conditional managed issuer candidate from P0. Assess a supplied public discovery document against existing validated resource-server configuration, without fetching URLs, creating accounts, accepting callbacks or issuing authority. A CLI consumes local JSON files and emits fixed structured checks. No new dependency, framework, service, storage or production wiring.

Spec: [P0 contracts](../specs/2026-10-25-oauth-p0-contracts.md) and authoritative [OAuth plan P1/P2](2026-10-22-oauth-public-api.md).

## Preflight and decisions

The previous resource core is in PR46, base e08a3e42b349555a655364c8021ece1ca822cde4. No dev tenant/domain/client was supplied; the optional tenant question returned no answer. No connected Azure/Auth0 provisioning tool exists. This is not proof that the user has no tenant. External clients own their OAuth redirects; a future WhatFees account-link client requires its own exact callback and independent proof of both identities.

Terra preflight found current resolveUserId exposes only userId and skips unsafe-method CSRF checking if any Bearer header is present. It cannot alone establish the strict cookie+CSRF proof required by P0 linking. Existing deletion has no external account-generation tombstone. Do not route a new linking flow through these assumptions, infer an Auth0 subject from Google IDs/email, or invent atomic lifecycle persistence while those contracts are unsettled. No legacy behavior changes in this increment.

Approaches: (1) build a speculative account-link orchestrator behind new storage/provider ports; rejected now because no real lifecycle/client proof and excessive unused seams. (2) prepare deterministic provider metadata checks and exact setup/evidence instructions; selected as smallest independently testable P1 step. (3) create a second local issuer; rejected by managed-issuer decision and lean requirement.

## Frozen interface and review focus

`assessExternalOAuthProvider(configuration:ExternalAccessConfiguration, metadata:unknown):ExternalOAuthProviderAssessment` in apps/api/src/features/externalOAuth/providerReadiness.ts. Result: readonly status metadata_consistent|metadata_incompatible, activationReady literal false, checks readonly array of readonly {id:string,passed:boolean}. Emit only fixed check IDs/booleans/status, never source metadata, error messages, client IDs or URLs. Configuration passes existing validateExternalAccessConfiguration (fixed internal_error on bad config); malformed metadata gives failed checks. No network, positive cache, trust capability or new principal is produced.

Check IDs: issuer_exact, jwks_exact, authorization_endpoint, token_endpoint, revocation_endpoint, pkce_s256, authorization_code, refresh_token, response_code, public_client_none, issuer_response_parameter, id_token_rs256, openid_scope. Exact issuer/JWKS match validated config. Endpoint fields must be canonical HTTPS on configured issuer origin, without credentials/query/fragment/control/backslash. Cap URI lengths2048; literal empty ?/# also reject. Cap metadata arrays128items, each string<=256, no control characters; require own data fields/plain JSON records, reject accessors/untrusted custom methods without executing them. Required list values: S256,authorization_code,refresh_token,code,none,RS256,openid respectively. Additional advertised capabilities do not authorize their use; this is metadata consistency only. `authorization_response_iss_parameter_supported` must true. Nonstring/malformed fields fail their check. Freeze all result copies.

Review focus: metadata is untrusted and must not cause URL fetches/redirects or output secrets; global metadata is advertising rather than actual client/refresh/revoke behavior; configured resource audience/grant hook cannot be inferred from discovery; malformed/accessor inputs fail safely; CLI stdout/stderr must not echo secrets or arbitrary exception content.

## Task1: pure assessment + focused tests (Terra owner)

- [x] Terra owner confined edits to providerReadiness.ts/test; coordinator integrated actual source.
- [x] Assessor missing-module RED then6focusedtests GREEN, with table/loop fixtures covering exactness, unsafe endpoints, malformed lists/accessors and fixed immutable non-authorizing output.
- [x] Minimal79line assessor reuses existing configuration; no token, crypto, flow or network implementation.
- [x] Targeted6tests/source/testtypechecks passed; independent Terra review recorded in ../reviews/2026-10-27-oauth-provider-readiness-review.md.

## Task2: offline CLI + setup/evidence instructions (Terra owner)

- [x] CLI owner confined changes to the3listed files; compiled assessor injected read-only by coordinator.
- [x] CLI exact args --config <file> --metadata <file>; no URL fetching, flags bypass, env secrets or global config writes. Cap each JSON file64KiB. Parse only regular files, fail safe on invalid args/files/JSON/build dependency; no content/path/exception echoes. NodecreateRequire loads compiled dist/features/externalOAuth/providerReadiness.js.
- [x] stdout is assessment JSON only when successful parse; metadata_consistent exit0 (not activation), incompatible exit1; invocation/config/file/parse/build error exit2, stderr fixed 'OAuth provider check failed.'. No raw/stack/cause. Help may print fixed usage and exit0. No token acquisition or provisioning.
- [x] Tests invoke real CLI as childprocess with temporary local public fixtures, assert valid/incompatible/malformed/largefile/unknownarg/missingbuild safe failure; meaningful RED before CLI implementation. Do not stub actual assessor. Worker may wait for integrator-supplied compiled assessor.
- [x] Docs show build+command, exact placeholders for real issuer/JWKS/distinctresource IDs/client IDs, public discovery retrieval manual, Auth0 separate account-link vs external client registrations, exact callback/PKCE/consent/rotation/resource-profile/RFC9068/grant-hook proofs. List unknowns and no enabled routes. Explain how success differs from real callback/replay/revoke tests.

## Integrator and gates

- [x] Frozen plan82838229 before dispatch; two complementary Terra6.1 workers in separate worktrees and separate Terra6.1 senior reviewer.
- [x] Actual compiled CLI tests wired into existing API runtime-protocol script after target build; no new runner/dependency.
- [x] Targeted compiled6CLI+6assessor tests and both API verification/CI gates pass; final diff/deployment boundaries reviewed.
- [ ] Publish stacked PR on PR46; no merge.
- [x] Test counts/timings and interrupted-scope limits recorded below; token/cost metrics null, no comparative gain claimed.
- [ ] Blocked: actual tenant/domain and own registered linking client/callback needed to exercise real discovery/authentication/consent. Establish atomic state consumption, session+CSRF proof, signed subject verification, account-generation/erasure barriers and provider hook before building/wiring linking orchestrator.

## Verified result, 2026-10-27

Coordinator process11137 exited0 for both npm run verify:api and npm --prefix apps/api run verify:ci.112files/882APItests +35compiled protocol tests (including6CLI childprocess tests); strict test TypeScript and unchanged coverage thresholds pass. Coverage statements80.80%,branches72.91%,functions86.83%,lines85.21%. API suite16.64seconds, CI coverage suite21.56seconds; these are test-run durations.

Initial missing-module/missing-script RED preceded implementations. Both packets and independent review passed without a requested source correction. Plan-commit-to-observed-gate window was2026-10-27T13:16:04Z to13:21:53Z (349seconds, includes setup/implementation/review/check observation; excludes earlier request/preflight work). Per-agent input/output/cachedtokens,cost,totalrequestcost and model-comparison data are null/unavailable. This is ordinary complementary execution, not a controlled Terra/Luna trial.

The result is an offline metadata consistency check and setup guide, not completed P1 login/consent or P2 lifecycle. No client/callback is registered, no identity is linked, no grant/storage is written, and no route or provider is provisioned. The real tenant domain and reviewed client/callback+atomic lifecycle contracts remain the concrete dependencies for the next flow.
