# Synapse X: sparse agent execution (R&D protocol, v0.1)

> **Status: experimental specification, not an implemented orchestrator.**
> Opt-in only. Existing `AGENTS.md` instructions, independent review, security rules, CI gates, and task checklists still apply.
> Next intended trial: the existing [OAuth 2.1 / Public API plan](superpowers/plans/2026-10-22-oauth-public-api.md). This document does not authorize OAuth implementation, production releases, or automatic merges.

## 1. Research question

Can WhatFees deliver **correct, independently verified changes** with fewer *total* tokens, less elapsed time, and fewer senior-agent rescues than the current master/Luna workflow?

Do not optimize tokens per prompt or completion speed in isolation. Measure the full path from request to validated integrated change, including failed candidates, verification, review and rework.

The repo is primarily TypeScript/Node Azure Functions and Vue. Prefer TypeScript compiler/AST, Vue tooling, Git, and current test scripts. **Do not add Roslyn, SQLite, vector databases, brokers, cloud services, or agent frameworks for v0.1.**

## 2. Model: activation, competition, inhibition

No permanent master-to-subagent conversation tree is required by the proposed protocol. A minimal **deterministic coordinator** owns task state, bounded budgets, process/worktree lifecycles, immutable acceptance checks and final integration.

State transitions (each transition must have an observable event):

```text
PENDING -> READY -> RUNNING -> CANDIDATE -> VERIFYING
                      |                           |
                      +-> FAILED / TIMEOUT         +-> ACCEPTABLE -> SELECTED
                                                  +-> REJECTED -> RETRY / ESCALATE
SELECTED -> INTEGRATION_VERIFY -> DONE / ESCALATE
Other RUNNING candidates -> CANCEL_REQUESTED -> TERMINATED -> CLEANED
```

- **Activate:** start one narrow candidate by default. Start independent speculative candidates only when extra parallelism is expected to improve end-to-end success/cost/latency or explicitly requested.
- **Compete:** variants work from the same immutable base commit in separate Git worktrees; candidate outputs are diffs, not conversational summaries.
- **Inhibit:** only a candidate passing **predefined, independent** acceptance checks can win. First response does not win. Upon selection, request cancellation of remaining candidates, terminate descendants when supported, then verify their cleanup. Cancellation may not refund tokens already consumed.
- **Escalate:** if no acceptable candidate exists within the attempt/time/token budget, return concrete failing diagnostics or route to a senior agent. Do not let Luna retry indefinitely or silently weaken tests.
- **Integrate:** apply the selected diff through the ordinary review/merge workflow and rerun relevant checks after integration; success in an isolated worktree is not sufficient.
- **Stop:** if task is security-sensitive, ambiguous, changes shared contracts, or lacks a meaningful independent oracle, do not blindly accept the fastest patch. Require expert review and the normal gates.

**Speculative execution is not always cheaper.** For simple tasks, one candidate is the control. Prefer staggered hedging (e.g. B only after A stalls), not unconditional three-way duplication. Different strategies may be tested, but candidates must not share mutable workspace state.

## 3. Minimal task capsule

A task is referenced by ID in coordinator/agent handoffs. The coordinator resolves the ID against a **local artifact**; an identifier alone is not enough context for an LLM.

Example (illustrative protocol data, not a real command):

```json
{
  "id": "OAUTH-P3-TRIAL",
  "baseSha": "<immutable-commit>",
  "goal": "Implement the agreed token verification contract",
  "scope": ["apps/api/src/lib/externalAccess/verify*"],
  "contractRefs": ["docs/superpowers/plans/2026-10-22-oauth-public-api.md#2-cross-plan-contracts-freeze-before-parallel-implementation"],
  "acceptance": ["focused auth tests", "typecheck", "security review"],
  "strategies": ["direct", "tests-first"],
  "maxCandidates": 2,
  "maxAttemptsPerCandidate": 1,
  "seniorReviewRequired": true
}
```

The capsule is only executable once required dependencies and contracts are frozen and tests/commands resolve to real repository targets. Give agents the *smallest sufficient* source slices, symbol references, acceptance contract and explicit file ownership. Agents must be able to request additional context when necessary. Never omit security constraints to save tokens.

## 4. Communication without chatter

Use **artifacts and events**, not paragraphs between agents:

- Input: capsule reference, base SHA, source/symbol references, immutable acceptance checks and ownership constraints.
- Candidate output: diff or commit SHA plus machine-readable changed paths, diagnostics and test command results.
- Events: `STARTED`, `CANDIDATE_READY`, `CHECK_FAILED`, `ACCEPTABLE`, `CANCEL_REQUESTED`, `CANCELLED`, `ESCALATE`, `INTEGRATED`.
- Human interaction: concise explanation in French/English when requested or needed for an approval, unexpected limitation, design choice or security risk. Do not suppress useful user communication.

Avoid summaries-as-proof and duplicated context. Resolve all references locally with Git and file tooling. **Model inputs/outputs still incur tokens** even if a message is JSON, shorthand, code or another natural language. Byte compression alone may not improve tokenizer efficiency. Do not use opaque embeddings or hidden model states as a purported lossless reasoning channel.

## 5. Independent oracle and bounded autonomy

Acceptance checks are defined *before* candidate generation by the task owner/reviewer, not invented or silently edited by the candidate. Candidate-generated tests may supplement, never replace, protected acceptance tests.

Verification includes, as applicable: diff path allowlist; no credentials; no weakening/deletion of protected tests; formatting/typecheck; targeted unit/component tests; regression fail-before/pass-after on bug fixes; scope, tenant isolation and security invariants; repository-mapped full verification; independent expert review for higher-risk changes.

- A green test suite is **evidence**, not a mathematical proof of correctness.
- A candidate cannot mark itself accepted or merge itself.
- If checks are missing, uncertain or unavailable, stop and report `BLOCKED`, not `PASS`.
- Keep branch permissions, secrets and production access outside candidate worktrees wherever possible.
- Never terminate unrelated processes or remove a worktree with uncommitted user changes. Confirm process ownership and cleanup boundaries first.
- If the agent runtime has no reliable spawn/cancel/usage-meter API, record the capability as unavailable; do not claim parallelism, cancellation or token savings occurred.

## 6. Adaptive activation, not an AI manager

Start with transparent heuristics, **no learned router or database**:

| Trigger | Choice |
| --- | --- |
| Deterministic transformation can be safely validated | Use tooling without a LLM |
| Small, local, low-risk task with good tests | One Luna candidate |
| Well-scoped task historically prone to failure | Optional second independent candidate, preferably staggered |
| Cross-cutting contract, security-sensitive OAuth, unclear acceptance oracle | Senior model/reviewer first; Luna only for bounded delegated work |
| Concrete failed test/typecheck | Return small diagnostics to same candidate if retry budget permits; otherwise escalate |
| One candidate independently verified and selected | Cancel remaining candidates if controllable |

Persist at most a small local append-only JSONL log for experiments; no SQLite in v0.1. Unavailable measurements must be `null`, never invented. Any later adaptive decisions must use observed outcomes and account for sample size.

## 7. Evaluation design

Compare equivalent tasks at the same base SHA with the same acceptance criteria and independent reviewer. First run a **control** with the current master/Luna procedure, then a **Synapse** variant. Repeated trials and alternating order help reduce noise. Do not leak the prior solution to the competing treatment.

Record one JSONL row per candidate and one per integrated task with schema version, task ID, method, model, base SHA, strategy, attempts, outcome, measured input/output/cached tokens (or null), cost if observable, start/end timestamps, verify commands and results, reviewer defects, escaped regressions, and cancellation effectiveness.

Primary metric: **total tokens or money per independently validated integrated change**, counting all candidates, coordinator, reviewers and rework. Guardrails: security/correctness, no regressions, no weakened checks. Secondary: first-pass success, wall time, number of senior rescues, speculative waste, failure categories. Do not claim percentage savings until measured on multiple comparable tasks.

## 8. First OAuth experiment

The separate OAuth plan remains authoritative. Do **not** implement or roll out OAuth from this R&D document.

1. Confirm OAuth plan P0 has frozen the issuer strategy and shared token/principal contracts, including distinct REST/MCP audiences and scopes. If not, trial a harmless local contract-test/documentation task first.
2. Select **one bounded packet**, ideally a subset of P3 verification with frozen interfaces and tests, or a similarly isolated P6 contract task. Do not race independent P1–P6 packets as if they were competing patches: they are complementary deliverables.
3. Freeze the test oracle and the exact task scope before launching a candidate.
4. Run control versus Synapse modes in isolated worktrees; start one candidate, hedge only if justified. No shared-file writes, no concurrent edits to lockfiles or global entrypoints.
5. Review token totals, defects, wall time and integration evidence. If there is no measurable improvement, revert to standard execution or revise the hypothesis; do not increase complexity just to keep the framework.

## 9. v0.1 non-goals and definition of done

**Non-goals:** custom agent runtime, mandatory three-agent races, learned model routing, self-modifying safety criteria, automatic OAuth deployment, production code changes, persistent databases, prompt-free LLMs, unverified automatic merges.

**R&D done:** one reproducible capsule, isolated control/treatment, evidence-backed independent acceptance, accurate accounting of available metrics, and a decision to keep/modify/discard the hypothesis.

This file is a **design and experiment protocol only**. Neither the runner, cancellation machinery nor OAuth implementation is present merely because this document exists.
