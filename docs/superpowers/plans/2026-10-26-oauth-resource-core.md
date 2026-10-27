# Inactive OAuth resource-server core

Base: published pilot `1896d603e62ef7242451cd8de0b6d0dfa370da69` ([PR45](https://github.com/Unschoolers/Calcul8/pull/45)); depends on [P0 PR44](https://github.com/Unschoolers/Calcul8/pull/44). Authoritative [OAuth plan](2026-10-22-oauth-public-api.md) and [security contracts](../specs/2026-10-25-oauth-p0-contracts.md) remain binding. No sensitive merge or activation.

## Frozen seams and ownership

Integrator alone adds `RevalidateExternalPrincipalInput`, `ExternalPrincipalAuthority` and `ExternalAccessService` to contracts.ts, dependency/test configuration, package/lockfiles and final integration. Authority functions validate privately issued principal provenance and fresh grant/account authority. Scope services consume this port, never issue principals. Workers were notified of the contract extension before dispatch.

| Complementary packet | Exclusive source/test ownership | Acceptance |
| --- | --- | --- |
| JWT/grant verification | externalAccess/verify.ts, verify.test.ts | Real RSA signatures via jose; exact issuer/single resource/client/subject/time/scope and grant generation; no stale revocation or fabricated principal; storage failure closed. |
| Scope/final boundary | externalAccess/scope.ts, scope.test.ts | Existing centralized scope grammar; private scope-to-principal binding; own-account partitions; active workspace membership at entry and final boundary; expiry across awaits. |
| Configuration/metadata | externalAccess/configuration.ts + test; features/externalOAuth/metadata.ts + test | Canonical configured HTTPS URIs, distinct REST/MCP, immutable copies; resource metadata for real issuer with only implemented read scopes. No counterfeit AS discovery. |
| Safe responses | externalAccess/response.ts, response.test.ts | Fixed public catalog/envelope, generated correlation ID, no token/claims/exception details; safe even on bad config/options; fixed Bearer challenges and correct resource metadata path binding. |

Four Luna agents use separate worktrees from `05e4b19b`, disjoint ownership, no subagents or global-file edits. This is ordinary complementary parallel work, not competing Synapse candidates. Configuration is a narrow shared dependency: integrator copies the actual reviewed module into dependent worktrees for focused checks after its owner finishes; workers never stub or independently edit it. No parallel lockfile/entrypoint edits.

Frozen factory interfaces:

- `createExternalAccessService(configuration, reader, { now?, getKey? }?) -> Promise<ExternalAccessService>`. Clock is epoch seconds. `getKey` is trusted construction-time dependency injection (real local JWKS in tests), never a request parameter. Default uses pinned configured remote JWKS. Maintained jose6.2.13 dynamic import for NodeNext/CommonJS; measured package unpacked size218445 bytes; one in-process crypto dependency, zero extra service/framework/database.
- `createExternalScopeService(authority + hasWorkspaceMembership) -> { resolveExternalScope, revalidateExternalAccess }`. Scope object provenance is local to service and bound to the exact principal.
- `validateExternalAccessConfiguration(config)` returns copied/frozen config; `getProtectedResourceMetadataUri(config, kind)` derives well-known resource path.
- `createProtectedResourceMetadata(config, kind)` is pure and inactive. Exact configured resource, real authorization_servers, read scopes, header bearer and RS256 only.
- `createExternalErrorResponse(error, {configuration, resourceKind, requiredScopes?}?)` returns HttpResponseInit safely. REST challenges omit resource_metadata; fixed MCP can advertise its exact configured metadata.

## Required checklist

- [x] Inspect existing auth/scope/response boundaries; preserve browser sessions, Google bearer opt-in, CSRF, billing/entitlements and inventory rules.
- [x] Freeze interfaces/file ownership before dispatch; pin maintained crypto rather than hand-rolled verification. No new storage or issuer deployed.
- [x] Packet reports and actual source inspected; Terra6.1 continuation plus separate senior signed-token security review, recorded in ../reviews/2026-10-27-oauth-core-security-review.md.
- [x] Owned source integrated; independent compiled cross-packet oracle9/9 passes with actual RSA signatures and final scope/revocation/membership checks. Protected oracle unchanged.
- [x] Final npm run verify:api and npm --prefix apps/api run verify:ci both exit0:111files/876tests +29compiled runtime tests. CI test typecheck and coverage thresholds pass; final diff/deployment-root/no-legacy-wiring checks pass.
- [ ] Publish separate verifiable PR stacked on pilot; no merge.
- [ ] Blocked: real dev tenant/client/issuer/resource configuration and trusted grant hook/account-linking authority have not been established. No auth/account lifecycle persistence schema is guessed.
- [ ] Blocked: PKCE/consent/code replay/refresh rotation+reuse/concurrency/key rotation and end-to-end revoke/logout, authoritative grant/account consistency+erasure, real REST/MCP discovery/interoperability remain unproved. No routes may be enabled.
- [ ] P4-P6 domain ports/read routes/OpenAPI remain separate authoritative-plan increments; inactive helpers do not satisfy them.

## Measurement policy

Keep only observed wall times, failures, review corrections and check results for this wave; token/cost data remain null. The failed N1 trial in `docs/experiments/synapse-x/oauth-bearer` does not justify further speculative duplication or efficiency claims. No custom orchestrator or budget service is added.

## Continuation, 2026-10-27

At the user's request, subsequent delegated work uses **Terra 6.1**, including the independent senior review. The initial four packets were written by Luna; that history is retained. Terra resumed the existing work rather than generating duplicate competing solutions. No controlled Luna/Terra cost or quality comparison was run, and unavailable token/cost metrics remain null.

Integration first observed the protected compiled oracle at 7/9: missing final required scopes returned401 instead of403, and expiry crossing entry membership was not rejected. Those source fixes were present in interrupted worker worktrees and verified during continuation. Terra then reproduced invalid nbf ordering (a not-before time after expiry could pass clock tolerance), replaced hand-parsed JWT headers with jose.decodeProtectedHeader, and added the regression. A separate Terra senior reviewer reproduced a signed-token account/workspace partition collision and identity trimming mismatch; that finding blocks publication pending correction and independent rerun.

A worker's extra full-suite run failed3Whatnot date-dependent tests without the coordinator's UTC setup. No unrelated application/test change was made. Coordinator's configured UTC full gate subsequently passed111files/871tests plus29runtime tests on the pre-collision-fix tree. Final results must supersede these interim figures after the security fix.

## Final local verification, 2026-10-27

Both final gates exited0 (coordinator process92951). API suite:111files/876tests. Compiled Node protocol tests:29 (8existing,12Bearer,9core). CI includes strict test typecheck and coverage: statements80.74%, branches72.74%, functions86.78%, lines85.19%; all existing thresholds passed unchanged. API suite elapsed18.00seconds; CI coverage suite23.01seconds. These are test-run durations, not agent latency or total request cost. Execution was interrupted between turns; no continuous full-wave wall duration was recorded. Token/cost/usage and comparative Terra/Luna gain remain unavailable.

The identity collision was fixed by rejecting noncanonical authoritative local user IDs and the reserved workspace namespace before principal issuance. Five real signed-token regressions failed before the fix and pass after; independent senior checks repeated the original collision and whitespace witnesses plus a valid own-account final flow. No runtime web imports, route registrations, legacy auth, host config, workflow or storage changes are included. Sole new runtime dependency: pinned jose6.2.13.

Security-ready for an inactive resource-server PR. Operational OAuth remains partial: no exact dev tenant/client/resource configuration, trusted provider grant hook, account-link/consent lifecycle persistence or proven revoke/erasure consistency exists yet. Those missing external and storage authorities block enabling routes; public read services/routes/OpenAPI and MCP tool wiring remain later packets.
