# Independent OAuth P0 review, 2026-10-26

Disposition: acceptable for an inactive development contract increment after the coordinator's full API gate. No route, issuer, tenant, persistence schema, external identity link or production capability is approved. No blocking implementation defect remains in the reviewed contract/error files. P0 is not a completed operational authorization system.

## Scope and method

Independently inspected actual `apps/api/src/lib/externalAccess/contracts.ts`, `errors.ts`, `contracts.test.ts`, the test TypeScript inclusion diff, and `docs/superpowers/specs/2026-10-25-oauth-p0-contracts.md`; checked OAuth plan Section 2, existing `syncScopeResolution.ts`, API build/test boundaries, AGENTS.md, coding standards and Synapse X acceptance rules. No candidate parser existed during oracle definition. No browser, live tenant, external linking or account authority was assumed.

The coordinator fast-forwarded the integration base to `44a7f19e` during review. The reviewed P0 file hashes below are unchanged. Verification totals from an earlier base are not reused; the coordinator's fresh complete API gate on this integration base remains required. This review covers the P0 increment only, not unrelated main-branch changes.

Also reviewed the complete staged package in `.cache/oauth/p0-review.diff`: seven intended files, 527 additions and one deletion. It contains the three P0 source/test files, protected bearer oracle, test-TypeScript inclusion, execution ledger and P0 spec. No manifest, lockfile, route index, legacy auth resolver or existing runtime scope module changes are staged. The implementer report in `.cache/oauth/contracts-restore.md` records RED before restoration and RED for the native stack descriptor; the final code and descriptor behavior were checked independently rather than accepting that report as proof.

Reviewed SHA-256 snapshots (freshly reconstructed files, not the removed checkout):

| Path | SHA-256 |
| --- | --- |
| `apps/api/src/lib/externalAccess/contracts.ts` | `619e4a3c9acf73f431ccf7c40f3936e5aa34119d33f168b420315671e4b5eefd` |
| `apps/api/src/lib/externalAccess/errors.ts` | `d1c93521b9910e672548d1b89698c6aa8832354f5e149fb35aa1bb00308509f7` |
| `apps/api/src/lib/externalAccess/contracts.test.ts` | `aeac754648606312f38cd36de2038d8636e61a821552e0a3aa081fbfce7afdbd` |
| `apps/api/tsconfig.tests.json` | `179a458db5abcc876cceb3459f422d3c74d018d2a3af1050b1eaf25c815cf267` |
| `docs/superpowers/specs/2026-10-25-oauth-p0-contracts.md` | `352612a46ee65d5dd21945d2367b97a6eea42768ed006a78edf3d3359a1f46c0` |

## Findings and disposition

| Finding | Evidence and consequence | Disposition |
| --- | --- | --- |
| Native stack accessor violated the requested data-only error surface on Node 24. | Native `Error.stack` was an own accessor under Node v24.22.1. `Object.freeze` alone did not remove it. Current `errors.ts` materializes stack as a data property before freezing; the new descriptor regression and an independent compiled-output smoke pass. | Resolved during review. Keep the literal no-own-accessor oracle requirement. |
| Scope/type declarations do not provide runtime authority. | Read-only scope union excludes both reserved write scopes; principal/grant/config/scope inputs remain structurally constructible at runtime. The spec explicitly requires copied/frozen principal/scope production and private provenance checks, fresh account/grant reads and final membership checks. No current transport consumes these declarations. | Acceptable for types-only P0. Future validator/resolver approval must demonstrate those runtime checks; types alone must never authorize. |
| Auth0 compatibility is conditional, not established. | Official profile documentation distinguishes default `azp` from RFC9068 `client_id` and shows a multi-audience sample. Official resource compatibility documentation says `audience` wins when both parameters are supplied. The spec preserves singleton resource isolation and lists conflicting-parameter/refresh tests as gates. | No relaxation approved. Real configured tenant proof is required before activation. |
| Resource discovery has a path-binding constraint. | RFC9728 section 3.3 binds well-known metadata to its derived resource identifier and challenge metadata to the requested resource URL. The spec correctly avoids advertising canonical REST-base metadata as if it matched every subresource. | No current route bug because no metadata route exists. Verify actual routing and clients before activation; do not infer prefix equivalence. |
| The full P0 plan has unfinished prerequisites. | No exact tenant identifiers, consent/linking proof, provider grant hook, storage consistency/erasure proof, real lifecycle exercise or P5 domain ports exists here. The spec explicitly records them as open activation gates. | These remain blockers to enabling endpoints and claiming complete OAuth/P0 operational delivery, not blockers to publishing this bounded inactive contract increment. |

The fixed catalog rejects unknown and inherited keys without coercion, uses fixed code/status/message values, deeply freezes entries and freezes each error. Compiled error objects contain only scalar stack/message/name/code/status own data properties and ignore an extra cause argument. No raw-token interpolation, generic error details, runtime web-source import, auth resolver change or route registration was found in this increment.

## Independent verification

- [x] `npm run build --prefix apps/api`: exit 0 after the stack change; 48 shared artifacts checked.
- [x] `npm --prefix apps/api run typecheck:tests`: exit 0. The changed inclusion glob covers the actual new contract test and its negative reserved-scope assertion.
- [x] `npm --prefix apps/api test -- src/lib/externalAccess/contracts.test.ts --maxWorkers=2`: 1 file / 11 tests passed.
- [x] Direct Node assertions against compiled `errors.js`: all 12 catalog entries/statuses/messages and entry/error freezes passed; all own fields are permitted scalar data properties; no cause/details/private marker; throwing Proxy coercion hook untouched.
- [x] Protected oracle syntax check passed; pre-candidate Node run failed specifically for missing compiled bearer module. Its protected SHA-256 is recorded in `.cache/oauth/oracle-restore.md`.
- [x] Read the current integration log `.cache/oauth/recovered-p0-verify.log`: build checked 48 shared artifacts, runtime protocol reports 8 passed / 0 failed, and Vitest reports 105 files / 755 tests passed. These are the log's current totals, not historical totals. Coordinator process exit confirmation remains required below.
- [ ] Coordinator must run and inspect the complete `npm run verify:api` integration gate on the final P0 tree. No full-suite result is claimed here.
- [ ] Real tenant, linking, lifecycle, revocation consistency, discovery and domain boundaries remain unverified and must stay disabled.

The protected `.mjs` oracle is deliberately invoked directly with Node and is not included by the current Vitest glob. It fails before a parser exists. Every candidate and final parser integration must explicitly execute it and verify the protected hash; the ordinary API suite alone cannot certify bearer acceptance.

## Primary references independently checked

Checked 2026-10-26: [RFC9068 sections 2 and 4](https://www.rfc-editor.org/rfc/rfc9068.html), [RFC9728 section 3.3](https://www.rfc-editor.org/rfc/rfc9728.html#section-3.3), [Auth0 token profiles](https://auth0.com/docs/secure/tokens/access-tokens/access-token-profiles), and [Auth0 resource compatibility](https://auth0.com/ai/docs/mcp/guides/resource-param-compatibility-profile). These support the specific token-profile, resource-precedence and metadata observations above. This review did not independently establish plan eligibility, prices, residency or any real tenant configuration.

## Reviewer task checklist

- [x] Capture restoration/review scope and preserve ownership; no subagents, contracts/errors edits, commits or push by reviewer.
- [x] Read applicable guidance and inspect actual code, tests, spec and compiled behavior rather than accepting worker summaries.
- [x] Preserve independently defined protected acceptance; record new restoration hash and meaningful missing-module RED.
- [x] Review security consequences and explicitly retain open activation obligations.
- [x] Review final owned-file diff and whitespace; record targeted evidence above.
- [ ] Full integration gate and requested PR are coordinator-owned and remain pending here.

Coordinator integration evidence: the complete current-main `npm run verify:api` process exited 0 (session 94709), with 105 files / 755 tests and 8 runtime protocol tests passing. Final `npm --prefix apps/api run typecheck:tests` also exited 0 (session 58498). The deliberately RED parser oracle remains outside the ordinary hook until the pilot provides its target. These checks satisfy the local P0 publication gate; activation blockers above remain open.
