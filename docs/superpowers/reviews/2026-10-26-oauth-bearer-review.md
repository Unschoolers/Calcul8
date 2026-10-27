# Independent OAuth bearer syntax review, 2026-10-26

Verdict: ACCEPTABLE for the scoped synchronous syntax parser, subject to coordinator-confirmed final build, protected oracle, API suite and test typecheck. No blocking source defect found in the reviewed coordinator fix. This does not authenticate tokens or complete OAuth authorization, issuer, account, grant, tenant or transport work.

## Reviewed scope and snapshots

Independently reviewed actual `apps/api/src/lib/externalAccess/bearer.ts`, the new `bearer.test.ts`, the `apps/api/package.json` runtime-test script diff, frozen experiment task/capsule and protected oracle. No source/test edits or repeated builds/tests by reviewer. No subagents.

| File | SHA-256 |
| --- | --- |
| `apps/api/src/lib/externalAccess/bearer.ts` | `68e4969dd57a1e4d2de6ac5713ddf0820578864409d3e7b7a844f2a462daa511` |
| `apps/api/src/lib/externalAccess/bearer.test.ts` | `72a6f1770fc4248ff95072cb136e33f58a56a7aa59df4209bc0ce60cb203f8eb` |
| `apps/api/test/oracles/external-bearer.test.mjs` | `e3fbcf7565f05eec5f57215f3194577f7d1b88e9a69fe02100899ae940acf9d5` (unchanged protected baseline) |

## Correctness and security findings

- The complete anchored credential grammar checks a single scheme, one or more ASCII separator spaces, a nonempty permitted token alphabet and terminal-only equals before deciding whether the scheme is supported. It rejects comma lists, duplicate credentials, malformed padding and token whitespace uniformly, including unsupported `Basic` and `Bearerx` prefixes. No special prefix branch bypasses syntax validation.
- The global code-unit scan runs before scheme classification and rejects every control, DEL, non-ASCII unit and surrogate. Terminal LF/CRLF cannot exploit the regular-expression end anchor. Raw length greater than 8192 fails before scanning/matching; exactly 8192 remains admissible when syntactically valid.
- Strict equality and `typeof` checks reject non-string categories without coercion/property inspection. Null, undefined and empty string produce the fixed authentication-required failure. Plain ordinary unsupported credentials produce 401 only after valid syntax. Malformed Bearer separators/tokens produce 400.
- The returned capture is the original opaque token substring, with preserved case, punctuation and equals. There is no normalization, trimming, JWT interpretation, issuer validation, network, minting or account lookup.
- The input is bounded and regex components are separated by distinct ASCII-space syntax; no unbounded nested backtracking pattern was introduced. Errors instantiate only the shared fixed catalog codes and attach no raw input, details or cause.

The supplemental tests preserve the independently protected oracle and add the actual review-gap witnesses: `Bearerx x `, `Bearerx x y`, `Bearerx x Bearer y`, `Bearerx x, Bearer y`, and `Basic x Bearer y`. The coordinator reported meaningful regression RED against the untouched control (two failed / three passed), rather than changing the experiment candidates. The fixed-message assertion distinguishes the prior wrong authentication-required result; the protected oracle separately checks shared error type, code, status, own properties and redaction.

The package change appends the protected Node oracle to the existing `test:runtime-protocol` script. Both ordinary API `verify` and `verify:ci` already build and invoke this script, so the actual compiled parser is now checked in the regular API validation paths. The existing runtime sales test remains included. No dependency/lockfile change or legacy browser-auth wiring is needed.

## Experiment disposition

Control and both treatment candidates were rejected under their predeclared one-attempt budget; no retries or candidate edits were authorized. The control and B expose an oracle coverage gap caught by independent review; A additionally fails an existing protected case. The coordinator fix is a separately disclosed senior escalation after the experiment, not a retroactive successful candidate. No accepted control baseline exists. No speed/cost advantage, cancellation saving or completed OAuth security capability follows from this trial.

## Verification checklist

- [x] Reviewed actual complete parser/test/package diff against frozen syntax contract and explicit security boundary; no unresolved source finding.
- [x] Protected oracle hash unchanged; supplemental tests add coverage without rewriting original acceptance.
- [x] Reviewed regular validation-path wiring for compiled Node execution.
- [x] Independently read `.cache/oauth/pilot-verify.log`: build checked 48 shared artifacts; compiled runtime tests report 20 passed / 0 failed (12 protected oracle + 8 existing); Vitest reports 106 files / 760 tests passed. No earlier-base totals reused.
- [ ] Coordinator must confirm final build, protected Node oracle, full `npm run verify:api` exit and `npm --prefix apps/api run typecheck:tests` on the integration tree. Full suite is already running; reviewer did not duplicate it.
- [ ] Coordinator must review final complete staged diff and publish the scoped increment through the requested ordinary PR workflow. No commit, merge or publication by reviewer.

The approval applies only to the reviewed syntax-parser snapshots and integration hook. Real token authentication, provenance, resource/scopes/grant checks, workspace access, issuer lifecycle and route activation retain the separate P0/P1-P6 gates.

Coordinator gate confirmation: full `npm run verify:api` exited 0 (session25647), including build, 20 runtime tests and 106 files / 760 tests. `npm --prefix apps/api run typecheck:tests` exited 0 (session17435). Direct protected Node oracle exited 0 with12/12 (session61979). Whitespace and protected hash checks passed. No candidate was selected; all three archived patches were verified against their original worktrees, agents were completed, and the three owned worktrees were removed without force. No cancellation was performed or saving inferred.
