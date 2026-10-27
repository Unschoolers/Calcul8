# OAuth / Synapse X execution ledger

Authoritative scope: [OAuth/public API plan](2026-10-22-oauth-public-api.md). User explicitly authorized implementation and reviewable PRs, not sensitive merges. [P0 decisions](../specs/2026-10-25-oauth-p0-contracts.md). Follow AGENTS.md, coding standards and Synapse X v0.1.

## Requirements and progress

- [x] Read repo instructions, OAuth plan, Synapse protocol and existing auth/scope/API build boundaries.
- [x] Restore and independently validate P0 architecture/security contracts; published PR44, remote770e999f.
- [x] Freeze parser task/base/oracle/budget in docs/experiments/synapse-x/oauth-bearer/capsule.json before candidates.
- [x] Run one-Luna control then two concurrent Luna candidates; all rejected by predefined checks/review. No selection; bounded senior escalation validated separately.
- [x] Record experiment rows, wall intervals,3rejections/1seniorrescue, inhibition and cleanup; unavailable metrics null. No gain established; resume ordinary complementary packets.
- [x] Publish pilot/evaluation PR45 (remote1896d603), APIverify106files/760tests +20runtime, testtypecheck0.
- [ ] Implement complementary OAuth batches with disjoint ownership, senior review and reviewable PRs.
- [ ] Complete real dev issuer/lifecycle/interoperability gates before wiring protected routes. Blocked: no verified tenant/configuration/account-linking authority supplied or established yet.
- [ ] Reconcile all original P0-P6 requirements; report partial implementation until real activation and domain/API gates pass.
- [ ] No automatic merge, no new orchestration framework/service/database and no secrets.

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
