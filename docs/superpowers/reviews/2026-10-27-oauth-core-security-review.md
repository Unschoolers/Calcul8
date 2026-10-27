# Inactive OAuth resource core: independent security review

Reviewed against base `1896d603e62ef7242451cd8de0b6d0dfa370da69`, the P0 contracts and the resource-core plan. **Verdict: no unresolved concrete security blocker for an inactive-only PR in the reviewed bytes, subject to the coordinator completing the final verification gates.** This is a review of inactive helpers; it does not approve a tenant, route activation, merge, or production deployment.

## Resolved blocking finding: account identity could select another partition without membership

The initially reviewed `snapshotGrant` in `apps/api/src/lib/externalAccess/verify.ts` accepted any nonempty bounded `userId` without excluding the workspace partition namespace or whitespace. `resolveExternalScope` passes that ID to the existing `resolveSyncScope`, which trims it and returns the ID itself as a legacy personal partition. Workspace partitions use the same `ws:` prefix. Thus an active authoritative account with ID `ws:team-42` received a `user` scope with partition key `ws:team-42`, exactly the partition for workspace `team-42`; no workspace membership check ran at entry or at the final boundary. An active account ID ` victim ` similarly resolved to the different personal partition `victim`, although the account lookup checked the untrimmed ID.

This is not a claim that a token holder can choose their grant's account ID. The witness uses the reader's authoritative grant and an active-account answer for that exact ID. The frozen port does not constrain those IDs, and the original helper accepted them. The result violated the plan's own-account partition and workspace-membership requirements if an accepted account ID collided.

**Witness:** On 2026-10-27 ran `node --input-type=module` from `apps/api` against the actual compiled `dist/lib/externalAccess/{verify,scope}.js`, using a real RS256 `jose` signature, configured expected REST audience, an active matching account generation, and a membership reader that increments a counter and returns false. Both principal validation and final scope revalidation resolved successfully:

```json
{"principalUserId":"ws:team-42","scopeType":"user","actorUserId":"ws:team-42","partitionKey":"ws:team-42","membershipCalls":0}
{"principalUserId":" victim ","scopeType":"user","actorUserId":"victim","partitionKey":"victim","membershipCalls":0}
```

The collision is confirmed by `apps/api/src/shared/scope-keys.cjs` and `apps/api/src/lib/syncScopeResolution.ts`. The coordinator was notified immediately. The fix rejects noncanonical local IDs and the reserved lowercase `ws:` prefix in `snapshotGrant`, before account lookup or principal issuance, without rewriting the identity. The regression suite uses signed tokens and derives the colliding key from the existing partition helper.

**Independent post-fix verification:** Repeated the signed-token witness in a new `node --input-type=module` process from `apps/api` against freshly rebuilt `dist/lib/externalAccess/{verify,scope}.js`. Both original inputs, `ws:team-42` and ` victim `, plus leading, trailing and embedded-space variants, returned `invalid_token` (401) before account or membership calls. A `valid-user` control completed validation and final boundary revalidation on `valid-user`, with two account reads. Inspected the final source and tests: the guard is applied on every fresh grant snapshot, and the original protected oracle remains unchanged. The packet report records five failing-before/passing-after signed-token regressions; this reviewer independently witnessed the original failure and final behavior, not the packet's RED run.

## Other reviewed boundaries

- Verification uses a pinned issuer/JWKS, `jose` RS256, restricted type and `kid`, rejects embedded/remote token key material, checks singleton audience, allowlisted `client_id`, subject, jti, signed grant UUID, read scopes and ordered/bounded time claims. Grant snapshots and fresh account generation reads fail closed, with principal expiry capped by token/grant expiry. The private WeakMap and frozen copies prevent lookalike principal use.
- Scope provenance is per service and tied to the exact principal; normal workspace scope checks membership on entry and final revalidation, and expiry is checked after awaits. The corrected grant guard prevents the reviewed identity collision from reaching scope issuance.
- Configuration makes frozen copies of canonical HTTPS identifiers and a bounded client list. Metadata declares the configured issuer, resource, read scopes, header bearer and RS256. Response projection selects fixed catalog values and generated correlation IDs; REST challenges omit resource metadata and MCP uses its configured path. The separate configuration/response review records verified fixes for empty URL delimiters and caller-controlled array serialization; this review inspected the final source, not that review's oracle execution.
- The change adds `jose` only to API dependencies and a runtime oracle to the API script. Source searches found no new runtime imports outside the inactive modules, and no new web imports, route registration or legacy-auth wiring. Actual provider behavior, account lifecycle and storage consistency remain activation gates, not properties established by these helpers.
- Authority and membership reads are sequential, not an atomic snapshot. The spec separately requires proven storage/revocation consistency before activation; this review does not claim immediate cross-instance revocation or atomicity during concurrent changes.

## Reviewed bytes

| File | SHA-256 |
| --- | --- |
| `apps/api/src/lib/externalAccess/contracts.ts` | `a4557334eafb5ede46b79de13b3d5202eadc3e2090ee98dcbb444de4745f81c1` |
| `apps/api/src/lib/externalAccess/verify.ts` | `f7a8babcc4ad7bc99d8a614b09b7b9a1446161eaf8a27901605a210b5df7468d` |
| `apps/api/src/lib/externalAccess/scope.ts` | `9592f97fc3540d21f2cc2ca403711b6242f8d542107fbd53d3f241aea4ae0fb2` |
| `apps/api/src/lib/externalAccess/configuration.ts` | `c6e9bcca27c269db7e3b7b2da49ac6cf42608f4c1feb549638e3b833f152bc2e` |
| `apps/api/src/lib/externalAccess/response.ts` | `ab347b40ca5f6c18a09ea1b25205ba18b4ac04f701493296a7679affa75fddda` |
| `apps/api/src/features/externalOAuth/metadata.ts` | `2787f57247b6a32fc3f614b005da44883c4bc51eb4e3705e4872f80db5f721a9` |
| `apps/api/src/lib/externalAccess/verify.test.ts` | `f9502f51a32a57d239e3c48414c07dd393fc128ed79bba0ca5b046e5a1b60d26` |
| `apps/api/test/oracles/external-access.test.mjs` | `5bfba2c86d15bff29df63c02e0fdd6c508f5a62696c18436f97513bbb5ba29f3` |
| `.cache/oauth/core-review-final.diff` | `9a7f2e00c07c3cf27c23c6e199adbab2e2490741e42f80650b222a482fb18409` |

## Checklist

- [x] Read repository guidance, actual branch diff and frozen resource-core and P0 requirements; inspected integrated source, tests and preceding packet reports.
- [x] Independently constructed and ran the real signed-token collision witness against compiled services; reported the blocker immediately.
- [x] Inspected pinned dependency, interfaces, fixed response projection, metadata and absence of route/web wiring; `git diff --check` returned exit 0 before this report.
- [x] Independently rechecked the identity/partition fix against the original signed-token witnesses, four whitespace variants and a valid final-boundary control; inspected signed-token regression tests.
- [ ] Blocked: coordinator-owned compiled oracle, focused tests, full API verification, API test typecheck and final packaging/diff checks must be completed against the final bytes. They were not rerun by this reviewer; earlier packet results are not a substitute.
- [ ] N/A: no implementation, subagent delegation, commit, PR publication or activation authorized for this reviewer. No tenant, issuer lifecycle, revoke-consistency or interoperability sign-off is claimed.

Coordinator final gate evidence: after the reviewed identity fix, npm run verify:api and npm --prefix apps/api run verify:ci both exited0 in process92951.111files/876APItests,29compiled protocol tests, test TypeScript checks and all existing coverage thresholds passed. Protected core oracle SHA256 remains5bfba2c86d15bff29df63c02e0fdd6c508f5a62696c18436f97513bbb5ba29f3. Final whitespace and packaging-boundary checks passed; source hashes match the independently reviewed bytes. This closes the local publication gate, not operational activation.
