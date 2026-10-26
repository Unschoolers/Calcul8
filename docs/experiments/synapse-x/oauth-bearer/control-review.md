# Independent control candidate review

Verdict: REJECTED — one frozen-contract correctness defect. A passing protected oracle would not override this independent source finding.

## Reviewed snapshot and scope

- Worktree: `/workspace/scratch/f43c9aa2abd8/oauth-control`
- Actual HEAD: `770e999fadb463f0fcb73f87732e02bd4a420202`, matching the task capsule.
- Candidate: only untracked `apps/api/src/lib/externalAccess/bearer.ts` in `git status --short`.
- Candidate SHA-256: `b446c078420b381cb6a39fde7fd49cec4032cc5ce20a21ff8c24cab3049c5982`.
- Protected oracle SHA-256 in coordinator checkout remains `e3fbcf7565f05eec5f57215f3194577f7d1b88e9a69fe02100899ae940acf9d5`.
- Read the frozen task, capsule, entire candidate and candidate report. No future treatment solution was inspected. No candidate/test edits, tests/builds, commits, pushes or subagents by reviewer.

## Defect C1: Bearer-prefixed unsupported schemes bypass malformed-header checks

Location: `apps/api/src/lib/externalAccess/bearer.ts:48-52`.

After the initial ASCII/size/edge-space/comma checks, any input starting with ASCII case-insensitive `Bearer` followed by an ASCII alphanumeric character immediately throws `authentication_required` 401. The remaining input is never examined. For example, `Bearerx x Bearer y` contains duplicate credentials and `Bearerx x y` contains an embedded space in the credential. Both take this unconditional 401 branch. The frozen task requires malformed/embedded-whitespace/duplicate-credential input to throw fixed `invalid_request` 400; only ordinary unsupported credentials such as `Bearerx x` receive 401. This is within the frozen syntax contract, not an additional authentication requirement.

The same malformed tail under `Basic` does not take the special branch and returns 400. The protected test currently checks ordinary `Bearerx x` and lexical hazards under `Bearerx`, but does not include the duplicate/embedded-space witness above. Do not weaken or silently alter the protected baseline to accommodate this candidate. Coordinator can independently confirm the two witness outputs against compiled code.

## Other observations

The valid Bearer path is synchronous, preserves the token substring, allows ASCII case variants and repeated ASCII separator spaces, and correctly checks the inclusive raw cap, controls/DEL/non-ASCII, token alphabet and terminal-only padding. Primitive type checks do not coerce or inspect non-string objects. Work is linear in bounded header length; no network, JWT decoding, secret interpolation or authentication behavior was introduced. Fixed `ExternalError` helpers reuse the shared redacted catalog. No additional blocking finding was identified beyond C1.

Coordinator owns actual build/oracle results and final acceptance. One-attempt capsule budget is unchanged; this review does not authorize a candidate retry or implementation change.
