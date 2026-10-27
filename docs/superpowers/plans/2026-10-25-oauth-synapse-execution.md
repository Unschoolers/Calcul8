# OAuth / Synapse X execution ledger

Authoritative scope: [OAuth/public API plan](2026-10-22-oauth-public-api.md). User explicitly authorized implementation and reviewable PRs, not sensitive merges. [P0 decisions](../specs/2026-10-25-oauth-p0-contracts.md). Follow AGENTS.md, coding standards and Synapse X v0.1.

## Requirements and progress

- [x] Read repo instructions, OAuth plan, Synapse protocol and existing auth/scope/API build boundaries.
- [x] Restore and independently validate P0 architecture/security contracts; published PR44, remote770e999f.
- [x] Freeze parser task/base/oracle/budget in docs/experiments/synapse-x/oauth-bearer/capsule.json before candidates.
- [x] Run one-Luna control then two concurrent Luna candidates; all rejected by predefined checks/review. No selection; bounded senior escalation validated separately.
- [x] Record experiment rows, wall intervals,3rejections/1seniorrescue, inhibition and cleanup; unavailable metrics null. No gain established; resume ordinary complementary packets.
- [x] Publish pilot/evaluation PR45 (remote1896d603), APIverify106files/760tests +20runtime, testtypecheck0.
- [x] Implemented the bounded inactive resource-core wave in PR46: JWT/grant/account validation, scope/final boundary, configuration/metadata and safe errors, with independent Terra6.1 senior review. Operational flow remains blocked below.
- [ ] Complete real dev issuer/lifecycle/interoperability gates before wiring protected routes. Blocked: no verified tenant/configuration/account-linking authority supplied or established yet.
- [x] Reconciled P0-P6 in resource-core plan and PR46: contracts/pilot/inactive P3 helpers complete; provider P1/P2, operational P0 and domain/API/OpenAPI P4-P6 gates remain open. Overall OAuth delivery is partial.
- [x] PR44/45/46 published without merge; no orchestration framework/service/database or secrets added. Only maintained jose added for resource-server cryptography.

## Recovery record, 2026-10-26

The previous temporary checkout and its unpublished local P0 commit `60665c2` were removed by environment cleanup. The root's retained conversation record reported 105 files / 757 API tests and 8 runtime tests passing there; these are historical, not evidence for reconstructed files. Recovery uses a fresh clone and reconstructs the contracts and independently owned oracle. New hashes/checks/review are required. The old experiment never started, so there are no lost token/time comparisons to invent. Recovery overhead is separate from candidate trial timing. Checkpoint each accepted increment on GitHub promptly.

## Ownership and sequence

Integrator alone: shared contracts/config/barrels, index.ts, host.json, package/lockfiles, workflow/test-hook registration and publication. No legacy session/Google resolver changes.

P0 recovery: Luna owns contracts/errors/tests; senior owns protected parser oracle and independent review; integrator owns architecture/spec/ledger. These are complementary tasks, not competing Synapse candidates.

Pilot: one module `apps/api/src/lib/externalAccess/bearer.ts`, syntax only. Control one Luna; treatment at most two Luna candidates with distinct strategies in separate worktrees, exact same base and protected oracle. One attempt each, ten minutes per candidate, senior review mandatory, no candidate subagents/background subprocesses/global edits. Native spawn/status/interrupt available; token/cost meter and general descendant termination unavailable. Coordinator runs tests and verifies actual state before cleanup.

Next complementary batches after pilot: signature/grant validator; provenance-aware centralized scope resolver; protected metadata/safe public errors. Freeze their small interfaces before dispatch. Use maintained jose only for cryptography. No enabling transport or guessed tenant persistence. P1/P2 real linking/consent/provider lifecycle and P4-P6 business routes/services/OpenAPI remain separately gated; report them honestly.

## Verification

API changes: `npm run verify:api`; also `npm --prefix apps/api run typecheck:tests` including new tests. Protected Node oracle syntax check and deliberate missing-module RED before parser candidates; hash + file ownership before/after checks. Final independent security review. API test date fixtures require UTC; use a local QA-only preload if nested login shells reset TZ. Do not change business date behavior to accommodate the environment.

P0 recovery evidence: current main base `44a7f19e1458141f9afddeb12cd73d7c050c1277`; Luna restored contracts/errors and corrected two issues (reserved write union and Node24 stack descriptor); independent Sol senior review recorded in `../reviews/2026-10-26-oauth-p0-review.md`. Fresh `npm run verify:api` exited 0: 105 files / 755 tests + 8 runtime tests; test typecheck and whitespace check passed. Protected oracle SHA256 `e3fbcf7565f05eec5f57215f3194577f7d1b88e9a69fe02100899ae940acf9d5`, syntax check passed and actual Node execution RED for missing parser. Candidate generation has not begun. Token/cost metrics unavailable. Publication pending next action.

User steering on2026-10-27: subsequent workers and independent reviewers use Terra6.1; no comparative gain is assumed. The resource-core increment remains under security review in its own execution plan.

Published resource-core PR46: https://github.com/Unschoolers/Calcul8/pull/46. Final local API/CI verification111files/876tests +29runtime, existingcoverage thresholds passed. Independent Terra review resolved the account/partition collision. Real tenant/consent/linking/revoke consistency and usable public routes remain blocked; do not claim complete OAuth activation.

## Auth0 Free decision, 2026-10-27

- [x] Record explicit user acceptance of Auth0 after cost discussion, constrained to Free with no paid activation.
- [x] Recheck official pricing, RFC9068/profile/resource/rotation docs and Free lifecycle fit using Terra6.1 read-only research; primary evidence linked in dev setup guide.
- [x] Document that Enterprise-only refresh Action access/newer management endpoints cannot be assumed on Free, without asserting all Free designs impossible or weakening grant-generation invariants.
- [x] Review documentation diff and relative links; executable files unchanged, application tests N/A for this decision-only update. Prior implementation checks are historical, not new runs.
- [x] Published decision-only PR48 https://github.com/Unschoolers/Calcul8/pull/48 on the current OAuth integration branch; remote implementation5243d511f41bca58aebd6f1a566ca0b2feaf591a, identical local/server treed4ae7357479f129abce8ca1102ec1dff3ce74f18. No merge or production change.
- [x] User supplied `whatfees.ca.auth0.com`; public discovery/JWKS and 13/13 metadata checks verified below. Real client PKCE and safe refresh/grant-generation binding still require separate inputs and end-to-end evidence.

Repository state check: PR47 was merged into feat/oauth-resource-core after PR46 had already been merged into PR45. The current PR45 head4ad77c48 contains the resource core, not the later PR47 readiness increment. This documentation follow-up preserves that current integration base; provider readiness requires a separate carry-forward before assuming it is available there. No shared branch is rewritten.

## Supplied development tenant, 2026-10-27

Scope: validate the user-supplied public domain `whatfees.ca.auth0.com`, record reproducible public evidence, and identify the remaining client/lifecycle inputs. Preserve the Free-only budget, P0 invariants and no automatic sensitive merge/deployment. This is a continuation of the open implementation checklist above.

- [x] Read current repository guidance, provider evaluation and existing readiness checker; inspect current branches before using prior work.
- [x] Retrieved public discovery/JWKS (HTTP 200), exact issuer/JWKS match and 13/13 metadata checks at source8b3aeda1; built clean isolated worktree and ran 6 CLI + 6 assessment tests, all passed. First root-directory Vitest invocation found no tests; corrected cwd, no source/test changes.
- [x] Recorded observations, snapshot hashes, fixture-only configuration and remaining activation gates in `docs/api/auth0-free-evaluation.md`. Two public RSA keys import successfully; no real token, client or resource compatibility claim.
- [x] Reviewed the documentation-only diff and relative paths; no API files changed. Publication is tracked in PR48, with no automatic merge or deployment.
- [ ] N/A: no new candidate or senior security patch review is needed for deterministic public metadata checks and documentation-only changes. No executable behavior changes; application regression tests are not required for the documentation diff. Existing checker tests were run separately as recorded above.
- [ ] Blocked: supplied client ID and Native selection are recorded below; exact callback registration/effective client settings, API resource registrations, Free eligibility and immutable grant-generation/lifecycle proof remain required before real login/refresh or route activation.

Use existing deterministic tools for this bounded follow-up; no new speculative agents, service, storage or dependency. Token/cost measurements remain unavailable; no comparative savings claim.


## Native client setup continuation, 2026-10-27

The user supplied public client ID `iJ91FR4M6AIgD8P68qPQ8Zpo3BgO8Qhe` for Default App and confirmed saving Application Type Native. This is user-reported configuration, not independently authenticated dashboard evidence. Continue the existing open OAuth checklist; the supplied client ID alone does not prove ownership or effective token authentication settings.

- [x] Inspect current branch, P0, provider evidence and official Auth0 PKCE prerequisites; preserve the Free-only/no-deploy constraints.
- [x] Prepared exact local development callback `http://127.0.0.1:8787/callback` and a single setup table in `docs/api/auth0-free-evaluation.md`. Callback registration and Authorization Code are the remaining dashboard steps; no production resource or allowlist is invented. A future loopback listener must run on the same computer as the browser.
- [x] Bounded anonymous authorization preflight returned HTTP403 and a Callback URL mismatch page. No redirects followed, interactive login, code or token exchange; fixed-field diagnostic only, no raw error page or credentials persisted. Result is a setup blocker, not PKCE success.
- [x] Reviewed the documentation-only diff and local links; preflight claims match the fixed-field report. Publication/evidence is tracked in existing PR48; no sensitive merge or deployment.
- [ ] N/A: application tests and delegated code/security patch review for this documentation-only setup increment; no new executable implementation or security-contract change. Use deterministic checks, no speculative agents.
- [ ] Blocked: exact callback registration and human login for a real PKCE exchange; Free lifecycle, trusted grant binding, token/resource and account-linking activation gates remain open.

Token/cost measurements remain unavailable. No gain or activation claim is authorized by this setup continuation.
