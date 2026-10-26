# Independent treatment candidate B review

Verdict: REJECTED — a malformed Bearer-prefixed unsupported scheme bypasses fixed invalid-request classification. Oracle success alone cannot satisfy independent review acceptance.

## Snapshot and scope

- Worktree: `/workspace/scratch/f43c9aa2abd8/oauth-candidate-b`.
- Actual HEAD: `770e999fadb463f0fcb73f87732e02bd4a420202`, matching frozen public base.
- Only candidate path in `git status --short`: untracked `apps/api/src/lib/externalAccess/bearer.ts`.
- Candidate SHA-256: `d49f4ef2f73f6adceb2fda10dcd62bfa7930983545292659b73ad919b5d2899d`.
- Protected oracle SHA-256 remains `e3fbcf7565f05eec5f57215f3194577f7d1b88e9a69fe02100899ae940acf9d5`.
- Read the full candidate against the same frozen task/capsule. No candidate/test change, test/build rerun, subagents or discussion with candidates. Coordinator owns actual Node-oracle/build evidence.

## Finding B1: Scheme continuation skips malformed-tail validation

At `bearer.ts:69-76`, a Bearer prefix with an alphanumeric, hyphen or underscore continuation immediately returns `authentication_required` 401. All edge-space/comma/separator-group validation is confined to the earlier `!isBearerPrefix` branch, so it does not run for `Bearerx` headers. The global code-unit/length scan does not reject ordinary ASCII spaces or commas.

| Exact input | Frozen required result | Source result |
| --- | --- | --- |
| `Bearerx x ` (one final ASCII space) | `invalid_request`, 400 | `authentication_required`, 401 |
| `Bearerx x, Bearer y` | `invalid_request`, 400 | `authentication_required`, 401 |
| `Bearerx x Bearer y` | `invalid_request`, 400 | `authentication_required`, 401 |
| `Bearerx x y` | `invalid_request`, 400 | `authentication_required`, 401 |

The frozen contract explicitly requires trailing whitespace, comma/duplicate credentials and embedded malformed whitespace to return 400. It permits 401 for ordinary `Bearerx x`, not arbitrary malformed tails. This finding does not introduce token authentication, issuer or other behavior beyond syntax. The protected oracle does not contain these exact unsupported-prefix tails; preserve its baseline hash and report the gap rather than interpreting green tests as complete acceptance.

## Other observations

Valid Bearer parsing is synchronous and opaque; the final substring preserves bytes. The bounded 8192-unit scan rejects controls, DEL, non-ASCII and surrogates before scheme classification. Allowed ASCII token characters, nonempty token, repeated ASCII separator spaces and terminal-only equals are handled explicitly. Non-string values are rejected without coercion/property inspection. Shared fixed errors carry no input data. The implementation has linear bounded work and adds no dependencies, JWT decoding, network or unrelated changes. No other blocking finding was identified.

No candidate selection, retry, oracle change, cancellation or efficiency gain is claimed. The one-attempt budget remains binding.
