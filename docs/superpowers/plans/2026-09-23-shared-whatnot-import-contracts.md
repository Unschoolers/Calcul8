# Shared Whatnot Import Contracts Implementation Plan

> **For agentic workers:** Use the existing shared contract convention and implement each task with a failing test first. Commit focused increments.

**Goal:** Route CSV and OAuth Whatnot rows and their review decisions through shared, runtime-validated contracts without changing existing successful imports.

**Architecture:** Create a pure shared module using the established `shared/*.cjs`, `*.mjs`, and declaration pattern. Keep source-specific parsing in its current adapters, make the API normalize both sources before batch construction, and use shared decision helpers at web and API boundaries. Retain durable confirmation and repository logic.

**Tech Stack:** TypeScript, Vue, Azure Functions, Vitest, NodeNext, Cosmos DB.

**Spec:** `docs/superpowers/specs/2026-09-23-whatnot-import-contracts-design.md`

## Global Constraints

- Preserve public endpoint shape, existing persisted batch shape, transaction identity, fingerprint, and retry semantics.
- Preserve source-specific CSV date/column parsing and OAuth network/credential handling.
- No new runtime dependency or database migration; follow `shared/` packaging and API copies used by existing sync contracts.
- Keep provider metadata in external-reference fields and preserve seller-authored memo.
- Do not broaden confirmation sale types to `wheel` just because the persisted mapping union includes it.

## Review Focus

- Equivalent CSV and OAuth candidate data must lead to the same normalized business fields and transaction identity.
- Missing/invalid identity or non-finite money must fail at the API boundary; omitted optional fields keep previous defaults.
- Existing confirmation request and fingerprints remain stable for valid retries; changed decisions still conflict.
- `skip`, `split_group`, mapped sale updates, and manual candidate target behavior remain unchanged.
- Legacy review response aliases still render correctly in the web review UI.

---

### Task 1: Shared candidate and decision contract

**Files:** Add `shared/whatnot-import-contracts.cjs`, `.mjs`, `.d.ts`, `.d.cts`, `.d.mts`, API shared packaging files following `shared/sync-contracts.*`; update `src/types/app.ts`, `apps/api/src/types.ts`; add `tests/shared-whatnot-import-contracts.test.ts` and API focused contract tests where appropriate.

1. Write failing tests for required external order/item identity, source-equivalent candidate normalization, optional fields/defaults, invalid price/shipping, and distinct accepted persisted versus confirmation sale types. Include a valid decision whose normalized serialization matches the current confirmation fingerprint input shape.
2. Run focused tests and record the expected failures.
3. Implement pure normalization with explicit `unknown` inputs, narrow return types, stable field names and defaults. Export shared type unions rather than retaining local duplicate declarations; keep declarations consistent with runtime. Do not move provider APIs or Cosmos code into `shared/`.
4. Re-run focused tests and both typechecks. Commit the independently usable contract.

### Task 2: Both source adapters use the candidate boundary

**Files:** `src/app-core/shared/whatnot-csv.ts`, `src/app-core/methods/ui/whatnot/whatnot.ts` as needed; `apps/api/src/features/whatnot/handlers.ts`, `apps/api/src/lib/whatnot.ts`, `apps/api/src/features/whatnot/importService.ts`; existing web/API CSV, OAuth, and import tests.

1. Add failing tests asserting CSV and OAuth routes build equivalent normalized candidate fields and preserve stable external keys; cover malformed input returning 400 without writing an import batch.
2. Map CSV fields after CSV-specific parsing and OAuth fields after provider-specific parsing. Validate/normalize at the API boundary before `buildWhatnotImportRowFromNormalizedInput`; keep any existing fallback external account id behavior and batch row shape.
3. Remove duplicated candidate field coercion where shared validation replaces it, but preserve legacy aliases and defaults explicitly. Run focused web/API tests and typechecks. Commit.

### Task 3: Shared review decisions and regression gate

**Files:** `apps/api/src/features/whatnot/handlers.ts`, `apps/api/src/features/whatnot/confirmationRecovery.ts`, `src/app-core/shared/whatnot-csv.ts`, review dialog code only if required; focused confirmation/review tests and contract tests; update `docs/refactorplan.md` to remove only completed items.

1. Pin pre-change fingerprints for representative valid decisions and add failing cross-boundary tests for `skip`, `split_group`, `manual_candidate`, `whatnot_mapping`, invalid explicit action, and repeated retry.
2. Reuse shared decision normalization/validators in both web review and API request parsing. Preserve confirmation's sorted normalized shape and its exact fingerprint bytes for valid existing requests; retain actionable 400 errors for malformed requests.
3. Run focused tests, `npm run verify:all`, inspect `git diff` for data-shape/behavior drift, update factual docs, and commit. Report net production TypeScript line delta and any remaining duplication separately.

## Handoff

The implementer works on `refactor/shared-whatnot-import-contracts`, does not push or merge, and reports commits, test output, and concerns. The parent reviews the full base-to-head diff and reruns verification, then handles any findings.
