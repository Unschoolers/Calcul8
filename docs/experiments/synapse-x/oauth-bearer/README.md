# OAuth Bearer trial 1: result

Decision: keep bounded artifacts and independent acceptance; **stop speculative competition by default**. Resume ordinary complementary parallel packets. This trial establishes no performance gain and adds no orchestrator/framework/service/storage.

Immutable public base: `770e999fadb463f0fcb73f87732e02bd4a420202` ([P0 PR44](https://github.com/Unschoolers/Calcul8/pull/44)). `capsule.json` and `task.md` were frozen before generation. Same protected Node oracle and senior reviewer role for all candidates. All workers were native concurrent-capable Luna agents in separate Git worktrees, one attempt each; control ran first and its implementation was not shared with treatments.

| Method | Candidates | Observed generation window | Acceptance end-to-end | Outcome |
| --- | --- | --- | --- | --- |
| Usual master/Luna control | 1 | 86.8 seconds | 211.9 seconds | Oracle12/12; senior review rejected malformed Bearerx handling. |
| Synapse artifact/competition | 2 concurrent | A60.7s, B102.0s from group start | 210.7 seconds to both rejection observations | A11/12; B12/12. Senior review rejected both. |

These are coordinator-observed wall intervals, including scheduling/notification/review delay, not model compute times. Both modes exhausted their identical one-attempt-per-candidate budget without an independently accepted patch. Treatment used an extra candidate; its total token/cost overhead is unknown. The protocol's primary cost-per-validated-change comparison cannot be computed. One task, fixed order and cache/order effects prohibit generalization. Tokens, cached tokens and prices for every candidate/coordinator/reviewer are **null**, because no meter/cap API is available; no estimated byte/token substitute is used.

Senior escalation produced the final complete-credential grammar; it is not retroactively counted as a successful trial candidate. Five supplemental regressions preserve the initial oracle: against the untouched control two fail/three pass; after the fix five pass. Final integration: `npm run verify:api` exit0, 106 files/760 tests plus20 compiled runtime tests (12protected +8existing); API test typecheck exit0. Review: `../../../superpowers/reviews/2026-10-26-oauth-bearer-review.md` (repository path: `docs/superpowers/reviews/2026-10-26-oauth-bearer-review.md`). Real token authentication remains unimplemented in this increment.

Candidate patches and rejection reviews are archived here. To reproduce, create a clean worktree at the base, `git apply candidates/<id>.patch` (absolute patch path), use the unchanged API lockfile with `npm --prefix apps/api ci`, build and run `node --test apps/api/test/oracles/external-bearer.test.mjs`, then apply the senior acceptance review. The protected oracle intentionally misses the Bearerx gap; a green oracle alone does not pass review. Baseline/worker packages were untouched.

Inhibition prevented all rejected candidates from integration. No selected candidate, no cancellation requests and no token savings: every worker had completed before review decisions. Native agent interrupt exists; reliable descendant termination and token/cost metering do not. Coordinator confirmed completed worker states, checked exact owned-file status, reverse-checked the archived patches, and removed the three owned worktrees without force. No unrelated worktree/process was touched.

`events.jsonl` captures activation/rejection/cleanup; `results.jsonl` has one row per candidate and one integrated-task row. Escaped regressions are unknown, not zero. P0 reconstruction overhead from environment cleanup is described in the execution ledger and excluded from candidate comparison; complete request-to-delivery cost is unavailable. No claims are made for that unmeasured period.
