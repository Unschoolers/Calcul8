# Configuration, metadata and safe response review

Verdict: no unresolved concrete blocker in the final reviewed inactive helpers. This review does not approve tenant activation, route enablement or merge.

## Reviewed final bytes

| Coordinator source | SHA256 |
| --- | --- |
| `apps/api/src/lib/externalAccess/configuration.ts` | `c6e9bcca27c269db7e3b7b2da49ac6cf42608f4c1feb549638e3b833f152bc2e` |
| `apps/api/src/features/externalOAuth/metadata.ts` | `2787f57247b6a32fc3f614b005da44883c4bc51eb4e3705e4872f80db5f721a9` |
| `apps/api/src/lib/externalAccess/response.ts` | `ab347b40ca5f6c18a09ea1b25205ba18b4ac04f701493296a7679affa75fddda` |

The final coordinator copies match the reviewed owner files. The coordinator confirmed response owner stability before final review. Requirements inspected: resource-core plan, P0 contracts, common/metadata/response packets, AGENTS.md, coding standards and repository organization.

## Review evidence

- [x] Inspect authoritative requirements and actual owned source; no source edits or further delegation.
- [x] Review canonical HTTPS URL/configuration constraints, bounded allowlist, defensive immutable copies and fixed configuration errors.
- [x] Review real-issuer protected metadata, exact configured resource, RFC9728 origin/path derivation, read scopes and omission of private/unsupported capabilities.
- [x] Review fixed public catalog projection, redaction, generated correlation IDs, hostile error objects, REST challenge omission and MCP bootstrap metadata.
- [x] Inspect final stable source hashes and execute a bounded independent Node oracle against actual coordinator modules. Source was transpiled through installed TypeScript `transpileModule` with CommonJS/ES2022; runtime assertions used Node `assert/strict`, with no mocks or substituted configuration implementation.
- [x] Oracle passed: empty literal `?`/`#` rejected across issuer/JWKS/REST/MCP (8 cases); immutable independent config/metadata copies; exact metadata URI/resource binding; custom iterator hiding indexed CRLF rejected; overridden caller `join` ignored; correct MCP metadata and REST omission for all four auth errors; five malformed/throwing option cases yield fixed 500 without challenge; all twelve catalog entries project fixed status/message/envelope and fresh UUIDs; three hostile unknown errors yield redacted fixed 500.
- [x] Coordinator `git diff --check` passed.
- [ ] N/A: source fixes and owner regression suites are owner responsibilities. This reviewer did not duplicate full test suites, builds or typechecks.
- [ ] N/A: tenant provisioning, route registration, production activation, merge and publication are outside this review authorization.

## Corrections verified during review

The initial configuration accepted `resources.mcp = https://api.example.test/api/mcp?` or `.../api/mcp#`: WHATWG `search`/`hash` are empty while `href` preserves the delimiter, and the derived metadata URL dropped it. Final validation explicitly rejects either literal delimiter; all eight field/marker cases now fail with fixed `internal_error`.

Initial response scope validation inspected iterator values then serialized caller `scopes.join`, allowing checked and emitted values to differ. Final code copies validated own primitive array data into an internal array before joining; hidden indexed CRLF produces safe 500, and caller join overrides do not run.

Final response challenge composition uses structured scope/metadata fields rather than reparsing constructed header strings. `authentication_required` now advertises the exact configured MCP metadata URL without adding an OAuth error parameter. REST challenges omit metadata. Forged/getter error inputs cannot inject raw data because output is projected only from the fixed catalog.
