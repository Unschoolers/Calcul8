# Independent treatment candidate A review

Verdict: REJECTED — malformed unsupported-scheme headers bypass required 400 errors.

## Snapshot and scope

- Worktree: `/workspace/scratch/f43c9aa2abd8/oauth-candidate-a`.
- Actual HEAD: `770e999fadb463f0fcb73f87732e02bd4a420202`, matching frozen public base.
- Only candidate path in `git status --short`: untracked `apps/api/src/lib/externalAccess/bearer.ts`.
- Candidate SHA-256: `46f1203d47f53f6f78955e688a11379c037ebbece56ace48f812678cbb030bb9`.
- Coordinator protected oracle SHA-256: `e3fbcf7565f05eec5f57215f3194577f7d1b88e9a69fe02100899ae940acf9d5`, unchanged.
- Reviewed the frozen task/capsule and entire candidate independently. No candidate/test change, test/build rerun, subagent or communication with candidates. Candidate B was not inspected.

## Finding A1: Unsupported classification happens before malformed/duplicate credential rejection

After size, ASCII and edge-space checks, `if (!prefix)` immediately throws `authentication_required` 401 for every header that does not begin with Bearer. It never checks commas, duplicate credentials or embedded malformed credential whitespace.

Exact reproductions inferred from the direct branch:

| Input | Required fixed result | Source result |
| --- | --- | --- |
| `Basic x, Basic y` | `invalid_request`, 400 | `authentication_required`, 401 |
| `Basic x,Bearer token` | `invalid_request`, 400 | `authentication_required`, 401 |
| `Basic x Bearer y` | `invalid_request`, 400 | `authentication_required`, 401 |
| `Bearerx x Bearer y` | `invalid_request`, 400 | `authentication_required`, 401 |

The first two are existing protected-oracle cases, not new criteria. The final case takes the separate alphanumeric character after Bearer branch, which similarly never inspects the rest. The frozen task requires malformed/embedded-whitespace/comma/duplicate credentials to be 400 and reserves 401 for ordinary unsupported schemes such as `Basic x` and `Bearerx x`. This defect prevents acceptance regardless of successful build or valid-token cases. Coordinator owns actual compiled reproduction and Node-oracle evidence.

Coordinator subsequently reported the actual protected Node run failed 1 of 12 tests in the duplicate/unknown-scheme case, consistent with A1. The reviewer did not rerun it.

## Other checks

The ordinary valid Bearer path is bounded and synchronous, retains opaque token bytes through concatenated captures, supports ASCII case variants, repeated ASCII separator spaces and terminal-only padding, and rejects non-string inputs without inspection/coercion. Raw length and all controls/non-ASCII are checked before scheme classification, preventing terminal-newline anchor acceptance. Shared fixed `ExternalError` is used without raw data, causes or additional fields. No JWT/auth/network behavior, external dependency or unrelated tracked mutation was found. These positive properties do not resolve A1.

One-attempt budget is unchanged. No retry, oracle modification or selection is authorized by this review.
